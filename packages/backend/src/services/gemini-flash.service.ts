import { GoogleGenAI } from '@google/genai';
import { PROMPTS_BY_FIELD, SYSTEM_PROMPT, type SchoolRecordFieldKey } from '../../../prompt/src/index.ts';
import { extractJsonFromText } from '../utils/json-extractor.js';

const MODEL = 'gemini-3-flash-preview';
const FIELD_KEYS: SchoolRecordFieldKey[] = [
    'autonomous_activities',
    'club_activities',
    'career_activities',
    'volunteer_activities',
    'attendance',
    'awards',
    'behavior_comments',
    'license',
    'reading_activities',
    // 'student_grades',  // 성적 추출 비활성화
    'subject_details',
];

const MAX_RETRIES = 3;

// ─── 요금표 (USD / 1M 토큰) ──────────────────────────────────
const PRICE = {
    input: 0.50,          // 텍스트 / 이미지 / 동영상 입력
    output: 3.00,         // 출력 (thinking 포함)
    cacheRead: 0.05,      // 컨텍스트 캐시 읽기
} as const;

export interface TokenUsage {
    promptTokens: number;       // 캐시 제외 입력
    candidateTokens: number;    // 출력 (생성 토큰)
    thinkingTokens: number;     // 사고(thinking) 토큰
    cachedTokens: number;       // 캐시 읽기 토큰
    totalTokens: number;
}

export interface CostBreakdown {
    usage: TokenUsage;
    cost: {
        inputUsd: number;
        outputUsd: number;
        cacheReadUsd: number;
        totalUsd: number;
        totalKrw: number;         // 1 USD ≈ 1,450 KRW 기준
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriable(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return (
            msg.includes('429') ||
            msg.includes('503') ||
            msg.includes('rate limit') ||
            msg.includes('quota') ||
            msg.includes('timeout')
        );
    }
    return false;
}

function extractUsage(response: unknown): TokenUsage {
    const r = response as Record<string, unknown>;
    const meta = r?.usageMetadata as Record<string, number> | undefined;
    return {
        promptTokens: (meta?.promptTokenCount ?? 0) - (meta?.cachedContentTokenCount ?? 0),
        candidateTokens: meta?.candidatesTokenCount ?? 0,
        thinkingTokens: meta?.thoughtsTokenCount ?? 0,
        cachedTokens: meta?.cachedContentTokenCount ?? 0,
        totalTokens: meta?.totalTokenCount ?? 0,
    };
}

function calcCost(usage: TokenUsage): CostBreakdown['cost'] {
    const inputUsd = (usage.promptTokens / 1_000_000) * PRICE.input;
    const outputUsd = ((usage.candidateTokens + usage.thinkingTokens) / 1_000_000) * PRICE.output;
    const cacheReadUsd = (usage.cachedTokens / 1_000_000) * PRICE.cacheRead;
    const totalUsd = inputUsd + outputUsd + cacheReadUsd;
    return {
        inputUsd,
        outputUsd,
        cacheReadUsd,
        totalUsd,
        totalKrw: totalUsd * 1_450,
    };
}

interface FieldResult {
    fieldKey: SchoolRecordFieldKey;
    data: unknown;
    usage: TokenUsage;
    error?: string;
}

export class GeminiFlashService {
    private genAI: GoogleGenAI;

    constructor() {
        const project = process.env.VERTEX_PROJECT;
        const location = process.env.VERTEX_LOCATION ?? 'global';
        if (!project) throw new Error('VERTEX_PROJECT 환경변수가 설정되지 않았습니다.');
        this.genAI = new GoogleGenAI({ vertexai: true, project, location });
    }

    private extractTextFromResponse(response: unknown): string {
        const r = response as Record<string, unknown>;
        if (typeof r?.text === 'string' && r.text.trim().length > 0) return r.text;
        const candidates = r?.candidates as Array<Record<string, unknown>> | undefined;
        const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(parts)) {
            const textParts = parts.filter(
                (p) => typeof p?.text === 'string' && !p?.executableCode && !p?.codeExecutionResult
            );
            const last = textParts[textParts.length - 1];
            if (last && typeof last.text === 'string') return last.text;
        }
        return '';
    }

