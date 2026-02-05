/**
 * Normalize name for comparison: 
 * - remove punctuation
 * - collapse whitespace
 * - reorder tokens alphabetically
 * - uppercase
 */
export function normalizeName(name: string): string {
    if (!name) return "";
    return name.toLowerCase()
        .replace(/[,.]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ')
        .toUpperCase();
}

/**
 * Calculate token overlap score between two names
 */
export function getTokenOverlapScore(name1: string, name2: string): number {
    const n1 = normalizeName(name1);
    const n2 = normalizeName(name2);

    if (!n1 || !n2) return 0;

    const tokens1 = new Set(n1.split(' '));
    const tokens2 = new Set(n2.split(' '));

    const intersectionSize = [...tokens1].filter(t => tokens2.has(t)).length;
    const unionSize = new Set([...tokens1, ...tokens2]).size;

    return intersectionSize / unionSize;
}
