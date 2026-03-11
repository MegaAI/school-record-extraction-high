import { Type } from '@google/genai';

// Stage 2: 수상경력 코드 스키마
export const awardsCodeSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        required: ['활동_구분_코드', '교내_교외_구분코드', '분야_코드'],
        properties: {
            활동_구분_코드: {
                type: Type.STRING,
                enum: ['1'],
                description: '활동 구분 코드 (항상 1)',
            },
            교내_교외_구분코드: {
                type: Type.STRING,
                enum: ['G001'],
                description: 'G001=교내',
            },
            분야_코드: {
                type: Type.STRING,
                enum: ['G001', 'G002', 'G003', 'G004', 'G005', 'G008', 'G011', 'G012', 'G013', 'G014', 'G015', 'G016', 'G017', 'G010'],
                description: 'G001=국어, G002=외국어(영어), G003=수학, G004=사회, G005=과학, G008=모범상, G011=제2외국어, G012=체육, G013=음악, G014=미술, G015=기술, G016=정보, G017=외식조리, G010=기타',
            },
        },
    },
};
