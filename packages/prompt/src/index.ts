import { SYSTEM_PROMPT } from './system-prompt.ts';
import { AUTONOMOUS_ACTIVITIES_PROMPT } from './autonomous-activities.prompt.ts';
import { CLUB_ACTIVITIES_PROMPT } from './club-activities.prompt.ts';
import { CAREER_ACTIVITIES_PROMPT } from './career-activities.prompt.ts';
import { VOLUNTEER_ACTIVITIES_PROMPT } from './volunteer-activities.prompt.ts';
import { ATTENDANCE_PROMPT } from './attendance.prompt.ts';
import { AWARDS_PROMPT } from './awards.prompt.ts';
import { BEHAVIOR_COMMENTS_PROMPT } from './behavior-comments.prompt.ts';
import { LICENSE_PROMPT } from './license.prompt.ts';
import { READING_ACTIVITIES_PROMPT } from './reading-activities.prompt.ts';
import { STUDENT_GRADES_PROMPT } from './student-grades.prompt.ts';
import { SUBJECT_DETAILS_PROMPT } from './subject-details.prompt.ts';

export {
    SYSTEM_PROMPT,
    AUTONOMOUS_ACTIVITIES_PROMPT,
    CLUB_ACTIVITIES_PROMPT,
    CAREER_ACTIVITIES_PROMPT,
    VOLUNTEER_ACTIVITIES_PROMPT,
    ATTENDANCE_PROMPT,
    AWARDS_PROMPT,
    BEHAVIOR_COMMENTS_PROMPT,
    LICENSE_PROMPT,
    READING_ACTIVITIES_PROMPT,
    STUDENT_GRADES_PROMPT,
    SUBJECT_DETAILS_PROMPT,
};

export type SchoolRecordFieldKey =
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

export const PROMPTS_BY_FIELD: Record<SchoolRecordFieldKey, string> = {
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
