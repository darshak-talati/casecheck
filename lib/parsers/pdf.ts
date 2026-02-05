// lib/parsers/pdf.ts

/**
 * PDF parsing is currently disabled to avoid pdfjs-dist worker bundling issues with Turbopack.
 * For MVP, we skip text extraction from PDFs.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
    console.warn("PDF parsing is currently disabled (pdfjs-dist removed).");
    return "";
}
