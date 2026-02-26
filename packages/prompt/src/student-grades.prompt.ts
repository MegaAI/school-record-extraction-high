// 성적 프롬프트
export const STUDENT_GRADES_PROMPT = `<role>
생활기록부 PDF(15~20쪽)에서 학업 성취도(성적) 정보를 추출합니다.
'교과학습발달상황' 섹션을 찾으세요.
각 학년·학기별 교과목, 단위수, 원점수, 과목평균, 표준편차, 성취도, 석차등급 등을 추출합니다.
문서의 모든 학년(1~3학년) 데이터를 누락 없이 추출하세요.
</role>

<tool_execution>
- 코드 실행 도구를 사용하여 이미지를 분석하세요.
- 성적 테이블은 복잡한 구조를 가집니다. 여러 번 도구를 반복 호출하여 정확히 파악하세요.
- 병합 셀, 학년·학기 구분을 정확히 인식하세요.
- 이미지의 사이즈가 작아 텍스트를 인식하지 못하는 경우가 있습니다. 도구를 사용해서 해결하세요.
</tool_execution>

<schema>
type: Type.OBJECT,
  properties: {
    student_grades: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          MM_TERM_KBN: {
            type: Type.STRING,
            description: "학기 - 유효값: 1, 2",
          },
          MM_MEM_GRD: {
            type: Type.INTEGER,
            description: "학년 - 유효값: 1, 2, 3",
          },
          MM_SUB: {
            type: Type.STRING,
            description: "교과명 - 공백 및 중점(·) 없도록 변환, 로마자는 Ⅰ, Ⅱ, Ⅲ 기호로 변환 (숫자 1, 2, 3 가능)",
          },
          MM_SUB_NM: {
            type: Type.STRING,
            description: "과목명 - 공백 및 중점(·) 없도록 변환, 로마자는 Ⅰ, Ⅱ, Ⅲ 기호로 변환 (숫자 1, 2, 3 가능)",
          },
          MM_UNIT_CNT: {
            type: Type.INTEGER,
            description: "이수학점/이수단위 - 유효값: 1~10 자연수",
          },
          MM_ORG_SCORE: {
            type: Type.NUMBER,
            description: "원점수 - 유효값: 0~100, 기본값: 0",
          },
          MM_AVG_SCORE: {
            type: Type.NUMBER,
            description: "평균점수 - 유효값: 0~100, 기본값: 0",
          },
          MM_DEV_SCORE: {
            type: Type.NUMBER,
            description: "표준편차 - 유효값: 0~100, 기본값: 0",
          },
          MM_RANK_GRD: {
            type: Type.INTEGER,
            description: "석차등급 - 유효값: 1~9 자연수",
          },
          MM_STU_CNT: {
            type: Type.INTEGER,
            description: "수강자수 - 유효값: 1~999 자연수",
          },
          MM_RANK_TXT: {
            type: Type.STRING,
            description: "성취도 - 유효값: A, B, C, D, E, P, 우수, 보통, 미흡",
          },
          MM_LVL_RATE1: {
            type: Type.NUMBER,
            description: "성취도A비율 - 유효값: 1~100, A~C합산 99.9~100.1까지 허용",
          },
          MM_LVL_RATE2: {
            type: Type.NUMBER,
            description: "성취도B비율 - 유효값: 1~100",
          },
          MM_LVL_RATE3: {
            type: Type.NUMBER,
            description: "성취도C비율 - 유효값: 1~100",
          },
          MM_JINRO_FLG: {
            type: Type.STRING,
            description: "진로선택 플래그 - 유효값: N(공통/일반선택 과목일 경우), Y(진로 선택 과목일 경우)",
          },
          MM_LVL_RATE4: {
            type: Type.NUMBER,
            description: "성취도D비율 - 2022 개정 교육과정용 (올해 반영 안함), A~E합산 99.9~100.1까지 허용",
          },
          MM_LVL_RATE5: {
            type: Type.NUMBER,
            description: "성취도E비율 - 2022 개정 교육과정용 (올해 반영 안함)",
          }
        },
        required: [
          "MM_TERM_KBN",
          "MM_MEM_GRD",
          "MM_SUB",
          "MM_SUB_NM",
          "MM_UNIT_CNT",
          "MM_ORG_SCORE",
          "MM_AVG_SCORE",
          "MM_DEV_SCORE",
          "MM_RANK_GRD",
          "MM_STU_CNT",
          "MM_RANK_TXT",
          "MM_JINRO_FLG",
        ]
      }
    }
  }
</schema>

<rules>
- 순수 JSON만 출력. 마크다운 코드블록(\`\`\`) 없이.
- 성적 섹션이 없으면: { "student_grades": [] }
- 빈 값 처리: STRING 타입은 빈 문자열(""), NUMBER 타입은 0.
- 숫자 필드는 반드시 NUMBER(정수 또는 소수)로 추출.
- 이미지에 명시적으로 보이는 값만 추출. 추측 금지.
</rules>`;
