// Month-based date helpers for gap detection
export interface MonthKey {
    year: number;
    month: number; // 1-12
}

/**
 * Parse a date string to month key
 * Accepts: YYYY-MM-DD, YYYY-MM, or "PRESENT"/"CURRENT"
 */
export function parseMonth(str?: string): MonthKey | null {
    if (!str) return null;

    const upper = str.toUpperCase().trim();
    if (upper === "PRESENT" || upper === "CURRENT") {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }

    // Try YYYY-MM-DD or YYYY-MM
    const match = str.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (match) {
        return { year: parseInt(match[1]), month: parseInt(match[2]) };
    }

    return null;
}

/**
 * Convert MonthKey to string YYYY-MM
 */
export function toMonthKey(mk: MonthKey): string {
    return `${mk.year}-${String(mk.month).padStart(2, '0')}`;
}

/**
 * Add months to a month key
 */
export function addMonthsToKey(monthKey: string, n: number): string {
    const mk = parseMonth(monthKey);
    if (!mk) return monthKey;

    let { year, month } = mk;
    month += n;

    while (month > 12) {
        month -= 12;
        year += 1;
    }
    while (month < 1) {
        month += 12;
        year -= 1;
    }

    return toMonthKey({ year, month });
}

/**
 * Compare two month keys
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareMonths(a: string, b: string): number {
    const mkA = parseMonth(a);
    const mkB = parseMonth(b);
    if (!mkA || !mkB) return 0;

    if (mkA.year !== mkB.year) return mkA.year < mkB.year ? -1 : 1;
    if (mkA.month !== mkB.month) return mkA.month < mkB.month ? -1 : 1;
    return 0;
}

/**
 * Format month key for display
 */
export function formatMonth(monthKey: string): string {
    const mk = parseMonth(monthKey);
    if (!mk) return monthKey;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[mk.month - 1]} ${mk.year}`;
}

/**
 * Find gaps in timeline at MONTH granularity
 * A gap exists only if next.from > prev.to + 1 month
 * No gap if periods are continuous or overlapping
 */
export function findGaps(
    intervals: { from?: string; to?: string }[],
    windowStart: Date,
    windowEnd: Date
): { start: string; end: string }[] {
    const gaps: { start: string; end: string }[] = [];

    // Convert to month keys and sort
    const periods = intervals
        .map(int => ({
            from: parseMonth(int.from),
            to: parseMonth(int.to)
        }))
        .filter(p => p.from && p.to)
        .sort((a, b) => {
            const aKey = toMonthKey(a.from!);
            const bKey = toMonthKey(b.from!);
            return compareMonths(aKey, bKey);
        });

    if (periods.length === 0) return gaps;

    const windowStartMonth = toMonthKey({
        year: windowStart.getFullYear(),
        month: windowStart.getMonth() + 1
    });
    const windowEndMonth = toMonthKey({
        year: windowEnd.getFullYear(),
        month: windowEnd.getMonth() + 1
    });

    // Check gap before first period
    const firstFrom = toMonthKey(periods[0].from!);
    if (compareMonths(windowStartMonth, firstFrom) < 0) {
        const gapEnd = addMonthsToKey(firstFrom, -1);
        if (compareMonths(windowStartMonth, gapEnd) <= 0) {
            gaps.push({ start: windowStartMonth, end: gapEnd });
        }
    }

    // Check gaps between consecutive periods
    for (let i = 0; i < periods.length - 1; i++) {
        const currentEnd = toMonthKey(periods[i].to!);
        const nextStart = toMonthKey(periods[i + 1].from!);

        const expectedNext = addMonthsToKey(currentEnd, 1);

        // Gap exists if next starts AFTER the month following current end
        if (compareMonths(nextStart, expectedNext) > 0) {
            gaps.push({
                start: expectedNext,
                end: addMonthsToKey(nextStart, -1)
            });
        }
    }

    // Check gap after last period
    const lastTo = toMonthKey(periods[periods.length - 1].to!);
    if (compareMonths(lastTo, windowEndMonth) < 0) {
        const gapStart = addMonthsToKey(lastTo, 1);
        if (compareMonths(gapStart, windowEndMonth) <= 0) {
            gaps.push({ start: gapStart, end: windowEndMonth });
        }
    }

    return gaps;
}

/**
 * Calculate age from DOB
 */
export function calculateAge(dob?: string): number | null {
    if (!dob) return null;

    const dobDate = parseDate(dob);
    if (!dobDate) return null;

    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
        age--;
    }

    return age >= 0 ? age : null;
}

// Keep parseDate for DOB parsing
export function parseDate(str?: string): Date | null {
    if (!str) return null;
    const trimmed = str.trim();

    const upper = trimmed.toUpperCase();
    if (upper === "PRESENT" || upper === "CURRENT") {
        return new Date();
    }

    // YYYY-MM-DD
    const fullMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fullMatch) {
        return new Date(parseInt(fullMatch[1]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[3]));
    }

    // YYYY-MM (assume day 1)
    const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
        return new Date(parseInt(monthMatch[1]), parseInt(monthMatch[2]) - 1, 1);
    }

    return null;
}

export function getMonthDiff(a: Date, b: Date): number {
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function calculateEducationYears(educationRows: { from?: string | null; to?: string | null }[]): number {
    let totalMonths = 0;

    for (const row of educationRows) {
        const fromDate = parseDate(row.from || undefined);
        const toDate = parseDate(row.to || undefined);
        if (fromDate && toDate) {
            const months = getMonthDiff(fromDate, toDate);
            if (months > 0) totalMonths += months;
        }
    }

    return Math.floor(totalMonths / 12);
}
