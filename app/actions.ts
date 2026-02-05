'use server'

import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Case, Document, CaseSchema, Member, Rule } from "@/lib/types";
import { saveCase, getCase, getRules, saveRules } from "@/lib/storage";
import path from "path";
import fs from "fs/promises";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";
import { classifyDocument } from "@/lib/ai/classify";
import { extractScheduleA, extractFamilyInfo, extractSupportingDoc } from "@/lib/ai/extract";
import { extractEducationClaims } from "@/lib/ai/extract-education";
import { runRules } from "@/lib/rules/engine";
import { buildMembersFromFamilyInfo, assignPAFromScheduleA, matchScheduleAToMember, matchFamilyInfoToMember, findMemberByName } from "@/lib/members/infer";
import { calculateAge } from "@/lib/rules/builtins";
import { normalizeName } from "@/lib/matching/name";
import { mapToCanonicalFormType } from "@/lib/forms/mapping";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export async function createCase(formData: FormData) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const caseId = uuidv4();
    const rawDocs = formData.getAll("files") as File[];

    const documents: Document[] = [];

    for (const file of rawDocs) {
        const docId = uuidv4();
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Save file for processing
        const filePath = path.join(UPLOADS_DIR, `${docId}_${file.name}`);
        await fs.writeFile(filePath, buffer);

        documents.push({
            id: docId,
            filename: file.name,
            mimeType: file.type,
            uploadedAt: new Date().toISOString(),
            kind: "FORM", // placeholder
            rawText: "",
            pages: 0,
            meta: {}
        });
    }

    const newCase: Case = {
        id: caseId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        documents,
        members: [],
        extracted: {
            scheduleAByMember: {},
            familyInfoByMember: {},
            supportingByMember: {},
            educationClaimsByMember: {}
        },
        findings: [],
        selectedFindingIds: []
    };

    await saveCase(newCase);

    redirect(`/cases/${caseId}`);
}

