/**
 * PDF 압축 유틸리티
 * PDF를 분해하고 지정 DPI로 렌더링 후 재조립하여 용량을 줄입니다.
 * 
 * 주의: 이 모듈은 Node.js 환경에서만 동작합니다.
 * (pdfjs-dist, @napi-rs/canvas, sharp 사용)
 */

import { PDFDocument } from 'pdf-lib';

// Vite 프론트엔드 빌더와 Amplify esbuild 백엔드 번들러를 모두 안전하게 우회하기 위해
// 문자열 결합과 동적 import를 활용해 런타임에 모듈들을 가져옵니다.
async function getCanvasModule() {
    const modString = 'm' + 'odule';
    const { createRequire } = await import(/* @vite-ignore */ modString);
    const req = createRequire(import.meta.url);
    const targetPkg = '@napi-rs/' + 'canvas';
    return req(targetPkg);
}

// pdfjs-dist 동적 import (ESM 호환)
let pdfjsLib: any = null;

/**
 * pdfjs-dist 또는 다른 라이브러리가 require('canvas')를 시도할 때 
 * @napi-rs/canvas를 반환하도록 require.cache를 하이재킹합니다.
 */
async function hijackCanvas() {
    try {
        const modString = 'm' + 'odule';
        const { createRequire } = await import(/* @vite-ignore */ modString);
        const req = createRequire(import.meta.url);

        const canvasMod = await getCanvasModule();

        // 1. 단순 이름 'canvas'로 캐시 등록
        req.cache['canvas'] = {
            id: 'canvas',
            filename: 'canvas',
            loaded: true,
            exports: canvasMod,
        } as any;

        // 2. 실제 canvas 패키지의 경로가 존재한다면 해당 경로로도 캐시 등록
        try {
            const realPath = req.resolve('canvas');
            if (realPath) {
                req.cache[realPath] = {
                    id: realPath,
                    filename: realPath,
                    loaded: true,
                    exports: canvasMod,
                } as any;
            }
        } catch (e) {
            // canvas 패키지가 설치되어 있지 않은 경우 무시
        }
    } catch (error) {
        console.warn('Failed to hijack canvas module:', error);
    }
}

async function getPdfjs() {
    if (!pdfjsLib) {
        // canvas 하이재킹 선제 적용
        await hijackCanvas();

        // esbuild 빌드 및 Lambda 환경 호환성을 위해 3.x 버전을 createRequire로 로드합니다.
        const modString = 'm' + 'odule';
        const { createRequire } = await import(/* @vite-ignore */ modString);
        const req = createRequire(import.meta.url);

        // Lambda 환경에서 DOMMatrix, Path2D 누락으로 인한 렌더링 에러 및 경고 해결
        // pdfjs-dist 로드 전에 폴리필을 적용해야 내부 require('canvas') 시 발생하는 경고를 방지할 수 있습니다.
        try {
            if (typeof global !== 'undefined' && (!(global as any).DOMMatrix || !(global as any).Path2D)) {
                const canvasMod = await getCanvasModule();
                if (!(global as any).DOMMatrix && canvasMod.DOMMatrix) {
                    (global as any).DOMMatrix = canvasMod.DOMMatrix;
                }
                if (!(global as any).Path2D && canvasMod.Path2D) {
                    (global as any).Path2D = canvasMod.Path2D;
                }
            }
        } catch (polyfillError) {
            console.warn('Failed to polyfill DOMMatrix/Path2D:', polyfillError);
        }

        const targetPkg = 'pdfjs-' + 'dist/legacy/build/pdf.js';
        const rawPdfjs = req(targetPkg);
        pdfjsLib = rawPdfjs.default || rawPdfjs;

        // 워커 로딩 설정 (Lambda/Node.js 환경)
        if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-' + 'dist/legacy/build/pdf.worker.js';
        }
    }
    return pdfjsLib;
}

/**
 * pdfjs-dist가 내부적으로 사용하는 NodeCanvasFactory를 대체하기 위한 커스텀 팩토리입니다.
 * 하드코딩된 require('canvas') 대신 @napi-rs/canvas를 사용하도록 합니다.
 */
class NapiCanvasFactory {
    constructor(private createCanvas: any) { }

    create(width: number, height: number) {
        const canvas = this.createCanvas(width, height);
        return {
            canvas,
            context: canvas.getContext('2d'),
        };
    }

    reset(canvasAndContext: any, width: number, height: number) {
        if (canvasAndContext.canvas) {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
        }
    }

    destroy(canvasAndContext: any) {
        if (canvasAndContext.canvas) {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
            canvasAndContext.canvas = null;
            canvasAndContext.context = null;
        }
    }
}

export interface CompressPdfOptions {
    /** 목표 DPI (기본값: 170) */
    targetDpi?: number;
    /** JPEG 품질 0-100 (기본값: 95) */
    jpegQuality?: number;
    /** 최대 허용 용량 바이트 (기본값: 10MB) */
    maxSizeBytes?: number;
}

