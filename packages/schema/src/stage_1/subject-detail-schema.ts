import { Type } from '@google/genai';

// 세부능력 및 특기사항(세특) 스키마
export const subjectDetailsSchema = {
    type: Type.OBJECT,
    properties: {
        subject_details: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    학년: {
                        type: Type.INTEGER,
                        description: '학년 - 유효값: 1, 2, 3',
                    },
                    과목명: {
                        type: Type.STRING,
                        description: '과목명 - 앞뒤 공백 및 중점(·) 제거. 과목명이 명시되지 않은 경우 "기타"로 지정',
                    },
                    세부능력특기사항: {
                        type: Type.STRING,
                        description: '세부능력 및 특기사항 원문. 절대 요약하거나 변형하지 않음. 줄바꿈 포함 원문 그대로 추출',
                    },
                },
                required: ['학년', '과목명', '세부능력특기사항'],
            },
        },
    },
    required: ['subject_details'],
};
