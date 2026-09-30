export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_VERIFICATION: "Under Verification",
  CORRECTION_REQUIRED: "Correction Required",
  RESUBMITTED: "Resubmitted",
  UNDER_OFFICER_REVIEW: "Under Officer Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  UNDER_VERIFICATION: "info",
  CORRECTION_REQUIRED: "warning",
  RESUBMITTED: "info",
  UNDER_OFFICER_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "danger",
};

export const SCHEME_STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  CLOSED: "danger",
};

/** Applicant-facing scheme lifecycle label — distinct from the officer-facing DRAFT/ACTIVE/PAUSED/CLOSED status. */
export function schemeLifecycleLabel(scheme: { status: string; deadline: string }): { label: string; tone: "success" | "warning" | "danger" } {
  if (scheme.status === "CLOSED") return { label: "Closed", tone: "danger" };
  const days = daysUntil(scheme.deadline);
  if (days !== null && days < 0) return { label: "Closed", tone: "danger" };
  if (days !== null && days <= 14) return { label: "Closing Soon", tone: "warning" };
  return { label: "Open", tone: "success" };
}
