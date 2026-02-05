import { Case, Rule, Finding, Member, ScheduleAExtract, FamilyInfoExtract } from "@/lib/types";
import { parseDate, findGaps, calculateEducationYears, formatMonth, calculateAge } from "./builtins";
import { v4 as uuidv4 } from "uuid";
import { getMemberFormPresence } from "@/lib/forms/presence";
import { normalizeName } from "@/lib/matching/name";
import { findBestEducationMatch } from "@/lib/matching/education";

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

    // Add unassigned document warnings
    const unassigned = caseData.documents.filter(d => d.personId === "unassigned");
    for (const doc of unassigned) {
        findings.push({
            id: uuidv4(),
            ruleId: "doc_linkage",
            status: "FAIL",
            severity: "WARNING",
            summary: "Unassigned document",
            recommendation: "Link this document to a family member.",
            clientMessage: `${doc.formType || doc.supportType || 'Document'} uploaded but could not be linked to a member.`,
            docIds: [doc.id],
            includeInEmail: false
        });
    }

    return findings;
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
                status: "FAIL",
                severity: r.severity,
                memberId: member.id,
                memberName: member.fullName,
                section: targetSection,
                summary: `Gap in ${targetSection.replace('_', ' ')}`,
                details: { gap: { start: gap.start, end: gap.end } },
                recommendation: `Provide details for the period from ${startFormatted} to ${endFormatted}.`,
                clientMessage: `Missing ${targetSection.replace('_', ' ')} information for ${startFormatted} to ${endFormatted}.`,
                docIds: [],
                includeInEmail: true
            });
        }

        if (gaps.length === 0 && rows.length > 0) {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                status: "PASS",
                severity: "INFO",
                memberId: member.id,
                memberName: member.fullName,
                section: targetSection,
                summary: `No gaps in ${targetSection.replace('_', ' ')}`,
                verifiedLabel: `Verified: ${targetSection.replace('_', ' ').charAt(0).toUpperCase() + targetSection.replace('_', ' ').slice(1)} continuity`,
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

    for (const m of c.members) {
        if (memberIsMinor(m)) {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                status: "PASS",
                severity: "INFO",
                memberId: m.id,
                memberName: m.fullName,
                summary: `Minor - no ${required} required`,
                verifiedLabel: `Verified: Minor exemption (${required})`,
                recommendation: "Member age is under 18.",
                clientMessage: `${m.fullName} is a minor, so ${required} is not required.`,
                docIds: [],
                includeInEmail: false
            });
            continue;
        }

        const presence = getMemberFormPresence(c, m.id);
        let extractionPresent = false;
        if (required === "SCHEDULE_A") extractionPresent = presence.hasScheduleA;
        if (required === "FAMILY_INFO") extractionPresent = presence.hasFamilyInfo;

        // Check if ANY document of this type exists in the case, even if unassigned
        const docExistsInCase = c.documents.find(d => d.formType === required);

        if (!extractionPresent) {
            if (docExistsInCase) {
                // If doc exists but extraction logic hasn't linked it to this person
                out.push({
                    id: uuidv4(),
                    ruleId: r.id,
                    status: "FAIL",
                    severity: "WARNING",
                    memberId: m.id,
                    memberName: m.fullName,
                    summary: `${required} needs assignment`,
                    recommendation: `The ${required} was uploaded but not linked to ${m.fullName}. Please assign it manually.`,
                    clientMessage: `${required} identified in case but not linked to ${m.fullName}.`,
                    docIds: [docExistsInCase.id],
                    includeInEmail: true
                });
            } else {
                // Truly missing
                out.push({
                    id: uuidv4(),
                    ruleId: r.id,
                    status: "FAIL",
                    severity: r.severity,
                    memberId: m.id,
                    memberName: m.fullName,
                    summary: `Missing form: ${required}`,
                    recommendation: `Please upload ${required} for ${m.fullName}`,
                    clientMessage: r.messageTemplate.replace("{member}", m.fullName),
                    docIds: [],
                    includeInEmail: true
                });
            }
        } else {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                status: "PASS",
                severity: "INFO",
                memberId: m.id,
                memberName: m.fullName,
                summary: `${required} present`,
                verifiedLabel: `Verified: ${required} received`,
                recommendation: "Form found and processed.",
                clientMessage: `${required} for ${m.fullName} has been identified.`,
                docIds: docExistsInCase ? [docExistsInCase.id] : [],
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
                status: "FAIL",
                severity: r.severity,
                memberId,
                memberName: member?.fullName,
                summary: "Education years mismatch (University)",
                details: { computed: calcUni, expected: boxUni },
                recommendation: "Check if years are summed correctly or if dates overlap.",
                clientMessage: r.messageTemplate.replace("{level}", "University").replace("{computed}", calcUni.toString()).replace("{declared}", boxUni.toString()),
                docIds: [],
                includeInEmail: true
            });
        } else {
            out.push({
                id: uuidv4(),
                ruleId: r.id,
                status: "PASS",
                severity: "INFO",
                memberId,
                memberName: member?.fullName,
                summary: "University years match",
                verifiedLabel: "Verified: Education years matching",
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
    const out: Finding[] = [];
    const familyInfos = c.extracted.familyInfoByMember || {};

    for (const [memberId, extract] of Object.entries(familyInfos)) {
        const member = c.members.find(m => m.id === memberId);
        if (!member) continue;

        const checkRow = (row: any, label: string) => {
            if (!row || !row.name) return;
            const missing = [];
            if (!row.dob) missing.push("DOB");
            if (!row.address || row.address.toLowerCase().includes("unknown")) missing.push("Address");

            if (missing.length > 0) {
                out.push({
                    id: uuidv4(),
                    ruleId: r.id,
                    status: "FAIL",
                    severity: "WARNING",
                    memberId: member.id,
                    memberName: member.fullName,
                    summary: `Incomplete data for ${label}: ${row.name}`,
                    recommendation: `Provide missing ${missing.join(", ")} for ${row.name} in Family Info.`,
                    clientMessage: `In Family Info, ${label} ${row.name} is missing: ${missing.join(", ")}.`,
                    docIds: [],
                    includeInEmail: true
                });
            } else {
                out.push({
                    id: uuidv4(),
                    ruleId: r.id,
                    status: "PASS",
                    severity: "INFO",
                    memberId: member.id,
                    memberName: member.fullName,
                    summary: `${label} data complete`,
                    verifiedLabel: `Verified: Family member row complete (${label})`,
                    recommendation: "All required fields are present.",
                    clientMessage: `Data for ${label} ${row.name} is complete.`,
                    docIds: [],
                    includeInEmail: false
                });
            }
        };

        checkRow(extract.applicant, "Applicant");
        checkRow(extract.spouse, "Spouse");
        extract.children.forEach(child => checkRow(child, "Child"));
        extract.parents.forEach(p => checkRow(p, "Parent"));
        extract.siblings.forEach(s => checkRow(s, "Sibling"));
    }
    return out;
}

function checkIdentityMatch(c: Case, r: Rule): Finding[] {
    const out: Finding[] = [];
    const coreMembers = c.members.filter(m => ["PA", "SPOUSE", "CHILD"].includes(m.relationship));

    for (const m of coreMembers) {
        const supportExtracts = c.extracted.supportingByMember[m.id] || [];
        const mName = normalizeName(m.fullName);

        for (const ext of supportExtracts) {
            const isIdDoc = ext.docType?.toLowerCase().match(/passport|id|birth|national/);

            if (ext.personName && mName) {
                const sName = normalizeName(ext.personName);
                if (mName !== sName && !mName.includes(sName) && !sName.includes(mName)) {
                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        status: "FAIL",
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
                        status: "PASS",
                        severity: "INFO",
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: "Name match",
                        verifiedLabel: `Verified: Name matches ${ext.docType || 'ID'}`,
                        recommendation: "Consistent name across documents.",
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
                        status: "FAIL",
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
                        status: "PASS",
                        severity: "INFO",
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: "DOB match",
                        verifiedLabel: `Verified: DOB matches ${ext.docType || 'ID'}`,
                        recommendation: "Consistent DOB across documents.",
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
                const isIdDoc = ext.docType?.toLowerCase().match(/passport|id|birth|national/);
                if (isIdDoc) {
                    if (sName && ext.personName) {
                        const sn = normalizeName(sName);
                        const en = normalizeName(ext.personName);
                        if (sn === en || sn.includes(en) || en.includes(sn)) {
                            out.push({
                                id: uuidv4(),
                                ruleId: r.id,
                                status: "PASS",
                                severity: "INFO",
                                memberId: m.id,
                                memberName: m.fullName,
                                summary: "Schedule A Name matches ID",
                                verifiedLabel: `Verified: Schedule A name matches ${ext.docType}`,
                                recommendation: "Verified against " + ext.docType,
                                clientMessage: `Name on Schedule A matches ${ext.docType}.`,
                                docIds: [],
                                includeInEmail: false
                            });
                        } else {
                            out.push({
                                id: uuidv4(),
                                ruleId: r.id,
                                status: "FAIL",
                                severity: "ERROR",
                                memberId: m.id,
                                memberName: m.fullName,
                                summary: "Schedule A Name mismatch with ID",
                                details: { extracted: ext.personName, expected: sName },
                                recommendation: "Correct the name on Schedule A to match your ID.",
                                clientMessage: `Name on your Schedule A form doesn't match your ${ext.docType}.`,
                                docIds: [],
                                includeInEmail: true
                            });
                        }
                    }
                    if (sDob && m.dob) {
                        const matched = ext.dates?.includes(sDob);
                        if (matched) {
                            out.push({
                                id: uuidv4(),
                                ruleId: r.id,
                                status: "PASS",
                                severity: "INFO",
                                memberId: m.id,
                                memberName: m.fullName,
                                summary: "Schedule A DOB matches ID",
                                verifiedLabel: `Verified: Schedule A DOB matches ${ext.docType}`,
                                recommendation: "Verified against " + ext.docType,
                                clientMessage: `DOB on Schedule A matches ${ext.docType}.`,
                                docIds: [],
                                includeInEmail: false
                            });
                        } else {
                            out.push({
                                id: uuidv4(),
                                ruleId: r.id,
                                status: "FAIL",
                                severity: "ERROR",
                                memberId: m.id,
                                memberName: m.fullName,
                                summary: "Schedule A DOB mismatch with ID",
                                details: { extracted: ext.dates, expected: sDob },
                                recommendation: "Correct the DOB on Schedule A to match your ID.",
                                clientMessage: `DOB on your Schedule A form doesn't match your ${ext.docType}.`,
                                docIds: [],
                                includeInEmail: true
                            });
                        }
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
        const memberDocs = c.documents.filter(d => d.personId === m.id);

        let rows: any[] = [];
        if (section === "personal_history") rows = scheduleA.personalHistory?.rows || [];
        if (section === "education") rows = scheduleA.education?.rows || [];

        for (const row of rows) {
            const rowFrom = row.from; // YYYY-MM
            const rowTo = row.to;     // YYYY-MM

            if (section === "education") {
                const claims = c.extracted.educationClaimsByMember[m.id] || [];
                const bestMatch = findBestEducationMatch(row, claims, 0.70);

                if (bestMatch) {
                    const { claim, score } = bestMatch;
                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        status: "PASS",
                        severity: "INFO",
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: `Verified: Education dates supported by evidence`,
                        verifiedLabel: `Verified: Education dates supported by evidence`,
                        details: {
                            scheduleRow: {
                                fieldOfStudy: row.fieldOfStudy,
                                institution: row.institution,
                                fromMonth: row.from,
                                toMonth: row.to
                            },
                            evidence: {
                                docId: (claim as any)._docId,
                                filename: (claim as any)._filename,
                                credential: claim.credential,
                                institution: claim.institution
                            },
                            anchor: {
                                fromMonth: claim.fromMonth,
                                toMonth: claim.toMonth,
                                snippet: claim.anchorSnippet,
                                kind: claim.anchorKind
                            },
                            score: score
                        },
                        recommendation: "Education evidence found and verified.",
                        clientMessage: `Compared: Schedule Range (${row.from} to ${row.to})\nEvidence: ${claim.credential} at ${claim.institution}\nAnchor: '${claim.anchorSnippet}'`,
                        docIds: (claim as any)._docId ? [(claim as any)._docId] : [],
                        includeInEmail: false
                    });
                } else if (claims.length > 0) {
                    // Collect top 2 candidates for warning
                    const candidates = claims
                        .map(cl => ({ claim: cl, score: (cl as any).score || 0 })) // score isn't pre-calculated here, let's recalculate
                        .map(cl => ({ ...cl, score: findBestEducationMatch(row, [cl.claim], 0)?.score || 0 }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 2);

                    out.push({
                        id: uuidv4(),
                        ruleId: r.id,
                        status: "FAIL",
                        severity: "WARNING",
                        memberId: m.id,
                        memberName: m.fullName,
                        summary: "Education evidence mismatch",
                        details: { row, candidates },
                        recommendation: `Upload specific evidence for ${row.fieldOfStudy} at ${row.institution}.`,
                        clientMessage: `Education evidence uploaded but could not be matched to this education row:\n- Row: ${row.fieldOfStudy} @ ${row.institution}\n- Best candidates: ${candidates.map(c => `${c.claim.credential} (${Math.round(c.score * 100)}%)`).join(", ")}`,
                        docIds: candidates.map(c => (c.claim as any)._docId).filter(Boolean),
                        includeInEmail: true
                    });
                }
                continue;
            }

            // Fallback for personal_history or other sections (original logic)
            let rowMatched = false;
            let matchingExtract = null;
            let matchingDocId: string | null = null;
            let anchorSnippet = "";

            for (const ext of supportDocs) {
                const isRelevantType = (section === "personal_history" && ext.docType?.match(/employment|reference|letter|work/i));

                if (!isRelevantType) continue;

                if (ext.dates && ext.dates.length > 0) {
                    for (const d of ext.dates) {
                        const dMonth = d.slice(0, 7); // YYYY-MM
                        if (rowFrom && dMonth === rowFrom) { rowMatched = true; anchorSnippet = d; }
                        if (rowTo && dMonth === rowTo) { rowMatched = true; anchorSnippet = d; }

                        // Year only fallback
                        const dYear = d.slice(0, 4);
                        if (rowFrom && rowFrom.length === 7 && rowFrom.startsWith(dYear)) { rowMatched = true; if (!anchorSnippet) anchorSnippet = d; }
                        if (rowTo && rowTo.length === 7 && rowTo.startsWith(dYear)) { rowMatched = true; if (!anchorSnippet) anchorSnippet = d; }
                    }
                }

                if (rowMatched) {
                    matchingExtract = ext;
                    const doc = memberDocs.find(d => d.supportType === ext.docType || d.filename.includes(ext.docType || ""));
                    matchingDocId = doc?.id || null;
                    break;
                }
            }

            if (rowMatched && matchingExtract) {
                const label = 'Personal history';
                const periodDisplay = `${rowFrom} → ${rowTo}`;
                const docName = matchingExtract.docType || "Supporting document";

                out.push({
                    id: uuidv4(),
                    ruleId: r.id,
                    status: "PASS",
                    severity: "INFO",
                    memberId: m.id,
                    memberName: m.fullName,
                    summary: `Verified: ${label} dates supported by evidence`,
                    verifiedLabel: `Verified: ${label} dates supported by evidence`,
                    details: {
                        matchedPeriod: periodDisplay,
                        evidence: docName,
                        anchorFound: anchorSnippet,
                        rowRef: row.activityType || row.institution || "Row"
                    },
                    recommendation: "Supporting evidence found.",
                    clientMessage: `Matched period: ${periodDisplay}\nEvidence: ${docName}\nAnchor found: '${anchorSnippet}'`,
                    docIds: matchingDocId ? [matchingDocId] : [],
                    includeInEmail: false
                });
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
                                    status: "FAIL",
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
                    status: "PASS",
                    severity: "INFO",
                    memberId: member.id,
                    memberName: member.fullName,
                    summary: "No history overlaps",
                    verifiedLabel: "Verified: No history overlaps",
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
