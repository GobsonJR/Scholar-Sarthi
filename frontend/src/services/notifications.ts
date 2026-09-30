import { api } from "./api";
import type { AuditLogEntry, Notification } from "../types";

export async function listNotifications(): Promise<Notification[]> {
  const { data } = await api.get<Notification[]>("/notifications");
  return data;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const { data } = await api.post<Notification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/read-all");
}

export async function listAuditLogs(applicationId?: string): Promise<AuditLogEntry[]> {
  const { data } = await api.get<AuditLogEntry[]>("/audit-logs", { params: { application_id: applicationId } });
  return data;
}
