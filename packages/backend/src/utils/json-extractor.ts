/**
 * Gemini가 프롬프트에서 "순수 JSON만" 요청했음에도
 * 코드블록이나 설명을 포함할 수 있습니다.
 * 3단계 fallback으로 항상 JSON 파싱을 보장합니다.
 */
export function extractJsonFromText(text: string): unknown {
    const trimmed = text.trim();

    // 1단계: 순수 JSON 바로 파싱 시도
    try {
        return JSON.parse(trimmed);
    } catch {
        // 계속
    }

    // 2단계: ```json ... ``` 코드블록 추출
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1].trim());
        } catch {
            // 계속
        }
    }

    // 3단계: 중괄호/대괄호 시작점 탐색 후 JSON 영역 추출
    const objectStart = trimmed.indexOf('{');
    const arrayStart = trimmed.indexOf('[');

    let jsonStart = -1;
    if (objectStart !== -1 && arrayStart !== -1) {
        jsonStart = Math.min(objectStart, arrayStart);
    } else if (objectStart !== -1) {
        jsonStart = objectStart;
    } else if (arrayStart !== -1) {
        jsonStart = arrayStart;
    }

    if (jsonStart !== -1) {
        const jsonStr = trimmed.slice(jsonStart);
        try {
            return JSON.parse(jsonStr);
        } catch {
            // 끝까지 시도 - 마지막 } 또는 ] 까지 추출
            const lastObject = jsonStr.lastIndexOf('}');
            const lastArray = jsonStr.lastIndexOf(']');
            const lastEnd = Math.max(lastObject, lastArray);
            if (lastEnd !== -1) {
                try {
                    return JSON.parse(jsonStr.slice(0, lastEnd + 1));
                } catch {
                    // 실패
                }
            }
        }
    }

    // 모두 실패 시 null 반환
    return null;
}
