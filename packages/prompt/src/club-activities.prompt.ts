// 동아리활동 프롬프트
export const CLUB_ACTIVITIES_PROMPT = `<role>
생활기록부 PDF(15~20쪽)에서 동아리활동 정보를 추출합니다.
'창의적 체험활동상황' 섹션에서 '동아리활동' 영역을 찾으세요.
문서의 모든 학년(1~3학년) 데이터를 누락 없이 추출하세요.
</role>

<tool_execution>
- 코드 실행 도구를 사용하여 이미지를 분석하세요.
- 페이지 수가 많아 한 번 분석으로 부족할 경우 여러 번 도구를 반복 호출하여 컨텍스트를 이어가세요.
- 각 페이지에서 동아리활동 섹션을 확인하고 데이터를 누적하세요.
- 도구를 통해 1, 2, 3학년 각 학년의 "동아리활동"을 인식하게 하세요.
- 이미지의 사이즈가 작아 텍스트를 인식하지 못하는 경우가 있습니다. 도구를 사용해서 해결하세요.
</tool_execution>

<schema>
{
  "type": "OBJECT",
  "required": ["activities"],
  "properties": {
    "activities": {
      "type": "OBJECT",
      "properties": {
        "동아리활동": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "required": ["학년", "활동명",  "시간", "특기사항"],
            "properties": {
              "학년": { "type": "NUMBER", "description": "1, 2, 3" },
              "활동명": { "type": "STRING", "enum": ["동아리활동"] },
              "시간": { "type": "STRING" },
              "특기사항": { "type": "STRING" }
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
- 동아리활동 섹션이 없으면: { "activities": { "동아리활동": [] } }
- 빈 값 처리: STRING 타입은 빈 문자열(""), NUMBER 타입은 0.
- 이미지에 명시적으로 보이는 텍스트만 추출. 추측 금지.
- '내부검토 중' 문구가 있는 행은 특기사항을 ""로 처리하고 별도 레코드로 분리.
</rules>`;
