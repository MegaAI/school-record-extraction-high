// Stage 1 — 순수 텍스트 추출 프롬프트
export * from './system-prompt';
export * from './stage_1';
export * from './stage_2';

import {
    ATTENDANCE_PROMPT, AUTONOMOUS_ACTIVITIES_PROMPT, AWARDS_PROMPT, BEHAVIOR_COMMENTS_PROMPT,
    CAREER_ACTIVITIES_PROMPT, CLUB_ACTIVITIES_PROMPT, LICENSE_PROMPT, READING_ACTIVITIES_PROMPT,
    STUDENT_GRADES_PROMPT, SUBJECT_DETAILS_PROMPT, VOLUNTEER_ACTIVITIES_PROMPT
} from './stage_1';

import {
    AUTONOMOUS_ACTIVITIES_CODE_PROMPT, AWARDS_CODE_PROMPT, CAREER_ACTIVITIES_CODE_PROMPT,
    CLUB_ACTIVITIES_CODE_PROMPT, LICENSE_CODE_PROMPT, READING_ACTIVITIES_CODE_PROMPT,
    VOLUNTEER_ACTIVITIES_CODE_PROMPT
} from './stage_2';

// ===== 타입 정의 =====

export type Stage1FieldKey =
    | 'autonomous_activities'
    | 'club_activities'
    | 'career_activities'
    | 'volunteer_activities'
    | 'attendance'
    | 'awards'
    | 'behavior_comments'
    | 'license'
    | 'reading_activities'
    | 'student_grades'
    | 'subject_details';

/** Stage 2 분류 코드 매핑이 필요한 7개 필드 */
export type Stage2FieldKey =
    | 'autonomous_activities'
    | 'club_activities'
    | 'career_activities'
    | 'volunteer_activities'
    | 'awards'
    | 'license'
    | 'reading_activities';

/** Stage 2 적용 없이 Stage 1 결과를 그대로 사용하는 필드 */
export type Stage1OnlyFieldKey = Exclude<Stage1FieldKey, Stage2FieldKey>;

export const STAGE_1_PROMPTS: Record<Stage1FieldKey, string> = {
    autonomous_activities: AUTONOMOUS_ACTIVITIES_PROMPT,
    club_activities: CLUB_ACTIVITIES_PROMPT,
    career_activities: CAREER_ACTIVITIES_PROMPT,
    volunteer_activities: VOLUNTEER_ACTIVITIES_PROMPT,
    attendance: ATTENDANCE_PROMPT,
    awards: AWARDS_PROMPT,
    behavior_comments: BEHAVIOR_COMMENTS_PROMPT,
    license: LICENSE_PROMPT,
    reading_activities: READING_ACTIVITIES_PROMPT,
    student_grades: STUDENT_GRADES_PROMPT,
    subject_details: SUBJECT_DETAILS_PROMPT,
};

export const STAGE_2_PROMPTS: Record<Stage2FieldKey, string> = {
    autonomous_activities: AUTONOMOUS_ACTIVITIES_CODE_PROMPT,
    club_activities: CLUB_ACTIVITIES_CODE_PROMPT,
    career_activities: CAREER_ACTIVITIES_CODE_PROMPT,
    volunteer_activities: VOLUNTEER_ACTIVITIES_CODE_PROMPT,
    awards: AWARDS_CODE_PROMPT,
    license: LICENSE_CODE_PROMPT,
    reading_activities: READING_ACTIVITIES_CODE_PROMPT,
};
