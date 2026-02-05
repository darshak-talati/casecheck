import { Case } from "@/lib/types";

export interface FormPresence {
    hasScheduleA: boolean;
    hasFamilyInfo: boolean;
}

/**
 * Determine if required forms are present for a given member.
 * Checks both extraction records and document linkage metadata.
 */
export function getMemberFormPresence(caseData: Case, memberId: string): FormPresence {
    // 1. Check extraction records (Case.extracted.*)
    const extractedScheduleA = !!caseData.extracted.scheduleAByMember?.[memberId];
    const extractedFamilyInfo = !!caseData.extracted.familyInfoByMember?.[memberId];

    // 2. Check document linkage (Document.personId and formType)
    const linkedScheduleA = caseData.documents.some(d =>
        d.personId === memberId && d.formType === "IMM5669"
    );
    const linkedFamilyInfo = caseData.documents.some(d =>
        d.personId === memberId && d.formType === "IMM5406"
    );

    return {
        hasScheduleA: extractedScheduleA || linkedScheduleA,
        hasFamilyInfo: extractedFamilyInfo || linkedFamilyInfo
    };
}
