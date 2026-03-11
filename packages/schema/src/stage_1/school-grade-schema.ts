import { Type } from '@google/genai';

// 성적표 스키마
export const schoolGradeSchema = {
    type: Type.OBJECT,
    properties: {
        student_grades: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    MM_TERM_KBN: {
                        type: Type.STRING,
                        description: "학기 - 유효값: 1, 2",
                        nullable: true
                    },
                    MM_MEM_GRD: {
                        type: Type.INTEGER,
                        description: "학년 - 유효값: 1, 2, 3",
                        nullable: true
                    },
                    MM_SUB: {
                        type: Type.STRING,
                        description: "교과명 - 공백 및 중점(·) 없도록 변환, 로마자는 Ⅰ, Ⅱ, Ⅲ 기호로 변환 (숫자 1, 2, 3 가능)",
                        nullable: true
                    },
                    MM_SUB_NM: {
                        type: Type.STRING,
                        description: "과목명 - 공백 및 중점(·) 없도록 변환, 로마자는 Ⅰ, Ⅱ, Ⅲ 기호로 변환 (숫자 1, 2, 3 가능)",
                        nullable: true
                    },
                    MM_UNIT_CNT: {
                        type: Type.INTEGER,
                        description: "이수학점/이수단위 - 유효값: 1~10 자연수",
                        nullable: true
                    },
                    MM_ORG_SCORE: {
                        type: Type.NUMBER,
                        description: "원점수 - 유효값: 0~100, 기본값: 0",
                        nullable: true
                    },
                    MM_AVG_SCORE: {
                        type: Type.NUMBER,
                        description: "평균점수 - 유효값: 0~100, 기본값: 0",
                        nullable: true
                    },
                    MM_DEV_SCORE: {
                        type: Type.NUMBER,
                        description: "표준편차 - 유효값: 0~100, 기본값: 0",
                        nullable: true
                    },
                    MM_RANK_GRD: {
                        type: Type.INTEGER,
                        description: "석차등급 - 유효값: 1~9 자연수",
                        nullable: true
                    },
                    MM_STU_CNT: {
                        type: Type.INTEGER,
                        description: "수강자수 - 유효값: 1~999 자연수",
                        nullable: true
                    },
                    MM_RANK_TXT: {
                        type: Type.STRING,
                        description: "성취도 - 유효값: A, B, C, D, E, P, 우수, 보통, 미흡",
                        nullable: true
                    },
                    MM_LVL_RATE1: {
                        type: Type.NUMBER,
                        description: "성취도A비율 - 유효값: 1~100, A~C합산 99.9~100.1까지 허용",
                        nullable: true
                    },
                    MM_LVL_RATE2: {
                        type: Type.NUMBER,
                        description: "성취도B비율 - 유효값: 1~100",
                        nullable: true
                    },
                    MM_LVL_RATE3: {
                        type: Type.NUMBER,
                        description: "성취도C비율 - 유효값: 1~100",
                        nullable: true
                    },
                    MM_JINRO_FLG: {
                        type: Type.STRING,
                        description: "진로선택 플래그 - 유효값: N(공통/일반선택 과목일 경우), Y(진로 선택 과목일 경우)",
                        nullable: true
                    },
                    MM_LVL_RATE4: {
                        type: Type.NUMBER,
                        description: "성취도D비율 - 2022 개정 교육과정용 (올해 반영 안함), A~E합산 99.9~100.1까지 허용",
                        nullable: true
                    },
                    MM_LVL_RATE5: {
                        type: Type.NUMBER,
                        description: "성취도E비율 - 2022 개정 교육과정용 (올해 반영 안함)",
                        nullable: true
                    }
                },
                required: [
                    "MM_TERM_KBN",
                    "MM_MEM_GRD",
                    "MM_SUB",
                    "MM_SUB_NM",
                    "MM_UNIT_CNT",
                    "MM_ORG_SCORE",
                    "MM_AVG_SCORE",
                    "MM_DEV_SCORE",
                    "MM_RANK_GRD",
                    "MM_STU_CNT",
                    "MM_RANK_TXT",
                    "MM_JINRO_FLG",
                ]
            }
        }
    }
};
