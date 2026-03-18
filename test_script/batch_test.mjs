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
const API_URL = 'http://localhost:3101/api/extract';
const TOTAL_ITERATIONS = 7;
const FIELD_STATS_ORDER = [
    'autonomous_activities',
    'club_activities',
    'career_activities',
    'volunteer_activities',
    'attendance',
    'awards',
    'behavior_comments',
    'license',
    'reading_activities',
    'student_grades',
    'subject_details',
];

const SAMPLES_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\샘플들\\세특';
const OUTPUT_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\260310_제미나이3_마이그레이션\\[제미나이3 flash_agentic vision]1차공유_260312';

function safeFolderName(filename) {
    return path.basename(filename, path.extname(filename));
}

function getPdfFiles() {
    if (!fs.existsSync(SAMPLES_DIR)) {
        throw new Error(`샘플 폴더를 찾을 수 없습니다: ${SAMPLES_DIR}`);
    }

    const files = fs.readdirSync(SAMPLES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, 'ko'));

    console.log(`📁 폴더 전체 스캔: 총 ${files.length}개의 PDF를 처리합니다.\n`);
    return files;
}

function orderFieldStats(fieldStats = {}) {
    const orderedEntries = [];

    for (const fieldKey of FIELD_STATS_ORDER) {
        if (fieldKey in fieldStats) {
            orderedEntries.push([fieldKey, fieldStats[fieldKey]]);
        }
    }

    for (const [fieldKey, value] of Object.entries(fieldStats)) {
        if (!FIELD_STATS_ORDER.includes(fieldKey)) {
            orderedEntries.push([fieldKey, value]);
        }
    }

    return Object.fromEntries(orderedEntries);
}

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

function saveResult(folderName, result, elapsedMs, baseOutputDir = OUTPUT_DIR) {
    const outDir = path.join(baseOutputDir, folderName);
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(
        path.join(outDir, 'result.json'),
        JSON.stringify({ parsed_data: result.data }, null, 2),
        'utf-8'
    );

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

    fs.writeFileSync(
        path.join(outDir, 'cost.json'),
        JSON.stringify({
            totalProcessingTimeMs: result.processingTimeMs,
            totalElapsedMs: elapsedMs,
            totalCostDetails: result.usageMetadata?.costDetails || null,
            fieldStats: orderFieldStats(result.fieldStats || {}),
            usageSummary: result.usageMetadata || null,
        }, null, 2),
        'utf-8'
    );

    console.log(`   💾 저장 완료 → ${outDir}`);
}

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

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const pdfFiles = getPdfFiles();
    const chunkSize = 7;
    const chunks = [];
    for (let i = 0; i < pdfFiles.length; i += chunkSize) {
        chunks.push(pdfFiles.slice(i, i + chunkSize));
    }

    for (let iter = 1; iter <= TOTAL_ITERATIONS; iter++) {
        console.log(`\n==================================================`);
        console.log(`=== 🔄 [반복 실행: ${iter} / ${TOTAL_ITERATIONS}] 시작 ===`);
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

                    const cost = result.usageMetadata?.costDetails;
                    const totalCost = cost?.estimatedCost?.totalCost ?? cost?.totalCost;
                    console.log(`   ✅ 완료 (${(elapsed / 1000).toFixed(1)}초) | $${totalCost?.toFixed(6) ?? '?'} [${filename}]`);

                    saveResult(folderName, result, elapsed, iterOutputDir);
                    results.success.push(filename);
                } catch (err) {
                    const elapsed = Date.now() - start;
                    console.error(`   ❌ 실패 (${(elapsed / 1000).toFixed(1)}초): ${err.message} [${filename}]`);
                    saveError(folderName, err.message, iterOutputDir);
                    results.failed.push({ filename, error: err.message });
                }
            }));

            if (c < chunks.length - 1) {
                console.log('   ⏳ 병렬 처리 후 5초 대기 중...');
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`📊 [반복 ${iter}] 최종 결과: 성공 ${results.success.length}개 / 실패 ${results.failed.length}개`);
        if (results.failed.length > 0) {
            console.log(`\n❌ [반복 ${iter}] 실패 목록:`);
            results.failed.forEach((item) => console.log(`   - ${item.filename}: ${item.error}`));
        }

        if (iter < TOTAL_ITERATIONS) {
            console.log(`\n   ⏳ 다음 반복 실행 전 10초 대기 중...`);
            await new Promise(r => setTimeout(r, 10000));
        }
    }

    console.log(`\n📁 모든 반복 실행 완료. 결과 저장 위치: ${OUTPUT_DIR}`);
}

main().catch((err) => {
    console.error('스크립트 실패:', err);
    process.exit(1);
});
