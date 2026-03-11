/**
 * 행동특성 및 종합의견 후처리 유틸리티
 *
 * - 행동특성_및_종합의견 값에 '내부검토 중' 문구가 포함된 레코드를 제거
 */

const INTERNAL_REVIEW_KEYWORD_COMPRESSED = '내부검토';

export function postprocessBehaviorComments(items: unknown[] | undefined | null): unknown[] {
    if (!Array.isArray(items)) return [];

    return items.filter(item => {
        if (!item || typeof item !== 'object') return true;
        const record = item as Record<string, unknown>;
        const text = record['행동특성_및_종합의견'];
        if (typeof text !== 'string') return true;
        return !text.replace(/\s+/g, '').includes(INTERNAL_REVIEW_KEYWORD_COMPRESSED);
    });
}
