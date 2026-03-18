import { STAGE_2_PROMPTS, type Stage2FieldKey } from '../../../prompt/src/index.js';
import { extractJsonFromText } from '../utils/json-extractor.js';
import {
    type TokenUsage,
    GEMINI_REQUEST_LABELS,
    createGenAI,
    retryWithBackoff,
    extractUsage,
    extractTextFromResponse,
    emptyUsage,
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

// ─── 필드별 추출/병합 설정 ────────────────────────────────────

interface FieldConfig {
    /** Stage 1 데이터에서 분류 대상 배열을 추출 */
    extractArray: (d: Record<string, unknown>) => Record<string, unknown>[];
    /** 분류 입력에 포함할 필드명 목록 */
    inputFields: string[];
    /** 코드가 병합된 배열을 Stage 1 반환 형식으로 감싸기 */
    wrapResult: (merged: Record<string, unknown>[]) => unknown;
}

const FIELD_CONFIG: Record<Stage2FieldKey, FieldConfig> = {
    autonomous_activities: {
        extractArray: (d) => (d.activities as Record<string, unknown>)?.['자율활동'] as Record<string, unknown>[] ?? [],
        inputFields: ['활동명', '특기사항'],
        wrapResult: (merged) => ({ activities: { 자율활동: merged } }),
    },
    club_activities: {
        extractArray: (d) => (d.activities as Record<string, unknown>)?.['동아리활동'] as Record<string, unknown>[] ?? [],
        inputFields: ['활동명', '특기사항'],
        wrapResult: (merged) => ({ activities: { 동아리활동: merged } }),
    },
    career_activities: {
        extractArray: (d) => (d.activities as Record<string, unknown>)?.['진로활동'] as Record<string, unknown>[] ?? [],
        inputFields: ['활동명', '진로희망', '특기사항'],
        wrapResult: (merged) => ({ activities: { 진로활동: merged } }),
    },
    volunteer_activities: {
        extractArray: (d) => (d.activities as Record<string, unknown>)?.['봉사활동실적'] as Record<string, unknown>[] ?? [],
        inputFields: ['활동명', '장소_주관기관명', '특기사항'],
        wrapResult: (merged) => ({ activities: { 봉사활동실적: merged } }),
    },
    awards: {
        extractArray: (d) => d.awards as Record<string, unknown>[] ?? [],
        inputFields: ['수상명', '수여기관'],
        wrapResult: (merged) => ({ awards: merged }),
    },
    license: {
        extractArray: (d) => (d.license as Record<string, unknown>)?.['자격증_및_인증_취득상황'] as Record<string, unknown>[] ?? [],
        inputFields: ['명칭_또는_종류', '발급기관'],
        wrapResult: (merged) => ({ license: { 자격증_및_인증_취득상황: merged } }),
    },
    reading_activities: {
        extractArray: (d) => d.reading_activities as Record<string, unknown>[] ?? [],
        inputFields: ['과목또는영역', '도서명', '독서활동상황'],
        wrapResult: (merged) => ({ reading_activities: merged }),
    },
};

export interface Stage2FieldResult {
    fieldKey: Stage2FieldKey;
    data: unknown;
    usage: TokenUsage;
    error?: string;
}

export class GeminiClassifyService {
    private genAI = createGenAI();

    /**
     * Stage 1 데이터에서 Stage 2 분류에 필요한 최소 필드만 추출 (flat array 반환)
     * 빈 배열 반환 시 → Stage 2 스킵 대상
     */
    private extractClassifyInput(fieldKey: Stage2FieldKey, data: unknown): Record<string, unknown>[] {
        const config = FIELD_CONFIG[fieldKey];
        const arr = config.extractArray(data as Record<string, unknown>);
        return arr.map(item => Object.fromEntries(config.inputFields.map(f => [f, item[f]])));
    }

    /**
     * Stage 2 코드 결과(flat array)를 Stage 1 원본 데이터에 인덱스 기준으로 병합
     */
    private mergeCodesIntoStage1(fieldKey: Stage2FieldKey, stage1Data: unknown, codes: Record<string, unknown>[]): unknown {
        const config = FIELD_CONFIG[fieldKey];
        const orig = config.extractArray(stage1Data as Record<string, unknown>);
        const merged = orig.map((item, i) => ({ ...item, ...(codes[i] ?? {}) }));
        return config.wrapResult(merged);
    }

    public async classifyField(
        fieldKey: Stage2FieldKey,
        stage1Data: unknown,
    ): Promise<Stage2FieldResult> {
        const classifyInput = this.extractClassifyInput(fieldKey, stage1Data);

        if (classifyInput.length === 0) {
            console.log(`  ⏭️ [Stage2][3-Flash] ${fieldKey} 스킵 (빈 배열)`);
            return { fieldKey, data: stage1Data, usage: emptyUsage() };
        }

        console.log(`  🔍 [Stage2][3-Flash] ${fieldKey} 시작 (${classifyInput.length}개 항목)`);

        const textContent = `${STAGE_2_PROMPTS[fieldKey]}\n\n[분류 대상 JSON 배열 - 각 항목의 분류 코드만 반환하세요 (입력 배열과 동일한 순서/개수)]\n${JSON.stringify(classifyInput, null, 2)}`;

        try {
            const result = await retryWithBackoff(
                async () => {
                    const response = await this.genAI.models.generateContent({
                        model: MODEL,
                        contents: [{ role: 'user', parts: [{ text: textContent }] }],
                        config: {
                            temperature: 0,
                            seed: 42,
                            maxOutputTokens: 16384,
                            thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false } as any,
                            responseMimeType: 'application/json',
                            responseSchema: STAGE_2_SCHEMAS[fieldKey] as any,
                            ...(GEMINI_REQUEST_LABELS as any),
                        },
                    });

                    const usage = extractUsage(response);
                    const text = extractTextFromResponse(response);
                    const parsed = extractJsonFromText(text);

                    if (parsed === null) throw new Error(`[Stage2] JSON 파싱 실패: ${text.slice(0, 200)}`);

                    const codesArray = Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [];

                    if (codesArray.length !== classifyInput.length) {
                        console.warn(`  ⚠️ [Stage2][3-Flash] ${fieldKey} 길이 불일치: 입력 ${classifyInput.length}개 / 출력 ${codesArray.length}개`);
                    }

                    const mergedData = this.mergeCodesIntoStage1(fieldKey, stage1Data, codesArray);
                    console.log(`  ✅ [Stage2][3-Flash] ${fieldKey} 완료 | 입력:${usage.promptTokens} 출력:${usage.candidateTokens} think:${usage.thinkingTokens} | ${classifyInput.length}개 항목 처리`);
                    return { fieldKey, data: mergedData, usage };
                },
                (attempt, delay) => console.warn(`  ⚠️ [Stage2][3-Flash] ${fieldKey} 재시도 ${attempt}... ${delay}ms 대기`),
            );
            return result;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ [Stage2][3-Flash] ${fieldKey} 최종 실패: ${msg}`);
            return { fieldKey, data: null, usage: emptyUsage(), error: msg };
        }
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

        const validKeys = stage2Keys.filter(key => stage1Data[key] !== null && stage1Data[key] !== undefined);

        const results = await Promise.all(
            validKeys.map((key) => this.classifyField(key, stage1Data[key]))
        );

        const totalUsage = results.reduce((acc, r) => ({
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
