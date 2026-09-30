import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { STATUS_LABELS, STATUS_TONE } from "../../utils/format";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  info: "bg-primary-light text-primary-dark border-blue-200",
  warning: "bg-warning-light text-warning border-amber-200",
  success: "bg-success-light text-success border-green-200",
  danger: "bg-danger-light text-danger border-red-200",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABELS[status] ?? status}</Badge>;
}
