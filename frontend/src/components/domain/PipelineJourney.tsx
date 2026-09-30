import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "../../utils/cn";

interface PipelineStep {
  label: string;
  done: boolean;
}

export function PipelineJourney({
  documentsUploaded,
  documentsVerified,
  mismatchChecked,
  eligibilityEvaluated,
}: {
  documentsUploaded: boolean;
  documentsVerified: boolean;
  mismatchChecked: boolean;
  eligibilityEvaluated: boolean;
}) {
  const steps: PipelineStep[] = [
    { label: "Documents uploaded", done: documentsUploaded },
    { label: "Reading documents", done: documentsUploaded },
    { label: "Extracting information", done: documentsVerified },
    { label: "Checking document quality", done: documentsVerified },
    { label: "Cross-document comparison", done: mismatchChecked },
    { label: "Eligibility evaluation", done: eligibilityEvaluated },
    { label: "Result ready", done: eligibilityEvaluated },
  ];

  return (
    <div className="rounded-xl border border-border bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">AI-Assisted Processing Journey</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {steps.map((step) => (
          <span key={step.label} className={cn("flex items-center gap-1.5 text-xs", step.done ? "text-text" : "text-text-secondary/60")}>
            {step.done ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5" />}
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}
