// Mirrors frontend/src/types/index.ts — the mobile client reflects the same
// backend response structures, deliberately kept in sync by hand rather than
// diverging into an incompatible parallel definition (see Phase 8 spec
// section 20). If the backend schema changes, update both files.

export type Role = "applicant" | "officer";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  phone: string | null;
}

export type SchemeStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED";

export interface SchemeRule {
  id: string;
  field: string;
  operator: string;
  value: any;
  label: string;
  required: boolean;
}

export interface SchemeDocumentRequirement {
  id: string;
  document_type: string;
  document_name: string;
  description: string | null;
  required: boolean;
  accepted_file_types: string[];
  max_file_size_mb: number;
  validity_required: boolean;
  authenticity_check_required: boolean;
  expected_fields: string[];
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface Scheme {
  id: string;
  name: string;
  provider: string;
  category: string;
  scheme_type: string;
  education_level: string;
  state: string;
  institution_type: string;
  short_description: string;
  overview: string;
  benefits: string;
  benefit_amount: string;
  benefit_duration: string | null;
  benefit_coverage: string | null;
  application_process: string;

  deadline: string;
  application_start: string | null;
  correction_deadline: string | null;
  result_date: string | null;

  status: SchemeStatus;
  version: number;
  is_demo: boolean;
  faqs: FAQ[];

  rules: SchemeRule[];
  documents: SchemeDocumentRequirement[];

  income_limit: number | null;
  min_marks: number | null;
  min_age: number | null;
  max_age: number | null;
  eligible_categories: string[] | null;
  required_documents: string[];
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_VERIFICATION"
  | "CORRECTION_REQUIRED"
  | "RESUBMITTED"
  | "UNDER_OFFICER_REVIEW"
  | "APPROVED"
  | "REJECTED";

export interface Application {
  id: string;
  display_id: string;
  applicant_id: string;
  scheme_id: string;
  scheme_version: number;
  status: ApplicationStatus;
  personal_info: Record<string, any>;
  academic_info: Record<string, any>;
  financial_info: Record<string, any>;
  category_info: Record<string, any>;
  current_step: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  scheme?: Scheme;
}

export interface DocumentExtraction {
  extracted_fields: Record<string, any>;
  confidence: Record<string, number>;
  raw_text_preview: string;
}

export type AuthenticityRisk = "LOW" | "MEDIUM" | "HIGH";

export interface LayoutLMResult {
  model: string;
  status: "success" | "error" | "unavailable";
  document_type: string | null;
  confidence: number;
  processing_time_ms: number;
  fallback_used: boolean;
}

export interface TranslationResult {
  status: "success" | "skipped" | "partial" | "fallback";
  source_language: string;
  target_language: string;
  translated_text: string | null;
  model: string;
  fallback_used: boolean;
  lines_translated: number;
  total_lines: number;
}

export interface DocumentVerification {
  result: "VERIFIED" | "NEEDS_REVIEW" | "INVALID";
  reasons: string[];
  document_type_match: boolean;
  expected_fields_found: string[];
  expected_fields_missing: string[];
  authenticity_risk: AuthenticityRisk;
  authenticity_notes: string[];
  review_required: boolean;
  expected_document_type?: string | null;
  detected_document_type?: string | null;
  document_type_detection_method?: string | null;
  layoutlm_result?: LayoutLMResult | null;
  translation_result?: TranslationResult | null;
}

export interface AppDocument {
  id: string;
  application_id: string;
  scheme_document_id: string | null;
  doc_type: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  status: string;
  version: number;
  is_current: boolean;
  uploaded_at: string;
  processed_at: string | null;
  extraction: DocumentExtraction | null;
  verification: DocumentVerification | null;
}

export interface DocumentReviewEntry {
  id: string;
  document_id: string;
  action: "VERIFIED" | "INVALID";
  reason: string;
  officer_id: string;
  created_at: string;
}

export interface DocumentHistory {
  versions: AppDocument[];
  reviews: DocumentReviewEntry[];
}

export interface MismatchValue {
  doc_type: string;
  value: any;
}

export interface Mismatch {
  field: string;
  is_mismatch: boolean;
  severity: "low" | "medium" | "high";
  similarity: number | null;
  values: MismatchValue[];
  explanation: string;
}

export interface EligibilityCriterion {
  name: string;
  passed: boolean;
  status: "passed" | "failed" | "needs_review";
  actual: any;
  required: any;
  detail: string;
  missing_documents?: string[];
  explanation?: { what: string; why: string; next_action: string };
}

export interface Eligibility {
  eligible: boolean;
  criteria: EligibilityCriterion[];
  explanation: string;
}

export interface ApplicationDetail extends Application {
  documents: AppDocument[];
  mismatches: Mismatch[];
  eligibility: Eligibility | null;
  applicant_name: string | null;
  applicant_email: string | null;
}

export interface CorrectionRequest {
  id: string;
  application_id: string;
  document_id: string | null;
  issue: string;
  comment: string;
  deadline: string | null;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  resolved_at: string | null;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  application_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface EligibilityPreviewCriterion {
  name: string;
  field?: string;
  passed: boolean;
  status: string;
  actual: any;
  required: any;
}

export interface EligibilityPreview {
  criteria: EligibilityPreviewCriterion[];
  likely_eligible: boolean | null;
  note: string;
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_VERIFICATION: "Under Verification",
  CORRECTION_REQUIRED: "Correction Required",
  RESUBMITTED: "Resubmitted",
  UNDER_OFFICER_REVIEW: "Under Officer Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export type Tone = "neutral" | "info" | "warning" | "success" | "danger";

export const STATUS_TONE: Record<ApplicationStatus, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  UNDER_VERIFICATION: "info",
  CORRECTION_REQUIRED: "warning",
  RESUBMITTED: "info",
  UNDER_OFFICER_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "danger",
};
