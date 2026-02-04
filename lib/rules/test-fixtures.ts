import { findGaps, formatMonth, compareMonths, addMonthsToKey } from '../lib/rules/builtins';

/**
 * Test fixtures for month-level gap detection
 */

// Test Case 1: No gap - continuous months (Dec 2022 → Jan 2023)
export function testCase1_NoGap_ContinuousMonths() {
    const intervals = [
        { from: "2022-12-15", to: "2022-12-31" },
        { from: "2023-01-01", to: "2023-01-31" }
    ];

    const windowStart = new Date(2022, 0, 1);
    const windowEnd = new Date(2023, 11, 31);

    const gaps = findGaps(intervals, windowStart, windowEnd);

    console.log("Test 1: Continuous Months (Dec 2022 → Jan 2023)");
    console.log("Expected: NO GAP");
    console.log("Result:", gaps.length === 0 ? "✅ PASS - No gaps found" : "❌ FAIL - Unexpected gaps:", gaps);
    console.log("");

    return gaps.length === 0;
}

// Test Case 2: Gap exists (Feb 2015 → Sep 2015, missing Mar-Aug)
export function testCase2_GapExists() {
    const intervals = [
        { from: "2015-02-01", to: "2015-02-28" },
        { from: "2015-09-01", to: "2015-09-30" }
    ];

    const windowStart = new Date(2015, 0, 1);
    const windowEnd = new Date(2015, 11, 31);

    const gaps = findGaps(intervals, windowStart, windowEnd);

    console.log("Test 2: Gap Exists (Feb 2015 → Sep 2015)");
    console.log("Expected: GAP from 2015-03 to 2015-08");

    if (gaps.length === 1) {
        const gap = gaps[0];
        const startFormatted = formatMonth(gap.start);
        const endFormatted = formatMonth(gap.end);

        console.log(`Result: ✅ PASS - Gap found from ${startFormatted} to ${endFormatted}`);
        console.log(`  Start: ${gap.start} (${startFormatted})`);
        console.log(`  End: ${gap.end} (${endFormatted})`);

        // Verify it's the correct gap
        const isCorrect = gap.start === "2015-03" && gap.end === "2015-08";
        if (!isCorrect) {
            console.log("  ⚠️  WARNING: Gap range doesn't match expected 2015-03 to 2015-08");
        }
    } else {
        console.log(`❌ FAIL - Expected 1 gap, found ${gaps.length}:`, gaps);
    }
    console.log("");

    return gaps.length === 1 && gaps[0].start === "2015-03" && gaps[0].end === "2015-08";
}

// Test Case 3: Overlapping rows - no gap
export function testCase3_OverlappingRows() {
    const intervals = [
        { from: "2020-01-01", to: "2020-06-30" },
        { from: "2020-05-01", to: "2020-12-31" }  // Overlaps with previous
    ];

    const windowStart = new Date(2020, 0, 1);
    const windowEnd = new Date(2020, 11, 31);

    const gaps = findGaps(intervals, windowStart, windowEnd);

    console.log("Test 3: Overlapping Rows (Jan-Jun overlaps with May-Dec)");
    console.log("Expected: NO GAP (overlap is acceptable)");
    console.log("Result:", gaps.length === 0 ? "✅ PASS - No gaps found" : "❌ FAIL - Unexpected gaps:", gaps);
    console.log("");

    return gaps.length === 0;
}

// Test Case 4: PRESENT handling
export function testCase4_PresentHandling() {
    const intervals = [
        { from: "2020-01-01", to: "2022-12-31" },
        { from: "2023-01-01", to: "PRESENT" }
    ];

    const windowStart = new Date(2020, 0, 1);
    const windowEnd = new Date(); // Today

    const gaps = findGaps(intervals, windowStart, windowEnd);

    console.log("Test 4: PRESENT Handling");
    console.log("Expected: NO GAP (continuous to present)");
    console.log("Result:", gaps.length === 0 ? "✅ PASS - No gaps found" : "❌ FAIL - Unexpected gaps:", gaps);
    console.log("");

    return gaps.length === 0;
}

// Test Case 5: Multiple gaps
export function testCase5_MultipleGaps() {
    const intervals = [
        { from: "2020-01", to: "2020-03" },
        { from: "2020-06", to: "2020-08" },
        { from: "2020-11", to: "2020-12" }
    ];

    const windowStart = new Date(2020, 0, 1);
    const windowEnd = new Date(2020, 11, 31);

    const gaps = findGaps(intervals, windowStart, windowEnd);

    console.log("Test 5: Multiple Gaps");
    console.log("Expected: 2 gaps (Apr-May, Sep-Oct)");
    console.log(`Result: Found ${gaps.length} gaps`);

    gaps.forEach((gap, i) => {
        console.log(`  Gap ${i + 1}: ${formatMonth(gap.start)} to ${formatMonth(gap.end)}`);
    });

    const isCorrect = gaps.length === 2 &&
        gaps[0].start === "2020-04" && gaps[0].end === "2020-05" &&
        gaps[1].start === "2020-09" && gaps[1].end === "2020-10";

    console.log(isCorrect ? "✅ PASS" : "❌ FAIL - Gap ranges don't match expected");
    console.log("");

    return isCorrect;
}

// Run all tests
export function runAllTests() {
    console.log("=".repeat(60));
    console.log("MONTH-LEVEL GAP DETECTION TEST SUITE");
    console.log("=".repeat(60));
    console.log("");

    const results = [
        testCase1_NoGap_ContinuousMonths(),
        testCase2_GapExists(),
        testCase3_OverlappingRows(),
        testCase4_PresentHandling(),
        testCase5_MultipleGaps()
    ];

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log("=".repeat(60));
    console.log(`RESULTS: ${passed}/${total} tests passed`);
    console.log("=".repeat(60));

    return passed === total;
}

// Example usage:
// import { runAllTests } from './test-fixtures';
// runAllTests();
