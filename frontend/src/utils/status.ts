import type { ApplicationStatus } from "../types";

export interface StatusAction {
  label: string;
  to: (id: string) => string;
}

const IN_PROGRESS: ApplicationStatus[] = ["SUBMITTED", "UNDER_VERIFICATION", "UNDER_OFFICER_REVIEW", "RESUBMITTED"];

export function primaryActionForStatus(status: ApplicationStatus): StatusAction {
  if (status === "DRAFT") {
    return { label: "Continue Application", to: (id) => `/app/applications/${id}/wizard` };
  }
  if (status === "CORRECTION_REQUIRED") {
    return { label: "Fix Document", to: (id) => `/app/applications/${id}` };
  }
  if (status === "APPROVED") {
    return { label: "View Application", to: (id) => `/app/applications/${id}` };
  }
  if (status === "REJECTED") {
    return { label: "View Decision", to: (id) => `/app/applications/${id}` };
  }
  if (IN_PROGRESS.includes(status)) {
    return { label: "View Verification", to: (id) => `/app/applications/${id}` };
  }
  return { label: "View Application", to: (id) => `/app/applications/${id}` };
}
