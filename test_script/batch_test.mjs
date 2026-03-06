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

// 소스: 샘플들 폴더 (하위 폴더 제외, 파일만 스캔)
const SAMPLES_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\샘플들';

// 출력: 260303_제미나이3_정확도개선 폴더 바로 아래 PDF이름 폴더로 저장
const OUTPUT_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\260303_제미나이3_정확도개선';

// 병렬 처리 개수
const CHUNK_SIZE = 7;

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────

/** 파일명에서 폴더명으로 사용할 안전한 이름 반환 (확장자 제거) */
function safeFolderName(filename) {
    return path.basename(filename, path.extname(filename));
}

/**
 * PDF 파일 목록 조회
 * - SAMPLES_DIR 바로 아래의 파일만 (하위 폴더 내 파일 제외)
 * - .pdf 확장자만
 */
function getPdfFiles() {
    const entries = fs.readdirSync(SAMPLES_DIR, { withFileTypes: true });
    const files = entries
        .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
        .map(e => e.name)
        .sort();
    console.log(`📁 스캔 완료: 총 ${files.length}개의 PDF를 처리합니다.\n`);
    files.forEach((f, i) => console.log(`   [${i + 1}] ${f}`));
    console.log('');
    return files;
}

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
function saveResult(folderName, result, elapsedMs) {
    const outDir = path.join(OUTPUT_DIR, folderName);
    fs.mkdirSync(outDir, { recursive: true });

    // 추출된 데이터 전체 (gemini-ocr 호환 포맷)
    fs.writeFileSync(
        path.join(outDir, 'result.json'),
        JSON.stringify({ parsed_data: result.data }, null, 2),
        'utf-8'
    );

    // 출결봉사 전용
    fs.writeFileSync(
        path.join(outDir, 'result_출결봉사.json'),
        JSON.stringify({
            parsed_data: {
                activities: result.data?.activities ?? null,
                attendance: result.data?.attendance ?? null,
            }
        }, null, 2),
        'utf-8'
    );

    // 세특 전용
    fs.writeFileSync(
        path.join(outDir, 'result_세특.json'),
        JSON.stringify({
            parsed_data: {
                subject_details: result.data?.subject_details ?? null,
            }
        }, null, 2),
        'utf-8'
    );

    // 비용 / 토큰 요약
    fs.writeFileSync(
        path.join(outDir, 'cost.json'),
        JSON.stringify({
            durationMs: result.durationMs,
            fieldDurationMs: result.fieldDurationMs ?? {},
            elapsedMs,
            costBreakdown: result.costBreakdown,
            stage1Flash: result.stage1Flash,
            stage1Pro: result.stage1Pro,
            stage1Pro31: result.stage1Pro31,
            stage2Flash: result.stage2Flash,
            errors: result.errors,
        }, null, 2),
        'utf-8'
    );

    console.log(`   💾 저장 완료 → ${outDir}`);
}

/** 에러를 지정 폴더에 저장 */
function saveError(folderName, errorMsg) {
    const outDir = path.join(OUTPUT_DIR, folderName);
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

    // CHUNK_SIZE 개씩 묶음 분할
    const chunks = [];
    for (let i = 0; i < pdfFiles.length; i += CHUNK_SIZE) {
        chunks.push(pdfFiles.slice(i, i + CHUNK_SIZE));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== 🚀 배치 처리 시작 | 총 ${pdfFiles.length}개 / ${chunks.length}개 묶음 (묶음당 최대 ${CHUNK_SIZE}개 병렬) ===`);
    console.log(`${'='.repeat(60)}\n`);

    const results = { success: [], failed: [] };

    for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        console.log(`\n=== 묶음 [${c + 1}/${chunks.length}] 병렬 처리 시작 (${chunk.length}개) ===`);

        await Promise.all(chunk.map(async (filename, idx) => {
            const index = c * CHUNK_SIZE + idx;
            const filePath = path.join(SAMPLES_DIR, filename);
            const folderName = safeFolderName(filename);

            console.log(`[${index + 1}/${pdfFiles.length}] 📄 처리 시작: ${filename}`);

            const start = Date.now();
            try {
                const result = await extractPdf(filePath);
                const elapsed = Date.now() - start;

                const cost = result.costBreakdown?.cost;
                console.log(`   ✅ 완료 (${(elapsed / 1000).toFixed(1)}초) | $${cost?.totalUsd?.toFixed(6) ?? '?'} ≈ ₩${cost?.totalKrw?.toFixed(0) ?? '?'} [${filename}]`);

                saveResult(folderName, result, elapsed);
                results.success.push(filename);
            } catch (err) {
                const elapsed = Date.now() - start;
                console.error(`   ❌ 실패 (${(elapsed / 1000).toFixed(1)}초): ${err.message} [${filename}]`);
                saveError(folderName, err.message);
                results.failed.push({ filename, error: err.message });
            }
        }));

        // 묶음 간 throttle 방지 대기 (마지막 묶음 제외)
        if (c < chunks.length - 1) {
            console.log('   ⏳ 다음 묶음 처리 전 5초 대기 중...');
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    // 최종 요약
    console.log('\n' + '='.repeat(60));
    console.log(`📊 최종 결과: 성공 ${results.success.length}개 / 실패 ${results.failed.length}개`);
    if (results.failed.length > 0) {
        console.log(`\n❌ 실패 목록:`);
        results.failed.forEach(f => console.log(`   - ${f.filename}: ${f.error}`));
    }
    console.log(`\n📁 결과 저장 위치: ${OUTPUT_DIR}`);
}

main().catch(err => {
    console.error('스크립트 실패:', err);
    process.exit(1);
});
