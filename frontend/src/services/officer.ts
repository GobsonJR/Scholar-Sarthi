import { api } from "./api";
import type { AppDocument, ApplicationDetail, CorrectionRequest, OfficerApplicationListItem, OfficerStatistics } from "../types";

export interface OfficerFilters {
  status?: string;
  scheme_id?: string;
  flagged?: boolean;
  search?: string;
}

export async function listOfficerApplications(filters: OfficerFilters = {}): Promise<OfficerApplicationListItem[]> {
  const { data } = await api.get<OfficerApplicationListItem[]>("/officer/applications", { params: filters });
  return data;
}

export async function getOfficerApplication(id: string): Promise<ApplicationDetail> {
  const { data } = await api.get<ApplicationDetail>(`/officer/applications/${id}`);
  return data;
}

export async function requestCorrection(
  applicationId: string,
  payload: { document_id?: string; issue: string; comment: string; deadline?: string },
): Promise<CorrectionRequest> {
  const { data } = await api.post<CorrectionRequest>(`/officer/applications/${applicationId}/corrections`, payload);
  return data;
}

export async function approveApplication(applicationId: string, reason: string) {
  const { data } = await api.post(`/officer/applications/${applicationId}/approve`, { reason });
  return data;
}

export async function rejectApplication(applicationId: string, reason: string) {
  const { data } = await api.post(`/officer/applications/${applicationId}/reject`, { reason });
  return data;
}

export async function getOfficerStatistics(): Promise<OfficerStatistics> {
  const { data } = await api.get<OfficerStatistics>("/officer/statistics");
  return data;
}

export async function verifyDocument(documentId: string, reason: string): Promise<AppDocument> {
  const { data } = await api.post<AppDocument>(`/officer/documents/${documentId}/verify`, { reason });
  return data;
}

export async function invalidateDocument(documentId: string, reason: string): Promise<AppDocument> {
  const { data } = await api.post<AppDocument>(`/officer/documents/${documentId}/invalidate`, { reason });
  return data;
}

export async function downloadReport(): Promise<void> {
  const { data } = await api.get("/officer/reports/export", { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "applications_report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
