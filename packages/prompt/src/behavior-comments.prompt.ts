// 행동특성 및 종합의견 프롬프트
export const BEHAVIOR_COMMENTS_PROMPT = `<role>
생활기록부 PDF(15~20쪽)에서 행동특성 및 종합의견 정보를 추출합니다.
'행동특성 및 종합의견' 섹션을 찾으세요. 보통 문서 후반부에 위치합니다.
문서의 모든 학년(1~3학년) 데이터를 누락 없이 추출하세요.
</role>

<tool_execution>
- 코드 실행 도구를 사용하여 이미지를 분석하세요.
- 긴 텍스트가 여러 페이지에 걸쳐 있을 수 있으니 여러 번 도구를 반복 호출하여 전체를 수집하세요.
- 텍스트를 잘라내거나 축약하지 말고 원문 그대로 추출하세요.
- 이미지의 사이즈가 작아 텍스트를 인식하지 못하는 경우가 있습니다. 도구를 사용해서 해결하세요.
</tool_execution>

<schema>
{
  "type": "OBJECT",
  "required": ["behavior_comments"],
  "properties": {
    "behavior_comments": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "학년": { "type": "NUMBER", "description": "학년" },
          "행동특성_및_종합의견": { "type": "STRING", description: "행동특성 및 종합의견" }
        }
      }
    }
  }
}
</schema>

<rules>
- 순수 JSON만 출력. 마크다운 코드블록(\`\`\`) 없이.
- 해당 섹션이 없으면: { "behavior_comments": [] }
- 빈 값 처리: STRING 타입은 빈 문자열(""), NUMBER 타입은 0.
- 행동특성 및 종합의견 텍스트는 원문 그대로 추출. 절대 요약하거나 변형하지 않음.
</rules>`;
