import { Router } from 'express';
import multer from 'multer';
import { PipelineService } from '../services/pipeline.service.js';

export const extractRoute = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('PDF 파일만 업로드 가능합니다.'));
    },
});

const pipeline = new PipelineService();

function buildUsageMetadata(
    costBreakdown: {
        usage: {
            promptTokens: number;
            candidateTokens: number;
            thinkingTokens: number;
            cachedTokens: number;
            totalTokens: number;
        };
        cost: {
            inputUsd: number;
            outputUsd: number;
            cacheReadUsd: number;
            totalUsd: number;
            totalKrw: number;
        };
    },
    stage1FlashBreakdown: unknown,
    stage1ProBreakdown: unknown,
    stage2Breakdown: unknown,
    errors: Record<string, string>,
    processingTimeMs: number,
) {
    return {
        promptTokenCount: costBreakdown.usage.promptTokens + costBreakdown.usage.cachedTokens,
        candidatesTokenCount: costBreakdown.usage.candidateTokens,
        thoughtsTokenCount: costBreakdown.usage.thinkingTokens,
        cachedContentTokenCount: costBreakdown.usage.cachedTokens,
        totalTokenCount: costBreakdown.usage.totalTokens,
        costDetails: {
            nonCachedInputTokenCount: costBreakdown.usage.promptTokens,
            cachedInputTokenCount: costBreakdown.usage.cachedTokens,
            outputTokenCount: costBreakdown.usage.candidateTokens + costBreakdown.usage.thinkingTokens,
            estimatedCost: {
                inputCost: costBreakdown.cost.inputUsd,
                cachedInputCost: costBreakdown.cost.cacheReadUsd,
                outputCost: costBreakdown.cost.outputUsd,
                cacheStorageCost: 0,
                totalCost: costBreakdown.cost.totalUsd,
            },
            cacheStorageInfo: costBreakdown.usage.cachedTokens > 0 ? {
                cachedTokenCount: costBreakdown.usage.cachedTokens,
                storageTimeSeconds: processingTimeMs / 1000,
                storageCost: 0,
            } : undefined,
        },
        stage1Flash: stage1FlashBreakdown,
        stage1Pro: stage1ProBreakdown,
        stage2Flash: stage2Breakdown,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
}

extractRoute.post('/extract', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'PDF 파일이 필요합니다.' });
            return;
        }

        const pdfBase64 = req.file.buffer.toString('base64');
        console.log(`\n📄 PDF 수신: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);

        const { data, errors, costBreakdown, stage1FlashBreakdown, stage1ProBreakdown, stage2Breakdown, durationMs, fieldDurationMs, fieldStats } = await pipeline.runPipeline(pdfBase64);
        const usageMetadata = buildUsageMetadata(costBreakdown, stage1FlashBreakdown, stage1ProBreakdown, stage2Breakdown, errors, durationMs);

        res.json({
            success: true,
            data,
            errors: Object.keys(errors).length > 0 ? errors : undefined,
            costBreakdown,
            stage1Flash: stage1FlashBreakdown,
            stage1Pro: stage1ProBreakdown,
            stage2Flash: stage2Breakdown,
            durationMs,
            fieldDurationMs,
            processingTimeMs: durationMs,
            fieldStats,
            usageMetadata,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('추출 실패:', msg);
        res.status(500).json({ success: false, error: msg });
    }
});
