import { Type } from '@google/genai';

// Stage 2: 동아리활동 코드 스키마
export const clubActivitiesCodeSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        required: ['활동_구분_코드', '세부_분야_코드'],
        properties: {
            활동_구분_코드: {
                type: Type.STRING,
                enum: ['S002'],
                description: 'S002=동아리활동',
            },
            세부_분야_코드: {
                type: Type.STRING,
                enum: ['N004', 'N060', 'N005', 'N006', 'N007', 'N008', 'N061', 'N062', 'N063', 'N011', 'N012', 'N013', 'N014', 'N015', 'N064'],
                description: 'N004=국어계열, N060=영어계열, N005=제2외국어계열, N006=수학계열, N007=사회계열, N008=과학계열, N061=기술계열, N062=정보계열, N063=외식조리계열, N011=문예/창작, N012=연극/영화/사진, N013=미술, N014=음악, N015=체육, N064=기타',
            },
        },
    },
};
