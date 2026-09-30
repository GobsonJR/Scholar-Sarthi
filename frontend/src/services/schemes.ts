import { api } from "./api";
import type { Scheme, SchemeAdminListItem, SchemeStatistics, OfficerApplicationListItem } from "../types";

export interface SchemeFilters {
  search?: string;
  category?: string;
  education_level?: string;
  state?: string;
  scheme_type?: string;
  institution_type?: string;
  max_income?: number;
  status?: "ACTIVE" | "CLOSED";
}

export async function listSchemes(filters: SchemeFilters = {}): Promise<Scheme[]> {
  const { data } = await api.get<Scheme[]>("/schemes", { params: filters });
  return data;
}

export async function getScheme(id: string): Promise<Scheme> {
  const { data } = await api.get<Scheme>(`/schemes/${id}`);
  return data;
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

export async function previewEligibility(
  schemeId: string,
  payload: { dob?: string; annual_income?: number; marks_percentage?: number; category?: string },
): Promise<EligibilityPreview> {
  const { data } = await api.post<EligibilityPreview>(`/schemes/${schemeId}/check-eligibility`, payload);
  return data;
}

// --- Officer scheme management -----------------------------------------

export interface SchemeRuleInput {
  field: string;
  operator: string;
  value: any;
  label: string;
  required: boolean;
}

export interface SchemeDocumentInput {
  document_type: string;
  document_name: string;
  description?: string | null;
  required: boolean;
  accepted_file_types: string[];
  max_file_size_mb: number;
  validity_required: boolean;
  authenticity_check_required: boolean;
  expected_fields: string[];
}

export interface SchemeWriteInput {
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
  benefit_duration?: string | null;
  benefit_coverage?: string | null;
  application_process: string;
  deadline: string;
  application_start?: string | null;
  correction_deadline?: string | null;
  result_date?: string | null;
  status: string;
  faqs: { question: string; answer: string }[];
  rules: SchemeRuleInput[];
  documents: SchemeDocumentInput[];
}

export interface SchemeBuilderMeta {
  rule_fields: { field: string; label: string }[];
  operators: string[];
  document_types: string[];
  statuses: string[];
}

export async function listAllSchemesForOfficer(): Promise<SchemeAdminListItem[]> {
  const { data } = await api.get<SchemeAdminListItem[]>("/officer/schemes");
  return data;
}

export async function getSchemeBuilderMeta(): Promise<SchemeBuilderMeta> {
  const { data } = await api.get<SchemeBuilderMeta>("/officer/schemes/meta");
  return data;
}

export async function getSchemeForOfficer(id: string): Promise<Scheme> {
  const { data } = await api.get<Scheme>(`/officer/schemes/${id}`);
  return data;
}

export async function createScheme(payload: SchemeWriteInput): Promise<Scheme> {
  const { data } = await api.post<Scheme>("/officer/schemes", payload);
  return data;
}

export async function updateScheme(id: string, payload: SchemeWriteInput): Promise<Scheme> {
  const { data } = await api.put<Scheme>(`/officer/schemes/${id}`, payload);
  return data;
}

export async function deleteScheme(id: string): Promise<void> {
  await api.delete(`/officer/schemes/${id}`);
}

export async function activateScheme(id: string): Promise<Scheme> {
  const { data } = await api.post<Scheme>(`/officer/schemes/${id}/activate`);
  return data;
}

export async function deactivateScheme(id: string): Promise<Scheme> {
  const { data } = await api.post<Scheme>(`/officer/schemes/${id}/deactivate`);
  return data;
}

export async function duplicateScheme(id: string): Promise<Scheme> {
  const { data } = await api.post<Scheme>(`/officer/schemes/${id}/duplicate`);
  return data;
}

export async function getSchemeApplications(id: string): Promise<OfficerApplicationListItem[]> {
  const { data } = await api.get<OfficerApplicationListItem[]>(`/officer/schemes/${id}/applications`);
  return data;
}

export async function getSchemeStatistics(id: string): Promise<SchemeStatistics> {
  const { data } = await api.get<SchemeStatistics>(`/officer/schemes/${id}/statistics`);
  return data;
}
