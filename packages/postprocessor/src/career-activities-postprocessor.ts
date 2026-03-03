/**
 * 진로활동 후처리 유틸리티
 *
 * Stage 2 분류 결과로 붙은 계열별 직업_분야_분류코드_* 필드들을
 * 단일 직업_분야_분류코드 필드로 통합합니다.
 *
 * - 각 항목에서 8개의 계열별 코드 필드를 순서대로 검사하여
 *   비어있지 않은 첫 번째 값을 직업_분야_분류코드로 채택
 * - 8개 모두 빈 문자열인 경우 빈 문자열 처리
 * - 원래 계열별 분리 필드는 제거
 */

const JOB_CODE_FIELDS = [
    '직업_분야_분류코드_인문계열',
    '직업_분야_분류코드_사회계열',
    '직업_분야_분류코드_교육계열',
    '직업_분야_분류코드_공학계열',
    '직업_분야_분류코드_자연계열',
    '직업_분야_분류코드_의약학계열',
    '직업_분야_분류코드_예체능계열',
    '직업_분야_분류코드_기타',
] as const;

/**
 * 단일 진로활동 항목에서 계열별 직업_분야_분류코드_* 필드를
 * 하나의 직업_분야_분류코드 필드로 통합
 */
export function mergeCareerActivityJobCode(item: Record<string, unknown>): Record<string, unknown> {
    // 비어있지 않은 첫 번째 계열별 코드 채택
    let mergedCode = '';
    for (const field of JOB_CODE_FIELDS) {
        const val = item[field];
        if (typeof val === 'string' && val.trim() !== '') {
            mergedCode = val.trim();
            break;
        }
    }

    // 계열별 분리 필드 제거 후 통합 필드 삽입
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
        if (!(JOB_CODE_FIELDS as readonly string[]).includes(key)) {
            cleaned[key] = value;
        }
    }
    cleaned['직업_분야_분류코드'] = mergedCode;

    return cleaned;
}

/**
 * 진로활동 배열 전체를 후처리
 */
export function postprocessCareerActivities(data: unknown): unknown {
    const d = data as Record<string, unknown>;
    const activitiesObj = d?.activities as Record<string, unknown> | undefined;
    if (!activitiesObj) return data;

    const arr = activitiesObj['진로활동'] as Record<string, unknown>[] | undefined;
    if (!Array.isArray(arr)) return data;

    return {
        ...d,
        activities: {
            ...activitiesObj,
            진로활동: arr.map(mergeCareerActivityJobCode),
        },
    };
}
