import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, FileText, ChevronDown, ChevronUp, Eye, Trash2, RefreshCw, History, ShieldAlert } from "lucide-react";
import type { AppDocument, AuthenticityRisk } from "../../types";
import { titleCase, formatFileSize } from "../../utils/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fetchDocumentBlobUrl } from "../../services/documents";

const resultMeta: Record<string, { tone: "success" | "warning" | "danger"; icon: typeof CheckCircle2; label: string }> = {
  VERIFIED: { tone: "success", icon: CheckCircle2, label: "Verified" },
  NEEDS_REVIEW: { tone: "warning", icon: AlertTriangle, label: "Needs Review" },
  INVALID: { tone: "danger", icon: XCircle, label: "Verification Failed" },
};

const recommendedAction: Record<string, string> = {
  VERIFIED: "No action needed.",
  NEEDS_REVIEW: "Review this document. If anything looks incorrect, re-upload a clearer copy.",
  INVALID: "Re-upload a clearer copy of this document.",
};

const riskMeta: Record<AuthenticityRisk, { tone: "success" | "warning" | "danger"; label: string }> = {
  LOW: { tone: "success", label: "Low Risk" },
  MEDIUM: { tone: "warning", label: "Medium Risk" },
  HIGH: { tone: "danger", label: "High Risk" },
};

// FLORES-200-style codes -> display names. tam_Taml and hin_Deva are the
// languages this project has actually run through real IndicTrans2
// inference; the rest are script-detectable but untested (see
// indictrans_service.py's module docstring).
const LANGUAGE_LABELS: Record<string, string> = {
  tam_Taml: "Tamil", hin_Deva: "Hindi", tel_Telu: "Telugu", kan_Knda: "Kannada",
  mal_Mlym: "Malayalam", ben_Beng: "Bengali", guj_Gujr: "Gujarati", pan_Guru: "Punjabi", ory_Orya: "Odia",
};

type CheckState = "done" | "warn" | "fail";

function processingSteps(document: AppDocument): { label: string; state: CheckState }[] {
  const v = document.verification;
  if (!v) {
    return [
      { label: "Document received", state: document.status === "PROCESSING" ? "warn" : "done" },
      { label: "Document type detected", state: "warn" },
      { label: "Text extracted", state: "warn" },
      { label: "Required fields found", state: "warn" },
      { label: "Quality checked", state: "warn" },
    ];
  }
  const steps: { label: string; state: CheckState }[] = [
    { label: "Document received", state: "done" },
    { label: "Document type detected", state: v.document_type_match ? "done" : "fail" },
  ];
  if (!v.document_type_match) {
    // Type mismatch short-circuits the rest of the demo pipeline — nothing else was meaningfully checked.
    return steps;
  }
  steps.push({ label: "Text extracted", state: document.status === "INVALID" ? "fail" : "done" });
  steps.push({ label: "Required fields found", state: v.expected_fields_missing.length > 0 ? "warn" : "done" });
  steps.push({ label: "Quality checked", state: document.status === "NEEDS_REVIEW" || document.status === "INVALID" ? "warn" : "done" });
  steps.push({
    label: v.authenticity_risk === "LOW" ? "Authenticity checked" : "Authenticity requires review",
    state: v.authenticity_risk === "LOW" ? "done" : v.authenticity_risk === "HIGH" ? "fail" : "warn",
  });
  return steps;
}

