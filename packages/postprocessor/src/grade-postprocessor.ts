/**
 * 학생 성적 데이터 후처리 유틸리티
 *
 * 스키마 타입별 null/undefined 처리:
 * - Type.STRING  → ""
 * - Type.INTEGER → 0 (정수 강제 변환: parseInt / Math.round)
 * - Type.NUMBER  → 0 (실수 허용: parseFloat)
 */

const STRING_FIELDS = ['MM_TERM_KBN', 'MM_SUB', 'MM_SUB_NM', 'MM_RANK_TXT', 'MM_JINRO_FLG'];

const INTEGER_FIELDS = ['MM_MEM_GRD', 'MM_UNIT_CNT', 'MM_RANK_GRD', 'MM_STU_CNT'];

const NUMBER_FIELDS = ['MM_ORG_SCORE', 'MM_AVG_SCORE', 'MM_DEV_SCORE', 'MM_LVL_RATE1', 'MM_LVL_RATE2', 'MM_LVL_RATE3', 'MM_LVL_RATE4', 'MM_LVL_RATE5'];

export function sanitizeStudentGrades(grades: any[] | undefined | null): any[] {
    if (!Array.isArray(grades)) return [];

    return grades.map(grade => {
        if (!grade || typeof grade !== 'object') return grade;

        const sanitized: any = { ...grade };

        // STRING 필드: null/undefined → ""
        for (const field of STRING_FIELDS) {
            if (sanitized[field] === null || sanitized[field] === undefined) {
                sanitized[field] = '';
            } else if (typeof sanitized[field] !== 'string') {
                sanitized[field] = String(sanitized[field]);
            }
        }

        // INTEGER 필드: null/undefined → 0, 그 외 정수 변환
        for (const field of INTEGER_FIELDS) {
            if (sanitized[field] === null || sanitized[field] === undefined) {
                sanitized[field] = 0;
            } else if (typeof sanitized[field] !== 'number') {
                const parsed = parseInt(String(sanitized[field]), 10);
                sanitized[field] = isNaN(parsed) ? 0 : parsed;
            } else {
                // 이미 number이지만 소수점이 있을 경우 정수로 절사
                sanitized[field] = Math.round(sanitized[field]);
            }
        }

        // NUMBER 필드: 스키마에서 nullable 처리 → null/undefined만 0으로 초기화
        for (const field of NUMBER_FIELDS) {
            if (sanitized[field] === null || sanitized[field] === undefined) {
                sanitized[field] = 0;
            }
        }

        return sanitized;
    });
}
