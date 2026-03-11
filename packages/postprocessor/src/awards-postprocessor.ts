export interface RawAward {
    수상명?: string;
    수여기관?: string;
    참가대상_참가인원?: string;
    [key: string]: any;
}

export function extractSubjectsFromAwardName(awardName: string): string[] {
    if (!awardName || typeof awardName !== 'string') return [];
    const match = awardName.match(/\(([^)]+)\)/);
    if (!match) return [];
    return match[1].split(/[,،、]/).map(s => s.trim()).filter(s => s.length > 0);
}

export function extractAwardBaseName(awardName: string): string {
    if (!awardName || typeof awardName !== 'string') return '';
    const match = awardName.match(/^([^(]+)/);
    return match ? match[1].trim() : awardName;
}

export function expandAwards(awards: RawAward[] | undefined | null): RawAward[] {
    if (!Array.isArray(awards)) return [];

    return awards.flatMap(award => {
        if (!award || !award.수상명) return [award];

        const subjects = extractSubjectsFromAwardName(award.수상명);
        const baseName = extractAwardBaseName(award.수상명);

        if (subjects.length > 1) {
            return subjects.map(subject => ({
                ...award,
                수상명: `${baseName}(${subject})`
            }));
        }

        return [award];
    });
}
