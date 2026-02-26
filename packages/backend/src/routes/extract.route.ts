import { Router } from 'express';
import multer from 'multer';
import { GeminiFlashService } from '../services/gemini-flash.service.ts';

export const extractRoute = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('PDF 파일만 업로드 가능합니다.'));
    },
});

const service = new GeminiFlashService();

extractRoute.post('/extract', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'PDF 파일이 필요합니다.' });
            return;
        }

        const pdfBase64 = req.file.buffer.toString('base64');
        console.log(`📄 PDF 수신: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);

        const { data, errors, costBreakdown, durationMs } = await service.extractAll(pdfBase64);

        res.json({
            success: true,
            data,
            errors: Object.keys(errors).length > 0 ? errors : undefined,
            costBreakdown,
            durationMs,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('추출 실패:', msg);
        res.status(500).json({ success: false, error: msg });
    }
});
