import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { Eligibility } from "../../types";
import { Badge } from "../ui/Badge";
import { cn } from "../../utils/cn";
import { formatMoney } from "../../utils/format";

function displayValue(criterionName: string, value: unknown): string {
  if (criterionName === "Income" && typeof value === "number") return formatMoney(value);
  return String(value ?? "—");
}

function displayRequired(criterionName: string, required: unknown): string {
  if (criterionName === "Income" && typeof required === "string") {
    return required.replace(/([\d,]+)/, (match) => `₹${match}`);
  }
  return String(required);
}

export function EligibilityPanel({ eligibility }: { eligibility: Eligibility }) {
  return (
    <div>
      <div
        className={cn(
          "mb-4 flex items-center gap-3 rounded-xl border px-4 py-3",
          eligibility.eligible ? "border-green-200 bg-success-light" : "border-red-200 bg-danger-light",
        )}
      >
        {eligibility.eligible ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-danger" />}
        <div>
          <p className={cn("text-sm font-semibold", eligibility.eligible ? "text-success" : "text-danger")}>
            {eligibility.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
          </p>
          <p className="text-xs text-text-secondary">Rule-based eligibility result — determined by the deterministic rule engine, not AI.</p>
        </div>
      </div>

      <div className="space-y-2">
        {eligibility.criteria.map((c) => {
          const icon =
            c.status === "passed" ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : c.status === "needs_review" ? (
              <AlertTriangle className="h-4 w-4 text-warning" />
            ) : (
              <XCircle className="h-4 w-4 text-danger" />
            );
          return (
            <div key={c.name} className="rounded-lg border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {icon}
                  <span className="text-sm font-medium text-text">{c.name}</span>
                </div>
                <Badge tone={c.status === "passed" ? "success" : c.status === "needs_review" ? "warning" : "danger"}>
                  {displayValue(c.name, c.actual)} <span className="opacity-60">/ req. {displayRequired(c.name, c.required)}</span>
                </Badge>
              </div>
              {c.explanation && !c.passed && (
                <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5 text-xs">
                  <p>
                    <span className="font-semibold text-text-secondary">WHY? </span>
                    <span className="text-text-secondary">{c.explanation.why}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-text-secondary">WHAT NEXT? </span>
                    <span className="text-text-secondary">{c.explanation.next_action}</span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">Explanation</p>
        <p className="whitespace-pre-line text-sm text-text">{eligibility.explanation}</p>
      </div>
    </div>
  );
}
