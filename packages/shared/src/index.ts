// ─── Token & Cost ─────────────────────────────────────────────────────────────

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

// ─── Detailed Cost ────────────────────────────────────────────────────────────

export interface DetailedEstimatedCost {
    inputCost: number;
    cachedInputCost: number;
    outputCost: number;
    cacheStorageCost: number;
    totalCost: number;
}

export interface CacheStorageInfo {
    cachedTokenCount: number;
    storageTimeSeconds: number;
    storageCost: number;
}

export interface DetailedCostDetails {
    nonCachedInputTokenCount: number;
    cachedInputTokenCount: number;
    outputTokenCount: number;
    estimatedCost: DetailedEstimatedCost;
    cacheStorageInfo?: CacheStorageInfo;
}

// ─── Model ────────────────────────────────────────────────────────────────────

export type ModelType = '3-flash' | '3.1-pro';

// ─── API Response ─────────────────────────────────────────────────────────────

export interface FieldStat {
    durationMs: number;
    costDetails: DetailedCostDetails;
    model: string;
}

export interface ExtractResponse {
    success: boolean;
    data?: Record<string, unknown>;
    errors?: Record<string, string>;
    costBreakdown?: CostBreakdown;
    stage1Flash?: CostBreakdown;
    stage1Pro?: CostBreakdown;
    stage2Flash?: CostBreakdown;
    durationMs?: number;
    processingTimeMs?: number;
    fieldDurationMs?: Record<string, number>;
    fieldStats?: Record<string, FieldStat>;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        thoughtsTokenCount: number;
        cachedContentTokenCount: number;
        totalTokenCount: number;
        costDetails: DetailedCostDetails;
        stage1Flash?: CostBreakdown;
        stage1Pro?: CostBreakdown;
        stage2Flash?: CostBreakdown;
        errors?: Record<string, string>;
    };
    error?: string;
}
