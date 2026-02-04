import { Member, FamilyInfoExtract, ScheduleAExtract } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { calculateAge } from "@/lib/rules/builtins";

/**
 * Build members from Family Info (IMM 5406)
 * This is the primary source of truth for family roster
 */
export function buildMembersFromFamilyInfo(extract: FamilyInfoExtract): Member[] {
    const members: Member[] = [];

    // Applicant (PA)
    if (extract.applicant?.name) {
        const age = calculateAge(extract.applicant.dob || undefined);
        members.push({
            id: uuidv4(),
            fullName: extract.applicant.name,
            relationship: "PA",
            dob: extract.applicant.dob || undefined,
            dobPrecision: determineDobPrecision(extract.applicant.dob),
            age: age || undefined,
            aliases: []
        });
    }

    // Spouse
    if (extract.spouse?.name) {
        const age = calculateAge(extract.spouse.dob || undefined);
        members.push({
            id: uuidv4(),
            fullName: extract.spouse.name,
            relationship: "SPOUSE",
            dob: extract.spouse.dob || undefined,
            dobPrecision: determineDobPrecision(extract.spouse.dob),
            age: age || undefined,
            aliases: []
        });
    }

    // Children
    for (const child of extract.children) {
        if (!child.name) continue;
        const age = calculateAge(child.dob || undefined);
        members.push({
            id: uuidv4(),
            fullName: child.name,
            relationship: "CHILD",
            dob: child.dob || undefined,
            dobPrecision: determineDobPrecision(child.dob),
            age: age || undefined,
            aliases: []
        });
    }

    // Parents (optional, for completeness)
    for (const parent of extract.parents) {
        if (!parent.name) continue;
        const age = calculateAge(parent.dob || undefined);
        members.push({
            id: uuidv4(),
            fullName: parent.name,
            relationship: "PARENT",
            dob: parent.dob || undefined,
            dobPrecision: determineDobPrecision(parent.dob),
            age: age || undefined,
            aliases: []
        });
    }

    // Siblings (optional)
    for (const sibling of extract.siblings) {
        if (!sibling.name) continue;
        const age = calculateAge(sibling.dob || undefined);
        members.push({
            id: uuidv4(),
            fullName: sibling.name,
            relationship: "SIBLING",
            dob: sibling.dob || undefined,
            dobPrecision: determineDobPrecision(sibling.dob),
            age: age || undefined,
            aliases: []
        });
    }

    return members;
}

/**
 * Determine DOB precision
 */
function determineDobPrecision(dob?: string | null): "DAY" | "MONTH" | "UNKNOWN" {
    if (!dob) return "UNKNOWN";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) return "DAY";
    if (/^\d{4}-\d{2}$/.test(dob)) return "MONTH";
    return "UNKNOWN";
}

/**
 * Assign PA based on Schedule A applicantType
 * If a Schedule A declares "PRINCIPAL_APPLICANT", that member becomes PA
 */
export function assignPAFromScheduleA(
    members: Member[],
    scheduleAByMember: Record<string, ScheduleAExtract>
): void {
    // Find member with PRINCIPAL_APPLICANT declaration
    for (const [memberId, extract] of Object.entries(scheduleAByMember)) {
        if (extract.applicantType === "PRINCIPAL_APPLICANT") {
            const member = members.find(m => m.id === memberId);
            if (member) {
                // Set this member as PA
                member.relationship = "PA";

                // Demote any other PA to OTHER (or keep as spouse/child if already set)
                for (const other of members) {
                    if (other.id !== member.id && other.relationship === "PA") {
                        // Try to infer correct relationship
                        // If there's a spouse in family info, keep as SPOUSE
                        // Otherwise set to OTHER
                        if (other.relationship === "PA") {
                            other.relationship = "OTHER";
                        }
                    }
                }
                break;
            }
        }
    }
}

/**
 * Find member by name (fuzzy match)
 */
export function findMemberByName(members: Member[], name: string): Member | undefined {
    const normalized = name.trim().toLowerCase();
    return members.find(m =>
        m.fullName.trim().toLowerCase() === normalized ||
        m.aliases.some(a => a.trim().toLowerCase() === normalized)
    );
}

/**
 * Match Schedule A to member by name and DOB
 */
export function matchScheduleAToMember(
    members: Member[],
    extract: ScheduleAExtract
): Member | undefined {
    const name = extract.identity?.name;
    const dob = extract.identity?.dob;

    if (!name) return undefined;

    // First try exact name + DOB match
    if (dob) {
        const match = members.find(m =>
            m.fullName.trim().toLowerCase() === name.trim().toLowerCase() &&
            m.dob === dob
        );
        if (match) return match;
    }

    // Fallback to name only
    return findMemberByName(members, name);
}
