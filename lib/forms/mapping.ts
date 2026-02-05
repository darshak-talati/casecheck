/**
 * Canonical form types used throughout the system.
 */
export type CanonicalFormType = "SCHEDULE_A" | "FAMILY_INFO" | "UNKNOWN";

/**
 * Maps various form type strings (from AI or filenames) into a canonical form type.
 * Handles "IMM 5406", "IMM5406", "SCHEDULE_A", etc.
 */
export function mapToCanonicalFormType(input?: string): CanonicalFormType {
    if (!input) return "UNKNOWN";

    const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

    // IMM 5406 / FAMILY INFO
    if (normalized.includes("5406") || normalized.includes("FAMILYINFO")) {
        return "FAMILY_INFO";
    }

    // IMM 5669 / SCHEDULE A
    if (normalized.includes("5669") || normalized.includes("SCHEDULEA")) {
        return "SCHEDULE_A";
    }

    // Specific check for strings that might have been mapped to something else
    if (input === "IMM5406" || input === "IMM_5406" || input === "IMM 5406") return "FAMILY_INFO";
    if (input === "IMM5669" || input === "IMM_5669" || input === "IMM 5669") return "SCHEDULE_A";

    return "UNKNOWN";
}
