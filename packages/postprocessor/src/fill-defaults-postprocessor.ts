/**
 * 파이프라인 최종 출력 디폴트값 채우기 유틸리티
 *
 * 각 필드의 역할:
 * 1. 배열이 [] 이면 → 기본 키:값을 가진 항목 하나로 채움
 * 2. 항목 내 개별 키가 null/undefined 이면 → 타입에 맞는 기본값(""  or 0)으로 채움
 *
 * 적용 대상: finalData의 모든 필드
 */

// ──────────────────────────────────────────────
// 각 필드별 빈 배열 시 삽입할 기본 항목 정의
// ──────────────────────────────────────────────

// 자율활동(S001) · 동아리활동(S002) · 진로활동(S003) 모두 동일한 키 구조
const DEFAULT_ACTIVITY_ITEM = {
    학년: 0,
    활동명: '',
    시간: '',
    특기사항: '',
    진로희망: '',          // S001/S002는 항상 "", S003은 실제값
    활동_구분_코드: '',    // Stage 2: S001 / S002 / S003
    세부_분야_코드: '',    // Stage 2: N***
    직업_분야_분류코드: '', // S001/S002는 항상 "", S003은 실제값
};

const DEFAULT_VOLUNTEER_ITEM = {
    학년: 0,
    활동명: '봉사활동',
    장소_주관기관명: '',
    특기사항: '',
    시간: 0,
    // Stage 2에서 추가되는 분류 코드
    봉사활동코드: '',
};

const DEFAULT_AWARD_ITEM = {
    학년: 0,
    학기: 0,
    수상명: '',
    등급위: '',
    수상연월일: '',
    수여기관: '',
    참가대상_참가인원: '',
    // Stage 2에서 추가되는 분류 코드
    활동_구분_코드: '',
    교내_교외_구분코드: '',
    분야_코드: '',
};

const DEFAULT_LICENSE_ITEM = {
    명칭_또는_종류: '',
    번호_또는_내용: '',
    취득년월일: '',
    발급기관: '',
    // Stage 2에서 추가되는 분류 코드
    구분: '',             // 항상 "2" (교외)
    교내_교외_구분코드: '', // 항상 "G002" (교외)
    분야_코드: '',         // H002~H043, H006 (기타)
};

const DEFAULT_READING_ITEM = {
    학년: '',
    과목또는영역: '',
    독서_분야코드: '',
    도서명: '',
    독서활동상황: '',
};

const DEFAULT_BEHAVIOR_ITEM = {
    학년: 0,
    행동특성_및_종합의견: '',
};

const DEFAULT_SUBJECT_DETAIL_ITEM = {
    학년: 0,
    과목명: '',
    세부능력특기사항: '',
};

// ──────────────────────────────────────────────
// 유틸 함수
// ──────────────────────────────────────────────

/**
 * 배열이 비어있으면 기본 항목을 하나 삽입,
 * 항목 내 null/undefined 값은 기본값으로 채움
 */
function fillArray<T extends Record<string, unknown>>(
    arr: unknown[] | undefined | null,
    defaultItem: T
): Record<string, unknown>[] {
    if (!Array.isArray(arr) || arr.length === 0) {
        return [{ ...defaultItem }];
    }
    return arr.map(item => {
        if (!item || typeof item !== 'object') return { ...defaultItem };
        const filled: Record<string, unknown> = { ...defaultItem, ...(item as Record<string, unknown>) };
        // null/undefined 키 → 기본값으로 교체
        for (const key of Object.keys(defaultItem)) {
            if (filled[key] === null || filled[key] === undefined) {
                filled[key] = (defaultItem as Record<string, unknown>)[key];
            }
        }
        return filled;
    });
}

// ──────────────────────────────────────────────
// 필드별 디폴트 채우기 함수
// ──────────────────────────────────────────────

export function fillDefaultActivities(data: unknown, activityKey: string): unknown {
    const d = data as Record<string, unknown>;
    const activitiesObj = d?.activities as Record<string, unknown[]> | undefined;
    if (!activitiesObj) return data;

    return {
        ...d,
        activities: {
            ...activitiesObj,
            [activityKey]: fillArray(activitiesObj[activityKey], DEFAULT_ACTIVITY_ITEM),
        },
    };
}

export function fillDefaultVolunteerActivities(data: unknown): unknown {
    const d = data as Record<string, unknown>;
    const activitiesObj = d?.activities as Record<string, unknown[]> | undefined;
    if (!activitiesObj) return data;
    return {
        ...d,
        activities: {
            ...activitiesObj,
            봉사활동실적: fillArray(activitiesObj['봉사활동실적'], DEFAULT_VOLUNTEER_ITEM),
        },
    };
}

export function fillDefaultAwards(data: unknown): unknown {
    const d = data as Record<string, unknown>;
    const arr = d?.awards as unknown[] | undefined;
    return { ...d, awards: fillArray(arr, DEFAULT_AWARD_ITEM) };
}

export function fillDefaultLicense(data: unknown): unknown {
    const d = data as Record<string, unknown>;
    const licenseObj = d?.license as Record<string, unknown[]> | undefined;
    const arr = licenseObj?.['자격증_및_인증_취득상황'];
    return {
        ...d,
        license: {
            ...(licenseObj ?? {}),
            자격증_및_인증_취득상황: fillArray(arr, DEFAULT_LICENSE_ITEM),
        },
    };
}

export function fillDefaultReadingActivities(data: unknown): unknown {
    const d = data as Record<string, unknown>;
    const arr = d?.reading_activities as unknown[] | undefined;
    return { ...d, reading_activities: fillArray(arr, DEFAULT_READING_ITEM) };
}

export function fillDefaultBehaviorComments(data: unknown): unknown {
    const d = data as Record<string, unknown>;
    const arr = d?.behavior_comments as unknown[] | undefined;
    return { ...d, behavior_comments: fillArray(arr, DEFAULT_BEHAVIOR_ITEM) };
}

export function fillDefaultSubjectDetails(data: unknown): unknown {
    const d = data as Record<string, unknown>;
    const arr = d?.subject_details as unknown[] | undefined;
    return { ...d, subject_details: fillArray(arr, DEFAULT_SUBJECT_DETAIL_ITEM) };
}

// ──────────────────────────────────────────────
// 전체 finalData에 일괄 적용
// ──────────────────────────────────────────────

/**
 * pipeline.service.ts의 finalData에 일괄 적용
 */
export function fillAllDefaults(finalData: Record<string, unknown>): Record<string, unknown> {
    const result = { ...finalData };

    if (result.autonomous_activities)
        result.autonomous_activities = fillDefaultActivities(result.autonomous_activities, '자율활동');

    if (result.club_activities)
        result.club_activities = fillDefaultActivities(result.club_activities, '동아리활동');

    if (result.career_activities)
        result.career_activities = fillDefaultActivities(result.career_activities, '진로활동');

    if (result.volunteer_activities)
        result.volunteer_activities = fillDefaultVolunteerActivities(result.volunteer_activities);

    if (result.awards)
        result.awards = fillDefaultAwards(result.awards);

    if (result.license)
        result.license = fillDefaultLicense(result.license);

    if (result.reading_activities)
        result.reading_activities = fillDefaultReadingActivities(result.reading_activities);

    if (result.behavior_comments)
        result.behavior_comments = fillDefaultBehaviorComments(result.behavior_comments);

    if (result.subject_details)
        result.subject_details = fillDefaultSubjectDetails(result.subject_details);

    return result;
}
