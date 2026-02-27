import { useCallback, useState } from 'react';
import { extractFromPdf, type ExtractResponse, type CostBreakdown, type ModelCost } from './api/extract';
import './index.css';

const FIELD_LABELS: Record<string, string> = {
    autonomous_activities: '자율활동',
    club_activities: '동아리활동',
    career_activities: '진로활동',
    volunteer_activities: '봉사활동',
    attendance: '출결상황',
    awards: '수상경력',
    behavior_comments: '행동특성 및 종합의견',
    license: '자격증 및 인증',
    reading_activities: '독서활동',
    student_grades: '성적',
    subject_details: '세부능력특기사항',
};

type Status = 'idle' | 'ready' | 'loading' | 'success' | 'error';

function fmt(n: number): string {
    return n.toLocaleString();
}

function ModelCostRow({ label, model, cost }: { label: string; model: string; cost: ModelCost }) {
    return (
        <div className="model-cost-row">
            <div className="model-cost-header">
                <span className="model-badge">{model}</span>
                <span className="model-cost-label">{label}</span>
                <span className="model-cost-total">${cost.totalUsd.toFixed(6)}</span>
            </div>
            <div className="model-cost-detail">
                <span>입력 ${cost.inputUsd.toFixed(6)}</span>
                <span>출력 ${cost.outputUsd.toFixed(6)}</span>
                <span>캐시읽기 ${cost.cacheReadUsd.toFixed(6)}</span>
            </div>
        </div>
    );
}

function CostPanel({ cb, flashCost, proCost, stage2Cost, durationMs }: {
    cb: CostBreakdown;
    flashCost?: ModelCost;
    proCost?: ModelCost;
    stage2Cost?: ModelCost;
    durationMs?: number;
}) {
    const { usage, cost } = cb;
    return (
        <div className="cost-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ marginBottom: 0 }}>◈ 분석 요약</h2>
                {durationMs && (
                    <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                        ⏱️ 소요시간: <b style={{ color: '#e2e8f0', fontSize: '1rem' }}>{(durationMs / 1000).toFixed(1)}초</b>
                    </span>
                )}
            </div>

            {/* 토큰 사용량 그리드 */}
            <div className="cost-grid">
                <div className="cost-item">
                    <span className="cost-label">입력 토큰</span>
                    <span className="cost-value">{fmt(usage.promptTokens)} tok</span>
                    <span className="cost-sub">${cost.inputUsd.toFixed(6)}</span>
                </div>
                <div className="cost-item">
                    <span className="cost-label">출력 토큰</span>
                    <span className="cost-value">{fmt(usage.candidateTokens)} tok</span>
                    <span className="cost-sub">${cost.outputUsd.toFixed(6)}</span>
                </div>
                <div className="cost-item">
                    <span className="cost-label">Thinking 토큰</span>
                    <span className="cost-value thinking">{fmt(usage.thinkingTokens)} tok</span>
                    <span className="cost-sub">출력 요금에 포함</span>
                </div>
                <div className="cost-item">
                    <span className="cost-label">캐시 읽기 토큰</span>
                    <span className="cost-value cached">{fmt(usage.cachedTokens)} tok</span>
                    <span className="cost-sub">${cost.cacheReadUsd.toFixed(6)}</span>
                </div>
            </div>

            {/* 모델별 비용 breakdown */}
            {(flashCost || proCost || stage2Cost) && (
                <div className="model-cost-section">
                    <div className="model-cost-title">모델별 비용 내역</div>
                    {flashCost && (
                        <ModelCostRow
                            label="Stage 1"
                            model="Gemini 3 Flash"
                            cost={flashCost}
                        />
                    )}
                    {proCost && (
                        <ModelCostRow
                            label="Stage 1"
                            model="Gemini 2.5 Pro (성적)"
                            cost={proCost}
                        />
                    )}
                    {stage2Cost && (
                        <ModelCostRow
                            label="Stage 2"
                            model="Gemini 3 Flash (분류)"
                            cost={stage2Cost}
                        />
                    )}
                </div>
            )}

            {/* 합산 총 비용 */}
            <div className="cost-total">
                <span>총 비용</span>
                <div>
                    <span className="total-usd">${cost.totalUsd.toFixed(6)}</span>
                    <span className="total-krw">≈ ₩{cost.totalKrw.toFixed(0)}</span>
                </div>
            </div>
        </div>
    );
}

function App() {
    const [status, setStatus] = useState<Status>('idle');
    const [result, setResult] = useState<ExtractResponse | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFile = useCallback((file: File) => {
        if (file.type !== 'application/pdf') { alert('PDF 파일만 업로드 가능합니다.'); return; }
        setSelectedFile(file);
        setResult(null);
        setStatus('ready');
    }, []);

    const handleAnalyze = useCallback(async () => {
        if (!selectedFile) return;
        setStatus('loading');
        setResult(null);
        try {
            const res = await extractFromPdf(selectedFile);
            setResult(res);
            setStatus('success');
        } catch (e) {
            setResult({ success: false, error: e instanceof Error ? e.message : '알 수 없는 오류' });
            setStatus('error');
        }
    }, [selectedFile]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
    };

    const handleReset = () => { setSelectedFile(null); setResult(null); setStatus('idle'); };

    return (
        <div className="container">
            <header>
                <h1>🎓 생활기록부 PDF 추출</h1>
                <p>PDF를 업로드하고 분석 버튼을 누르면 11개 필드를 병렬로 추출합니다.</p>
            </header>

            <div
                className={`dropzone${dragOver ? ' drag-over' : ''}${selectedFile ? ' has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => status !== 'loading' && document.getElementById('file-input')?.click()}
            >
                <input id="file-input" type="file" accept=".pdf" style={{ display: 'none' }} onChange={onInputChange} />
                <p className="drop-icon">{selectedFile ? '📄' : '⬆️'}</p>
                {selectedFile ? <p className="file-name">{selectedFile.name}</p> : <p>PDF 파일을 드래그하거나 클릭하여 선택</p>}
            </div>

            {selectedFile && status !== 'loading' && (
                <div className="btn-row">
                    <button className="btn-analyze" onClick={handleAnalyze}>🔍 분석 시작</button>
                    <button className="btn-reset" onClick={handleReset}>✕ 초기화</button>
                </div>
            )}

            {status === 'loading' && (
                <div className="loading-box">
                    <div className="spinner" />
                    <p>
                        2-Stage 분석 중...<br />
                        <small style={{ color: '#94a3b8' }}>Stage 1: 순수 텍스트 추출 ➔ Stage 2: 분류 코드 분리 유추</small>
                    </p>
                </div>
            )}

            {status === 'error' && <div className="error-box">❌ {result?.error}</div>}

            {status === 'success' && result && (
                <>
                    {result.costBreakdown && (
                        <CostPanel
                            cb={result.costBreakdown}
                            flashCost={result.flashCost}
                            proCost={result.proCost}
                            stage2Cost={result.stage2Cost}
                            durationMs={result.durationMs}
                        />
                    )}

                    {result.data && (
                        <div className="result-section">
                            <h2>추출 결과</h2>
                            {result.errors && Object.keys(result.errors).length > 0 && (
                                <div className="error-box">⚠️ 일부 필드 실패: {Object.keys(result.errors).join(', ')}</div>
                            )}
                            {Object.entries(result.data).map(([key, value]) => (
                                <div key={key} className="field-card">
                                    <h3>{FIELD_LABELS[key] ?? key}</h3>
                                    <pre>{JSON.stringify(value, null, 2)}</pre>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default App;
