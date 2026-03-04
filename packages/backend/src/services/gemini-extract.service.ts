import { GoogleGenAI, Type } from '@google/genai';
import { STAGE_1_PROMPTS, SYSTEM_PROMPT, type Stage1FieldKey } from '../../../prompt/src/index.js';
import { STUDENT_GRADES_SYSTEM_PROMPT, STUDENT_GRADES_PROMPT } from '../../../prompt/src/stage_1/student-grades.prompt.js';
import { schoolGradeSchema } from '@gemini-data-extraction/schema';
import { extractJsonFromText } from '../utils/json-extractor.js';
import {
    type TokenUsage,
    type CostBreakdown,
    sleep,
    isRetriable,
    extractUsage,
    extractTextFromResponse,
    emptyUsage,
    calcCost
} from '../utils/gemini-utils.js';

const MODEL = 'gemini-3-flash-preview';

// 성적(student_grades) 제외 (제미나이 2.5 Pro에서 별도 처리), Stage1 활성 필드 (Flash 사용)
const STAGE_1_FIELD_KEYS: Stage1FieldKey[] = [
    'autonomous_activities',
    'club_activities',
    'career_activities',
    'volunteer_activities',
    'attendance',
    'awards',
    'behavior_comments',
    'license',
    'reading_activities',
    // 'student_grades', // 2.5 Pro에서 별도 처리
    'subject_details',
];

const MAX_RETRIES = 3;

export interface Stage1FieldResult {
    fieldKey: Stage1FieldKey;
    data: unknown;
    usage: TokenUsage;
    error?: string;
}

export class GeminiExtractService {
    private genAI: GoogleGenAI;

    constructor() {
        const project = process.env.VERTEX_PROJECT;
        const location = process.env.VERTEX_LOCATION ?? 'global';
        if (!project) throw new Error('VERTEX_PROJECT 환경변수가 설정되지 않았습니다.');
        this.genAI = new GoogleGenAI({ vertexai: true, project, location });
    }

    private async extractField(
        fieldKey: Stage1FieldKey,
        cachedContentName_3flash: string,
        onFieldDone?: (result: Stage1FieldResult) => void
    ): Promise<Stage1FieldResult> {
        const prompt = STAGE_1_PROMPTS[fieldKey];

        const thinkingLevel = fieldKey === 'subject_details' ? 'HIGH' : 'LOW';

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await this.genAI.models.generateContent({
                    model: MODEL,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        cachedContent: cachedContentName_3flash,
                        temperature: 0,
                        maxOutputTokens: 65536,
                        thinkingConfig: {
                            thinkingLevel,
                            includeThoughts: false,
                        } as any,
                    },
                });

                const usage = extractUsage(response);
                const text = extractTextFromResponse(response);
                const parsed = extractJsonFromText(text);

                if (parsed === null) throw new Error(`[Stage1] JSON 파싱 실패: ${text.slice(0, 200)}`);

