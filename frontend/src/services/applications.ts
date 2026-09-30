import { api } from "./api";
import type { Application, ApplicationDetail, CorrectionRequest } from "../types";

export async function createApplication(schemeId: string): Promise<Application> {
  const { data } = await api.post<Application>("/applications", { scheme_id: schemeId });
  return data;
}

export async function listApplications(): Promise<Application[]> {
  const { data } = await api.get<Application[]>("/applications");
  return data;
}

export async function getApplication(id: string): Promise<ApplicationDetail> {
  const { data } = await api.get<ApplicationDetail>(`/applications/${id}`);
  return data;
}

export async function updateApplication(
  id: string,
  payload: Partial<{
    personal_info: Record<string, any>;
    academic_info: Record<string, any>;
    financial_info: Record<string, any>;
    category_info: Record<string, any>;
    current_step: number;
  }>,
): Promise<Application> {
  const { data } = await api.patch<Application>(`/applications/${id}`, payload);
  return data;
}

export async function submitApplication(id: string): Promise<ApplicationDetail> {
  const { data } = await api.post<ApplicationDetail>(`/applications/${id}/submit`);
  return data;
}

export async function resubmitApplication(id: string): Promise<ApplicationDetail> {
  const { data } = await api.post<ApplicationDetail>(`/applications/${id}/resubmit`);
  return data;
}

export async function listCorrections(applicationId: string): Promise<CorrectionRequest[]> {
  const { data } = await api.get<CorrectionRequest[]>(`/applications/${applicationId}/corrections`);
  return data;
}