    private async extractField(
        fieldKey: SchoolRecordFieldKey,
        cachedContentName: string,
    ): Promise<FieldResult> {
        const prompt = PROMPTS_BY_FIELD[fieldKey];
        const emptyUsage: TokenUsage = {
            promptTokens: 0, candidateTokens: 0, thinkingTokens: 0, cachedTokens: 0, totalTokens: 0
        };

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await this.genAI.models.generateContent({
                    model: MODEL,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        cachedContent: cachedContentName,
                        temperature: 0,
                        maxOutputTokens: 65536,
                    },
                });

                const usage = extractUsage(response);
                const text = this.extractTextFromResponse(response);
                const parsed = extractJsonFromText(text);

                if (parsed === null) throw new Error(`JSON 파싱 실패: ${text.slice(0, 200)}`);

                console.log(`  ✅ [${fieldKey}] 완료 | 입력:${usage.promptTokens} 출력:${usage.candidateTokens} 캐시:${usage.cachedTokens} think:${usage.thinkingTokens}`);
                return { fieldKey, data: parsed, usage };
            } catch (error) {
                const isLast = attempt === MAX_RETRIES;
                if (!isLast && isRetriable(error)) {
                    const delay = 1000 * Math.pow(2, attempt - 1);
                    console.warn(`  ⚠️ [${fieldKey}] 재시도 ${attempt}... ${delay}ms 대기`);
                    await sleep(delay);
                } else {
                    const msg = error instanceof Error ? error.message : String(error);
                    console.error(`  ❌ [${fieldKey}] 최종 실패: ${msg}`);
                    return { fieldKey, data: null, usage: emptyUsage, error: msg };
                }
            }
        }
        return { fieldKey, data: null, usage: emptyUsage, error: '최대 재시도 초과' };
    }

    async extractAll(pdfBase64: string): Promise<{
        data: Record<string, unknown>;
        errors: Record<string, string>;
        costBreakdown: CostBreakdown;
        durationMs: number;
    }> {
        const startTime = Date.now();
        let cachedContentName: string | undefined;

        try {
            console.log('📦 PDF 캐싱 중...');
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
                },
            });

            cachedContentName = cachedContent.name ?? undefined;
            if (!cachedContentName) throw new Error('캐시 생성 실패');
            console.log(`✅ 캐시 생성: ${cachedContentName}`);

            console.log(`🚀 병렬 추출 시작 (${FIELD_KEYS.length}개 필드, 모델: ${MODEL})`);
            const results = await Promise.all(FIELD_KEYS.map((key) => this.extractField(key, cachedContentName!)));

            // 토큰 합산
            const totalUsage: TokenUsage = results.reduce((acc, r) => ({
                promptTokens: acc.promptTokens + r.usage.promptTokens,
                candidateTokens: acc.candidateTokens + r.usage.candidateTokens,
                thinkingTokens: acc.thinkingTokens + r.usage.thinkingTokens,
                cachedTokens: Math.max(acc.cachedTokens, r.usage.cachedTokens), // 사용자 요청: 캐시 읽기는 웹에 한 번 쓴 걸로 표시
                totalTokens: acc.totalTokens + r.usage.totalTokens,
            }), { promptTokens: 0, candidateTokens: 0, thinkingTokens: 0, cachedTokens: 0, totalTokens: 0 });

            const costBreakdown: CostBreakdown = { usage: totalUsage, cost: calcCost(totalUsage) };

            const data: Record<string, unknown> = {};
            const errors: Record<string, string> = {};
            for (const r of results) {
                if (r.error) errors[r.fieldKey] = r.error;
                else data[r.fieldKey] = r.data;
            }

            const total = results.filter(r => !r.error).length;
            const durationMs = Date.now() - startTime;
            console.log(`✅ 추출 완료: ${total}/${FIELD_KEYS.length} (소요시간: ${(durationMs / 1000).toFixed(1)}초)`);
            console.log(`💰 총 비용: $${costBreakdown.cost.totalUsd.toFixed(6)} (₩${costBreakdown.cost.totalKrw.toFixed(2)})`);
            console.log(`   입력: ${totalUsage.promptTokens.toLocaleString()}tok | 출력: ${totalUsage.candidateTokens.toLocaleString()}tok | 캐시읽기: ${totalUsage.cachedTokens.toLocaleString()}tok | thinking: ${totalUsage.thinkingTokens.toLocaleString()}tok`);

            return { data, errors, costBreakdown, durationMs };

        } finally {
            if (cachedContentName) {
                await this.genAI.caches.delete({ name: cachedContentName }).catch(() => { });
                console.log('🗑️ 캐시 삭제 완료');
            }
        }
    }
}