export async function analyzeCase(caseId: string) {
    const caseData = await getCase(caseId);
    if (!caseData) throw new Error("Case not found");

    const rules = await getRules();

    // 1. Process Documents (Classify & Text Extract)
    // We re-process all docs to be safe, or check if rawText is missing
    for (const doc of caseData.documents) {
        if (!doc.rawText) {
            const filePath = path.join(UPLOADS_DIR, `${doc.id}_${doc.filename}`);
            const buffer = await fs.readFile(filePath);

            let text = "";
            try {
                if (doc.filename.toLowerCase().endsWith(".pdf")) {
                    text = await parsePdf(buffer);
                } else if (doc.filename.toLowerCase().endsWith(".docx")) {
                    text = await parseDocx(buffer);
                }
            } catch (e) {
                console.error(`Failed to parse ${doc.filename}`, e);
                text = "";
            }
            doc.rawText = text;

            // Classify
            const classification = await classifyDocument(text, doc.filename);
            if (classification) {
                doc.kind = classification.kind;
                // Canonicalize formType immediately
                doc.formType = mapToCanonicalFormType(classification.formType) || undefined;
                doc.supportType = classification.supportType || undefined;
                doc.meta = { ...doc.meta, detectedName: classification.detectedName, confidence: classification.confidence };
            }
        } else if (doc.formType) {
            // Ensure even existing formTypes are canonicalized
            doc.formType = mapToCanonicalFormType(doc.formType);
        }
    }

    // 2. Clear previous extractions to rebuild
    caseData.extracted = {
        scheduleAByMember: {},
        familyInfoByMember: {},
        supportingByMember: {},
        educationClaimsByMember: {}
    };
    caseData.members = [];

    // 3. FIRST PASS: Extract Family Info (IMM 5406) to build member roster
    const familyInfoDocs = caseData.documents.filter(d => d.formType === "FAMILY_INFO");

    for (const doc of familyInfoDocs) {
        const extract = await extractFamilyInfo(doc.rawText);
        if (!extract) continue;

        // Build members from this family info
        const newMembers = buildMembersFromFamilyInfo(extract);

        // Merge with existing (avoid duplicates by robust name matching)
        for (const newMember of newMembers) {
            const existing = findMemberByName(caseData.members, newMember.fullName);
            if (!existing) {
                caseData.members.push(newMember);
            } else {
                // Update DOB/age if missing
                if (!existing.dob && newMember.dob) {
                    existing.dob = newMember.dob;
                    existing.dobPrecision = newMember.dobPrecision;
                    existing.age = newMember.age;
                }
                // Add alias if name differs slightly but matched
                if (normalizeName(existing.fullName) !== normalizeName(newMember.fullName)) {
                    if (!existing.aliases.includes(newMember.fullName)) {
                        existing.aliases.push(newMember.fullName);
                    }
                }
            }
        }

        // Link document specifically to the "Applicant" in this form
        const member = matchFamilyInfoToMember(caseData.members, extract);
        if (member) {
            caseData.extracted.familyInfoByMember[member.id] = extract;
            doc.personId = member.id;
        } else {
            doc.personId = "unassigned";
        }
    }

    // 4. SECOND PASS: Extract Schedule A and assign to members
    const scheduleADocs = caseData.documents.filter(d => d.formType === "SCHEDULE_A");

    for (const doc of scheduleADocs) {
        const extract = await extractScheduleA(doc.rawText);
        if (!extract) continue;

        // Match to member by name/DOB (fuzzy robust)
        const member = matchScheduleAToMember(caseData.members, extract);

        if (member) {
            caseData.extracted.scheduleAByMember[member.id] = extract;
            doc.personId = member.id;

            // Update member DOB if missing
            if (!member.dob && extract.identity?.dob) {
                member.dob = extract.identity.dob;
                member.dobPrecision = "DAY";
                member.age = calculateAge(extract.identity.dob) || undefined;
            }
        } else {
            doc.personId = "unassigned";
        }
    }

    // 5. Assign PA based on Schedule A applicantType declarations
    assignPAFromScheduleA(caseData.members, caseData.extracted.scheduleAByMember);

    // 6. Extract Supporting Documents
    for (const doc of caseData.documents) {
        if (doc.kind === "SUPPORTING" && doc.supportType) {
            const info = await extractSupportingDoc(doc.rawText, doc.supportType);
            const bestMatchName = info[0]?.personName || doc.meta?.detectedName;

            if (bestMatchName) {
                const member = findMemberByName(caseData.members, bestMatchName);
                if (member) {
                    doc.personId = member.id;
                    if (!caseData.extracted.supportingByMember[member.id]) {
                        caseData.extracted.supportingByMember[member.id] = [];
                    }
                    caseData.extracted.supportingByMember[member.id].push(...info);
                }
            }
        }
    }

    // 6.5. Extract Education Evidence Claims
    for (const doc of caseData.documents) {
        if (doc.kind === "SUPPORTING" && doc.supportType) {
            const isEducationDoc = /education|transcript|degree|wes|certificate|diploma/i.test(doc.supportType);
            if (isEducationDoc && doc.personId) {
                const claims = await extractEducationClaims(doc.rawText, doc.supportType);
                if (claims.length > 0) {
                    if (!caseData.extracted.educationClaimsByMember[doc.personId]) {
                        caseData.extracted.educationClaimsByMember[doc.personId] = [];
                    }
                    // Add document ID to each claim for traceability
                    const claimsWithDoc = claims.map(c => ({ ...c, _docId: doc.id, _filename: doc.filename }));
                    caseData.extracted.educationClaimsByMember[doc.personId].push(...claimsWithDoc);
                }
            }
        }
    }

    // 7. Run Rules
    const findings = runRules(caseData, rules);
    caseData.findings = findings;
    caseData.updatedAt = new Date().toISOString();

    await saveCase(caseData);

    return { success: true };
}

function findMemberIdByName(members: Member[], name: string): string | null {
    // Simple fuzzy match or exact match
    const n = name.toLowerCase().trim();
    for (const m of members) {
        if (m.fullName.toLowerCase().trim() === n) return m.id;
        // Add more robust matching (firstname lastname swap etc) if needed
    }
    return null;
}

export async function updateRule(rule: Rule) {
    const rules = await getRules();
    const index = rules.findIndex(r => r.id === rule.id);
    if (index >= 0) {
        rules[index] = rule;
        await saveRules(rules);
    }
    return { success: true };
}

export async function toggleFindingInEmail(caseId: string, findingId: string, include: boolean) {
    const caseData = await getCase(caseId);
    if (!caseData) throw new Error("Case not found");

    const finding = caseData.findings.find(f => f.id === findingId);
    if (finding) {
        finding.includeInEmail = include;
        await saveCase(caseData);
    }
}

export async function bulkToggleFindings(caseId: string, action: 'includeAll' | 'clearAll') {
    const caseData = await getCase(caseId);
    if (!caseData) throw new Error("Case not found");

    caseData.findings.forEach(f => {
        if (action === 'includeAll' && f.severity === 'ERROR') {
            f.includeInEmail = true;
        } else if (action === 'clearAll') {
            f.includeInEmail = false;
        }
    });

    await saveCase(caseData);
}

