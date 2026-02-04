import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { DocumentKind } from "@/lib/types";

// We'll initialize OpenAI lazily
const getOpenAI = () => new OpenAI();

const ClassificationResult = z.object({
    kind: DocumentKind,
    formType: z.string().optional(), // "IMM5669", "IMM5406", etc.
    supportType: z.string().optional(), // "PASSPORT", "BIRTH_CERTIFICATE", "DEGREE", "Reference Letter"
    pageCount: z.number().optional(),
    detectedName: z.string().optional(),
    confidence: z.number(),
});

export async function classifyDocument(text: string, filename: string) {
    const openai = getOpenAI();
    const snippet = text.slice(0, 4000); // First 4k chars usually enough for classification

    const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are an expert immigration document classifier. 
        Analyze the provided document text snippet and filename to classify it.
        
        Forms are usually strict templates:
        - IMM 5669 -> "SCHEDULE_A"
        - IMM 5406 -> "FAMILY_INFO"
        
        Supporting documents are varied:
        - "PASSPORT", "BIRTH_CERTIFICATE", "MARRIAGE_CERTIFICATE", "POLICE_CERTIFICATE", "IELTS", "EDUCATION_DEGREE", "TRANSCRIPT", "EMPLOYMENT_LETTER", "BUSINESS_REGISTRATION", "NATIONAL_ID", etc.
        
        Also try to extract the main person's name if clearly visible in the header/first page.
        `
            },
            {
                role: "user",
                content: `Filename: ${filename}\n\nContent Snippet:\n${snippet}`
            }
        ],
        response_format: zodResponseFormat(ClassificationResult, "classification"),
    });

    return completion.choices[0].message.parsed;
}
