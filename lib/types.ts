import { z } from "zod";

// --- Enums ---
export const DocumentKind = z.enum(["FORM", "SUPPORTING"]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const Relationship = z.enum(["PA", "SPOUSE", "CHILD", "PARENT", "SIBLING", "OTHER"]);
export type Relationship = z.infer<typeof Relationship>;

export const FindingSeverity = z.enum(["ERROR", "WARNING", "INFO"]);
export type FindingSeverity = z.infer<typeof FindingSeverity>;

// --- Sub-Structures for Extraction ---

// 1. Schedule A Extraction
export const EducationRowSchema = z.object({
  from: z.string().nullable(), // YYYY-MM
  to: z.string().nullable(),   // YYYY-MM or "PRESENT"
  fieldOfStudy: z.string().nullable(),
  institution: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});
export type EducationRow = z.infer<typeof EducationRowSchema>;

export const HistoryRowSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  activityType: z.string().nullable(),
  employerOrCompany: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});
export type HistoryRow = z.infer<typeof HistoryRowSchema>;

export const AddressRowSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  fullAddress: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});
export type AddressRow = z.infer<typeof AddressRowSchema>;

export const ScheduleAExtractSchema = z.object({
  identity: z.object({
    name: z.string().nullable(),
    dob: z.string().nullable(), // YYYY-MM-DD
    passportNo: z.string().nullable(),
  }).nullable(),
  applicantType: z.enum(["PRINCIPAL_APPLICANT", "SPOUSE_DEPENDENT_18PLUS", "UNKNOWN"]).default("UNKNOWN"), // From "Indicate whether you are" section
  education: z.object({
    rows: z.array(EducationRowSchema),
    yearsBoxes: z.object({
      elementary: z.number().nullable(),
      secondary: z.number().nullable(),
      university: z.number().nullable(),
      trade: z.number().nullable(),
    }).nullable(),
  }).nullable(),
  personalHistory: z.object({
    rows: z.array(HistoryRowSchema),
  }).nullable(),
  addresses: z.object({
    rows: z.array(AddressRowSchema),
  }).nullable(),
});
export type ScheduleAExtract = z.infer<typeof ScheduleAExtractSchema>;

// 2. Family Info Extraction
export const FamilyMemberRowSchema = z.object({
  name: z.string().nullable(),
  relationship: z.string().nullable(), // Inferred from section context usually
  dob: z.string().nullable(),
  countryOfBirth: z.string().nullable(),
  address: z.string().nullable(),
  maritalStatus: z.string().nullable(),
});
export type FamilyMemberRow = z.infer<typeof FamilyMemberRowSchema>;

export const FamilyInfoExtractSchema = z.object({
  applicant: FamilyMemberRowSchema.nullable(),
  spouse: FamilyMemberRowSchema.nullable(),
  children: z.array(FamilyMemberRowSchema),
  parents: z.array(FamilyMemberRowSchema),
  siblings: z.array(FamilyMemberRowSchema),
});
export type FamilyInfoExtract = z.infer<typeof FamilyInfoExtractSchema>;

// 3. Supporting Doc Extraction
export const SupportingExtractSchema = z.object({
  docType: z.string().nullable(), // e.g., "Passport", "Degree", "Reference Letter"
  personName: z.string().nullable(),
  dates: z.array(z.string()).nullable(), // Extracted relevant dates YYYY-MM-DD or YYYY-MM
  issuer: z.string().nullable(), // University name, Government body, Employer
  identifiers: z.array(z.string()).nullable(), // Passport numbers, etc.
  summary: z.string().nullable(),
});
export type SupportingExtract = z.infer<typeof SupportingExtractSchema>;

// 4. Education Evidence Claim (for detailed education verification)
export const EducationEvidenceClaimSchema = z.object({
  credential: z.string().nullable(), // e.g., "Bachelor of Science", "Master of Arts"
  fieldOfStudy: z.string().nullable(), // e.g., "Computer Science", "Business Administration"
  institution: z.string().nullable(), // e.g., "University of Lagos"
  fromMonth: z.string().nullable(), // YYYY-MM format
  toMonth: z.string().nullable(), // YYYY-MM format or "PRESENT"
  anchorSnippet: z.string().nullable(), // Human-readable date snippet from document
  anchorKind: z.enum(["exact_dates", "year_range", "completion_date", "academic_year"]).default("exact_dates"),
});
export type EducationEvidenceClaim = z.infer<typeof EducationEvidenceClaimSchema>;


// --- Main Data Models ---
export const MemberSchema = z.object({
  id: z.string(),
  relationship: Relationship,
  fullName: z.string(),
  dob: z.string().optional(), // YYYY-MM-DD or YYYY-MM
  dobPrecision: z.enum(["DAY", "MONTH", "UNKNOWN"]).optional(),
  age: z.number().optional(),
  aliases: z.array(z.string()).default([]),
});
export type Member = z.infer<typeof MemberSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  uploadedAt: z.string(), // ISO
  kind: DocumentKind,
  formType: z.string().optional(), // "IMM5669", "IMM5406"
  supportType: z.string().optional(), // "PASSPORT", "DEGREE", etc.
  personId: z.string().optional(), // Assigned member ID
  rawText: z.string().default(""),
  pages: z.number().optional(),
  meta: z.any().optional(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  status: z.enum(["FAIL", "PASS"]).default("FAIL"),
  severity: FindingSeverity,
  memberId: z.string().optional(),
  memberName: z.string().optional(),
  docIds: z.array(z.string()).default([]),
  formType: z.string().optional(),
  section: z.string().optional(),
  summary: z.string(),
  verifiedLabel: z.string().optional(),
  details: z.record(z.any()).optional(),
  recommendation: z.string(),
  clientMessage: z.string(),
  agentNotes: z.string().optional(),
  includeInEmail: z.boolean().default(false), // User-controlled flag for email inclusion
});
export type Finding = z.infer<typeof FindingSchema>;

export const ExtractedCaseDataSchema = z.object({
  scheduleAByMember: z.record(ScheduleAExtractSchema), // memberId -> Extract
  familyInfoByMember: z.record(FamilyInfoExtractSchema),
  supportingByMember: z.record(z.array(SupportingExtractSchema)),
  educationClaimsByMember: z.record(z.array(EducationEvidenceClaimSchema)).default({}),
});
export type ExtractedCaseData = z.infer<typeof ExtractedCaseDataSchema>;

export const CaseSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  documents: z.array(DocumentSchema).default([]),
  members: z.array(MemberSchema).default([]),
  extracted: ExtractedCaseDataSchema.default({
    scheduleAByMember: {},
    familyInfoByMember: {},
    supportingByMember: {},
  }),
  findings: z.array(FindingSchema).default([]),
  selectedFindingIds: z.array(z.string()).default([]),
});
export type Case = z.infer<typeof CaseSchema>;

// --- Rule Definition Schema ---
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  active: z.boolean().default(true),
  severity: FindingSeverity,
  type: z.enum([
    "gap_check",
    "overlap_check",
    "required_doc_check",
    "date_match_check",
    "years_box_check",
    "completeness_check",
    "identity_match_check"
  ]),
  config: z.record(z.any()).default({}), // active, tolerance, etc.
  messageTemplate: z.string(), // "Please provide explaination for gap between {start} and {end}..."
});
export type Rule = z.infer<typeof RuleSchema>;
