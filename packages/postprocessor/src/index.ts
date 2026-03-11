export { expandAwards, extractAwardBaseName, extractSubjectsFromAwardName, type RawAward } from './awards-postprocessor.js';
export { sanitizeStudentGrades } from './grade-postprocessor.js';
export { postprocessBehaviorComments } from './behavior-comments-postprocessor.js';
export { postprocessSubjectDetails, normalizeSubjectName } from './subject-details-postprocessor.js';
export { postprocessCareerActivities, mergeCareerActivityJobCode } from './career-activities-postprocessor.js';
export { postprocessReadingActivities, normalizeReadingArea } from './reading-activities-postprocessor.js';
export { filterActivitiesForStage2, restoreEmptyActivities, postprocessActivityCodes } from './activities-postprocessor.js';
export { fillAllDefaults, fillDefaultActivities, fillDefaultVolunteerActivities, fillDefaultAwards, fillDefaultLicense, fillDefaultReadingActivities, fillDefaultBehaviorComments, fillDefaultSubjectDetails } from './fill-defaults-postprocessor.js';
export { convertToEnglishKeys } from './key-converter.js';
