/**
 * 생기부 PDF 일괄 테스트 스크립트
 *
 * 실행: node test_script/batch_test.mjs
 * (pnpm dev 실행 중인 상태에서 실행)
 */

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

// ──────────────────────────────────────────────
// 설정
// ──────────────────────────────────────────────
const API_URL = 'http://localhost:5174/api/extract';

const SAMPLES_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\샘플들\\세특';
const OUTPUT_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\260303_제미나이3_정확도개선\\1차_세특_HIGH';

/** 파일명에서 폴더명으로 사용할 안전한 이름 반환 (확장자 제거) */
function safeFolderName(filename) {
    return path.basename(filename, path.extname(filename));
}

/** PDF 파일 목록 조회 */
// function getPdfFiles() {
//     const files = [
//         '샘플30.pdf',
//         '샘플31.pdf',
//         '샘플31_Failed to fetch.pdf'
//     ];
//     console.log(`📁 배열 강제 지정: 지정된 PDF 처리합니다.\n`);
//     return files;
// }

function getPdfFiles() {
    const files = ['샘플35.pdf'];
    console.log(`📁 단일 파일 스캔: 총 ${files.length}개의 PDF를 처리합니다.\n`);
    return files;
}

// function getPdfFiles() {
//     const failedList = [
//         '샘플01_세특 1,2학기 구분.pdf',
//         // '샘플35.pdf',
//         '샘플22_진로탐색중.pdf',
//         '샘플32-------독서, 진로활동 1,2학기 구분.pdf',
//         '샘플_2-2까지.pdf',
//         '샘플_3-1까지.pdf'
//     ];
//     console.log(`📁 실패 항목 재처리: 총 ${failedList.length}개의 PDF를 처리합니다.\n`);
//     return failedList;
// }

/** 단일 PDF 파일 추출 API 호출 */
async function extractPdf(filePath) {
    const form = new FormData();
    form.append('pdf', fs.createReadStream(filePath), {
        filename: path.basename(filePath),
        contentType: 'application/pdf',
    });

    const response = await fetch(API_URL, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
        throw new Error(json.error || `HTTP ${response.status}`);
    }
    return json;
}

/** 결과를 지정 폴더에 저장 */
function saveResult(folderName, result, elapsedMs, baseOutputDir = OUTPUT_DIR) {
    const outDir = path.join(baseOutputDir, folderName);
    fs.mkdirSync(outDir, { recursive: true });

    // 추출된 데이터 전체 (gemini-ocr 호환 포맷: parsed_data로 감싸기)
    fs.writeFileSync(
        path.join(outDir, 'result.json'),
        JSON.stringify({ parsed_data: result.data }, null, 2),
        'utf-8'
    );

    // 출결봉사 전용 (activities + attendance)
    const resultAttendanceVolunteer = {
        parsed_data: {
            activities: result.data?.activities ?? null,
            attendance: result.data?.attendance ?? null,
        }
    };
    fs.writeFileSync(
        path.join(outDir, 'result_출결봉사.json'),
        JSON.stringify(resultAttendanceVolunteer, null, 2),
        'utf-8'
    );

    // 세특 전용 (subject_details)
    const resultSubjectDetails = {
        parsed_data: {
            subject_details: result.data?.subject_details ?? null,
        }
    };
    fs.writeFileSync(
        path.join(outDir, 'result_세특.json'),
        JSON.stringify(resultSubjectDetails, null, 2),
        'utf-8'
    );

    // 비용 / 토큰 요약
    const costSummary = {
        durationMs: result.durationMs,
        // 필드별 소요 시간 (ms): 각 Stage 1 필드의 개별 처리 시간
        fieldDurationMs: result.fieldDurationMs ?? {},
        elapsedMs,
        costBreakdown: result.costBreakdown,
        stage1Flash: result.stage1Flash,
        stage1Pro: result.stage1Pro,
        stage2Flash: result.stage2Flash,
        errors: result.errors,
    };
    fs.writeFileSync(
        path.join(outDir, 'cost.json'),
        JSON.stringify(costSummary, null, 2),
        'utf-8'
    );

    console.log(`   💾 저장 완료 → ${outDir}`);
}

