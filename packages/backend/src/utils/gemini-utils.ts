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

// Gemini 3.1 Pro (gemini-3.1-pro-preview)
const PRICE_3_1_PRO = {
    input: 2.00,
    output: 12.00,
    cacheRead: 0.20,
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

export type ModelType = '3-flash' | '2.5-pro' | '3.1-pro';

export function calcCost(usage: TokenUsage, model: ModelType = '3-flash'): CostBreakdown['cost'] {
    let price;
    if (model === '2.5-pro') price = PRICE_2_5_PRO;
    else if (model === '3.1-pro') price = PRICE_3_1_PRO;
    else price = PRICE_3_FLASH;
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

    // 1) SDK 내부의 text getter를 호출하면 CodeExecutionResult 등 땜에 경고(console.warn) 발생.
    // 우리는 parts 배열에서 순수 text 부분만 가져오도록 자체 처리.
    const candidates = r?.candidates as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(candidates) && candidates.length > 0) {
        const content = candidates[0].content as Record<string, unknown> | undefined;
        const parts = content?.parts as Array<Record<string, unknown>> | undefined;

        if (Array.isArray(parts)) {
            const texts = parts
                .filter(p => typeof p.text === 'string')
                .map(p => p.text as string);

            if (texts.length > 0) {
                return texts.join('').trim();
            }
        }
    }

    // 2) Fallback: 만약 parts가 없거나 빈 문자열이면 원래 로직대로 getter 호출
    if (typeof r?.text === 'string') {
        return (r.text as string).trim();
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