function StepIcon({ state }: { state: CheckState }) {
  if (state === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (state === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
  return <XCircle className="h-3.5 w-3.5 text-danger" />;
}

export function DocumentCard({
  document,
  onDelete,
  onReprocess,
  onReplace,
  onViewHistory,
  isMismatched,
}: {
  document: AppDocument;
  onDelete?: () => void;
  onReprocess?: () => void;
  onReplace?: (file: File) => void;
  onViewHistory?: () => void;
  isMismatched?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const meta = resultMeta[document.status] ?? resultMeta.NEEDS_REVIEW;
  const Icon = meta.icon;
  const docLabel = titleCase(document.doc_type);
  const v = document.verification;

  const handlePreview = async () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
      return;
    }
    const url = await fetchDocumentBlobUrl(document.id);
    setPreviewUrl(url);
    window.open(url, "_blank");
  };

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-100 p-2">
            <FileText className="h-4 w-4 text-text-secondary" />
          </div>
          <div>
            <p className="text-sm font-medium text-text">
              {docLabel}
              {document.version > 1 && <span className="ml-1.5 text-xs font-normal text-text-secondary">v{document.version}</span>}
            </p>
            <p className="text-xs text-text-secondary">
              {document.original_filename} · {formatFileSize(document.file_size)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={meta.tone}>
            <Icon className="h-3 w-3" /> {meta.label}
          </Badge>
          {isMismatched && <Badge tone="warning">Name Mismatch</Badge>}
          {v && v.authenticity_risk !== "LOW" && (
            <Badge tone={riskMeta[v.authenticity_risk].tone}>
              <ShieldAlert className="h-3 w-3" /> {riskMeta[v.authenticity_risk].label}
            </Badge>
          )}
        </div>
      </div>

      {document.extraction && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {processingSteps(document).map((step) => (
            <span key={step.label} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <StepIcon state={step.state} /> {step.label}
            </span>
          ))}
        </div>
      )}

      {v && v.reasons.length > 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
          <span className="font-medium text-text">Reason: </span>
          {v.reasons.join(" ")}
        </p>
      )}

      {v && v.authenticity_notes.length > 0 && (
        <p className="mt-2 rounded-lg bg-warning-light px-3 py-2 text-xs text-warning">
          <span className="font-medium">Additional verification is required</span> because {v.authenticity_notes.join(" ").toLowerCase()}
        </p>
      )}

      <p className="mt-2 text-xs">
        <span className="font-medium text-text-secondary">Recommended action: </span>
        <span className={meta.tone === "success" ? "text-text-secondary" : "text-text"}>{recommendedAction[document.status] ?? recommendedAction.NEEDS_REVIEW}</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {expanded ? "Hide extracted information" : "View extracted information"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={handlePreview} title="Preview file" aria-label={`Preview ${docLabel}`}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {onViewHistory && document.version > 1 && (
            <Button size="sm" variant="ghost" onClick={onViewHistory} title="Version history" aria-label={`View version history for ${docLabel}`}>
              <History className="h-3.5 w-3.5" />
            </Button>
          )}
          {onReprocess && (
            <Button size="sm" variant="ghost" onClick={onReprocess} title="Re-run verification" aria-label={`Re-run verification for ${docLabel}`}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {onReplace && (
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onReplace(file);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center justify-center rounded-lg p-1.5 text-xs font-medium text-text hover:bg-slate-100" title="Replace document">
                Replace
              </span>
            </label>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              title="Remove document"
              aria-label={`Remove ${docLabel}`}
              className="text-danger hover:bg-danger-light"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {expanded && document.extraction && (
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {v && v.layoutlm_result && (
            <div className="px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text">Document Type</span>
                <span className={v.document_type_match ? "text-success" : "text-danger"}>
                  {v.document_type_match ? "Type Match" : "Type Mismatch"}
                </span>
              </div>
              <p className="mt-1 text-text-secondary">
                Expected: <span className="text-text">{titleCase(v.expected_document_type ?? document.doc_type)}</span>
              </p>
              <p className="text-text-secondary">
                Detected: <span className="text-text">{v.detected_document_type ? titleCase(v.detected_document_type) : "—"}</span>
              </p>
              {v.layoutlm_result.status === "success" && !v.layoutlm_result.fallback_used ? (
                <p className="text-text-secondary">
                  Confidence: <span className="text-text">{Math.round(v.layoutlm_result.confidence * 100)}%</span> · Source: LayoutLMv3
                  {v.layoutlm_result.confidence < 0.5 && <span className="ml-1 font-medium text-warning">⚠ Review required</span>}
                </p>
              ) : (
                <p className="text-warning">
                  Source: Deterministic fallback{v.document_type_detection_method ? ` (${v.document_type_detection_method})` : ""} · ⚠ Model unavailable — manual review recommended
                </p>
              )}
            </div>
          )}
          {v && v.translation_result && v.translation_result.source_language !== "eng_Latn" && (
            <div className="px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text">Language</span>
                <span className="text-text">{LANGUAGE_LABELS[v.translation_result.source_language] ?? v.translation_result.source_language}</span>
              </div>
              {v.translation_result.status === "success" || v.translation_result.status === "partial" ? (
                <>
                  <p className="mt-1 text-text-secondary">
                    Translated text: <span className="text-text">{v.translation_result.translated_text}</span>
                  </p>
                  <p className="text-text-secondary">
                    Translation source: <span className="text-text">IndicTrans2</span>
                    {v.translation_result.status === "partial" && <span className="ml-1 font-medium text-warning">⚠ Partially translated</span>}
                  </p>
                </>
              ) : (
                <p className="text-warning">Translation unavailable — original OCR text retained</p>
              )}
            </div>
          )}
          {Object.entries(document.extraction.extracted_fields).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <p className="text-text-secondary">{titleCase(key)}</p>
                <p className="font-medium text-text">{value === null || value === "" ? "—" : String(value)}</p>
              </div>
              <span className="text-xs text-text-secondary">
                Confidence: {Math.round((document.extraction!.confidence[key] ?? 0) * 100)}%
              </span>
            </div>
          ))}
          {v && v.expected_fields_missing.length > 0 && (
            <div className="px-3 py-2 text-xs text-danger">
              Expected but not found: {v.expected_fields_missing.map((f) => titleCase(f)).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
