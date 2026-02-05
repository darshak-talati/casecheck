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
                case "identity_match_check":
                    findings.push(...checkIdentityMatch(caseData, rule));
                    break;
                case "date_match_check":
                    findings.push(...checkDateMatch(caseData, rule));
                    break;
                case "overlap_check":
                    findings.push(...checkOverlaps(caseData, rule));
                    break;
            }
        } catch (e) {
            console.error(`Error running rule ${rule.id}`, e);
        }
    }

    return findings.map(f => ({
        ...f,
        includeInEmail: f.severity === "ERROR"
    }));
}

function checkGaps(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const targetSection = r.config?.section;

    if (!targetSection) return [];

    const scheduleAs = c.extracted.scheduleAByMember || {};
    for (const [memberId, extract] of Object.entries(scheduleAs)) {
        const member = c.members.find(m => m.id === memberId);
        if (!member) continue;
        if (memberIsMinor(member)) continue;

        let rows: any[] = [];
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
                details: { gap: { start: gap.start, end: gap.end } },
                recommendation: `Provide details for the period from ${startFormatted} to ${endFormatted}.`,
                clientMessage: `Missing ${targetSection.replace('_', ' ')} information for ${startFormatted} to ${endFormatted}.`,
                docIds: [],
                includeInEmail: false
            });
        }

        if (gaps.length === 0 && rows.length > 0) {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                severity: "INFO",
                memberId: member.id,
                memberName: member.fullName,
                section: targetSection,
                summary: `Verified: No gaps in ${targetSection.replace('_', ' ')}`,
                recommendation: "Information matches requirements.",
                clientMessage: `Your ${targetSection.replace('_', ' ')} is continuous.`,
                docIds: [],
                includeInEmail: false
            });
        }
    }
    return out;
}

function checkRequiredDocs(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const required = r.config?.requiredForm;

    // Explicitly check all members (adults and children)
    for (const m of c.members) {
        const isMinor = memberIsMinor(m);

        if (isMinor) {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                severity: "INFO",
                memberId: m.id,
                memberName: m.fullName,
                summary: `Verified: Minor - no ${required} required`,
                recommendation: "Member age is under 18.",
                clientMessage: `${m.fullName} is a minor (${m.age || 'Age unknown'}), so ${required} is not required.`,
                docIds: [],
                includeInEmail: false
            });
            continue;
        }

        let present = false;
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
        } else {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                severity: "INFO",
                memberId: m.id,
                memberName: m.fullName,
                summary: `Verified: ${required} present`,
                recommendation: "Form found and processed.",
                clientMessage: `${required} for ${m.fullName} has been identified.`,
                docIds: [],
                includeInEmail: false
            });
        }
    }
    return out;
}

function checkYearsBox(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const tolerance = (r.config?.tolerance as number) || 0.5;

    const scheduleAs = c.extracted.scheduleAByMember || {};
    for (const [memberId, extract] of Object.entries(scheduleAs)) {
        const member = c.members.find(m => m.id === memberId);
        const sExtract = extract as ScheduleAExtract;
        const boxes = sExtract.education?.yearsBoxes;
        const rows = sExtract.education?.rows || [];

        if (!boxes) continue;

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
        } else {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                severity: "INFO",
                memberId,
                memberName: member?.fullName,
                summary: "Verified: University years match",
                details: { computed: calcUni, expected: boxUni },
                recommendation: "Calculated years match declared boxes.",
                clientMessage: `Education years check for ${member?.fullName} passed for University.`,
                docIds: [],
                includeInEmail: false
            });
        }
    }
    return out;
}

function checkCompleteness(c: Case, r: Rule): Finding[] {
    return [];
}

