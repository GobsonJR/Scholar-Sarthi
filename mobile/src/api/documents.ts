import { api } from "./client";
import type { AppDocument, DocumentHistory } from "../types";

// React Native has no File/Blob-from-disk-path constructor like the browser;
// the standard pattern is appending {uri, name, type} directly to FormData
// and letting the RN networking layer stream the file from its uri.
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

function toFormPart(file: PickedFile) {
  return { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob;
}

export async function uploadDocument(
  applicationId: string,
  docType: string,
  file: PickedFile,
  sourceLanguageHint?: string,
): Promise<AppDocument> {
  const form = new FormData();
  form.append("doc_type", docType);
  form.append("file", toFormPart(file));
  if (sourceLanguageHint) form.append("source_language_hint", sourceLanguageHint);
  const { data } = await api.post<AppDocument>(`/applications/${applicationId}/documents`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function replaceDocument(documentId: string, file: PickedFile, sourceLanguageHint?: string): Promise<AppDocument> {
  const form = new FormData();
  form.append("file", toFormPart(file));
  if (sourceLanguageHint) form.append("source_language_hint", sourceLanguageHint);
  const { data } = await api.post<AppDocument>(`/documents/${documentId}/replace`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`);
}

export async function getDocumentHistory(documentId: string): Promise<DocumentHistory> {
  const { data } = await api.get<DocumentHistory>(`/documents/${documentId}/history`);
  return data;
}
