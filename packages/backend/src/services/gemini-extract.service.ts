import { Type } from '@google/genai';
import { STAGE_1_PROMPTS, SYSTEM_PROMPT, type Stage1FieldKey } from '../../../prompt/src/index.js';
import { STUDENT_GRADES_SYSTEM_PROMPT, STUDENT_GRADES_PROMPT } from '../../../prompt/src/stage_1/student-grades.prompt.js';
import { schoolGradeSchema } from '@gemini-data-extraction/schema';
import { extractJsonFromText } from '../utils/json-extractor.js';
import {
    type TokenUsage,
    type CostBreakdown,
    type ModelType,
    GEMINI_REQUEST_LABELS,
    createGenAI,
    retryWithBackoff,
    extractUsage,
    extractTextFromResponse,
    emptyUsage,
} from '../utils/gemini-utils.js';

const MODEL = 'gemini-3-flash-preview';
const STUDENT_GRADES_MODEL = 'gemini-3.1-pro-preview';

// 성적(student_grades) 제외 (Gemini 3.1 Pro Preview에서 별도 처리), Stage1 활성 필드 (Flash 사용)
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
    // 'student_grades', // 3.1 Pro Preview에서 별도 처리
    'subject_details',
];

export interface Stage1FieldResult {
    fieldKey: Stage1FieldKey;
    data: unknown;
    usage: TokenUsage;
    model: ModelType;
    modelName: string;
    error?: string;
}

export class GeminiExtractService {
    private genAI = createGenAI();

