import { GeminiExtractService, type Stage1FieldResult } from './gemini-extract.service.js';
import { GeminiClassifyService, type Stage2FieldResult } from './gemini-classify.service.js';
import { type CostBreakdown, type TokenUsage, type ModelCost, addUsage, calcCost, buildDetailedCostDetails, emptyUsage } from '../utils/gemini-utils.js';
import { type Stage2FieldKey } from '../../../prompt/src/index.js';
import { expandAwards, sanitizeStudentGrades, postprocessCareerActivities, postprocessSubjectDetails, postprocessReadingActivities, postprocessBehaviorComments, filterActivitiesForStage2, restoreEmptyActivities, postprocessActivityCodes, fillAllDefaults, convertToEnglishKeys } from '@gemini-data-extraction/postprocessor';

type FieldStat = {
    durationMs: number;
    costDetails: ReturnType<typeof buildDetailedCostDetails>;
    model: string;
};

const STAGE_2_KEYS: Stage2FieldKey[] = ['autonomous_activities', 'club_activities', 'career_activities', 'volunteer_activities', 'awards', 'license', 'reading_activities'];
const ACTIVITY_KEYS: Stage2FieldKey[] = ['autonomous_activities', 'club_activities', 'career_activities'];

function makeEmptyCostBreakdown(): CostBreakdown {
    const usage = emptyUsage();
    return { usage, cost: calcCost(usage, '3-flash') };
}

