import { mapToCanonicalFormType } from "@/lib/forms/mapping";
import { Case, Rule, Finding } from "@/lib/types";
import { runRules } from "@/lib/rules/engine";

/**
 * Test Fixture 1: Canonical Mapping
 * Verifies that "IMM 5406" and variants map to "FAMILY_INFO"
 */
export function testCanonicalMapping() {
    const inputs = ["IMM 5406", "IMM5406", "IMM_5406", "Family Info"];
    const results = inputs.map(i => mapToCanonicalFormType(i));

    console.log("Test Fixture 1: Canonical Mapping");
    inputs.forEach((input, i) => {
        console.log(`- Input: "${input}" => Canonical: "${results[i]}"`);
    });

    const allPass = results.every(r => r === "FAMILY_INFO");
    console.log(`Result: ${allPass ? "PASS" : "FAIL"}`);
}

/**
 * Test Fixture 2: Evidence Date Anchors
 * Verifies that a matching date "May 2023 – Present" produces a PASS finding
 */
export function testDateAnchorPass() {
    const mockCase: Partial<Case> = {
        id: "test-case",
        documents: [],
        members: [
            { id: "m1", fullName: "Test User", relationship: "PA", aliases: [], dob: "1990-01-01", age: 34, dobPrecision: "DAY" }
        ],
        extracted: {
            scheduleAByMember: {
                "m1": {
                    identity: { name: "Test User", dob: "1990-01-01", passportNo: null },
                    applicantType: "PRINCIPAL_APPLICANT",
                    personalHistory: {
                        rows: [
                            { from: "2023-05", to: "PRESENT", activityType: "Employment", city: "London", country: "UK", employerOrCompany: "Enterprise" }
                        ]
                    },
                    education: { rows: [], yearsBoxes: null },
                    addresses: { rows: [] }
                }
            },
            familyInfoByMember: {},
            educationClaimsByMember: {},
            supportingByMember: {
                "m1": [
                    {
                        docType: "Employment Letter",
                        personName: "Test User",
                        dates: ["2023-05-01", "PRESENT", "May 2023 – Present"],
                        issuer: "Enterprise",
                        identifiers: [],
                        summary: "Verified employment"
                    }
                ]
            }
        },
        findings: []
    };

    const mockRule: Rule = {
        id: "date_match_history",
        name: "Date Match",
        type: "date_match_check",
        active: true,
        severity: "ERROR",
        config: { section: "personal_history" },
        description: "Matches dates",
        messageTemplate: "Mismatch"
    };

    const findings = runRules(mockCase as Case, [mockRule]);
    const passFinding = findings.find(f => f.status === "PASS" && f.verifiedLabel?.includes("Personal history"));

    console.log("Test Fixture 2: Date Anchor PASS");
    if (passFinding) {
        console.log("- PASS finding produced successfully");
        console.log(`- Snippet: "${passFinding.details?.anchorFound}"`);
        console.log(`- Message: \n${passFinding.clientMessage}`);
        console.log("Result: PASS");
    } else {
        console.log("- FAILED to produce PASS finding");
        console.log("Result: FAIL");
    }
}