    private async extractField(
        fieldKey: Stage1FieldKey,
        cachedContentName_3flash: string,
        onFieldDone?: (result: Stage1FieldResult) => void
    ): Promise<Stage1FieldResult> {
        const prompt = STAGE_1_PROMPTS[fieldKey];

        let thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        if (fieldKey === 'subject_details') thinkingLevel = 'HIGH';
        else if (fieldKey === 'volunteer_activities') thinkingLevel = 'MEDIUM';

        try {
            const result = await retryWithBackoff(
                async () => {
                    const response = await this.genAI.models.generateContent({
                        model: MODEL,
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        config: {
                            cachedContent: cachedContentName_3flash,
                            temperature: 0,
                            seed: 42,
                            maxOutputTokens: 65536,
                            thinkingConfig: { thinkingLevel, includeThoughts: false } as any,
                            ...(GEMINI_REQUEST_LABELS as any),
                        },
                    });

                    const usage = extractUsage(response);
                    const text = extractTextFromResponse(response);
                    const parsed = extractJsonFromText(text);

                    if (parsed === null) throw new Error(`[Stage1] JSON 파싱 실패: ${text.slice(0, 200)}`);

                    console.log(`  ✅ [Stage1][3-Flash] ${fieldKey} 완료 | 입력:${usage.promptTokens} 출력:${usage.candidateTokens} 캐시:${usage.cachedTokens} think:${usage.thinkingTokens}`);
                    return { fieldKey, data: parsed, usage, model: '3-flash' as const, modelName: MODEL };
                },
                (attempt, delay) => console.warn(`  ⚠️ [Stage1][3-Flash] ${fieldKey} 재시도 ${attempt}... ${delay}ms 대기`),
            );
            onFieldDone?.(result);
            return result;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ [Stage1][3-Flash] ${fieldKey} 최종 실패: ${msg}`);
            const result: Stage1FieldResult = { fieldKey, data: null, usage: emptyUsage(), model: '3-flash', modelName: MODEL, error: msg };
            onFieldDone?.(result);
            return result;
        }
    }

    private async extractStudentGrades(
        cachedContentName_3_1Pro?: string,
        onFieldDone?: (result: Stage1FieldResult) => void
    ): Promise<Stage1FieldResult> {
        const fieldKey: Stage1FieldKey = 'student_grades';

        try {
            const result = await retryWithBackoff(
                async () => {
                    const response = await this.genAI.models.generateContent({
                        model: STUDENT_GRADES_MODEL,
                        contents: [{ role: 'user', parts: [{ text: STUDENT_GRADES_PROMPT }] }],
                        config: {
                            cachedContent: cachedContentName_3_1Pro,
                            temperature: 0,
                            seed: 42,
                            maxOutputTokens: 65536,
                            thinkingConfig: { thinkingBudget: 128 },
                            responseMimeType: 'application/json',
                            responseSchema: {
                                type: Type.OBJECT,
                                properties: { student_grades: schoolGradeSchema.properties.student_grades },
                            },
                            ...(GEMINI_REQUEST_LABELS as any),
                        },
                    });

                    const usage = extractUsage(response);
                    const text = extractTextFromResponse(response);
                    const parsed = extractJsonFromText(text);

                    if (parsed === null) throw new Error(`[Stage1] JSON 파싱 실패 (성적): ${text.slice(0, 200)}`);

                    console.log(`  ✅ [Stage1][3.1-Pro] ${fieldKey} 완료 | 입력:${usage.promptTokens} 출력:${usage.candidateTokens} 캐시:${usage.cachedTokens} think:${usage.thinkingTokens}`);
                    return { fieldKey, data: parsed, usage, model: '3.1-pro' as const, modelName: STUDENT_GRADES_MODEL };
                },
                (attempt, delay) => console.warn(`  ⚠️ [Stage1][3.1-Pro] ${fieldKey} 재시도 ${attempt}... ${delay}ms 대기`),
            );
            onFieldDone?.(result);
            return result;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ [Stage1][3.1-Pro] ${fieldKey} 최종 실패: ${msg}`);
            const result: Stage1FieldResult = { fieldKey, data: null, usage: emptyUsage(), model: '3.1-pro', modelName: STUDENT_GRADES_MODEL, error: msg };
            onFieldDone?.(result);
            return result;
        }
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
        proUsage: TokenUsage;     // 3.1-Pro 사용량
        totalUsage: TokenUsage;   // 전체 합산
    }> {
        let cachedContentName_3flash: string | undefined;
        let cachedContentName_3_1Pro: string | undefined;

        try {
            // Flash 캐시와 Pro 캐시를 병렬로 생성
            console.log('📦 [Stage1] PDF 캐싱 중 (Flash / Pro 병렬)...');
            const [flashSettled, proSettled] = await Promise.allSettled([
                this.genAI.caches.create({
                    model: MODEL,
                    config: {
                        contents: [{ role: 'user', parts: [{ inlineData: { data: pdfBase64, mimeType: 'application/pdf' } }] }],
                        systemInstruction: SYSTEM_PROMPT,
                        tools: [{ codeExecution: {} }],
                        ttl: '600s',
                        ...(GEMINI_REQUEST_LABELS as any),
                    },
                }),
                this.genAI.caches.create({
                    model: STUDENT_GRADES_MODEL,
                    config: {
                        contents: [{ role: 'user', parts: [{ inlineData: { data: pdfBase64, mimeType: 'application/pdf' } }] }],
                        systemInstruction: STUDENT_GRADES_SYSTEM_PROMPT,
                        ttl: '600s',
                        ...(GEMINI_REQUEST_LABELS as any),
                    },
                }),
            ]);

            // 이름을 먼저 추출해야 finally에서 정리 가능
            if (flashSettled.status === 'fulfilled') cachedContentName_3flash = flashSettled.value.name ?? undefined;
            if (proSettled.status === 'fulfilled') cachedContentName_3_1Pro = proSettled.value.name ?? undefined;

            if (!cachedContentName_3flash) throw new Error('[Stage1] 캐시 생성 실패 (Flash)');
            if (!cachedContentName_3_1Pro) throw new Error('[Stage1] 캐시 생성 실패 (Pro)');
            console.log(`✅ [Stage1] 캐시 생성 완료 | Flash: ${cachedContentName_3flash} | Pro: ${cachedContentName_3_1Pro}`);

            console.log(`🚀 [Stage1] 병렬 추출 시작 (${STAGE_1_FIELD_KEYS.length}개 필드 Flash, 성적 1개 필드 Pro)`);
            const flashPromises = STAGE_1_FIELD_KEYS.map((key) => this.extractField(key, cachedContentName_3flash!, onFieldDone));
            const proPromise = this.extractStudentGrades(cachedContentName_3_1Pro, onFieldDone);

            const results = await Promise.all([...flashPromises, proPromise]);

            const flashResults = results.slice(0, STAGE_1_FIELD_KEYS.length);
            const proResult = results[results.length - 1];

            // 1. Flash 캐시 생성 비용(1회) 및 호출당 캐시 읽기 비용 합산
            const flashMaxCachedTokens = Math.max(0, ...flashResults.map((r) => r.usage.cachedTokens));
            const flashUsage: TokenUsage = flashResults.reduce((acc, r) => ({
                promptTokens: acc.promptTokens + r.usage.promptTokens,
                candidateTokens: acc.candidateTokens + r.usage.candidateTokens,
                thinkingTokens: acc.thinkingTokens + r.usage.thinkingTokens,
                cachedTokens: acc.cachedTokens + r.usage.cachedTokens,
                totalTokens: acc.totalTokens + r.usage.totalTokens,
            }), emptyUsage());

            // 캐시 생성 원가 합산
            flashUsage.promptTokens += flashMaxCachedTokens;
            flashUsage.totalTokens += flashMaxCachedTokens;

            // 2. Pro 캐시 생성 비용 및 캐시 읽기 비용 합산
            const proUsage: TokenUsage = {
                ...proResult.usage,
                promptTokens: proResult.usage.promptTokens + proResult.usage.cachedTokens,
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

            console.log(`✅ [Stage1] 추출 완료: ${results.filter(r => !r.error).length}/${results.length}`);
            return { data, errors, flashUsage, proUsage, totalUsage };

        } finally {
            if (cachedContentName_3flash) {
                await this.genAI.caches.delete({ name: cachedContentName_3flash }).catch(() => { });
            }
            if (cachedContentName_3_1Pro) {
                await this.genAI.caches.delete({ name: cachedContentName_3_1Pro }).catch(() => { });
            }
            console.log('🗑️ [Stage1] 캐시 삭제 완료');
        }
    }
}
