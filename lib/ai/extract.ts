import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import {
    ScheduleAExtractSchema,
    FamilyInfoExtractSchema,
    SupportingExtractSchema
} from "@/lib/types";

const getOpenAI = () => new OpenAI();

export async function extractScheduleA(text: string) {
    const openai = getOpenAI();
    const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `Extract strict data from Canada IMM 5669 (Schedule A).
        Focus on:
        1. Personal Details (Section 1-6)
        2. **CRITICAL**: "Indicate whether you are" section - Extract which checkbox is marked:
           - If "The principal applicant" is checked → applicantType = "PRINCIPAL_APPLICANT"
           - If "The spouse, common-law partner or dependent child 18 years of age or older of the principal applicant" is checked → applicantType = "SPOUSE_DEPENDENT_18PLUS"
           - If unclear or neither → applicantType = "UNKNOWN"
        3. Education (Section 7): Extract rows. ALSO extract the "Number of years of school" boxes at the top of the section (Elementary, Secondary, University/College, Trade/Other).
        4. Personal History (Section 8): Extract all rows.
        5. Addresses (Section 12): Extract all rows.
        
        For dates, use YYYY-MM format. If "Present" or "Current", use "PRESENT".
        `
            },
            { role: "user", content: text }
        ],
        response_format: zodResponseFormat(ScheduleAExtractSchema, "schedule_a"),
    });
    return completion.choices[0].message.parsed;
}

export async function extractFamilyInfo(text: string) {
    const openai = getOpenAI();
    const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `Extract data from Canada IMM 5406 (Additional Family Information).
        
        Sections:
        A: Applicant, Spouse, Parents
        B: Children
        C: Siblings
        
        For each person, extract Name, DOB, Country of Birth, Address.
        Inferred Relationship should be explicitly mapped.
        `
            },
            { role: "user", content: text }
        ],
        response_format: zodResponseFormat(FamilyInfoExtractSchema, "family_info"),
    });
    return completion.choices[0].message.parsed;
}

export async function extractSupportingDoc(text: string, docType: string) {
    // We wrap the result in a wrapper object because the Tool requires a schema
    const Wrapper = z.object({
        extracts: z.array(SupportingExtractSchema)
    });

    const openai = getOpenAI();

    try {
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Extract key evidence from this supporting document of type: ${docType}.
            
            If it's an Employment Letter, look for: Start/End dates, Role, Employer Name, Full-time/Part-time status, Hours per week.
            If it's an Education doc, look for: Institution, Degree Name, Completion Date.
            If it's Identity, look for: Name, DOB, Passport No, Expiry.
            
            Summarize important findings in the 'summary' field.
            `
                },
                { role: "user", content: text }
            ],
            response_format: zodResponseFormat(Wrapper, "supporting"),
        });

        return completion.choices[0].message.parsed?.extracts || [];
    } catch (e) {
        console.error("OpenAI Supporting Extract Error:", e);
        return [];
    }
}
