import type { TokenUsage, ModelCost, CostBreakdown, DetailedCostDetails, ExtractResponse } from '@school-record/shared';

export type { TokenUsage, ModelCost, CostBreakdown, DetailedCostDetails, ExtractResponse };

const API_BASE = '/api';

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