export interface CompressPdfResult {
    /** 압축 성공 여부 */
    success: boolean;
    /** 압축된 PDF Base64 데이터 (성공 시) */
    compressedData?: string;
    /** 원본 크기 (바이트) */
    originalSize: number;
    /** 압축 후 크기 (바이트, 성공 시) */
    compressedSize?: number;
    /** 에러 메시지 (실패 시) */
    error?: string;
    /** 성공한 압축 단계 (1-based index) */
    compressionLevel?: number;
}

const DEFAULT_OPTIONS: Required<CompressPdfOptions> = {
    targetDpi: 200,
    jpegQuality: 95,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
};

async function getSharp() {
    const targetPkg = 'sh' + 'arp';
    const mod = await import(/* @vite-ignore */ targetPkg);
    return mod.default || mod;
}

/**
 * PDF를 특정 DPI로 압축합니다.
 * 
 * @param pdfBase64 - Base64로 인코딩된 PDF 데이터
 * @param options - 압축 옵션
 * @returns 압축 결과
 */
export async function compressPdf(
    pdfBase64: string,
    options?: CompressPdfOptions
): Promise<CompressPdfResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // 재시도 레벨 정의 (순차적으로 적용)
    const compressionLevels = [
        { dpi: opts.targetDpi, quality: opts.jpegQuality }, // Level 1 (사용자 지정 또는 기본값)
        { dpi: 180, quality: 95 },                          // Level 2 (화질 우선 재시도)
    ];

    let lastResult: CompressPdfResult | null = null;


    try {
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const originalSize = pdfBuffer.length;
        const pdfjs = await getPdfjs();

        // 단계별 압축 시도
        for (let level = 0; level < compressionLevels.length; level++) {
            const { dpi, quality } = compressionLevels[level];
            const scale = dpi / 72;

            try {
                // PDF 로드 (매 반복마다 새로 로드하여 상태 초기화)
                const pdfData = new Uint8Array(pdfBuffer);
                const { createCanvas } = await getCanvasModule();
                const pdfDoc = await pdfjs.getDocument({
                    data: pdfData,
                    canvasFactory: new NapiCanvasFactory(createCanvas),
                }).promise;

                // 각 페이지 렌더링 및 JPG 변환
                const jpgBuffers: Buffer[] = [];

                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const viewport = page.getViewport({ scale });

                    // Canvas에 렌더링
                    const canvas = createCanvas(viewport.width, viewport.height);
                    const context = canvas.getContext('2d');

                    await page.render({
                        canvasContext: context as any,
                        viewport,
                        canvasFactory: new NapiCanvasFactory(createCanvas),
                    }).promise;

                    // PNG → JPG 변환
                    const pngBuffer = canvas.toBuffer('image/png');
                    const sharpObj = await getSharp();
                    const jpgBuffer = await sharpObj(pngBuffer)
                        .jpeg({ quality })
                        .toBuffer();

                    jpgBuffers.push(jpgBuffer);

                    // 메모리 해제
                    page.cleanup();
                }

                // 새 PDF 생성
                const newPdf = await PDFDocument.create();

                for (const jpgBuffer of jpgBuffers) {
                    const jpgImage = await newPdf.embedJpg(jpgBuffer);
                    // A4 크기 (595.28 x 841.89 pt) - 원본 비율 유지하면서 A4에 맞추는 것이 더 좋으나 일단 기존 로직 유지
                    // 또는 이미지 크기에 맞춰 페이지 생성
                    // 여기서는 렌더링된 이미지 크기에 맞춰 페이지를 생성하는 것이 안전함 (비율 왜곡 방지)
                    // 하지만 기존 코드가 A4 고정이므로 일단 유지하되 이슈가 있다면 수정 필요
                    // -> 이미지 크기가 scale에 따라 변하므로, 페이지 크기도 그에 맞추거나 A4에 맞게 줄여야 함.
                    // 기존 로직: 595.28 x 841.89 고정 (A4)

                    const page = newPdf.addPage([595.28, 841.89]);
                    page.drawImage(jpgImage, {
                        x: 0,
                        y: 0,
                        width: 595.28,
                        height: 841.89,
                    });
                }

                const compressedBytes = await newPdf.save();
                const compressedSize = compressedBytes.length;

                // 용량 체크
                if (compressedSize <= opts.maxSizeBytes) {
                    // 성공!
                    return {
                        success: true,
                        compressedData: Buffer.from(compressedBytes).toString('base64'),
                        originalSize,
                        compressedSize,
                        compressionLevel: level + 1,
                    };
                }

                // 용량 초과: 결과 저장해두고 다음 단계 진행
                lastResult = {
                    success: false,
                    originalSize,
                    compressedSize,
                    error: `압축 후 용량(${level + 1}차): ${(compressedSize / 1024 / 1024).toFixed(1)}MB (제한: ${(opts.maxSizeBytes / 1024 / 1024).toFixed(0)}MB, DPI: ${dpi}, Q: ${quality})`,
                };

                // 마지막 단계였다면 실패 반환
                if (level === compressionLevels.length - 1) {
                    return lastResult;
                }

                // 다음 단계 시도 전 로그 등은 상위에서 처리하지 않으므로 여기서 계속 진행

            } catch (err) {

                // 에러 발생 시에도 다음 단계 시도 (혹시 특정 DPI에서만 터지는 문제일 수 있으므로)
                if (level === compressionLevels.length - 1) {
                    throw err; // 마지막 단계에서도 에러나면 throw
                }
            }
        }

        // 반복문 종료 후에도 리턴 못했으면 (이론상 올 수 없음)
        return lastResult || {
            success: false,
            originalSize: 0,
            error: 'Unknown compression error',
        };

    } catch (error) {
        return {
            success: false,
            originalSize: 0,
            error: `PDF 압축 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * PDF 용량이 제한을 초과하는지 확인합니다.
 * 
 * @param base64Data - Base64로 인코딩된 데이터
 * @param maxSizeBytes - 최대 허용 용량 (기본값: 10MB)
 * @returns 초과 여부
 */
export function isPdfSizeExceeded(
    base64Data: string,
    maxSizeBytes: number = 10 * 1024 * 1024
): boolean {
    const buffer = Buffer.from(base64Data, 'base64');
    return buffer.length > maxSizeBytes;
}

/**
 * Base64 데이터의 실제 바이트 크기를 반환합니다.
 */
export function getBase64Size(base64Data: string): number {
    return Buffer.from(base64Data, 'base64').length;
}

/**
 * PDF를 페이지별 JPEG 이미지 Buffer 배열로 변환합니다.
 * gemini-3-pro-preview에서 PDF를 직접 전송하면 타임아웃 예외가 발생하므로
 * 페이지별 JPEG 이미지로 변환하여 전송합니다.
 *
 * @param pdfBase64 - Base64로 인코딩된 PDF 데이터
 * @param options - 변환 옵션 (dpi, quality, maxPages)
 * @returns 페이지별 JPEG Buffer 배열과 처리된 페이지 수
 */
export async function pdfToPageImages(
    pdfBase64: string,
    options: { dpi?: number; quality?: number; maxPages?: number } = {},
): Promise<{ images: Buffer[]; pageCount: number }> {
    const { dpi = 200, quality = 85, maxPages = 3 } = options;
    const scale = dpi / 72;

    const pdfjs = await getPdfjs();
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const pdfData = new Uint8Array(pdfBuffer);
    const { createCanvas } = await getCanvasModule();
    const pdfDoc = await pdfjs.getDocument({
        data: pdfData,
        canvasFactory: new NapiCanvasFactory(createCanvas),
    }).promise;

    const images: Buffer[] = [];
    const totalPages = pdfDoc.numPages;
    const pagesToConvert = Math.min(totalPages, maxPages);

    for (let i = 1; i <= pagesToConvert; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        await page.render({
            canvasContext: context as any,
            viewport,
            canvasFactory: new NapiCanvasFactory(createCanvas),
        }).promise;

        const pngBuffer = canvas.toBuffer('image/png');
        const sharpObj = await getSharp();
        const jpgBuffer = await sharpObj(pngBuffer).jpeg({ quality }).toBuffer();
        images.push(jpgBuffer);

        page.cleanup();
    }

    return { images, pageCount: pagesToConvert };
}

/**
 * PDF에 텍스트 레이어가 포함되어 있는지 확인합니다.
 * (앞쪽 5페이지를 샘플링하여 텍스트 존재 여부 판단)
 * 
 * @param pdfBase64 - Base64로 인코딩된 PDF 데이터
 * @returns 텍스트 유무 (true: 텍스트 있음, false: 이미지 위주)
 */
export async function hasTextLayer(pdfBase64: string): Promise<boolean> {
    try {
        const pdfjs = await getPdfjs();
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const pdfData = new Uint8Array(pdfBuffer);

        const loadingTask = pdfjs.getDocument({ data: pdfData });
        const pdfDoc = await loadingTask.promise;

        const pagesToCheck = pdfDoc.numPages; // 전체 페이지 검사 (사용자 요청)
        let textLength = 0;

        for (let i = 1; i <= pagesToCheck; i++) {
            const page = await pdfDoc.getPage(i);
            const content = await page.getTextContent();

            // 각 아이템의 문자열을 합침
            const strings = content.items.map((item: any) => item.str).join('');
            textLength += strings.trim().length;

            // 메모리 해제
            page.cleanup();

            // 의미있는 수준의 텍스트가 발견되면 즉시 true 반환
            // (OCR 오인식을 제외하기 위해 최소 50자 이상으로 설정)
            if (textLength > 50) {
                return true;
            }
        }

        return false;
    } catch (error) {
        // 읽기 에러 시 안전을 위해 텍스트가 없다고 가정하거나, 
        // 혹은 에러를 상위로 전파. 여기서는 false로 처리하여 로직 흐름 유지
        console.warn(`Error checking text layer: ${error}`);
        return false;
    }
}
