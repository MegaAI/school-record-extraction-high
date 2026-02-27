import { Type } from '@google/genai';

// Stage 2: 자율활동 코드 스키마
export const autonomousActivitiesCodeSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        required: ['활동_구분_코드', '세부_분야_코드'],
        properties: {
            활동_구분_코드: {
                type: Type.STRING,
                enum: ['S001'],
                description: 'S001=자율활동',
            },
            세부_분야_코드: {
                type: Type.STRING,
                enum: ['N001', 'N002', 'N003', 'N044', 'N045', 'N046', 'N047', 'N048', 'N049', 'N050', 'N051', 'N052', 'N053', 'N054', 'N055', 'N056', 'N057', 'N058', 'N059'],
                description: 'N001=적응활동, N002=자치활동, N003=행사활동, N044=국어계열, N045=영어계열, N046=제2외국어계열, N047=수학계열, N048=사회계열, N049=과학계열, N050=기술계열, N051=정보계열, N052=외식조리계열, N053=문예/창작, N054=연극/영화/사진, N055=미술, N056=음악, N057=체육, N058=기타진로활동, N059=기타',
            },
        },
    },
};
