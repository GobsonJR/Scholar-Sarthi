import { Check, AlertTriangle, Circle, X } from "lucide-react";
import { cn } from "../../utils/cn";
import type { ApplicationStatus } from "../../types";

interface Step {
  label: string;
  state: "done" | "current" | "warning" | "upcoming" | "rejected";
}

function buildSteps(status: ApplicationStatus): Step[] {
  const isRejected = status === "REJECTED";
  const needsCorrection = status === "CORRECTION_REQUIRED" || status === "RESUBMITTED";

  const order: ApplicationStatus[] = [
    "DRAFT",
    "SUBMITTED",
    "UNDER_VERIFICATION",
    ...(needsCorrection ? (["CORRECTION_REQUIRED"] as ApplicationStatus[]) : []),
    "UNDER_OFFICER_REVIEW",
    "APPROVED",
  ];
  const labels: Record<string, string> = {
    DRAFT: "Application Started",
    SUBMITTED: "Application Submitted",
    UNDER_VERIFICATION: "AI Document Verification",
    CORRECTION_REQUIRED: "Correction Required",
    UNDER_OFFICER_REVIEW: "Officer Review",
    APPROVED: isRejected ? "Final Decision" : "Approved",
  };

  const effectiveIndex = (() => {
    if (status === "RESUBMITTED") return order.indexOf("UNDER_OFFICER_REVIEW");
    if (status === "REJECTED") return order.indexOf("APPROVED");
    return order.indexOf(status);
  })();

  return order.map((key, idx) => {
    let state: Step["state"] = "upcoming";
    if (key === "CORRECTION_REQUIRED") {
      state = status === "CORRECTION_REQUIRED" ? "warning" : "done";
      return { label: labels[key], state };
    }
    if (key === "APPROVED" && isRejected) {
      return { label: "Rejected", state: "rejected" };
    }
    if (idx < effectiveIndex) state = "done";
    else if (idx === effectiveIndex) state = key === "APPROVED" ? "done" : "current";
    return { label: labels[key], state };
  });
}

export function ApplicationTimeline({ status }: { status: ApplicationStatus }) {
  const steps = buildSteps(status);
  return (
    <ol className="space-y-4">
      {steps.map((step, idx) => (
        <li key={idx} className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
              step.state === "done" && "border-green-200 bg-success-light text-success",
              step.state === "current" && "border-blue-200 bg-primary-light text-primary",
              step.state === "warning" && "border-amber-200 bg-warning-light text-warning",
              step.state === "rejected" && "border-red-200 bg-danger-light text-danger",
              step.state === "upcoming" && "border-border bg-slate-50 text-text-secondary",
            )}
          >
            {step.state === "done" && <Check className="h-3.5 w-3.5" />}
            {step.state === "warning" && <AlertTriangle className="h-3.5 w-3.5" />}
            {step.state === "rejected" && <X className="h-3.5 w-3.5" />}
            {(step.state === "current" || step.state === "upcoming") && <Circle className="h-2 w-2 fill-current" />}
          </span>
          <span
            className={cn(
              "text-sm pt-0.5",
              step.state === "upcoming" ? "text-text-secondary" : "text-text font-medium",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