                console.log(`  ✅ [Stage1][3-Flash] ${fieldKey} 완료 | 입력:${usage.promptTokens} 출력:${usage.candidateTokens} 캐시:${usage.cachedTokens} think:${usage.thinkingTokens}`);
                const result = { fieldKey, data: parsed, usage };
                if (onFieldDone) onFieldDone(result);
                return result;
            } catch (error) {
                const isLast = attempt === MAX_RETRIES;
                if (!isLast && isRetriable(error)) {
                    const delay = 1000 * Math.pow(2, attempt - 1);
                    console.warn(`  ⚠️ [Stage1][3-Flash] ${fieldKey} 재시도 ${attempt}... ${delay}ms 대기`);
                    await sleep(delay);
                } else {
                    const msg = error instanceof Error ? error.message : String(error);
                    console.error(`  ❌ [Stage1][3-Flash] ${fieldKey} 최종 실패: ${msg}`);
                    const result = { fieldKey, data: null, usage: emptyUsage(), error: msg };
                    if (onFieldDone) onFieldDone(result);
                    return result;
                }
            }
        }
        const result = { fieldKey, data: null, usage: emptyUsage(), error: '최대 재시도 초과' };
        if (onFieldDone) onFieldDone(result);
        return result;
    }

    private async extractStudentGrades(pdfBase64: string, cachedContentName_2_5Pro?: string, onFieldDone?: (result: Stage1FieldResult) => void): Promise<Stage1FieldResult> {
        const fieldKey: Stage1FieldKey = 'student_grades';
        const prompt = STUDENT_GRADES_PROMPT;
        // 성적 전용 Gemini 2.5 Pro 모델 (캐싱 사용)
        const MODEL_PRO = 'gemini-2.5-pro';

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await this.genAI.models.generateContent({
                    model: MODEL_PRO,
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: prompt }
                        ]
                    }],
                    config: {
                        cachedContent: cachedContentName_2_5Pro,
                        temperature: 0,
                        seed: 42,
                        maxOutputTokens: 65536,
                        thinkingConfig: {
                            thinkingBudget: 128,
                        },
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                student_grades: schoolGradeSchema.properties.student_grades
                            },
                        },
                    },
                });

                const usage = extractUsage(response);
                const text = extractTextFromResponse(response);
                const parsed = extractJsonFromText(text);

                if (parsed === null) throw new Error(`[Stage1] JSON 파싱 실패 (성적): ${text.slice(0, 200)}`);

                console.log(`  ✅ [Stage1][2.5-Pro] ${fieldKey} 완료 | 입력:${usage.promptTokens} 출력:${usage.candidateTokens} 캐시:${usage.cachedTokens} think:${usage.thinkingTokens}`);
                const result = { fieldKey, data: parsed, usage };
                if (onFieldDone) onFieldDone(result);
                return result;
            } catch (error) {
                const isLast = attempt === MAX_RETRIES;
                if (!isLast && isRetriable(error)) {
                    const delay = 1000 * Math.pow(2, attempt - 1);
                    console.warn(`  ⚠️ [Stage1][2.5-Pro] ${fieldKey} 재시도 ${attempt}... ${delay}ms 대기`);
                    await sleep(delay);
                } else {
                    const msg = error instanceof Error ? error.message : String(error);
                    console.error(`  ❌ [Stage1][2.5-Pro] ${fieldKey} 최종 실패: ${msg}`);
                    const result = { fieldKey, data: null, usage: emptyUsage(), error: msg };
                    if (onFieldDone) onFieldDone(result);
                    return result;
                }
            }
        }
        const result = { fieldKey, data: null, usage: emptyUsage(), error: '최대 재시도 초과' };
        if (onFieldDone) onFieldDone(result);
        return result;
    }

    /**
     * PDF를 캐싱하고 Stage 1 프롬프트(순수 텍스트 추출)를 병렬 실행
     */
    async executeStage1(
        pdfBase64: string,
        onFieldDone?: (result: Stage1FieldResult) => void
    ): Promise<{
        data: Record<string, unknown>;
        errors: Record<string, string>;
        flashUsage: TokenUsage;   // 3-Flash 사용량
        proUsage: TokenUsage;     // 2.5-Pro 사용량
        totalUsage: TokenUsage;   // 전체 합산
    }> {
        let cachedContentName_3flash: string | undefined;
        let cachedContentName_2_5Pro: string | undefined;

        try {
            console.log('📦 [Stage1] PDF 캐싱 중 (Flash)...');
            const cachedContent = await this.genAI.caches.create({
                model: MODEL,
                config: {
                    contents: [{
                        role: 'user',
                        parts: [{ inlineData: { data: pdfBase64, mimeType: 'application/pdf' } }],
                    }],
                    systemInstruction: SYSTEM_PROMPT,
                    tools: [{ codeExecution: {} }],
                    ttl: '600s',
                    ...({
                        labels: {
                            feature: "school-record_ai-report",
                            environment: "test"
                        }
                    } as any)
                },
            });

            cachedContentName_3flash = cachedContent.name ?? undefined;
            if (!cachedContentName_3flash) throw new Error('[Stage1] 캐시 생성 실패 (Flash)');
            console.log(`✅ [Stage1] 캐시 생성 (Flash): ${cachedContentName_3flash}`);

            console.log('📦 [Stage1] PDF 캐싱 중 (Pro)...');
            const cachedContentPro = await this.genAI.caches.create({
                model: 'gemini-2.5-pro',
                config: {
                    contents: [{
                        role: 'user',
                        parts: [{ inlineData: { data: pdfBase64, mimeType: 'application/pdf' } }],
                    }],
                    systemInstruction: STUDENT_GRADES_SYSTEM_PROMPT,
                    ttl: '600s',
                    ...({
                        labels: {
                            feature: "school-record_ai-report",
                            environment: "test"
                        }
                    } as any)
                },
            });

            cachedContentName_2_5Pro = cachedContentPro.name ?? undefined;
            if (!cachedContentName_2_5Pro) throw new Error('[Stage1] 캐시 생성 실패 (Pro)');
            console.log(`✅ [Stage1] 캐시 생성 (Pro): ${cachedContentName_2_5Pro}`);

            console.log(`🚀 [Stage1] 병렬 추출 시작 (${STAGE_1_FIELD_KEYS.length}개 필드 Flash, 성적 1개 필드 Pro)`);
            const flashPromises = STAGE_1_FIELD_KEYS.map((key) => this.extractField(key, cachedContentName_3flash!, onFieldDone));
            const proPromise = this.extractStudentGrades(pdfBase64, cachedContentName_2_5Pro, onFieldDone);

            const results = await Promise.all([...flashPromises, proPromise]);

            const flashResults = results.slice(0, STAGE_1_FIELD_KEYS.length);
            const proResult = results[results.length - 1];

            // 1. Flash 캐시 생성 비용(1회) 및 호출당 캐시 읽기 비용 합산
            const flashMaxCachedTokens = Math.max(0, ...flashResults.map((r) => r.usage.cachedTokens));
            const flashUsage: TokenUsage = flashResults.reduce((acc, r) => ({
                // 캐시 생성 토큰은 promptTokens(표준 입력 요금)으로 1회 정산되어야 하므로 acc.promptTokens 초기값을 flashMaxCachedTokens로 처리 (reduce 이후 추가)
                promptTokens: acc.promptTokens + r.usage.promptTokens,
                candidateTokens: acc.candidateTokens + r.usage.candidateTokens,
                thinkingTokens: acc.thinkingTokens + r.usage.thinkingTokens,
                cachedTokens: acc.cachedTokens + r.usage.cachedTokens, // 매 호출마다 읽었으므로 합산
                totalTokens: acc.totalTokens + r.usage.totalTokens, // 캐시 생성분은 아래에서 추가
            }), emptyUsage());

            // 캐시 생성 원가 합산
            flashUsage.promptTokens += flashMaxCachedTokens;
            flashUsage.totalTokens += flashMaxCachedTokens;

            // 2. Pro 캐시 생성 비용 및 캐시 읽기 비용 합산 (1회 호출이므로 그대로 사용 후 캐시 생성비 추가)
            const proUsage: TokenUsage = {
                ...proResult.usage,
                promptTokens: proResult.usage.promptTokens + proResult.usage.cachedTokens, // 캐시 생성 비용 추가
                totalTokens: proResult.usage.totalTokens + proResult.usage.cachedTokens,
            };

            const totalUsage: TokenUsage = {
                promptTokens: flashUsage.promptTokens + proUsage.promptTokens,
                candidateTokens: flashUsage.candidateTokens + proUsage.candidateTokens,
                thinkingTokens: flashUsage.thinkingTokens + proUsage.thinkingTokens,
                cachedTokens: flashUsage.cachedTokens + proUsage.cachedTokens,
                totalTokens: flashUsage.totalTokens + proUsage.totalTokens,
            };

            const data: Record<string, unknown> = {};
            const errors: Record<string, string> = {};
            for (const r of results) {
                if (r.error) errors[r.fieldKey] = r.error;
                else data[r.fieldKey] = r.data;
            }

            const total = results.filter(r => !r.error).length;
            console.log(`✅ [Stage1] 추출 완료: ${total}/${results.length}`);

            return { data, errors, flashUsage, proUsage, totalUsage };

        } finally {
            if (cachedContentName_3flash) {
                await this.genAI.caches.delete({ name: cachedContentName_3flash }).catch(() => { });
            }
            if (cachedContentName_2_5Pro) {
                await this.genAI.caches.delete({ name: cachedContentName_2_5Pro }).catch(() => { });
            }
            console.log('🗑️ [Stage1] 캐시 삭제 완료');
        }
    }
}
