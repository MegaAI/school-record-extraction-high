import { GeminiExtractService } from './gemini-extract.service.js';
import { GeminiClassifyService } from './gemini-classify.service.js';
import { type CostBreakdown, type TokenUsage, type ModelType, addUsage, calcCost } from '../utils/gemini-utils.js';
import { type Stage2FieldKey } from '../../../prompt/src/index.js';
import { expandAwards, sanitizeStudentGrades, postprocessCareerActivities, postprocessSubjectDetails, postprocessReadingActivities, postprocessBehaviorComments, filterActivitiesForStage2, restoreEmptyActivities, postprocessActivityCodes, fillAllDefaults, convertToEnglishKeys } from '@gemini-data-extraction/postprocessor';

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
        stage1FlashBreakdown: CostBreakdown;
        stage1ProBreakdown: CostBreakdown;
        stage2Breakdown: CostBreakdown;
        durationMs: number;
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

        const stage2Promises: Promise<any>[] = [];

        const onFieldDone = (result: any) => {
            if (result.error || !result.data) return;

            // --- Stage 1 직후 파이프라이닝 과정에서 데이터 후처리 (Post-processing) 적용 ---
            if (result.fieldKey === 'awards') {
                if (Array.isArray(result.data)) {
                    result.data = expandAwards(result.data);
                } else if (result.data.awards && Array.isArray(result.data.awards)) { // 혹시 { awards: [...] } 형태로 나왔을 경우
                    result.data.awards = expandAwards(result.data.awards);
                }
            } else if (result.fieldKey === 'student_grades') {
                const gradesObj = result.data as Record<string, unknown>;
                if (gradesObj && Array.isArray(gradesObj.student_grades)) {
                    gradesObj.student_grades = sanitizeStudentGrades(gradesObj.student_grades);
                }
            }

            const STAGE_2_KEYS = ['autonomous_activities', 'club_activities', 'career_activities', 'volunteer_activities', 'awards', 'license', 'reading_activities'];
            if (STAGE_2_KEYS.includes(result.fieldKey)) {
                const ACTIVITY_KEYS = ['autonomous_activities', 'club_activities', 'career_activities'];
                if (ACTIVITY_KEYS.includes(result.fieldKey)) {
                    // 특기사항이 있는 항목만 Stage 2에 전달, 빈 항목은 finalData에서 복원
                    const { filteredData, hasContent } = filterActivitiesForStage2(result.data, result.fieldKey);
                    if (!hasContent) {
                        console.log(`  ⏭️ [Pipeline] ${result.fieldKey}: 특기사항 있는 항목 없음 → Stage 2 스킵`);
                        return;
                    }
                    stage2Promises.push(this.classifyService.classifyField(result.fieldKey, filteredData));
                    return;
                }
                // 나머지 필드는 원본 데이터 그대로 Stage 2 호출
                stage2Promises.push(this.classifyService.classifyField(result.fieldKey, result.data));
            }
        };

        console.log('--- [Pipeline] Stage 1 (텍스트 추출) 시작 ---');
        const stage1Result = await this.extractService.executeStage1(processedPdf, onFieldDone);

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
                    cost: { ...flashCost, totalUsd, totalKrw: totalUsd * 1_350 }
                },
                stage1FlashBreakdown: { usage: stage1Result.flashUsage, cost: flashCost },
                stage1ProBreakdown: { usage: stage1Result.proUsage, cost: proCost },
                stage2Breakdown: { usage: { promptTokens: 0, candidateTokens: 0, thinkingTokens: 0, cachedTokens: 0, totalTokens: 0 }, cost: { inputUsd: 0, outputUsd: 0, cacheReadUsd: 0, totalUsd: 0, totalKrw: 0 } },
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
        const ACTIVITY_KEYS = ['autonomous_activities', 'club_activities', 'career_activities'];
        for (const r of stage2RawResults) {
            if (r.error) {
                finalErrors[r.fieldKey] = `[Stage2 에러] ${r.error}`;
            } else {
                const merged = Object.assign({}, finalData[r.fieldKey] as any, r.data);
                // 창체활동: Stage 2에서 스킵된 빈 항목(내부검토 등)을 원본 Stage 1 데이터에서 복원
                if (ACTIVITY_KEYS.includes(r.fieldKey)) {
                    finalData[r.fieldKey] = restoreEmptyActivities(merged, stage1Result.data[r.fieldKey], r.fieldKey);
                } else {
                    finalData[r.fieldKey] = merged;
                }
            }
            s2PromptTokens += r.usage.promptTokens;
            s2CandidateTokens += r.usage.candidateTokens;
            s2ThinkingTokens += r.usage.thinkingTokens;
            s2CachedTokens += r.usage.cachedTokens;
            s2TotalTokens += r.usage.totalTokens;
        }

        // --- Stage 2 후처리 (Post-processing) ---
        // 진로활동: 계열별 직업_분야_분류코드_* → 단일 직업_분야_분류코드 통합
        if (finalData.career_activities) {
            finalData.career_activities = postprocessCareerActivities(finalData.career_activities);
        }
        // 독서활동: 과목또는영역 필드에서 공백 및 중점 제거
        if (Array.isArray((finalData.reading_activities as any)?.reading_activities)) {
            const ra = finalData.reading_activities as Record<string, unknown>;
            ra.reading_activities = postprocessReadingActivities(ra.reading_activities as unknown[]);
        }
        // 세부능력특기사항: 과목명에서 공백 및 중점 제거 + 내부검토 중 레코드 제거
        if (Array.isArray((finalData.subject_details as any)?.subject_details)) {
            const sd = finalData.subject_details as Record<string, unknown>;
            sd.subject_details = postprocessSubjectDetails(sd.subject_details as unknown[]);
        }
        // 행동특성 및 종합의견: 내부검토 중 레코드 제거
        if (Array.isArray((finalData.behavior_comments as any)?.behavior_comments)) {
            const bc = finalData.behavior_comments as Record<string, unknown>;
            bc.behavior_comments = postprocessBehaviorComments(bc.behavior_comments as unknown[]);
        }

        // --- 창체활동 코드 강제 고정 후처리 ---
        // 활동_구분_코드(S001/S002/S003) 강제 매핑 + S001/S002 진로희망·직업코드 초기화 + S003 미정 기본값 세팅
        for (const actField of ['autonomous_activities', 'club_activities', 'career_activities'] as const) {
            if (finalData[actField]) {
                finalData[actField] = postprocessActivityCodes(finalData[actField], actField);
            }
        }

        // --- 최종 디폴트값 채우기: 빈 배열 → 기본 항목, null/undefined → 기본값 ---
        const filledData = fillAllDefaults(finalData);

        // --- activities 구조 병합: 자율/동아리/진로 → 창의적_체험활동상황[], 봉사 → 봉사활동실적[] ---
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

        // --- 영문 키 변환: gemini-ocr key-converter 형식과 동일하게 단순 키 매핑만 수행 ---
        const convertedData = convertToEnglishKeys(mergedData);

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
                totalKrw: totalUsd * 1_350,
            },
        };
        const durationMs = Date.now() - startTime;

        const stage1FlashBreakdown: CostBreakdown = { usage: stage1Result.flashUsage, cost: flashCost };
        const stage1ProBreakdown: CostBreakdown = { usage: stage1Result.proUsage, cost: proCost };
        const stage2Breakdown: CostBreakdown = { usage: stage2TotalUsage, cost: stage2Cost };

        console.log(`✅ [Pipeline] 최종 파이프라인 완료 (소요시간: ${(durationMs / 1000).toFixed(1)}초)`);
        console.log(`💰 총 비용: $${totalUsd.toFixed(6)} (₩${costBreakdown.cost.totalKrw.toFixed(2)})`);
        console.log(`   ├ [Stage1] Gemini 3 Flash : $${flashCost.totalUsd.toFixed(6)} | 입력:${stage1Result.flashUsage.promptTokens.toLocaleString()}tok 출력:${stage1Result.flashUsage.candidateTokens.toLocaleString()}tok 캐시:${stage1Result.flashUsage.cachedTokens.toLocaleString()}tok think:${stage1Result.flashUsage.thinkingTokens.toLocaleString()}tok`);
        console.log(`   ├ [Stage1] Gemini 2.5 Pro : $${proCost.totalUsd.toFixed(6)} | 입력:${stage1Result.proUsage.promptTokens.toLocaleString()}tok 출력:${stage1Result.proUsage.candidateTokens.toLocaleString()}tok 캐시:${stage1Result.proUsage.cachedTokens.toLocaleString()}tok think:${stage1Result.proUsage.thinkingTokens.toLocaleString()}tok`);
        console.log(`   └ [Stage2] Gemini 3 Flash : $${stage2Cost.totalUsd.toFixed(6)} | 입력:${stage2TotalUsage.promptTokens.toLocaleString()}tok 출력:${stage2TotalUsage.candidateTokens.toLocaleString()}tok 캐시:${stage2TotalUsage.cachedTokens.toLocaleString()}tok think:${stage2TotalUsage.thinkingTokens.toLocaleString()}tok`);

        return {
            data: convertedData,
            errors: finalErrors,
            costBreakdown,
            stage1FlashBreakdown,
            stage1ProBreakdown,
            stage2Breakdown,
            durationMs,
        };
    }
}
