import { Member, FamilyInfoExtract, ScheduleAExtract } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { calculateAge } from "@/lib/rules/builtins";

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

    const normalize = (s: string) => {
        return s.toLowerCase()
            .replace(/,/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .sort()
            .join(' ');
    };

    for (const m of members) {
        const mNorm = normalize(m.fullName);
        const match = out.find(existing => {
            // Check DOB match first (strong signal)
            const dobMatch = m.dob && existing.dob && m.dob === existing.dob;

            // Check name similarity
            const exNorm = normalize(existing.fullName);
            const tokens1 = new Set(mNorm.split(' '));
            const tokens2 = new Set(exNorm.split(' '));
            const common = [...tokens1].filter(t => tokens2.has(t));

            // Heuristic: if same DOB and significant name overlap (e.g. 2+ tokens or high Jaccard)
            // or if names match exactly after normalization.
            if (mNorm === exNorm) return true;
            if (dobMatch && common.length >= 2) return true;

            // Substring match for spelling variations (e.g. Ibukun Eyitwunmi vs Ibukun Eyiwunmi)
            if (dobMatch && (mNorm.includes(exNorm) || exNorm.includes(mNorm))) return true;

            return false;
        });

        if (match) {
            // Merge: keep "higher" relationship if different
            const relRank: Record<string, number> = { "PA": 3, "SPOUSE": 2, "CHILD": 1, "OTHER": 0 };
            if (relRank[m.relationship] > relRank[match.relationship]) {
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
    const normalize = (s: string) => {
        return s.toLowerCase()
            .replace(/,/g, ' ') // treat comma as space
            .split(/\s+/)      // split by whitespace
            .filter(Boolean)   // remove empty
            .sort()            // sort tokens to be order-independent
            .join(' ');        // join back
    };

    const target = normalize(name);
    if (!target) return undefined;

    return members.find(m => {
        if (normalize(m.fullName) === target) return true;
        return m.aliases.some(a => normalize(a) === target);
    });
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

    // Try exact DOB + Fuzzy Name match
    if (dob) {
        const match = members.find(m =>
            m.dob === dob && findMemberByName([m], name)
        );
        if (match) return match;
    }

    // Fallback to name only (fuzzy)
    return findMemberByName(members, name);
}