/** 에러를 지정 폴더에 저장 */
function saveError(folderName, errorMsg, baseOutputDir = OUTPUT_DIR) {
    const outDir = path.join(baseOutputDir, folderName);
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(
        path.join(outDir, 'error.json'),
        JSON.stringify({ error: errorMsg, timestamp: new Date().toISOString() }, null, 2),
        'utf-8'
    );

    console.error(`   💾 에러 저장 → ${outDir}/error.json`);
}

// ──────────────────────────────────────────────
// 메인 실행
// ──────────────────────────────────────────────
async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const pdfFiles = getPdfFiles();

    // 3개씩 청크 분할
    const chunkSize = 7;
    const chunks = [];
    for (let i = 0; i < pdfFiles.length; i += chunkSize) {
        chunks.push(pdfFiles.slice(i, i + chunkSize));
    }

    for (let iter = 1; iter <= 1; iter++) {
        console.log(`\n==================================================`);
        console.log(`=== 🔄 [반복 실행: ${iter} / 7] 시작 ===`);
        console.log(`==================================================\n`);

        const iterOutputDir = path.join(OUTPUT_DIR, `iter_${iter}`);
        fs.mkdirSync(iterOutputDir, { recursive: true });

        const results = { success: [], failed: [] };

        for (let c = 0; c < chunks.length; c++) {
            const chunk = chunks[c];
            console.log(`\n=== 묶음 [${c + 1}/${chunks.length}] 병렬 처리 시작 (${chunk.length}개) ===`);

            await Promise.all(chunk.map(async (filename, idx) => {
                const index = c * chunkSize + idx;
                const filePath = path.join(SAMPLES_DIR, filename);
                const folderName = safeFolderName(filename);

                console.log(`[${index + 1}/${pdfFiles.length}] 📄 처리 시작: ${filename}`);

                const start = Date.now();
                try {
                    const result = await extractPdf(filePath);
                    const elapsed = Date.now() - start;

                    const cost = result.costBreakdown?.cost;
                    console.log(`   ✅ 완료 (${(elapsed / 1000).toFixed(1)}초) | $${cost?.totalUsd?.toFixed(6) ?? '?'} ≈ ₩${cost?.totalKrw?.toFixed(0) ?? '?'} [${filename}]`);

                    saveResult(folderName, result, elapsed, iterOutputDir);
                    results.success.push(filename);
                } catch (err) {
                    const elapsed = Date.now() - start;
                    console.error(`   ❌ 실패 (${(elapsed / 1000).toFixed(1)}초): ${err.message} [${filename}]`);
                    saveError(folderName, err.message, iterOutputDir);
                    results.failed.push({ filename, error: err.message });
                }
            }));

            // 연속 호출 간 throttle 방지 대기 (5초) (마지막 묶음 제외)
            if (c < chunks.length - 1) {
                console.log('   ⏳ 병렬 처리 후 5초 대기 중...');
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        // 최종 요약
        console.log('\n' + '='.repeat(60));
        console.log(`📊 [반복 ${iter}] 최종 결과: 성공 ${results.success.length}개 / 실패 ${results.failed.length}개`);
        if (results.failed.length > 0) {
            console.log(`\n❌ [반복 ${iter}] 실패 목록:`);
            results.failed.forEach(f => console.log(`   - ${f.filename}: ${f.error}`));
        }

        // 반복 간 대기 (마지막 반복 제외)
        if (iter < 7) {
            console.log(`\n   ⏳ 다음 반복 실행 전 10초 대기 중...`);
            await new Promise(r => setTimeout(r, 10000));
        }
    }

    console.log(`\n📁 모든 반복 실행 완료. 결과 저장 위치: ${OUTPUT_DIR}`);
}

main().catch(err => {
    console.error('스크립트 실패:', err);
    process.exit(1);
});