function mergeCosts(...costs: ModelCost[]): ModelCost {
    return {
        inputUsd: costs.reduce((s, c) => s + c.inputUsd, 0),
        outputUsd: costs.reduce((s, c) => s + c.outputUsd, 0),
        cacheReadUsd: costs.reduce((s, c) => s + c.cacheReadUsd, 0),
        totalUsd: costs.reduce((s, c) => s + c.totalUsd, 0),
        totalKrw: costs.reduce((s, c) => s + c.totalKrw, 0),
    };
}

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
        stage1FlashBreakdown: CostBreakdown;
        stage1ProBreakdown: CostBreakdown;
        stage2Breakdown: CostBreakdown;
        durationMs: number;
        fieldDurationMs: Record<string, number>;
        fieldStats: Record<string, FieldStat>;
    }> {
        const startTime = Date.now();

        // --- 전처리 (Pre-processing) ---
        let processedPdf = pdfBase64;
        try {
            const sizeImport = await import('@gemini-data-extraction/preprocessor');
            const { isPdfSizeExceeded, compressPdf } = sizeImport;

            if (isPdfSizeExceeded(processedPdf)) {
                console.log('📦 [PreProcess] PDF 용량 초과 감지. 압축을 진행합니다...');
                const result = await compressPdf(processedPdf);
                if (result.success && result.compressedData) {
                    console.log(`✅ [PreProcess] PDF 압축 성공 (레벨: ${result.compressionLevel}): ${(result.originalSize / 1024 / 1024).toFixed(1)}MB -> ${(result.compressedSize! / 1024 / 1024).toFixed(1)}MB`);
                    processedPdf = result.compressedData;
                } else {
                    console.warn(`⚠️ [PreProcess] PDF 압축 실패. 원본으로 진행합니다: ${result.error}`);
                }
            }
        } catch (err) {
            console.warn(`⚠️ [PreProcess] 전처리 모듈 로드 또는 실행 중 에러 발생:`, err);
        }

        const stage2Promises: Promise<Stage2FieldResult>[] = [];
        const fieldStartTimes = new Map<string, number>();
        const fieldDurationMs: Record<string, number> = {};
        const fieldStats: Record<string, FieldStat> = {};

        // 필드별 시작시간 등록 (Stage 1 시작 직전)
        const ALL_TRACKED_FIELDS = [
            'attendance', 'autonomous_activities', 'club_activities', 'career_activities',
            'volunteer_activities', 'awards', 'license', 'reading_activities',
            'behavior_comments', 'subject_details', 'student_grades',
        ];
        ALL_TRACKED_FIELDS.forEach(k => fieldStartTimes.set(k, Date.now()));

        const onFieldDone = (result: Stage1FieldResult) => {
            // 타이밍 기록
            const started = fieldStartTimes.get(result.fieldKey);
            if (started !== undefined) {
                fieldDurationMs[result.fieldKey] = Date.now() - started;
                if (!result.error) {
                    fieldStats[result.fieldKey] = {
                        durationMs: fieldDurationMs[result.fieldKey],
                        costDetails: buildDetailedCostDetails(result.usage, result.model),
                        model: result.modelName,
                    };
                }
            }

            if (result.error || !result.data) return;

            // --- Stage 1 직후 파이프라이닝 과정에서 데이터 후처리 (Post-processing) 적용 ---
            if (result.fieldKey === 'awards') {
                if (Array.isArray(result.data)) {
                    result.data = expandAwards(result.data);
                } else if ((result.data as any).awards && Array.isArray((result.data as any).awards)) {
                    (result.data as any).awards = expandAwards((result.data as any).awards);
                }
            } else if (result.fieldKey === 'student_grades') {
                const gradesObj = result.data as Record<string, unknown>;
                if (gradesObj && Array.isArray(gradesObj.student_grades)) {
                    gradesObj.student_grades = sanitizeStudentGrades(gradesObj.student_grades);
                }
            }

            // Stage 2 큐잉
            if (STAGE_2_KEYS.includes(result.fieldKey as Stage2FieldKey)) {
                if (ACTIVITY_KEYS.includes(result.fieldKey as Stage2FieldKey)) {
                    const { filteredData, hasContent } = filterActivitiesForStage2(result.data, result.fieldKey);
                    if (!hasContent) {
                        console.log(`  ⏭️ [Pipeline] ${result.fieldKey}: 특기사항 있는 항목 없음 → Stage 2 스킵`);
                        return;
                    }
                    stage2Promises.push(this.classifyService.classifyField(result.fieldKey as Stage2FieldKey, filteredData));
                    return;
                }
                stage2Promises.push(this.classifyService.classifyField(result.fieldKey as Stage2FieldKey, result.data));
            }
        };

        console.log('--- [Pipeline] Stage 1 (텍스트 추출) 시작 ---');
        const stage1Result = await this.extractService.executeStage1(processedPdf, onFieldDone);

        if (Object.keys(stage1Result.data).length === 0 && Object.keys(stage1Result.errors).length > 0) {
            console.error('--- [Pipeline] Stage 1 이 모두 실패하여 Stage 2를 진행하지 않습니다 ---');
            const flashCost = calcCost(stage1Result.flashUsage, '3-flash');
            const proCost = calcCost(stage1Result.proUsage, '3.1-pro');
            const totalCost = mergeCosts(flashCost, proCost);
            return {
                data: {},
                errors: stage1Result.errors,
                costBreakdown: { usage: stage1Result.totalUsage, cost: totalCost },
                stage1FlashBreakdown: { usage: stage1Result.flashUsage, cost: flashCost },
                stage1ProBreakdown: { usage: stage1Result.proUsage, cost: proCost },
                stage2Breakdown: makeEmptyCostBreakdown(),
                durationMs: Date.now() - startTime,
                fieldDurationMs,
                fieldStats,
            };
        }

        console.log('--- [Pipeline] Stage 2 (분류 모델) 결과 대기 ---');
        const stage2RawResults = await Promise.all(stage2Promises);

        console.log('--- [Pipeline] 결과 병합 ---');
        const finalData = { ...stage1Result.data };
        const finalErrors = { ...stage1Result.errors };

        for (const r of stage2RawResults) {
            if (r.error) {
                finalErrors[r.fieldKey] = `[Stage2 에러] ${r.error}`;
            } else {
                const merged = Object.assign({}, finalData[r.fieldKey] as any, r.data);
                if (ACTIVITY_KEYS.includes(r.fieldKey as Stage2FieldKey)) {
                    finalData[r.fieldKey] = restoreEmptyActivities(merged, stage1Result.data[r.fieldKey], r.fieldKey);
                } else {
                    finalData[r.fieldKey] = merged;
                }
            }
        }

        const stage2TotalUsage: TokenUsage = stage2RawResults.reduce(
            (acc, r) => addUsage(acc, r.usage),
            emptyUsage()
        );

        // --- Stage 2 후처리 (Post-processing) ---
        if (finalData.career_activities) {
            finalData.career_activities = postprocessCareerActivities(finalData.career_activities);
        }
        if (Array.isArray((finalData.reading_activities as any)?.reading_activities)) {
            const ra = finalData.reading_activities as Record<string, unknown>;
            ra.reading_activities = postprocessReadingActivities(ra.reading_activities as unknown[]);
        }
        if (Array.isArray((finalData.subject_details as any)?.subject_details)) {
            const sd = finalData.subject_details as Record<string, unknown>;
            sd.subject_details = postprocessSubjectDetails(sd.subject_details as unknown[]);
        }
        if (Array.isArray((finalData.behavior_comments as any)?.behavior_comments)) {
            const bc = finalData.behavior_comments as Record<string, unknown>;
            bc.behavior_comments = postprocessBehaviorComments(bc.behavior_comments as unknown[]);
        }

        // --- 창체활동 코드 강제 고정 후처리 ---
        for (const actField of ['autonomous_activities', 'club_activities', 'career_activities'] as const) {
            if (finalData[actField]) {
                finalData[actField] = postprocessActivityCodes(finalData[actField], actField);
            }
        }

        // --- 최종 디폴트값 채우기 ---
        const filledData = fillAllDefaults(finalData);

        // --- activities 구조 병합 ---
        const autonomousArr = (filledData['autonomous_activities'] as any)?.activities?.['자율활동'] ?? [];
        const autonomousAltArr = (filledData['autonomous_activities'] as any)?.activities?.['자율·자치활동'] ?? [];
        const clubArr = (filledData['club_activities'] as any)?.activities?.['동아리활동'] ?? [];
        const careerArr = (filledData['career_activities'] as any)?.activities?.['진로활동'] ?? [];
        const volunteerArr = (filledData['volunteer_activities'] as any)?.activities?.['봉사활동실적'] ?? [];

        const mergedData = {
            ...filledData,
            activities: {
                창의적_체험활동상황: [...autonomousArr, ...autonomousAltArr, ...clubArr, ...careerArr],
                봉사활동실적: volunteerArr,
            },
        };

        // --- 영문 키 변환 ---
        const convertedData = convertToEnglishKeys(mergedData);

        // 비용 계산
        const totalUsage = addUsage(stage1Result.totalUsage, stage2TotalUsage);
        const flashCost = calcCost(stage1Result.flashUsage, '3-flash');
        const proCost = calcCost(stage1Result.proUsage, '3.1-pro');
        const stage2Cost = calcCost(stage2TotalUsage, '3-flash');
        const totalCost = mergeCosts(flashCost, proCost, stage2Cost);

        const costBreakdown: CostBreakdown = { usage: totalUsage, cost: totalCost };
        const stage1FlashBreakdown: CostBreakdown = { usage: stage1Result.flashUsage, cost: flashCost };
        const stage1ProBreakdown: CostBreakdown = { usage: stage1Result.proUsage, cost: proCost };
        const stage2Breakdown: CostBreakdown = { usage: stage2TotalUsage, cost: stage2Cost };
        const durationMs = Date.now() - startTime;

        console.log(`✅ [Pipeline] 최종 파이프라인 완료 (소요시간: ${(durationMs / 1000).toFixed(1)}초)`);
        console.log(`💰 총 비용: $${totalCost.totalUsd.toFixed(6)} (₩${totalCost.totalKrw.toFixed(2)})`);
        console.log(`   ├ [Stage1] Gemini 3 Flash : $${flashCost.totalUsd.toFixed(6)} | 입력:${stage1Result.flashUsage.promptTokens.toLocaleString()}tok 출력:${stage1Result.flashUsage.candidateTokens.toLocaleString()}tok 캐시:${stage1Result.flashUsage.cachedTokens.toLocaleString()}tok think:${stage1Result.flashUsage.thinkingTokens.toLocaleString()}tok`);
        console.log(`   ├ [Stage1] Gemini 3.1 Pro : $${proCost.totalUsd.toFixed(6)} | 입력:${stage1Result.proUsage.promptTokens.toLocaleString()}tok 출력:${stage1Result.proUsage.candidateTokens.toLocaleString()}tok 캐시:${stage1Result.proUsage.cachedTokens.toLocaleString()}tok think:${stage1Result.proUsage.thinkingTokens.toLocaleString()}tok`);
        console.log(`   └ [Stage2] Gemini 3 Flash : $${stage2Cost.totalUsd.toFixed(6)} | 입력:${stage2TotalUsage.promptTokens.toLocaleString()}tok 출력:${stage2TotalUsage.candidateTokens.toLocaleString()}tok 캐시:${stage2TotalUsage.cachedTokens.toLocaleString()}tok think:${stage2TotalUsage.thinkingTokens.toLocaleString()}tok`);

        return {
            data: convertedData,
            errors: finalErrors,
            costBreakdown,
            stage1FlashBreakdown,
            stage1ProBreakdown,
            stage2Breakdown,
            durationMs,
            fieldDurationMs,
            fieldStats,
        };
    }
}
