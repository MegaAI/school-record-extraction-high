import { GoogleGenAI } from '@google/genai';
import { STAGE_2_PROMPTS, type Stage2FieldKey } from '../../../prompt/src/index.js';
import { extractJsonFromText } from '../utils/json-extractor.js';
import {
    type TokenUsage,
    sleep,
    isRetriable,
    extractUsage,
    extractTextFromResponse,
    emptyUsage
} from '../utils/gemini-utils.js';
import {
    autonomousActivitiesCodeSchema,
    clubActivitiesCodeSchema,
    careerActivitiesCodeSchema,
    volunteerActivitiesCodeSchema,
    awardsCodeSchema,
    licenseCodeSchema,
    readingActivitiesCodeSchema,
} from '../../../schema/src/index.js';

const MODEL = 'gemini-3-flash-preview';

const MAX_RETRIES = 3;

// Stage 2 필드별 responseSchema 매핑
const STAGE_2_SCHEMAS: Record<Stage2FieldKey, unknown> = {
    autonomous_activities: autonomousActivitiesCodeSchema,
    club_activities: clubActivitiesCodeSchema,
    career_activities: careerActivitiesCodeSchema,
    volunteer_activities: volunteerActivitiesCodeSchema,
    awards: awardsCodeSchema,
    license: licenseCodeSchema,
    reading_activities: readingActivitiesCodeSchema,
};

export interface Stage2FieldResult {
    fieldKey: Stage2FieldKey;
    data: unknown;
    usage: TokenUsage;
    error?: string;
}

export class GeminiClassifyService {
    private genAI: GoogleGenAI;

    constructor() {
        const project = process.env.VERTEX_PROJECT;
        const location = process.env.VERTEX_LOCATION ?? 'global';
        if (!project) throw new Error('VERTEX_PROJECT 환경변수가 설정되지 않았습니다.');
        this.genAI = new GoogleGenAI({ vertexai: true, project, location });
    }

    /**
     * Stage 1 데이터에서 Stage 2 분류에 필요한 최소 필드만 추출 (flat array 반환)
     * 빈 배열 반환 시 → Stage 2 스킵 대상
     */
    private extractClassifyInput(fieldKey: Stage2FieldKey, data: unknown): Record<string, unknown>[] {
        const d = data as Record<string, unknown>;

        switch (fieldKey) {
            case 'autonomous_activities': {
                const arr = (d?.activities as Record<string, unknown>)?.['자율활동'] as Record<string, unknown>[] ?? [];
                return arr.map(item => ({ 활동명: item['활동명'], 특기사항: item['특기사항'] }));
            }
            case 'club_activities': {
                const arr = (d?.activities as Record<string, unknown>)?.['동아리활동'] as Record<string, unknown>[] ?? [];
                return arr.map(item => ({ 활동명: item['활동명'], 특기사항: item['특기사항'] }));
            }
            case 'career_activities': {
                const arr = (d?.activities as Record<string, unknown>)?.['진로활동'] as Record<string, unknown>[] ?? [];
                return arr.map(item => ({ 활동명: item['활동명'], 진로희망: item['진로희망'], 특기사항: item['특기사항'] }));
            }
            case 'volunteer_activities': {
                const arr = (d?.activities as Record<string, unknown>)?.['봉사활동실적'] as Record<string, unknown>[] ?? [];
                return arr.map(item => ({ 활동명: item['활동명'], 장소_주관기관명: item['장소_주관기관명'], 특기사항: item['특기사항'] }));
            }
            case 'awards': {
                const arr = d?.awards as Record<string, unknown>[] ?? [];
                return arr.map(item => ({ 수상명: item['수상명'], 수여기관: item['수여기관'] }));
            }
            case 'license': {
                const licenseData = d?.license as Record<string, unknown> ?? {};
                const arr = licenseData?.['자격증_및_인증_취득상황'] as Record<string, unknown>[] ?? [];
                return arr.map(item => ({ 명칭_또는_종류: item['명칭_또는_종류'], 발급기관: item['발급기관'] }));
            }
            case 'reading_activities': {
                const arr = d?.reading_activities as Record<string, unknown>[] ?? [];
                return arr.map(item => ({ 과목또는영역: item['과목또는영역'], 도서명: item['도서명'], 독서활동상황: item['독서활동상황'] }));
            }
            default:
                return [];
        }
    }

