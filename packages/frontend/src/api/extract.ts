const API_BASE = '/api';

export interface TokenUsage {
    promptTokens: number;
    candidateTokens: number;
    thinkingTokens: number;
    cachedTokens: number;
    totalTokens: number;
}

export interface ModelCost {
    inputUsd: number;
    outputUsd: number;
    cacheReadUsd: number;
    totalUsd: number;
    totalKrw: number;
}

export interface CostBreakdown {
    usage: TokenUsage;
    cost: ModelCost;
}

export interface ExtractResponse {
    success: boolean;
    data?: Record<string, unknown>;
    errors?: Record<string, string>;
    costBreakdown?: CostBreakdown;
    flashCost?: ModelCost;
    proCost?: ModelCost;
    stage2Cost?: ModelCost;
    durationMs?: number;
    error?: string;
}

export async function extractFromPdf(file: File): Promise<ExtractResponse> {
    const formData = new FormData();
    formData.append('pdf', file);

    const response = await fetch(`${API_BASE}/extract`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error ?? '서버 오류');
    }

    return response.json();
}
