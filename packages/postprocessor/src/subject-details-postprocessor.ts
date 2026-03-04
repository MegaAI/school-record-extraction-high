/**
 * 교과별 세부능력 및 특기사항(세특) 후처리 유틸리티
 *
 * - 세부능력특기사항 값에 '내부검토 중' 문구가 포함된 레코드를 제거
 * - 과목명에서 띄어쓰기(공백) 및 중점(·, ．) 제거
 */

const INTERNAL_REVIEW_KEYWORD_COMPRESSED = '내부검토';

// 제거 대상: 공백 + 중점(U+00B7 가운뎃점, U+FF0E 전각마침표, U+30FB 가타카나 중점)
const SUBJECT_NAME_REMOVE_REGEX = /[\s·．・]/g;

/**
 * 과목명 정제: 공백 및 중점 계열 문자 제거
 */
export function normalizeSubjectName(name: string): string {
    return name.replace(SUBJECT_NAME_REMOVE_REGEX, '');
}

export function postprocessSubjectDetails(items: unknown[] | undefined | null): unknown[] {
    if (!Array.isArray(items)) return [];

    return items
        .filter(item => {
            if (!item || typeof item !== 'object') return true;
            const record = item as Record<string, unknown>;
            const text = record['세부능력특기사항'];
            if (typeof text !== 'string') return true;
            return !text.replace(/\s+/g, '').includes(INTERNAL_REVIEW_KEYWORD_COMPRESSED);
        })
        .map(item => {
            if (!item || typeof item !== 'object') return item;
            const record = item as Record<string, unknown>;
            if (typeof record['과목명'] !== 'string') return record;
            return {
                ...record,
                과목명: normalizeSubjectName(record['과목명'] as string),
            };
        });
}
