/**
 * 창체활동(자율/동아리/진로) Stage 2 전/후 처리 유틸리티
 *
 * 목적:
 * - 특기사항이 있는 항목만 Stage 2에 전달 (비용 절감)
 * - 특기사항이 없는 항목(내부검토 포함)은 Stage 2 스킵하되 finalData에 유지
 */

const ACTIVITY_KEY_MAP: Record<string, string> = {
    autonomous_activities: '자율활동',
    club_activities: '동아리활동',
    career_activities: '진로활동',
};

/** 활동 섹션 키 → 고정 영역코드(MEA_KBN_CD1) 매핑 */
const ACTIVITY_CODE_MAP: Record<string, string> = {
    자율활동: 'S001',
    '자율·자치활동': 'S001',
    동아리활동: 'S002',
    진로활동: 'S003',
};

/**
 * 창체활동 항목의 활동_구분_코드를 활동 유형에 따라 강제 고정하고,
 * S001/S002는 진로희망·직업분야분류코드를 ""로 초기화,
 * S003은 진로희망이 비어있으면 세부_분야_코드=N072, 직업_분야_분류코드=R101로 세팅.
 *
 * @param data       해당 필드 데이터 (e.g. autonomous_activities 전체)
 * @param fieldKey   pipeline fieldKey (e.g. "autonomous_activities")
 */
export function postprocessActivityCodes(data: unknown, fieldKey: string): unknown {
    const d = data as Record<string, unknown>;
    const actKey = ACTIVITY_KEY_MAP[fieldKey];
    if (!actKey) return data;

    const activitiesObj = d?.activities as Record<string, unknown[]> | undefined;
    if (!activitiesObj) return data;

    const arr = activitiesObj[actKey];
    if (!Array.isArray(arr)) return data;

    const processed = arr.map(item => {
        const r = { ...(item as Record<string, unknown>) };

        // 1. 활동_구분_코드 강제 고정 (활동명 기준 우선, 없으면 섹션 기반)
        const nameBasedCode = ACTIVITY_CODE_MAP[r['활동명'] as string ?? ''];
        const sectionCode = ACTIVITY_CODE_MAP[actKey];
        r['활동_구분_코드'] = nameBasedCode ?? sectionCode ?? r['활동_구분_코드'] ?? '';

        const code = r['활동_구분_코드'] as string;

        if (code === 'S001' || code === 'S002') {
            // 2. 자율/동아리: 진로희망·직업코드는 항상 ""
            r['진로희망'] = '';
            r['직업_분야_분류코드'] = '';
        } else if (code === 'S003') {
            // 3. 진로활동: 진로희망이 비어있으면 미정 기본값
            const jobName = (r['진로희망'] as string | undefined) ?? '';
            if (!jobName.trim()) {
                r['세부_분야_코드'] = r['세부_분야_코드'] || 'N072'; // 기타
                r['직업_분야_분류코드'] = r['직업_분야_분류코드'] || 'R101'; // 기타계열
            }
        }

        return r;
    });

    return {
        ...d,
        activities: { ...activitiesObj, [actKey]: processed },
    };
}

/**
 * Stage 2 전처리: 특기사항이 있는 항목만 추린 filteredData와 hasContent 반환
 * - hasContent = false → 전체 항목이 비어있음 → Stage 2 호출 자체를 스킵
 * - hasContent = true  → filteredData를 Stage 2에 전달
 */
export function filterActivitiesForStage2(
    data: unknown,
    fieldKey: string
): { filteredData: unknown; hasContent: boolean } {
    const d = data as Record<string, unknown>;
    const actKey = ACTIVITY_KEY_MAP[fieldKey];
    if (!actKey) return { filteredData: data, hasContent: true };

    const activitiesObj = d?.activities as Record<string, unknown[]> | undefined;
    if (!activitiesObj) return { filteredData: data, hasContent: false };

    const arr = activitiesObj[actKey];
    if (!Array.isArray(arr)) return { filteredData: data, hasContent: false };

    const filtered = arr.filter(item => {
        const r = item as Record<string, unknown>;
        return typeof r['특기사항'] === 'string' && r['특기사항'].trim() !== '';
    });

    return {
        filteredData: { ...d, activities: { ...activitiesObj, [actKey]: filtered } },
        hasContent: filtered.length > 0,
    };
}

/**
 * Stage 2 후처리: Stage 2에서 분류된 항목(codes 포함)과
 * Stage 2를 스킵했던 빈 항목(original)을 학년 순으로 합산
 */
export function restoreEmptyActivities(
    mergedData: unknown,
    originalData: unknown,
    fieldKey: string
): unknown {
    const actKey = ACTIVITY_KEY_MAP[fieldKey];
    if (!actKey) return mergedData;

    const origActivities = (originalData as Record<string, unknown>)?.activities as Record<string, unknown[]> | undefined;
    const mergedActivities = (mergedData as Record<string, unknown>)?.activities as Record<string, unknown[]> | undefined;
    if (!origActivities || !mergedActivities) return mergedData;

    const origArr = origActivities[actKey] ?? [];
    const mergedArr = mergedActivities[actKey] ?? [];

    // Stage 2를 스킵한 항목 = 원본에는 있으나 특기사항이 ""인 항목
    const skippedItems = origArr.filter(item => {
        const r = item as Record<string, unknown>;
        return typeof r['특기사항'] !== 'string' || r['특기사항'].trim() === '';
    });

    // Stage 2 결과 항목 + 스킵된 항목 합산 후 학년 오름차순 정렬
    const combined = [...mergedArr, ...skippedItems].sort((a, b) => {
        const aG = ((a as Record<string, unknown>)['학년'] as number) ?? 0;
        const bG = ((b as Record<string, unknown>)['학년'] as number) ?? 0;
        return aG - bG;
    });

    return {
        ...(mergedData as Record<string, unknown>),
        activities: { ...mergedActivities, [actKey]: combined },
    };
}
