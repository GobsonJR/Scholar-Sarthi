import { api } from "./api";
import type { AppDocument, DocumentHistory } from "../types";

export async function uploadDocument(applicationId: string, docType: string, file: File): Promise<AppDocument> {
  const form = new FormData();
  form.append("doc_type", docType);
  form.append("file", file);
  const { data } = await api.post<AppDocument>(`/applications/${applicationId}/documents`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function replaceDocument(documentId: string, file: File): Promise<AppDocument> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<AppDocument>(`/documents/${documentId}/replace`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function reprocessDocument(documentId: string): Promise<AppDocument> {
  const { data } = await api.post<AppDocument>(`/documents/${documentId}/reprocess`);
  return data;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`);
}

export async function getDocumentHistory(documentId: string): Promise<DocumentHistory> {
  const { data } = await api.get<DocumentHistory>(`/documents/${documentId}/history`);
  return data;
}

export async function fetchDocumentBlobUrl(documentId: string): Promise<string> {
  const { data } = await api.get(`/documents/${documentId}/file`, { responseType: "blob" });
  return URL.createObjectURL(data);
}
