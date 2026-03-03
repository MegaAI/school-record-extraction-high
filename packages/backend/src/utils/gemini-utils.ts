export interface TokenUsage {
    promptTokens: number;
    candidateTokens: number;
    thinkingTokens: number;
    cachedTokens: number;
    totalTokens: number;
}

export interface CostBreakdown {
    usage: TokenUsage;
    cost: {
        inputUsd: number;
        outputUsd: number;
        cacheReadUsd: number;
        totalUsd: number;
        totalKrw: number;
    };
}

// ─── 요금표 (USD / 1M 토큰) ──────────────────────────────────
// Gemini 3 Flash (gemini-3-flash-preview)
const PRICE_3_FLASH = {
    input: 0.50,        // 텍스트 / 이미지 / 동영상 입력
    output: 3.00,       // 출력 (thinking 포함)
    cacheRead: 0.05,    // 컨텍스트 캐시 읽기
} as const;

// Gemini 2.5 Pro (gemini-2.5-pro) - 200K 토큰 이하 기준
const PRICE_2_5_PRO = {
    input: 1.25,        // 입력 (≤200K 토큰)
    output: 10.00,      // 출력, thinking 포함 (≤200K 토큰)
    cacheRead: 0.125,   // 컨텍스트 캐시 읽기 (≤200K 토큰)
} as const;

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetriable(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return (
            msg.includes('429') ||
            msg.includes('503') ||
            msg.includes('rate limit') ||
            msg.includes('quota') ||
            msg.includes('timeout') ||
            msg.includes('resource_exhausted') ||
            msg.includes('throttl')
        );
    }
    return false;
}

export function extractUsage(response: unknown): TokenUsage {
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

export type ModelType = '3-flash' | '2.5-pro';

export function calcCost(usage: TokenUsage, model: ModelType = '3-flash'): CostBreakdown['cost'] {
    const price = model === '2.5-pro' ? PRICE_2_5_PRO : PRICE_3_FLASH;
    const inputUsd = (usage.promptTokens / 1_000_000) * price.input;
    const outputUsd = ((usage.candidateTokens + usage.thinkingTokens) / 1_000_000) * price.output;
    const cacheReadUsd = (usage.cachedTokens / 1_000_000) * price.cacheRead;
    const totalUsd = inputUsd + outputUsd + cacheReadUsd;
    return {
        inputUsd,
        outputUsd,
        cacheReadUsd,
        totalUsd,
        totalKrw: totalUsd * 1_350,
    };
}

export function extractTextFromResponse(response: unknown): string {
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

export function emptyUsage(): TokenUsage {
    return { promptTokens: 0, candidateTokens: 0, thinkingTokens: 0, cachedTokens: 0, totalTokens: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
    return {
        promptTokens: a.promptTokens + b.promptTokens,
        candidateTokens: a.candidateTokens + b.candidateTokens,
        thinkingTokens: a.thinkingTokens + b.thinkingTokens,
        // 사용자 요청: 캐시 읽기는 웹에 한 번 쓴 걸로 합산 시 최대값 등으로 하거나 단순히 더하는 방식
        // 여기선 Stage 1/2 가 각각 다르므로 단순 합산 또는 필요에 따라 조절합니다.
        cachedTokens: a.cachedTokens + b.cachedTokens,
        totalTokens: a.totalTokens + b.totalTokens,
    };
}
