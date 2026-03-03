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

const SAMPLES_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\샘플들';
const OUTPUT_DIR = 'D:\\업무\\AI 개발\\입시전략연구소_고교동행\\(입시서비스팀)생기부 데이터 추출\\260303_제미나이3_정확도개선';

/** 파일명에서 폴더명으로 사용할 안전한 이름 반환 (확장자 제거) */
function safeFolderName(filename) {
    return path.basename(filename, path.extname(filename));
}

/** PDF 파일 목록 조회 */
function getPdfFiles() {
    const files = fs.readdirSync(SAMPLES_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`📁 샘플 폴더에서 PDF ${files.length}개 발견\n`);
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

    // 추출된 데이터
    fs.writeFileSync(
        path.join(outDir, 'result.json'),
        JSON.stringify(result.data, null, 2),
        'utf-8'
    );

    // 비용 / 토큰 요약
    const costSummary = {
        durationMs: result.durationMs,
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
    const results = { success: [], failed: [] };

    for (let i = 0; i < pdfFiles.length; i++) {
        const filename = pdfFiles[i];
        const filePath = path.join(SAMPLES_DIR, filename);
        const folderName = safeFolderName(filename);

        console.log(`\n[${i + 1}/${pdfFiles.length}] 📄 처리 중: ${filename}`);

        const start = Date.now();
        try {
            const result = await extractPdf(filePath);
            const elapsed = Date.now() - start;

            const cost = result.costBreakdown?.cost;
            console.log(`   ✅ 완료 (${(elapsed / 1000).toFixed(1)}초) | $${cost?.totalUsd?.toFixed(6) ?? '?'} ≈ ₩${cost?.totalKrw?.toFixed(0) ?? '?'}`);

            saveResult(folderName, result, elapsed);
            results.success.push(filename);
        } catch (err) {
            const elapsed = Date.now() - start;
            console.error(`   ❌ 실패 (${(elapsed / 1000).toFixed(1)}초): ${err.message}`);
            saveError(folderName, err.message);
            results.failed.push({ filename, error: err.message });
        }

        // 연속 호출 간 throttle 방지 대기 (5초)
        if (i < pdfFiles.length - 1) {
            console.log('   ⏳ 5초 대기 중...');
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    // 최종 요약
    console.log('\n' + '='.repeat(60));
    console.log(`📊 최종 결과: 성공 ${results.success.length}개 / 실패 ${results.failed.length}개`);
    if (results.failed.length > 0) {
        console.log('\n❌ 실패 목록:');
        results.failed.forEach(f => console.log(`   - ${f.filename}: ${f.error}`));
    }
    console.log(`\n📁 결과 저장 위치: ${OUTPUT_DIR}`);
}

main().catch(err => {
    console.error('스크립트 실패:', err);
    process.exit(1);
});
