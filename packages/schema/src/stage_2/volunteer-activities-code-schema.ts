import { Type } from '@google/genai';

// Stage 2: 봉사활동 코드 스키마
export const volunteerActivitiesCodeSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        required: ['봉사활동코드'],
        properties: {
            봉사활동코드: {
                type: Type.STRING,
                enum: ['N001', 'N002', 'N003', 'N004', 'N005', 'N006', 'N007', 'N008', 'N009', 'N010', 'N011', 'N012', 'N013', 'N014'],
                description: 'N001=교내(학교주변), N002=공공기관, N003=복지시설, N004=의료시설, N005=교육봉사, N006=이재민돕기, N007=또래상담/멘토, N008=재능봉사, N009=자연환경보호, N010=캠페인활동, N011=지역봉사활동, N012=헌혈, N013=해외봉사, N014=기타',
            },
        },
    },
};
