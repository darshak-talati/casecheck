# Immigration Document QA (CaseCheck)

MVP for an Immigration Agency to verify and QA client documents.

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn UI concepts
- **AI**: OpenAI (GPT-4o) for extraction and reasoning
- **Parsers**: `mammoth` (DOCX), [PDF Text Extraction currently disabled]
- **Database**: Local JSON files in `/data`

## Prerequisites
1. Node.js 18+
2. OpenAI API Key

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create `.env.local` based on the example:
   ```bash
   OPENAI_API_KEY=sk-...
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Open Browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Features (MVP)
- **Case Creation**: Upload multiple documents at once.
- **Auto-Classification**: AI determines if a doc is a Form (Schedule A, Family Info) or Supporting Doc.
- **Smart Extraction**: Extracts structured data (timelines, family members, addresses) from forms and evidence from supporting docs.
- **Rules Engine**: Runs checks like "Missing Forms", "Education Gaps", "Timeline Coverage", "Evidence Matching".
- **Findings Dashboard**: View flagged issues (Errors, Warnings) grouped by member.
- **Rules Editor**: Toggle rules on/off or view configuration.
- **Client Email Draft**: Auto-generates an email template with findings.

## Directory Structure
- `/app`: Next.js App Router pages and API routes
- `/components`: UI components
- `/lib`: Core logic
  - `/ai`: OpenAI wrappers
  - `/parsers`: PDF/DOCX extractors
  - `/rules`: Engine and built-in checks
  - `/storage`: JSON file persistence
- `/data`: Local storage for cases and rules

## Notes
- Files are stored in `/data/uploads`.
- Cases are stored as JSON in `/data/cases`.
- Rules are stored in `/data/rules/rules.json`.
