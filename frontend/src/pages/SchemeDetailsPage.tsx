import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, Calendar, FileText, ArrowLeft, HelpCircle } from "lucide-react";
import { getScheme, previewEligibility, type EligibilityPreviewCriterion } from "../services/schemes";
import { createApplication, listApplications, getApplication } from "../services/applications";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Select } from "../components/ui/Input";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDate, titleCase, schemeLifecycleLabel } from "../utils/format";
import { apiErrorMessage } from "../services/api";

export function SchemeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const { data: scheme, isLoading, isError } = useQuery({
    queryKey: ["scheme", id],
    queryFn: () => getScheme(id!),
    enabled: !!id,
  });

  // "Already submitted" document check — only meaningful for a logged-in applicant.
  const { data: myApplications } = useQuery({
    queryKey: ["applications"],
    queryFn: listApplications,
    enabled: !!user && user.role === "applicant",
  });
  const existingAppForScheme = useMemo(() => myApplications?.find((a) => a.scheme_id === id), [myApplications, id]);
  const { data: existingAppDetail } = useQuery({
    queryKey: ["application", existingAppForScheme?.id],
    queryFn: () => getApplication(existingAppForScheme!.id),
    enabled: !!existingAppForScheme,
  });
  const submittedDocsByType = useMemo(
    () => new Map((existingAppDetail?.documents ?? []).map((d) => [d.doc_type, d])),
    [existingAppDetail],
  );

  const [dob, setDob] = useState("");
  const [income, setIncome] = useState("");
  const [marks, setMarks] = useState("");
  const [category, setCategory] = useState("");
  const [criteria, setCriteria] = useState<EligibilityPreviewCriterion[] | null>(null);
  const [likelyEligible, setLikelyEligible] = useState<boolean | null>(null);

  const checkMutation = useMutation({
    mutationFn: () =>
      previewEligibility(id!, {
        dob: dob || undefined,
        annual_income: income ? Number(income) : undefined,
        marks_percentage: marks ? Number(marks) : undefined,
        category: category || undefined,
      }),
    onSuccess: (data) => {
      setCriteria(data.criteria);
      setLikelyEligible(data.likely_eligible);
    },
  });

  const startMutation = useMutation({
    mutationFn: () => createApplication(id!),
    onSuccess: (app) => {
      showToast("Application started. Let's get your details in.", "success");
      navigate(`/app/applications/${app.id}/wizard`);
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const handleStart = () => {
    if (!user) {
      navigate("/login", { state: { from: `/app/schemes/${id}` } });
      return;
    }
    startMutation.mutate();
  };

  if (isLoading) return <LoadingState label="Loading scheme details..." />;
  if (isError || !scheme) return <ErrorState message="Scheme not found." />;

  const lifecycle = schemeLifecycleLabel(scheme);
  const canApply = scheme.status === "ACTIVE";

  return (
    <div className="max-w-5xl">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1.5 text-sm text-text-secondary hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* HEADER — CTA is inline (not viewport-fixed) so it never collides with
          the applicant shell's own fixed bottom nav on mobile. */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-secondary">{scheme.provider}</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">{scheme.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scheme.is_demo && <Badge tone="neutral">Demo Scheme</Badge>}
            <Badge tone="info">{titleCase(scheme.scheme_type)}</Badge>
            <Badge tone="neutral">{scheme.education_level}</Badge>
            <Badge tone={lifecycle.tone}>{lifecycle.label}</Badge>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-text-secondary">
            <Calendar className="h-3.5 w-3.5" /> Application deadline: {formatDate(scheme.deadline)}
          </p>
        </div>
        <div className="sm:sticky sm:top-4 sm:self-start">
          <Button size="lg" className="w-full sm:w-auto" onClick={handleStart} isLoading={startMutation.isPending} disabled={!canApply}>
            {canApply ? "Start Application" : "Applications Closed"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-2 font-semibold text-text">About This Scheme</h2>
            <p className="text-sm leading-relaxed text-text-secondary">{scheme.overview}</p>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-text">Benefits</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-secondary">Amount</dt>
                <dd className="font-medium text-text">{scheme.benefit_amount}</dd>
              </div>
              {scheme.benefit_duration && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-text-secondary">Duration</dt>
                  <dd className="font-medium text-text">{scheme.benefit_duration}</dd>
                </div>
              )}
              {scheme.benefit_coverage && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-text-secondary">Coverage</dt>
                  <dd className="font-medium text-text">{scheme.benefit_coverage}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">{scheme.benefits}</p>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-text">Eligibility</h2>
            {scheme.rules.length === 0 ? (
              <p className="text-sm text-text-secondary">No specific eligibility criteria configured — see the application process for details.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {scheme.rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-text-secondary">{r.label}</span>
                    <span className="font-medium text-text">
                      {r.operator === "in" ? (Array.isArray(r.value) ? r.value.join(", ") : r.value) : `${r.operator} ${r.value}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-text">Required Documents</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {scheme.documents.map((d) => {
                const uploaded = submittedDocsByType.get(d.document_type);
                const docStatus = uploaded
                  ? uploaded.status === "VERIFIED"
                    ? { label: "Verified", tone: "success" as const, Icon: CheckCircle2 }
                    : uploaded.status === "NEEDS_REVIEW"
                      ? { label: "Needs Review", tone: "warning" as const, Icon: AlertTriangle }
                      : uploaded.status === "INVALID"
                        ? { label: "Verification Failed", tone: "danger" as const, Icon: XCircle }
                        : { label: "Uploaded", tone: "success" as const, Icon: CheckCircle2 }
                  : d.required
                    ? { label: "Required — Not uploaded", tone: "warning" as const, Icon: AlertTriangle }
                    : { label: "Optional — Not uploaded", tone: "neutral" as const, Icon: FileText };
                const acceptedLabel = d.accepted_file_types.map((t) => t.split("/")[1]?.toUpperCase() ?? t).join(", ");
                return (
                  <div key={d.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-text">
                        {d.document_name}
                        {!d.required && <span className="ml-1 text-xs text-text-secondary">(optional)</span>}
                      </p>
                      {d.description && <p className="text-xs text-text-secondary">{d.description}</p>}
                      <p className="text-xs text-text-secondary">
                        {acceptedLabel} — up to {d.max_file_size_mb}MB
                      </p>
                      <span
                        className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium ${
                          docStatus.tone === "success" ? "text-success" : docStatus.tone === "warning" ? "text-warning" : docStatus.tone === "danger" ? "text-danger" : "text-text-secondary"
                        }`}
                      >
                        <docStatus.Icon className="h-3 w-3" /> {docStatus.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
              <Calendar className="h-4 w-4" /> Important Dates
            </h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {scheme.application_start && (
                <div className="flex justify-between sm:block">
                  <dt className="text-text-secondary">Application Opens</dt>
                  <dd className="font-medium text-text">{formatDate(scheme.application_start)}</dd>
                </div>
              )}
              <div className="flex justify-between sm:block">
                <dt className="text-text-secondary">Application Deadline</dt>
                <dd className="font-medium text-text">{formatDate(scheme.deadline)}</dd>
              </div>
              {scheme.correction_deadline && (
                <div className="flex justify-between sm:block">
                  <dt className="text-text-secondary">Correction Deadline</dt>
                  <dd className="font-medium text-text">{formatDate(scheme.correction_deadline)}</dd>
                </div>
              )}
              {scheme.result_date && (
                <div className="flex justify-between sm:block">
                  <dt className="text-text-secondary">Result Date</dt>
                  <dd className="font-medium text-text">{formatDate(scheme.result_date)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-2 font-semibold text-text">Application Process</h2>
            <p className="text-sm leading-relaxed text-text-secondary">{scheme.application_process}</p>
            <ol className="mt-3 space-y-1.5 text-sm text-text-secondary">
              {["Submit application", "Upload documents", "AI-assisted verification", "Eligibility evaluation", "Officer review", "Final decision"].map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-text-secondary">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          {scheme.faqs.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
                <HelpCircle className="h-4 w-4" /> Frequently Asked Questions
              </h2>
              <div className="space-y-3">
                {scheme.faqs.map((f) => (
                  <div key={f.question} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                    <p className="text-sm font-medium text-text">{f.question}</p>
                    <p className="mt-1 text-sm text-text-secondary">{f.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-text">Check Your Eligibility</h2>
            <p className="mb-3 text-xs text-text-secondary">
              A quick preview — formal eligibility is confirmed by the rule engine after you submit documents.
            </p>
            <div className="space-y-3">
              <Input label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              <Input label="Annual family income (₹)" type="number" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="e.g. 200000" />
              <Input label="Marks (%)" type="number" value={marks} onChange={(e) => setMarks(e.target.value)} placeholder="e.g. 78" />
              <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select category</option>
                {["General", "OBC", "SC", "ST", "Minority"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Button className="w-full" onClick={() => checkMutation.mutate()} isLoading={checkMutation.isPending}>
                Check Eligibility
              </Button>
            </div>

            {criteria && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {criteria.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-text">
                      {c.status === "passed" && <CheckCircle2 className="h-4 w-4 text-success" />}
                      {c.status === "failed" && <XCircle className="h-4 w-4 text-danger" />}
                      {c.status === "needs_review" && <AlertTriangle className="h-4 w-4 text-warning" />}
                      {c.name}
                    </span>
                    <span className="text-text-secondary">{String(c.actual ?? "—")}</span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-text-secondary">
                  {likelyEligible === null
                    ? "Fill in more fields for a fuller preview."
                    : likelyEligible
                      ? "You appear to meet the criteria you've entered so far."
                      : "One or more criteria may not be met — you can still apply and the officer will review supporting documents."}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
