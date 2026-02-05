import { Member, FamilyInfoExtract, ScheduleAExtract } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { calculateAge } from "@/lib/rules/builtins";
import { normalizeName, getTokenOverlapScore } from "@/lib/matching/name";

/**
 * Build members from Family Info (IMM 5406)
 * This is the primary source of truth for family roster
 */
export function buildMembersFromFamilyInfo(extract: FamilyInfoExtract): Member[] {
    const rawMembers: Member[] = [];

    // Applicant (PA)
    if (extract.applicant?.name) {
        const age = calculateAge(extract.applicant.dob || undefined);
        rawMembers.push({
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
        rawMembers.push({
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
        rawMembers.push({
            id: uuidv4(),
            fullName: child.name,
            relationship: "CHILD",
            dob: child.dob || undefined,
            dobPrecision: determineDobPrecision(child.dob),
            age: age || undefined,
            aliases: []
        });
    }

    return deduplicateMembers(rawMembers);
}

/**
 * Deduplicate members based on name similarity and DOB
 */
function deduplicateMembers(members: Member[]): Member[] {
    const out: Member[] = [];

    for (const m of members) {
        const mNorm = normalizeName(m.fullName);
        const match = out.find(existing => {
            // Check DOB match first (strong signal)
            const dobMatch = m.dob && existing.dob && m.dob === existing.dob;

            // Check name similarity
            const exNorm = normalizeName(existing.fullName);

            // 1. Exact normalized match
            if (mNorm === exNorm) return true;

            // 2. High fuzzy score overlap (>= 0.8)
            const fuzzyScore = getTokenOverlapScore(m.fullName, existing.fullName);
            if (fuzzyScore >= 0.8) return true;

            // 3. Same DOB + Substring match for spelling variations
            if (dobMatch && (mNorm.includes(exNorm) || exNorm.includes(mNorm))) return true;

            return false;
        });

        if (match) {
            // Merge: keep "higher" relationship if different
            const relRank: Record<string, number> = { "PA": 3, "SPOUSE": 2, "CHILD": 1, "OTHER": 0 };
            const mRank = relRank[m.relationship] ?? 0;
            const matchRank = relRank[match.relationship] ?? 0;
            if (mRank > matchRank) {
                match.relationship = m.relationship;
            }
            // Add name as alias if different
            if (m.fullName !== match.fullName && !match.aliases.includes(m.fullName)) {
                match.aliases.push(m.fullName);
            }
        } else {
            out.push(m);
        }
    }

    return out;
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
    const target = normalizeName(name);
    if (!target) return undefined;

    return members.find(m => {
        if (normalizeName(m.fullName) === target) return true;
        if (getTokenOverlapScore(m.fullName, name) >= 0.8) return true;
        return m.aliases.some(a => normalizeName(a) === target || getTokenOverlapScore(a, name) >= 0.8);
    });
}

/**
 * Match a generic person (from any form) to a member by name and DOB
 */
export function matchPersonToMember(
    members: Member[],
    name?: string | null,
    dob?: string | null
): Member | undefined {
    if (!name) return undefined;

    // 1. Try exact DOB + Fuzzy Name match
    if (dob) {
        const match = members.find(m =>
            m.dob === dob && findMemberByName([m], name)
        );
        if (match) return match;
    }

    // 2. Fallback to name only (fuzzy)
    return findMemberByName(members, name);
}

/**
 * Match Schedule A to member by name and DOB
 */
export function matchScheduleAToMember(
    members: Member[],
    extract: ScheduleAExtract
): Member | undefined {
    return matchPersonToMember(members, extract.identity?.name, extract.identity?.dob);
}

/**
 * Match Family Info to member by applicant name and DOB
 */
export function matchFamilyInfoToMember(
    members: Member[],
    extract: FamilyInfoExtract
): Member | undefined {
    return matchPersonToMember(members, extract.applicant?.name, extract.applicant?.dob);
}
