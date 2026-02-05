import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { EducationEvidenceClaimSchema } from "@/lib/types";

const getOpenAI = () => new OpenAI();

/**
 * Extract education evidence claims from education-related supporting documents.
 * This provides detailed credential, institution, and date anchor information
 * for matching against Schedule A education rows.
 */
export async function extractEducationClaims(text: string, docType: string): Promise<any[]> {
    const Wrapper = z.object({
        claims: z.array(EducationEvidenceClaimSchema)
    });

    const openai = getOpenAI();

    try {
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Extract education credential claims from this ${docType} document.
                    
For each credential/degree mentioned:
1. credential: The degree/certificate name (e.g., "Bachelor of Science", "Master of Business Administration", "HND")
2. fieldOfStudy: The major/specialization (e.g., "Computer Science", "Accounting", "Civil Engineering")
3. institution: The full name of the educational institution
4. fromMonth: Start date in YYYY-MM format if available
5. toMonth: End/completion date in YYYY-MM format if available, or "PRESENT" if ongoing
6. anchorSnippet: The exact text snippet showing the dates (e.g., "September 2015 - June 2019", "Academic Year 2018/2019")
7. anchorKind: Classification of date format:
   - "exact_dates": Full month/year ranges (e.g., "Sept 2015 - June 2019")
   - "year_range": Year-only ranges (e.g., "2015-2019")
   - "completion_date": Single completion date (e.g., "Graduated: July 2019")
   - "academic_year": Academic year format (e.g., "2018/2019", "2018-2019")

For dates:
- Convert all dates to YYYY-MM format
- If only year is available, use YYYY-01 for start and YYYY-12 for end
- For academic years like "2018/2019", interpret as 2018-09 to 2019-06
- Preserve the original snippet exactly as it appears in the document

Extract ALL credentials mentioned in the document.
`
                },
                { role: "user", content: text }
            ],
            response_format: zodResponseFormat(Wrapper, "education_claims"),
        });

        return completion.choices[0].message.parsed?.claims || [];
    } catch (e) {
        console.error("OpenAI Education Claims Extract Error:", e);
        return [];
    }
}
