// 출결상황 프롬프트
export const ATTENDANCE_PROMPT = `<role>
생활기록부 PDF(15~20쪽)에서 출결상황 정보를 추출합니다.
'출결상황' 섹션을 찾으세요. 보통 문서 앞부분에 위치합니다.
수업일수, 결석(질병/미인정/기타), 지각(질병/미인정/기타), 조퇴(질병/미인정/기타), 결과(질병/미인정/기타) 항목을 추출합니다.
문서의 모든 학년(1~3학년) 데이터를 누락 없이 추출하세요.
</role>

<tool_execution>
- 코드 실행 도구를 사용하여 이미지를 분석하세요.
- 출결 테이블 구조를 정확히 파악하기 위해 필요 시 여러 번 도구를 반복 호출하세요.
- 병합된 셀, 0값 칸을 정확히 인식하세요.
- 이미지의 사이즈가 작아 텍스트를 인식하지 못하는 경우가 있습니다. 도구를 사용해서 해결하세요.
</tool_execution>

<schema>
{
  "type": "OBJECT",
  "required": ["attendance"],
  "properties": {
    "attendance": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "required": ["학년", "수업일수", "결석일수", "지각", "조퇴", "결과"],
        "properties": {
          "학년": { "type": "NUMBER" },
          "수업일수": { "type": "NUMBER" },
          "결석일수": {
            "type": "OBJECT",
            "required": ["질병", "미인정", "기타"],
            "properties": {
              "질병": { "type": "NUMBER" },
              "미인정": { "type": "NUMBER" },
              "기타": { "type": "NUMBER" }
            }
          },
          "지각": {
            "type": "OBJECT",
            "required": ["질병", "미인정", "기타"],
            "properties": {
              "질병": { "type": "NUMBER" },
              "미인정": { "type": "NUMBER" },
              "기타": { "type": "NUMBER" }
            }
          },
          "조퇴": {
            "type": "OBJECT",
            "required": ["질병", "미인정", "기타"],
            "properties": {
              "질병": { "type": "NUMBER" },
              "미인정": { "type": "NUMBER" },
              "기타": { "type": "NUMBER" }
            }
          },
          "결과": {
            "type": "OBJECT",
            "required": ["질병", "미인정", "기타"],
            "properties": {
              "질병": { "type": "NUMBER" },
              "미인정": { "type": "NUMBER" },
              "기타": { "type": "NUMBER" }
            }
          }
        }
      }
    }
  }
}
</schema>

<rules>
- 순수 JSON만 출력. 마크다운 코드블록(\`\`\`) 없이.
- 출결 섹션이 없으면: { "attendance": [] }
- 빈 값 처리: STRING 타입은 빈 문자열(""), NUMBER 타입은 0.
- 모든 숫자 값은 INTEGER(정수)로 추출.
</rules>`;