function checkIdentityMatch(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const coreMembers = c.members.filter(m => ["PA", "SPOUSE", "CHILD"].includes(m.relationship));

    const normalize = (s: string) => {
        return s.toLowerCase()
            .replace(/,/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .sort()
            .join(' ');
    };

    for (const m of coreMembers) {
        const supportExtracts = c.extracted.supportingByMember[m.id] || [];
        const mName = normalize(m.fullName);

        for (const ext of supportExtracts) {
            const isIdDoc = ext.docType?.toLowerCase().match(/passport|id|birth|national/);

            if (ext.personName && mName) {
                const sName = normalize(ext.personName);
                if (mName !== sName && !mName.includes(sName) && !sName.includes(mName)) {
                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        severity: r.severity,
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: "Name inconsistency",
                        details: { extracted: ext.personName, expected: m.fullName },
                        recommendation: "Verify name spelling in " + (ext.docType || "supporting document"),
                        clientMessage: `Name inconsistency found between your forms and the ${ext.docType || "supporting document"}.`,
                        docIds: [],
                        includeInEmail: true
                    });
                } else {
                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        severity: "INFO",
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: "Verified: Name match",
                        details: { extracted: ext.personName, expected: m.fullName },
                        recommendation: "Name correctly matches in " + (ext.docType || "doc"),
                        clientMessage: `Name on ${ext.docType || "supporting document"} matches your core profile.`,
                        docIds: [],
                        includeInEmail: false
                    });
                }
            }

            if (ext.dates && ext.dates.length > 0 && m.dob) {
                let anyDobMatch = false;
                for (const dateStr of ext.dates) {
                    if (m.dob === dateStr || m.dob.startsWith(dateStr) || dateStr.startsWith(m.dob)) {
                        anyDobMatch = true;
                    }
                }

                if (!anyDobMatch && isIdDoc) {
                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        severity: r.severity,
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: "DOB inconsistency",
                        details: { extracted: ext.dates.join(", "), expected: m.dob },
                        recommendation: "Verify Date of Birth in " + ext.docType,
                        clientMessage: `Date of Birth in your ${ext.docType} doesn't match the information in your forms.`,
                        docIds: [],
                        includeInEmail: true
                    });
                } else if (anyDobMatch) {
                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        severity: "INFO",
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: "Verified: DOB match",
                        recommendation: "DOB matches in " + ext.docType,
                        clientMessage: `DOB in ${ext.docType} matches core profile.`,
                        docIds: [],
                        includeInEmail: false
                    });
                }
            }
        }

        // Schedule A identity vs Docs
        const schedA = c.extracted.scheduleAByMember?.[m.id];
        if (schedA?.identity) {
            const sName = schedA.identity.name;
            const sDob = schedA.identity.dob;

            for (const ext of supportExtracts) {
                if (ext.docType?.toLowerCase().match(/passport|id|birth|national/)) {
                    if (sName && ext.personName) {
                        const sn = normalize(sName);
                        const en = normalize(ext.personName);
                        if (sn === en || sn.includes(en) || en.includes(sn)) {
                            out.push({
                                id: uuidv4(),
                                ruleId: r.id,
                                severity: "INFO",
                                memberId: m.id,
                                memberName: m.fullName,
                                summary: "Verified: Schedule A Name matches ID",
                                recommendation: "Verified against " + ext.docType,
                                clientMessage: `Name on Schedule A matches ${ext.docType}.`,
                                docIds: [],
                                includeInEmail: false
                            });
                        }
                    }
                    if (sDob && ext.dates?.includes(sDob)) {
                        out.push({
                            id: uuidv4(),
                            ruleId: r.id,
                            severity: "INFO",
                            memberId: m.id,
                            memberName: m.fullName,
                            summary: "Verified: Schedule A DOB matches ID",
                            recommendation: "Verified against " + ext.docType,
                            clientMessage: `DOB on Schedule A matches ${ext.docType}.`,
                            docIds: [],
                            includeInEmail: false
                        });
                    }
                }
            }
        }
    }
    return out;
}

