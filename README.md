# School Record Extraction (학교 생활기록부 데이터 추출 시스템)

본 프로젝트는 고등학교 학교 생활기록부(생기부) PDF 문서에서 의미 있는 데이터를 빠르고 정확하게 추출 및 구조화하기 위한 자동화 파이프라인 시스템입니다. **Vertex AI (Gemini 1.5 Pro, Flash 등)**를 활용한 다단계(Stage 1, Stage 2) 병렬 처리 아키텍처를 기반으로 설계되었습니다.

## 🚀 프로젝트 개요
- **프로젝트 명**: `school-record-extraction`
- **주요 목적**: 학생 생활기록부 PDF에서 출결 상황, 창의적 체험활동, 교과 세부능력 및 특기사항(세특), 독서 활동 등의 항목별 구조화 데이터 추출
- **핵심 기술**: Node.js, `pnpm` 기반 Monorepo 구조, Vertex AI (Gemini Pro/Flash 모델), 비동기 병렬 처리 설계

## 🏗 아키텍처 및 핵심 폴더 구조
본 프로젝트는 `pnpm` 워크스페이스(Workspace)를 활용해 기능별 패키지로 완전히 분리된 구조를 띕니다.

```text
📦 school-record-extraction (Root)
 ┣ 📂 packages/
 ┃ ┣ 📂 backend/       # Express 기반 API 서버 로직 (환경변수 .env 위치)
 ┃ ┣ 📂 frontend/      # Vite + React 기반 사용자 웹 UI 사이드
 ┃ ┣ 📂 preprocessor/  # PDF 파싱, 용량 압축 및 전처리 로직 모듈
 ┃ ┣ 📂 postprocessor/ # Gemini API로부터 파싱된 결과의 데이터 오류 후처리 모듈
 ┃ ┣ 📂 prompt/        # Gemini API 프롬프트 관리 (항목별, Stage 모델별)
 ┃ ┗ 📂 schema/        # 데이터 무결성 검증을 위한 Zod 스키마
 ┣ 📂 test_script/     # Node.js 기반 배치 일괄 추출 및 정확도 등 테스트 모듈
 ┣ 📜 <gcp-인증키-이름>.json # (선택) Vertex AI 서비스 어카운트 인증 정보 JSON 파일
 ┣ 📜 pnpm-workspace.yaml # 모노레포 워크스페이스 설정 정의
 ┗ 📜 package.json     # 최상위 의존성 및 병렬 실행 스크립트 (run dev)
```
*(참고: `gemini-ocr` 등 레거시 테스트 폴더는 본 모노레포 메인 파이프라인 구조와는 별도로 존재합니다.)*

## ✨ 주요 기능 및 특징
1. **다단계 추출 파이프라인 최적화 (Stage 분리)** 
   - **Stage 1**: 전처리된 문서에서 기초 데이터 및 항목 구획 판별 (주로 Flash 모델 활용)
   - **Stage 2**: 세특(subject_details) 등 심층 분석 데이터는 별도 항목으로 추출 (사고 수준 `HIGH` 및 지수 백오프 전략 적용)
2. **모놀리식 분할과 병렬 파이프라인 (Monorepo)** 
   - 스키마(`schema`), 프롬프트(`prompt`), 처리 모듈을 각자 독립적인 패키지로 구성하고 묶어서 활용합니다.

## 🛠 설치 및 실행 방법

### 요구 사항
- **Node.js**: v18 이상 권장
- **Package Manager**: `pnpm` (`npm i -g pnpm`)

### 1. 의존성 설치
```bash
pnpm install
```

### 2. 구글 클라우드(Vertex AI) 및 서버 환경 변수 설정
`packages/backend` 폴더로 이동하여 `.env` 파일을 생성해야 합니다. 
만약 서비스 어카운트 JSON 인증 키를 프로젝트 루트 폴더에 두었다면, `GOOGLE_APPLICATION_CREDENTIALS` 경로는 아래와 같이 `../../`로 시작하게 됩니다.

```env
# packages/backend/.env 예시

# GCP Vertex AI 인증 및 프로젝트 설정
GOOGLE_APPLICATION_CREDENTIALS=../../your-service-account-file.json
VERTEX_PROJECT=your-gcp-project-id
VERTEX_LOCATION=global  # 또는 설정된 리전 (us-central1 등)

# 서버 포트 및 클라이언트 허용 주소 설정
PORT=3001               # (배치 테스트 시 포트를 5174로 사용할 경우 5174 입력)
FRONTEND_URL=http://localhost:5173
```

### 3. 개발 서버 실행 (Monorepo 통합 실행)
최상위 루트 디렉토리에서 아래 명령어를 실행하면 백엔드와 프론트엔드가 동시에 구동됩니다:
```bash
pnpm dev
```
- 개별 수동 실행 명령어 (참고용):
  - 백엔드: `pnpm run dev:backend`
  - 프론트엔드: `pnpm run dev:frontend`

## 🧪 배치 테스트 (Batch Test)
`test_script` 폴더 내에 로컬 환경의 폴더 절대 경로를 참조하여 PDF 파일들을 일괄 처리하는 테스트를 수행할 수 있습니다. 백엔드 서버가 로컬에서 구동 중일 때 독립 터미널을 열어 실행합니다.
```bash
node test_script/batch_test.mjs
```
- 파일 내의 `API_URL`(예: `http://localhost:5174`), `SAMPLES_DIR`, `OUTPUT_DIR` 경로가 본인 환경과 맞게 설정되어 있는지 확인 후 실행하세요.
