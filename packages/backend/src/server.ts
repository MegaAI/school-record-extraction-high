import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { extractRoute } from './routes/extract.route.ts';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
}));

app.use(express.json());

app.use('/api', extractRoute);

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
    console.log(`🚀 서버 실행 중: http://localhost:${port}`);
});
