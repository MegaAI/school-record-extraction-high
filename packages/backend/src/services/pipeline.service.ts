import { GeminiExtractService } from './gemini-extract.service.js';
import { GeminiClassifyService } from './gemini-classify.service.js';
import { type CostBreakdown, type TokenUsage, type ModelType, addUsage, calcCost } from '../utils/gemini-utils.js';
import { type Stage2FieldKey } from '../../../prompt/src/index.js';

type ModelCost = CostBreakdown['cost'];

export class PipelineService {
    private extractService: GeminiExtractService;
    private classifyService: GeminiClassifyService;

    constructor() {
        this.extractService = new GeminiExtractService();
        this.classifyService = new GeminiClassifyService();
    }

    async runPipeline(pdfBase64: string): Promise<{
        data: Record<string, unknown>;
        errors: Record<string, string>;
        costBreakdown: CostBreakdown;
        flashCost: ModelCost;
        proCost: ModelCost;
        stage2Cost: ModelCost;
        durationMs: number;
    }> {
        const startTime = Date.now();

        const stage2Promises: Promise<any>[] = [];

        const onFieldDone = (result: any) => {
            if (result.error || !result.data) return;
            const STAGE_2_KEYS = ['autonomous_activities', 'club_activities', 'career_activities', 'volunteer_activities', 'awards', 'license', 'reading_activities'];
            if (STAGE_2_KEYS.includes(result.fieldKey)) {
                // 특정 필드의 추출이 끝나면 즉시 Stage 2(분류) 시작 (파이프라이닝)
                stage2Promises.push(this.classifyService.classifyField(result.fieldKey, result.data));
            }
        };

        console.log('--- [Pipeline] Stage 1 (텍스트 추출) 시작 ---');
        const stage1Result = await this.extractService.executeStage1(pdfBase64, onFieldDone);

        if (Object.keys(stage1Result.data).length === 0 && Object.keys(stage1Result.errors).length > 0) {
            console.error('--- [Pipeline] Stage 1 이 모두 실패하여 Stage 2를 진행하지 않습니다 ---');
            const flashCost = calcCost(stage1Result.flashUsage, '3-flash');
            const proCost = calcCost(stage1Result.proUsage, '2.5-pro');
            const totalUsd = flashCost.totalUsd + proCost.totalUsd;
            return {
                data: {},
                errors: stage1Result.errors,
                costBreakdown: {
                    usage: stage1Result.totalUsage,
                    cost: { ...flashCost, totalUsd, totalKrw: totalUsd * 1_450 }
                },
                flashCost,
                proCost,
                stage2Cost: { inputUsd: 0, outputUsd: 0, cacheReadUsd: 0, totalUsd: 0, totalKrw: 0 },
                durationMs: Date.now() - startTime,
            };
        }

        console.log('--- [Pipeline] Stage 2 (분류 모델) 결과 대기 ---');
        const stage2RawResults = await Promise.all(stage2Promises);

        console.log('--- [Pipeline] 결과 병합 ---');
        const finalData = { ...stage1Result.data };
        const finalErrors = { ...stage1Result.errors };

        let s2PromptTokens = 0;
        let s2CandidateTokens = 0;
        let s2ThinkingTokens = 0;
        let s2CachedTokens = 0;
        let s2TotalTokens = 0;

        // Stage 2의 결과물로 Stage 1의 결과물들을 덮어씁니다.
        for (const r of stage2RawResults) {
            if (r.error) {
                finalErrors[r.fieldKey] = `[Stage2 에러] ${r.error}`;
            } else {
                // r.data는 stage1Data[key]에 해당하는 객체이므로, 바로 병합하거나 덮어쓴다. (classifyField는 병합된 객체를 반환힘)
                finalData[r.fieldKey] = Object.assign({}, finalData[r.fieldKey] as any, r.data);
            }
            s2PromptTokens += r.usage.promptTokens;
            s2CandidateTokens += r.usage.candidateTokens;
            s2ThinkingTokens += r.usage.thinkingTokens;
            s2CachedTokens += r.usage.cachedTokens;
            s2TotalTokens += r.usage.totalTokens;
        }

        // 전체 Stage 2 사용량
        const stage2TotalUsage: TokenUsage = {
            promptTokens: s2PromptTokens,
            candidateTokens: s2CandidateTokens,
            thinkingTokens: s2ThinkingTokens,
            cachedTokens: s2CachedTokens,
            totalTokens: s2TotalTokens,
        };

        const totalUsage: TokenUsage = addUsage(stage1Result.totalUsage, stage2TotalUsage);

        // 모델별 비용 분리 계산
        const flashCost = calcCost(stage1Result.flashUsage, '3-flash');
        const proCost = calcCost(stage1Result.proUsage, '2.5-pro');
        const stage2Cost = calcCost(stage2TotalUsage, '3-flash'); // Stage2는 Flash 모델
        const totalUsd = flashCost.totalUsd + proCost.totalUsd + stage2Cost.totalUsd;
        const costBreakdown: CostBreakdown = {
            usage: totalUsage,
            cost: {
                inputUsd: flashCost.inputUsd + proCost.inputUsd + stage2Cost.inputUsd,
                outputUsd: flashCost.outputUsd + proCost.outputUsd + stage2Cost.outputUsd,
                cacheReadUsd: flashCost.cacheReadUsd + proCost.cacheReadUsd + stage2Cost.cacheReadUsd,
                totalUsd,
                totalKrw: totalUsd * 1_450,
            },
        };
        const durationMs = Date.now() - startTime;

        console.log(`✅ [Pipeline] 최종 파이프라인 완료 (소요시간: ${(durationMs / 1000).toFixed(1)}초)`);
        console.log(`💰 총 비용: $${totalUsd.toFixed(6)} (₩${costBreakdown.cost.totalKrw.toFixed(2)})`);
        console.log(`   ├ [Stage1] Gemini 3 Flash : $${flashCost.totalUsd.toFixed(6)} | 입력:${stage1Result.flashUsage.promptTokens.toLocaleString()}tok 출력:${stage1Result.flashUsage.candidateTokens.toLocaleString()}tok 캐시:${stage1Result.flashUsage.cachedTokens.toLocaleString()}tok`);
        console.log(`   ├ [Stage1] Gemini 2.5 Pro : $${proCost.totalUsd.toFixed(6)} | 입력:${stage1Result.proUsage.promptTokens.toLocaleString()}tok 출력:${stage1Result.proUsage.candidateTokens.toLocaleString()}tok 캐시:${stage1Result.proUsage.cachedTokens.toLocaleString()}tok think:${stage1Result.proUsage.thinkingTokens.toLocaleString()}tok`);
        console.log(`   └ [Stage2] Gemini 3 Flash : $${stage2Cost.totalUsd.toFixed(6)} | 입력:${stage2TotalUsage.promptTokens.toLocaleString()}tok 출력:${stage2TotalUsage.candidateTokens.toLocaleString()}tok`);

        return {
            data: finalData,
            errors: finalErrors,
            costBreakdown,
            flashCost,
            proCost,
            stage2Cost,
            durationMs,
        };
    }
}
