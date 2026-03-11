import { Type } from '@google/genai';

// Stage 2: 독서활동상황 코드 스키마
export const readingActivitiesCodeSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            독서_분야코드: {
                type: Type.STRING,
                enum: ['N001', 'N002', 'N003', 'N004', 'N005', 'N007', 'N008', 'N009', 'N010', 'N011', 'N012', 'N013', 'N014', 'N015', 'N016'],
                description: 'N001=국어, N002=영어, N003=수학, N004=사회, N005=과학, N007=정보, N008=음악, N009=미술, N010=체육, N011=기타, N012=제2외국어, N013=문예/창작, N014=기술계열, N015=외식조리계열, N016=연극/영화/사진',
            },
        },
    },
};