    /**
     * Stage 2 코드 결과(flat array)를 Stage 1 원본 데이터에 인덱스 기준으로 병합
     */
    private mergeCodesIntoStage1(fieldKey: Stage2FieldKey, stage1Data: unknown, codes: Record<string, unknown>[]): unknown {
        const d = stage1Data as Record<string, unknown>;
        const merge = (orig: Record<string, unknown>[], codeArr: Record<string, unknown>[]) =>
            orig.map((item, i) => ({ ...item, ...(codeArr[i] ?? {}) }));

        switch (fieldKey) {
            case 'autonomous_activities': {
                const activities = d.activities as Record<string, unknown>;
                const orig = activities?.['자율활동'] as Record<string, unknown>[] ?? [];
                return { activities: { 자율활동: merge(orig, codes) } };
            }
            case 'club_activities': {
                const activities = d.activities as Record<string, unknown>;
                const orig = activities?.['동아리활동'] as Record<string, unknown>[] ?? [];
                return { activities: { 동아리활동: merge(orig, codes) } };
            }
            case 'career_activities': {
                const activities = d.activities as Record<string, unknown>;
                const orig = activities?.['진로활동'] as Record<string, unknown>[] ?? [];
                return { activities: { 진로활동: merge(orig, codes) } };
            }
            case 'volunteer_activities': {
                const activities = d.activities as Record<string, unknown>;
                const orig = activities?.['봉사활동실적'] as Record<string, unknown>[] ?? [];
                return { activities: { 봉사활동실적: merge(orig, codes) } };
            }
            case 'awards': {
                const orig = d.awards as Record<string, unknown>[] ?? [];
                return { awards: merge(orig, codes) };
            }
            case 'license': {
                const licenseData = d.license as Record<string, unknown> ?? {};
                const orig = licenseData?.['자격증_및_인증_취득상황'] as Record<string, unknown>[] ?? [];
                return { license: { 자격증_및_인증_취득상황: merge(orig, codes) } };
            }
            case 'reading_activities': {
                const orig = d.reading_activities as Record<string, unknown>[] ?? [];
                return { reading_activities: merge(orig, codes) };
            }
            default:
                return stage1Data;
        }
    }

