import { Case, Rule, Finding, Member, ScheduleAExtract, FamilyInfoExtract } from "@/lib/types";
import { parseDate, findGaps, calculateEducationYears, formatMonth, calculateAge } from "./builtins";
import { v4 as uuidv4 } from "uuid";

export function runRules(caseData: Case, rules: Rule[]): Finding[] {
    const findings: Finding[] = [];
    const activeRules = rules.filter(r => r.active);

    for (const rule of activeRules) {
        try {
            switch (rule.type) {
                case "gap_check":
                    findings.push(...checkGaps(caseData, rule));
                    break;
                case "required_doc_check":
                    findings.push(...checkRequiredDocs(caseData, rule));
                    break;
                case "years_box_check":
                    findings.push(...checkYearsBox(caseData, rule));
                    break;
                case "completeness_check":
                    findings.push(...checkCompleteness(caseData, rule));
                    break;
                // ... implement others
            }
        } catch (e) {
            console.error(`Error running rule ${rule.id}`, e);
        }
    }

    // Set default includeInEmail based on severity
    return findings.map(f => ({
        ...f,
        includeInEmail: f.severity === "ERROR" // Errors included by default
    }));
}

function checkGaps(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const targetSection = r.config?.section; // "personal_history" | "education" | "addresses"

    if (!targetSection) return [];

    // Iterate all members who have Schedule A
    const scheduleAs = c.extracted.scheduleAByMember || {};
    for (const [memberId, extract] of Object.entries(scheduleAs)) {
        const member = c.members.find(m => m.id === memberId);
        if (!member) continue;
        if (memberIsMinor(member)) continue; // Gaps checks usually for adults

        let rows: any[] = [];

        // Window: max(DOB + 18, Today - 10 years) to Today
        const today = new Date();
        let windowStart = new Date(today.getFullYear() - 10, today.getMonth(), 1);

        if (member.dob) {
            const dobDate = parseDate(member.dob);
            if (dobDate) {
                const turn18 = new Date(dobDate.getFullYear() + 18, dobDate.getMonth(), 1);
                if (turn18 > windowStart) windowStart = turn18;
            }
        }

        const windowEnd = today;

        // Cast extract to known type for safety in this scope
        const sExtract = extract as ScheduleAExtract;

        if (targetSection === "personal_history") rows = sExtract.personalHistory?.rows || [];
        if (targetSection === "education") rows = sExtract.education?.rows || [];
        if (targetSection === "addresses") rows = sExtract.addresses?.rows || [];

        const gaps = findGaps(rows, windowStart, windowEnd);

        for (const gap of gaps) {
            const startFormatted = formatMonth(gap.start);
            const endFormatted = formatMonth(gap.end);

            out.push({
                id: uuidv4(),
                ruleId: r.id,
                severity: r.severity,
                memberId: member.id,
                memberName: member.fullName,
                section: targetSection,
                summary: `Gap in ${targetSection.replace('_', ' ')}`,
                details: {
                    gap: { start: gap.start, end: gap.end }
                },
                recommendation: `Provide details for the period from ${startFormatted} to ${endFormatted}.`,
                clientMessage: `Missing ${targetSection.replace('_', ' ')} information for ${startFormatted} to ${endFormatted}.`,
                docIds: [],
                includeInEmail: false // Will be set by default logic
            });
        }
    }
    return out;
}

function checkRequiredDocs(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const required = r.config?.requiredForm; // "SCHEDULE_A" | "FAMILY_INFO"

    // For every adult member
    const adults = c.members.filter(m => !memberIsMinor(m));

    for (const m of adults) {
        let present = false;
        // Safe access
        if (required === "SCHEDULE_A") present = !!(c.extracted.scheduleAByMember && c.extracted.scheduleAByMember[m.id]);
        if (required === "FAMILY_INFO") present = !!(c.extracted.familyInfoByMember && c.extracted.familyInfoByMember[m.id]);

        if (!present) {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                severity: r.severity,
                memberId: m.id,
                memberName: m.fullName,
                summary: `Missing form: ${required}`,
                recommendation: `Please upload ${required} for ${m.fullName}`,
                clientMessage: r.messageTemplate.replace("{member}", m.fullName),
                docIds: [],
                includeInEmail: false
            });
        }
    }
    return out;
}

function checkYearsBox(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const tolerance = (r.config?.tolerance as number) || 0.5; // Cast to number

    const scheduleAs = c.extracted.scheduleAByMember || {};
    for (const [memberId, extract] of Object.entries(scheduleAs)) {
        const member = c.members.find(m => m.id === memberId);
        const sExtract = extract as ScheduleAExtract; // Cast
        const boxes = sExtract.education?.yearsBoxes;
        const rows = sExtract.education?.rows || [];

        if (!boxes) continue;

        // 1. Calculate University years
        const uniRows = rows.filter((row: any) => {
            const txt = (row.institution || "") + " " + (row.fieldOfStudy || "");
            return /university|college|bachelor|master|phd|bsc|msc|mba/i.test(txt);
        });
        const calcUni = calculateEducationYears(uniRows);
        const boxUni = boxes.university || 0;

        if (Math.abs(calcUni - boxUni) > tolerance) {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                severity: r.severity,
                memberId,
                memberName: member?.fullName,
                summary: "Education years mismatch (University)",
                details: { computed: calcUni, expected: boxUni },
                recommendation: "Check if years are summed correctly or if dates overlap.",
                clientMessage: r.messageTemplate.replace("{level}", "University").replace("{computed}", calcUni.toString()).replace("{declared}", boxUni.toString()),
                docIds: [],
                includeInEmail: false
            });
        }
    }
    return out;
}

function checkCompleteness(c: Case, r: Rule): Finding[] {
    // Implementation for checking required fields in forms
    // (Skipping deep implementation for brevity in this step, but skeleton exists)
    return [];
}

function memberIsMinor(m: Member): boolean {
    if (m.age !== undefined) return m.age < 18;
    // If no age, assume adult to be safe? or false?
    return false;
}
