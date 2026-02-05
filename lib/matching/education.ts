import { EducationRow, EducationEvidenceClaim } from "@/lib/types";
import { normalizeName, getTokenOverlapScore } from "@/lib/matching/name";

/**
 * Score a match between a Schedule A education row and an evidence claim.
 * Returns a score from 0.0 to 1.0 based on:
 * - Institution name similarity (40%)
 * - Field of study similarity (30%)
 * - Date overlap (30%)
 */
export function scoreEducationMatch(
    row: EducationRow,
    claim: EducationEvidenceClaim
): number {
    let score = 0;

    // 1. Institution match (40% weight)
    if (row.institution && claim.institution) {
        const instScore = getTokenOverlapScore(row.institution, claim.institution);
        score += instScore * 0.4;
    }

    // 2. Field of study match (30% weight)
    if (row.fieldOfStudy && claim.fieldOfStudy) {
        const fieldScore = getTokenOverlapScore(row.fieldOfStudy, claim.fieldOfStudy);
        score += fieldScore * 0.3;
    } else if (row.fieldOfStudy && claim.credential) {
        // Fallback: check if field appears in credential name
        const fieldNorm = normalizeName(row.fieldOfStudy);
        const credNorm = normalizeName(claim.credential);
        if (credNorm.includes(fieldNorm) || fieldNorm.includes(credNorm)) {
            score += 0.15; // Half credit
        }
    }

    // 3. Date overlap (30% weight)
    if (row.from && row.to && claim.fromMonth && claim.toMonth) {
        const overlapScore = calculateDateOverlap(
            row.from,
            row.to,
            claim.fromMonth,
            claim.toMonth
        );
        score += overlapScore * 0.3;
    }

    return score;
}

/**
 * Calculate date overlap between two date ranges.
 * Returns 1.0 for perfect overlap, 0.0 for no overlap.
 * Allows ±1 month tolerance for start/end dates.
 */
function calculateDateOverlap(
    rowFrom: string,
    rowTo: string,
    claimFrom: string,
    claimTo: string
): number {
    const rowStart = parseMonthKey(rowFrom);
    const rowEnd = parseMonthKey(rowTo === "PRESENT" ? getCurrentMonthKey() : rowTo);
    const claimStart = parseMonthKey(claimFrom);
    const claimEnd = parseMonthKey(claimTo === "PRESENT" ? getCurrentMonthKey() : claimTo);

    if (!rowStart || !rowEnd || !claimStart || !claimEnd) return 0;

    // Check if ranges overlap at all
    if (rowEnd < claimStart || claimEnd < rowStart) return 0;

    // Calculate overlap months
    const overlapStart = Math.max(rowStart, claimStart);
    const overlapEnd = Math.min(rowEnd, claimEnd);
    const overlapMonths = overlapEnd - overlapStart + 1;

    // Calculate total span
    const rowMonths = rowEnd - rowStart + 1;
    const claimMonths = claimEnd - claimStart + 1;
    const totalMonths = Math.max(rowMonths, claimMonths);

    // Apply ±1 month tolerance
    const tolerance = 1;
    const startDiff = Math.abs(rowStart - claimStart);
    const endDiff = Math.abs(rowEnd - claimEnd);

    if (startDiff <= tolerance && endDiff <= tolerance) {
        return 1.0; // Perfect match within tolerance
    }

    // Return overlap ratio
    return overlapMonths / totalMonths;
}

/**
 * Parse YYYY-MM to month number (e.g., "2020-01" -> 24241)
 */
function parseMonthKey(monthKey: string): number | null {
    const match = monthKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    return year * 12 + month;
}

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonthKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Find best matching claim for an education row.
 * Returns the claim and score if score >= threshold, otherwise null.
 */
export function findBestEducationMatch(
    row: EducationRow,
    claims: EducationEvidenceClaim[],
    threshold: number = 0.70
): { claim: EducationEvidenceClaim; score: number } | null {
    let bestMatch: { claim: EducationEvidenceClaim; score: number } | null = null;

    for (const claim of claims) {
        const score = scoreEducationMatch(row, claim);
        if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { claim, score };
        }
    }

    return bestMatch;
}