    public async classifyField(
        fieldKey: Stage2FieldKey,
        stage1Data: unknown,
    ): Promise<Stage2FieldResult> {
        const prompt = STAGE_2_PROMPTS[fieldKey];

        // Stage 1 데이터에서 분류에 필요한 최소 필드만 추출
        const classifyInput = this.extractClassifyInput(fieldKey, stage1Data);

        // 빈 배열이면 Stage 2 스킵 → Stage 1 데이터 그대로 반환
        if (classifyInput.length === 0) {
            console.log(`  ⏭️ [Stage2][3-Flash] ${fieldKey} 스킵 (빈 배열)`);
            return { fieldKey, data: stage1Data, usage: emptyUsage() };
        }

        console.log(`  🔍 [Stage2][3-Flash] ${fieldKey} 시작 (${classifyInput.length}개 항목)`);

        const textContent = `${prompt}\n\n[분류 대상 JSON 배열 - 각 항목의 분류 코드만 반환하세요 (입력 배열과 동일한 순서/개수)]\n${JSON.stringify(classifyInput, null, 2)}`;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await this.genAI.models.generateContent({
                    model: MODEL,
                    contents: [{ role: 'user', parts: [{ text: textContent }] }],
                    config: {
                        temperature: 0,
                        maxOutputTokens: 16384,
                        thinkingConfig: {
                            thinkingLevel: 'LOW',
                            includeThoughts: false,
                        } as any,
                        responseMimeType: 'application/json',
                        responseSchema: STAGE_2_SCHEMAS[fieldKey] as any,
                    },
                });

                const usage = extractUsage(response);
                const text = extractTextFromResponse(response);
                const parsed = extractJsonFromText(text);

                if (parsed === null) throw new Error(`[Stage2] JSON 파싱 실패: ${text.slice(0, 200)}`);

                // Stage 2 코드 결과(flat array)를 Stage 1 원본 데이터에 인덱스 기준 병합
                const codesArray = Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [];

                // 길이 불일치 경고
                if (codesArray.length !== classifyInput.length) {
                    console.warn(`  ⚠️ [Stage2][3-Flash] ${fieldKey} 길이 불일치: 입력 ${classifyInput.length}개 / 출력 ${codesArray.length}개`);
                }

                const mergedData = this.mergeCodesIntoStage1(fieldKey, stage1Data, codesArray);

                console.log(`  ✅ [Stage2][3-Flash] ${fieldKey} 완료 | 입력:${usage.promptTokens} 출력:${usage.candidateTokens} think:${usage.thinkingTokens} | ${classifyInput.length}개 항목 처리`);
                return { fieldKey, data: mergedData, usage };
            } catch (error) {
                const isLast = attempt === MAX_RETRIES;
                if (!isLast && isRetriable(error)) {
                    const delay = 1000 * Math.pow(2, attempt - 1);
                    console.warn(`  ⚠️ [Stage2][3-Flash] ${fieldKey} 재시도 ${attempt}... ${delay}ms 대기`);
                    await sleep(delay);
                } else {
                    const msg = error instanceof Error ? error.message : String(error);
                    console.error(`  ❌ [Stage2][3-Flash] ${fieldKey} 최종 실패: ${msg}`);
                    return { fieldKey, data: null, usage: emptyUsage(), error: msg };
                }
            }
        }
        return { fieldKey, data: null, usage: emptyUsage(), error: '최대 재시도 초과' };
    }

    /**
     * Stage 1에서 얻은 JSON 데이터 객체를 받아, Stage 2 분류가 필요한 필드들만 병렬 처리합니다.
     */
    async executeStage2(stage1Data: Record<string, unknown>): Promise<{
        data: Record<string, unknown>;
        errors: Record<string, string>;
        totalUsage: TokenUsage;
    }> {
        const stage2Keys = Object.keys(STAGE_2_PROMPTS) as Stage2FieldKey[];

        console.log(`🚀 [Stage2] 병렬 분류 시작 (${stage2Keys.length}개 필드, 모델: ${MODEL})`);

        // Stage 1 결과에서 null/undefined가 아닌 필드만 처리
        const validKeys = stage2Keys.filter(key => stage1Data[key] !== null && stage1Data[key] !== undefined);

        const results = await Promise.all(
            validKeys.map((key) => this.classifyField(key, stage1Data[key]))
        );

        // 토큰 합산 (스킵된 항목은 emptyUsage이므로 합산에 영향 없음)
        const totalUsage: TokenUsage = results.reduce((acc, r) => ({
            promptTokens: acc.promptTokens + r.usage.promptTokens,
            candidateTokens: acc.candidateTokens + r.usage.candidateTokens,
            thinkingTokens: acc.thinkingTokens + r.usage.thinkingTokens,
            cachedTokens: acc.cachedTokens + r.usage.cachedTokens,
            totalTokens: acc.totalTokens + r.usage.totalTokens,
        }), emptyUsage());

        const data: Record<string, unknown> = {};
        const errors: Record<string, string> = {};
        for (const r of results) {
            if (r.error) errors[r.fieldKey] = r.error;
            else data[r.fieldKey] = r.data;
        }

        const skipped = results.filter(r => !r.error && r.usage.totalTokens === 0).length;
        const successCount = results.filter(r => !r.error).length;
        console.log(`✅ [Stage2] 분류 완료: ${successCount}/${validKeys.length} (스킵: ${skipped}개)`);

        return { data, errors, totalUsage };
    }
}
