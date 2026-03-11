/**
 * 독서활동상황 후처리 유틸리티
 *
 * - 과목또는영역에서 띄어쓰기(공백) 및 중점(·, ．) 제거
 */

// 제거 대상: 공백 + 중점(U+00B7 가운뎃점, U+FF0E 전각마침표, U+30FB 가타카나 중점)
const FIELD_NAME_REMOVE_REGEX = /[\s·．・]/g;

/**
 * 과목또는영역 정제: 공백 및 중점 계열 문자 제거
 */
export function normalizeReadingArea(name: string): string {
    return name.replace(FIELD_NAME_REMOVE_REGEX, '');
}

export function postprocessReadingActivities(items: unknown[] | undefined | null): unknown[] {
    if (!Array.isArray(items)) return [];

    return items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const record = item as Record<string, unknown>;
        if (typeof record['과목또는영역'] !== 'string') return record;
        return {
            ...record,
            과목또는영역: normalizeReadingArea(record['과목또는영역'] as string),
        };
    });
}
