# School Record Extraction (학교 생활기록부 데이터 추출 시스템)

본 프로젝트는 고등학교 학교 생활기록부(생기부) PDF 문서에서 의미 있는 데이터를 빠르고 정확하게 추출 및 구조화하기 위한 자동화 파이프라인 시스템입니다. **Gemini API(1.5 Pro, Flash 등)**를 활용한 다단계(Stage 1, Stage 2) 병렬 처리 아키텍처를 기반으로 설계되었습니다.

## 🚀 프로젝트 개요
- **프로젝트 명**: `school-record-extraction` (gemini-data-extraction)
- **주요 목적**: 학생 생활기록부 PDF에서 출결 상황, 창의적 체험활동, 교과 세부능력 및 특기사항(세특), 독서 활동 등의 항목별 구조화 데이터 추출
- **핵심 기술**: Node.js, `pnpm` 기반 Monorepo 구조, Gemini AI (Pro/Flash 모델), 비동기 병렬 처리 기반 OCR 파이프라인

## 🏗 아키텍처 및 폴더 구조 (Monorepo)
본 프로젝트는 `pnpm` 워크스페이스(Workspace)를 활용한 모노레포 구조로 구성되어 있습니다.

```text
📦 gemini-data-extraction
 ┣ 📂 packages/
 ┃ ┣ 📂 backend/       # API 서비스 요약 및 라우팅 등 서버 로직
 ┃ ┣ 📂 frontend/      # 사용자 UI 사이드 
 ┃ ┣ 📂 preprocessor/  # PDF 파일 파싱, 전처리 연산, 이미지 변환 로직 모듈
 ┃ ┣ 📂 postprocessor/ # Gemini API로부터 파싱된 결과의 포맷 검증 및 데이터 후처리 로직 
 ┃ ┣ 📂 prompt/        # Gemini API 프롬프트 관리 (항목별, 모델별)
 ┃ ┗ 📂 schema/        # 데이터 무결성 및 구조(Schema) 검증 파트 기반 폴더
 ┣ 📂 test_script/     # 일괄 추출 결과 측정, 정확도 검증(배치 테스트) 모듈
 ┣ 📂 gemini-ocr/      # OCR 전담 유틸리티
 ┗ 📜 package.json
```

## ✨ 주요 기능 및 특징
1. **다단계 추출 파이프라인 최적화 (Pipeline Stage 연동)** 
   - **Stage 1**: 전처리된 문서에서 기초 데이터 및 항목 구획 판별 (Gemini Flash 모델 주로 활용 등)
   - **Stage 2**: 세특(subject_details) 등 심층 분석이 필요한 데이터 추출 (사고 수준(thinking level) 'HIGH' 적용 등)
2. **비용 효율 및 속도 최적화** 
   - 병렬 비동기 API 처리 구조, 지수 백오프(Exponential Backoff) 기반 안정적 재시도 로직
3. **독자적인 PDF 파싱 및 전처리 모듈화**
   - 이미지 기반 렌더링, 페이지 청크 분할 기능

## 🛠 설치 및 실행 방법

### 요구 사항
- **Node.js**: v18 이상 권장
- **Package Manager**: `pnpm` (`npm install -g pnpm`)

### 1. 의존성 설치
```bash
pnpm install
```

### 2. 환경 변수 설정
`packages/backend` 폴더 내에 `.env` 파일을 생성하고 다음 값을 추가하세요. 구글 클라우드(GCP) Vertex AI 접근을 위한 환경 변수입니다.
```env
# GCP Vertex AI 인증 및 프로젝트 설정
GOOGLE_APPLICATION_CREDENTIALS=../../fit-galaxy-466700-t2-865a267b842b.json
VERTEX_PROJECT=fit-galaxy-466700-t2
VERTEX_LOCATION=us-central1  # 또는 설정한 리전

# 서버 및 클라이언트 설정
PORT=5174
FRONTEND_URL=http://localhost:5173
```

### 3. 개발 서버 실행
전체 워크스페이스를 한 번에 실행합니다:
```bash
pnpm dev
```
- 개별 실행을 원할 경우:
  - 백엔드 실행: `pnpm run dev:backend`
  - 프론트엔드 실행: `pnpm run dev:frontend`

## 🧪 배치 테스트 (Batch Test)
`test_script` 디렉토리에 여러 학생의 생기부 PDF 데이터를 일괄로 점검하고 토큰 최적화 및 비용을 산출해주는 테스트 모듈이 준비되어 있습니다.
(백엔드 서버가 띄워져 있는 상태에서 구동되어야 합니다.)
```bash
node test_script/batch_test.mjs
```
- 스크립트 실행 후 지정된 내부 OUTPUT_DIR에 `result.json` 및 `cost.json` 파일이 추출/생성됩니다.
