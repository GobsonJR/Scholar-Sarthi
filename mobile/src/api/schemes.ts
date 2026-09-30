import { api } from "./client";
import type { EligibilityPreview, Scheme } from "../types";

export interface SchemeFilters {
  search?: string;
  category?: string;
  education_level?: string;
  state?: string;
  scheme_type?: string;
  institution_type?: string;
  max_income?: number;
}

export async function listSchemes(filters: SchemeFilters = {}): Promise<Scheme[]> {
  const { data } = await api.get<Scheme[]>("/schemes", { params: filters });
  return data;
}

export async function getScheme(id: string): Promise<Scheme> {
  const { data } = await api.get<Scheme>(`/schemes/${id}`);
  return data;
}

export async function previewEligibility(
  schemeId: string,
  payload: { dob?: string; annual_income?: number; marks_percentage?: number; category?: string },
): Promise<EligibilityPreview> {
  const { data } = await api.post<EligibilityPreview>(`/schemes/${schemeId}/check-eligibility`, payload);
  return data;
}
