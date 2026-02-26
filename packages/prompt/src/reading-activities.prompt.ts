// 독서활동상황 프롬프트
export const READING_ACTIVITIES_PROMPT = `<role>
생활기록부 PDF(15~20쪽)에서 독서활동 정보를 추출합니다.
'독서활동상황' 섹션을 찾으세요.
문서의 모든 학년(1~3학년) 데이터를 누락 없이 추출하세요.
한 셀에 여러 권의 도서가 기재된 경우 각각 별도 항목으로 분리하세요.
</role>

<tool_execution>
- 코드 실행 도구를 사용하여 이미지를 분석하세요.
- 페이지 수가 많아 한 번 분석으로 부족할 경우 여러 번 도구를 반복 호출하여 컨텍스트를 이어가세요.
- 독서 테이블의 학년, 과목/영역, 도서명(저자) 구조를 정확히 파악하세요.
- 이미지의 사이즈가 작아 텍스트를 인식하지 못하는 경우가 있습니다. 도구를 사용해서 해결하세요.
</tool_execution>

<schema>
{
  "type": "OBJECT",
  "required": ["reading_activities"],
  "properties": {
    "reading_activities": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "학년": { "type": "STRING" },
          "과목또는영역": { "type": "STRING" },
          "도서명": { "type": "STRING" },
          "독서활동상황": { "type": "STRING", "description": "도서명(저자) 형식 원문" }
        }
      }
    }
  }
}
</schema>

<rules>
- 순수 JSON만 출력. 마크다운 코드블록(\`\`\`) 없이.
- 독서활동 섹션이 없으면: { "reading_activities": [] }
- 빈 값 처리: STRING 타입은 빈 문자열(""), NUMBER 타입은 0.
- 이미지에 명시적으로 보이는 텍스트만 추출. 추측 금지.
- 한 셀에 여러 도서가 있으면 각각 별도 항목으로 분리.
- 독서활동상황 필드는 "도서명(저자)" 형식 원문 그대로 기록.
</rules>`;