function checkDateMatch(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const section = r.config?.section;
    const scheduleAs = c.extracted.scheduleAByMember || {};

    for (const [memberId, scheduleA] of Object.entries(scheduleAs)) {
        const m = c.members.find(mem => mem.id === memberId);
        if (!m) continue;
        const supportDocs = c.extracted.supportingByMember[m.id] || [];

        let rows: any[] = [];
        if (section === "personal_history") rows = scheduleA.personalHistory?.rows || [];
        if (section === "education") rows = scheduleA.education?.rows || [];

        for (const row of rows) {
            const rowFrom = row.from;
            const rowTo = row.to;
            let rowMatched = false;

            for (const ext of supportDocs) {
                const isRelevantType = (section === "personal_history" && ext.docType?.match(/employment|reference|letter|work/i)) ||
                    (section === "education" && ext.docType?.match(/degree|diploma|transcript|certificate/i));

                if (!isRelevantType) continue;

                if (ext.dates && ext.dates.length > 0) {
                    for (const d of ext.dates) {
                        if (rowFrom && (d === rowFrom || d.startsWith(rowFrom))) rowMatched = true;
                        if (rowTo && (d === rowTo || d.startsWith(rowTo))) rowMatched = true;

                        const rowYearFrom = rowFrom?.slice(0, 4);
                        const rowYearTo = rowTo?.slice(0, 4);
                        if (rowYearFrom && d.includes(rowYearFrom)) rowMatched = true;
                        if (rowYearTo && d.includes(rowYearTo)) rowMatched = true;
                    }
                }

                if (rowMatched) {
                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        severity: "INFO",
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: `Verified: ${section === 'education' ? 'Education' : 'Work History'} match`,
                        details: { extracted: ext.dates, expected: [rowFrom, rowTo] },
                        recommendation: `Found evidence in ${ext.docType}`,
                        clientMessage: `Dates in ${ext.docType} confirm the entry for ${row.activityType || row.institution || 'specified period'}.`,
                        docIds: [],
                        includeInEmail: false
                    });
                    break;
                }
            }
        }
    }
    return out;
}

function checkOverlaps(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const scheduleAs = c.extracted.scheduleAByMember || {};

    for (const [memberId, extract] of Object.entries(scheduleAs)) {
        const member = c.members.find(m => m.id === memberId);
        if (!member) continue;

        const history = extract.personalHistory?.rows || [];
        if (history.length > 0) {
            let foundOverlap = false;
            for (let i = 0; i < history.length; i++) {
                for (let j = i + 1; j < history.length; j++) {
                    const a = history[i];
                    const b = history[j];

                    if (a.from && a.to && b.from && b.to) {
                        const startA = a.from;
                        const endA = a.to === "PRESENT" ? toMonthKey({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }) : a.to;
                        const startB = b.from;
                        const endB = b.to === "PRESENT" ? toMonthKey({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }) : b.to;

                        if (compareMonths(startA, endB) <= 0 && compareMonths(startB, endA) <= 0) {
                            if (a.activityType?.toLowerCase().includes("employment") && b.activityType?.toLowerCase().includes("employment")) {
                                foundOverlap = true;
                                out.push({
                                    id: uuidv4(),
                                    ruleId: r.id,
                                    severity: r.severity,
                                    memberId: member.id,
                                    memberName: member.fullName,
                                    summary: "Overlapping employment periods",
                                    details: { mismatch: { row1: a, row2: b } },
                                    recommendation: "Explain how these two roles were held simultaneously.",
                                    clientMessage: `Your personal history shows overlapping full-time activities between ${a.from} and ${a.to}.`,
                                    docIds: [],
                                    includeInEmail: true
                                });
                            }
                        }
                    }
                }
            }
            if (!foundOverlap) {
                out.push({
                    id: uuidv4(),
                    ruleId: r.id,
                    severity: "INFO",
                    memberId: member.id,
                    memberName: member.fullName,
                    summary: "Verified: No history overlaps",
                    recommendation: "Roles are continuous/sequential.",
                    clientMessage: "No significant overlaps found in personal history.",
                    docIds: [],
                    includeInEmail: false
                });
            }
        }
    }
    return out;
}

function memberIsMinor(m: Member): boolean {
    if (m.age !== undefined) return m.age < 18;
    return false;
}

function toMonthKey(mk: { year: number, month: number }): string {
    return `${mk.year}-${String(mk.month).padStart(2, '0')}`;
}

function compareMonths(a: string, b: string): number {
    const p = (s: string) => {
        const m = s.match(/^(\d{4})-(\d{2})/);
        return m ? parseInt(m[1]) * 12 + parseInt(m[2]) : 0;
    };
    const vA = p(a);
    const vB = p(b);
    return vA - vB;
}
