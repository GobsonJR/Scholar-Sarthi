import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Play, Copy } from "lucide-react";
import {
  createScheme,
  updateScheme,
  getSchemeForOfficer,
  getSchemeBuilderMeta,
  activateScheme,
  type SchemeWriteInput,
  type SchemeRuleInput,
  type SchemeDocumentInput,
} from "../../services/schemes";
import { Button } from "../../components/ui/Button";
import { Input, Select, Textarea } from "../../components/ui/Input";
import { LoadingState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { apiErrorMessage } from "../../services/api";
import { titleCase } from "../../utils/format";

const NUMERIC_FIELDS = new Set(["income", "marks", "age"]);

const EMPTY_FORM: SchemeWriteInput = {
  name: "",
  provider: "",
  category: "merit",
  scheme_type: "scholarship",
  education_level: "Undergraduate",
  state: "All India",
  institution_type: "Any",
  short_description: "",
  overview: "",
  benefits: "",
  benefit_amount: "",
  benefit_duration: "",
  benefit_coverage: "",
  application_process: "Apply online, upload required documents, complete AI-assisted verification, and await officer review.",
  deadline: "",
  application_start: "",
  correction_deadline: "",
  result_date: "",
  status: "DRAFT",
  faqs: [],
  rules: [],
  documents: [],
};

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function SchemeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: meta } = useQuery({ queryKey: ["scheme-builder-meta"], queryFn: getSchemeBuilderMeta });
  const { data: existing, isLoading: loadingExisting, isError } = useQuery({
    queryKey: ["scheme-officer", id],
    queryFn: () => getSchemeForOfficer(id!),
    enabled: isEdit,
  });

  const [form, setForm] = useState<SchemeWriteInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        provider: existing.provider,
        category: existing.category,
        scheme_type: existing.scheme_type,
        education_level: existing.education_level,
        state: existing.state,
        institution_type: existing.institution_type,
        short_description: existing.short_description,
        overview: existing.overview,
        benefits: existing.benefits,
        benefit_amount: existing.benefit_amount,
        benefit_duration: existing.benefit_duration ?? "",
        benefit_coverage: existing.benefit_coverage ?? "",
        application_process: existing.application_process,
        deadline: toDateInput(existing.deadline),
        application_start: toDateInput(existing.application_start),
        correction_deadline: toDateInput(existing.correction_deadline),
        result_date: toDateInput(existing.result_date),
        status: existing.status,
        faqs: existing.faqs,
        rules: existing.rules.map((r) => ({ field: r.field, operator: r.operator, value: r.value, label: r.label, required: r.required })),
        documents: existing.documents.map((d) => ({
          document_type: d.document_type,
          document_name: d.document_name,
          description: d.description,
          required: d.required,
          accepted_file_types: d.accepted_file_types,
          max_file_size_mb: d.max_file_size_mb,
          validity_required: d.validity_required,
          authenticity_check_required: d.authenticity_check_required,
          expected_fields: d.expected_fields,
        })),
      });
    }
  }, [existing]);

  const set = <K extends keyof SchemeWriteInput>(key: K, value: SchemeWriteInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  // --- Rule builder ---
  const addRule = () =>
    set("rules", [...form.rules, { field: meta?.rule_fields[0]?.field ?? "income", operator: ">=", value: "", label: meta?.rule_fields[0]?.label ?? "", required: true }]);
  const updateRule = (i: number, patch: Partial<SchemeRuleInput>) =>
    set(
      "rules",
      form.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  const removeRule = (i: number) => set("rules", form.rules.filter((_, idx) => idx !== i));

  // --- Document builder ---
  const addDocument = () =>
    set("documents", [
      ...form.documents,
      {
        document_type: meta?.document_types[0] ?? "IDENTITY_PROOF",
        document_name: "",
        description: "",
        required: true,
        accepted_file_types: ["application/pdf", "image/jpeg", "image/png"],
        max_file_size_mb: 10,
        validity_required: false,
        authenticity_check_required: true,
        expected_fields: [],
      },
    ]);
  const updateDocument = (i: number, patch: Partial<SchemeDocumentInput>) =>
    set(
      "documents",
      form.documents.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
    );
  const removeDocument = (i: number) => set("documents", form.documents.filter((_, idx) => idx !== i));

  // --- FAQ builder ---
  const addFaq = () => set("faqs", [...form.faqs, { question: "", answer: "" }]);
  const updateFaq = (i: number, patch: Partial<{ question: string; answer: string }>) =>
    set(
      "faqs",
      form.faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    );
  const removeFaq = (i: number) => set("faqs", form.faqs.filter((_, idx) => idx !== i));

  function validate(): string[] {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("Scheme name is required.");
    if (!form.provider.trim()) errs.push("Provider / organization is required.");
    if (!form.short_description.trim()) errs.push("Short description is required.");
    if (!form.deadline) errs.push("Application deadline is required.");
    if (form.application_start && form.deadline && form.deadline < form.application_start) errs.push("Application deadline cannot be before the application start date.");
    if (form.correction_deadline && form.deadline && form.correction_deadline < form.deadline) errs.push("Correction deadline cannot be before the application deadline.");
    if (form.rules.some((r) => r.value === "" || r.value === null)) errs.push("Every eligibility criterion needs a value.");
    if (form.rules.some((r) => !r.label.trim())) errs.push("Every eligibility criterion needs a label.");
    if (form.documents.some((d) => !d.document_name.trim())) errs.push("Every document needs a name.");
    if (form.documents.some((d) => d.accepted_file_types.length === 0)) errs.push("Every document needs at least one accepted file type.");
    if (form.documents.some((d) => d.max_file_size_mb < 1 || d.max_file_size_mb > 10)) errs.push("Maximum file size must be between 1 and 10 MB.");
    return errs;
  }

  function buildPayload(): SchemeWriteInput {
    return {
      ...form,
      application_start: form.application_start || null,
      correction_deadline: form.correction_deadline || null,
      result_date: form.result_date || null,
      benefit_duration: form.benefit_duration || null,
      benefit_coverage: form.benefit_coverage || null,
      rules: form.rules.map((r) => ({
        ...r,
        value: r.operator === "in" ? String(r.value).split(",").map((v) => v.trim()).filter(Boolean) : NUMERIC_FIELDS.has(r.field) ? Number(r.value) : r.value,
      })),
    };
  }

  const saveMutation = useMutation({
    mutationFn: (payload: SchemeWriteInput) => (isEdit ? updateScheme(id!, payload) : createScheme(payload)),
    onSuccess: (scheme) => {
      showToast(isEdit ? "Scheme saved." : "Scheme created as draft.", "success");
      queryClient.invalidateQueries({ queryKey: ["scheme-officer", scheme.id] });
      queryClient.invalidateQueries({ queryKey: ["schemes-admin"] });
      if (isEdit) {
        // Same route/params — react-router won't remount, so the stale
        // `existing` query result (e.g. version number) needs an explicit
        // refetch rather than relying on navigation to reload it.
        queryClient.setQueryData(["scheme-officer", scheme.id], scheme);
      } else {
        navigate(`/officer/schemes/${scheme.id}/edit`);
      }
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateScheme(id!),
    onSuccess: (scheme) => {
      showToast("Scheme activated. It is now visible to applicants.", "success");
      set("status", "ACTIVE");
      queryClient.setQueryData(["scheme-officer", scheme.id], scheme);
      queryClient.invalidateQueries({ queryKey: ["schemes-admin"] });
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const handleSave = () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;
    saveMutation.mutate(buildPayload());
  };

  if (isEdit && loadingExisting) return <LoadingState label="Loading scheme..." />;
  if (isEdit && isError) return <ErrorState message="Scheme not found." />;

  return (
    <div className="max-w-4xl pb-10">
      <button onClick={() => navigate("/officer/schemes")} className="mb-4 flex items-center gap-1.5 text-sm text-text-secondary hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to Schemes
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-text">{isEdit ? "Edit Scheme" : "Add Scheme"}</h1>
          {isEdit && existing && <p className="text-sm text-text-secondary">Version {existing.version}{existing.version > 1 && " — eligibility rules have changed since v1"}</p>}
        </div>
        <div className="flex gap-2">
          {isEdit && form.status !== "ACTIVE" && (
            <Button variant="secondary" onClick={() => activateMutation.mutate()} isLoading={activateMutation.isPending}>
              <Play className="h-4 w-4" /> Activate
            </Button>
          )}
          <Button onClick={handleSave} isLoading={saveMutation.isPending}>
            Save {isEdit ? "" : "as Draft"}
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-danger-light p-4 text-sm text-danger">
          <ul className="list-disc space-y-1 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6">
        {/* SECTION 1 — Basic Information */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text">Basic Information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Scheme Name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <Input label="Provider / Organization" value={form.provider} onChange={(e) => set("provider", e.target.value)} />
            <Select label="Scheme Type" value={form.scheme_type} onChange={(e) => set("scheme_type", e.target.value)}>
              <option value="scholarship">Scholarship</option>
              <option value="fellowship">Fellowship</option>
            </Select>
            <Input label="Category" value={form.category} onChange={(e) => set("category", e.target.value)} hint="e.g. merit, need-based, minority, research, gender-equity" />
            <Input label="Education Level" value={form.education_level} onChange={(e) => set("education_level", e.target.value)} />
            <Input label="State" value={form.state} onChange={(e) => set("state", e.target.value)} hint="'All India' if not state-specific" />
            <Input label="Institution Type" value={form.institution_type} onChange={(e) => set("institution_type", e.target.value)} hint="'Any' if not restricted" />
            <Select label="Status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {(meta?.statuses ?? ["DRAFT", "ACTIVE", "PAUSED", "CLOSED"]).map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4 space-y-4">
            <Input label="Short Description" value={form.short_description} onChange={(e) => set("short_description", e.target.value)} hint="Shown on scheme cards — one sentence." />
            <Textarea label="Full Description (About this scheme)" value={form.overview} onChange={(e) => set("overview", e.target.value)} />
          </div>
        </section>

        {/* SECTION 2 — Benefits */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text">Benefits</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Award Amount" value={form.benefit_amount} onChange={(e) => set("benefit_amount", e.target.value)} placeholder="e.g. Rs. 50,000/year" />
            <Input label="Duration" value={form.benefit_duration ?? ""} onChange={(e) => set("benefit_duration", e.target.value)} placeholder="e.g. 1 year, renewable" />
          </div>
          <div className="mt-4 space-y-4">
            <Input label="Coverage" value={form.benefit_coverage ?? ""} onChange={(e) => set("benefit_coverage", e.target.value)} placeholder="e.g. Tuition fees + book grant" />
            <Textarea label="Other Benefits" value={form.benefits} onChange={(e) => set("benefits", e.target.value)} />
          </div>
        </section>

        {/* SECTION 3 — Eligibility rule builder */}
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-text">Eligibility Criteria</h2>
          <p className="mb-4 text-xs text-text-secondary">
            Evaluated by the deterministic rule engine — no criterion here is hardcoded; add any field/operator/value combination.
          </p>
          <div className="space-y-3">
            {form.rules.map((r, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto_1fr_1fr_auto_auto]">
                <Select
                  aria-label="Field"
                  value={r.field}
                  onChange={(e) => {
                    const fieldMeta = meta?.rule_fields.find((f) => f.field === e.target.value);
                    updateRule(i, { field: e.target.value, label: fieldMeta?.label ?? r.label });
                  }}
                >
                  {(meta?.rule_fields ?? []).map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Operator" value={r.operator} onChange={(e) => updateRule(i, { operator: e.target.value })}>
                  {(meta?.operators ?? [">=", "<=", ">", "<", "=", "in"]).map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label="Value"
                  value={r.value ?? ""}
                  onChange={(e) => updateRule(i, { value: e.target.value })}
                  placeholder={r.operator === "in" ? "OBC, SC, ST" : "value"}
                  type={NUMERIC_FIELDS.has(r.field) && r.operator !== "in" ? "number" : "text"}
                />
                <Input aria-label="Label" value={r.label} onChange={(e) => updateRule(i, { label: e.target.value })} placeholder="Display label" />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
                  <input type="checkbox" checked={r.required} onChange={(e) => updateRule(i, { required: e.target.checked })} /> Required
                </label>
                <Button variant="ghost" size="sm" onClick={() => removeRule(i)} aria-label="Remove criterion">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={addRule}>
            <Plus className="h-4 w-4" /> Add Criterion
          </Button>
        </section>

        {/* SECTION 4 — Required Document builder + verification configuration */}
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-text">Required Documents</h2>
          <p className="mb-4 text-xs text-text-secondary">Configure what's required and how each document should be verified.</p>
          <div className="space-y-4">
            {form.documents.map((d, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
                  <Select
                    aria-label="Document type"
                    value={d.document_type}
                    onChange={(e) => updateDocument(i, { document_type: e.target.value, document_name: d.document_name || titleCase(e.target.value) })}
                  >
                    {(meta?.document_types ?? []).map((t) => (
                      <option key={t} value={t}>
                        {titleCase(t)}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label="Document name" value={d.document_name} onChange={(e) => updateDocument(i, { document_name: e.target.value })} placeholder="Display name" />
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
                    <input type="checkbox" checked={d.required} onChange={(e) => updateDocument(i, { required: e.target.checked })} /> Required
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => set("documents", [...form.documents, { ...d }])} aria-label="Duplicate document" title="Duplicate">
                    <Copy className="h-4 w-4 text-text-secondary" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeDocument(i)} aria-label="Remove document">
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>

                <Input
                  aria-label="Description"
                  className="mt-2"
                  value={d.description ?? ""}
                  onChange={(e) => updateDocument(i, { description: e.target.value })}
                  placeholder="Description / instructions shown to the applicant, e.g. 'Valid income certificate for the current financial year.'"
                />

                <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-text-secondary">Accepted File Types</p>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { mime: "application/pdf", label: "PDF" },
                        { mime: "image/jpeg", label: "JPG" },
                        { mime: "image/png", label: "PNG" },
                      ].map((t) => (
                        <label key={t.mime} className="flex items-center gap-1.5 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={d.accepted_file_types.includes(t.mime)}
                            onChange={(e) =>
                              updateDocument(i, {
                                accepted_file_types: e.target.checked
                                  ? [...d.accepted_file_types, t.mime]
                                  : d.accepted_file_types.filter((x) => x !== t.mime),
                              })
                            }
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Input
                    id={`doc-${i}-max-size`}
                    label="Maximum File Size (MB)"
                    type="number"
                    min={1}
                    max={10}
                    value={d.max_file_size_mb}
                    onChange={(e) => updateDocument(i, { max_file_size_mb: Number(e.target.value) })}
                  />
                  <Input
                    id={`doc-${i}-expected-fields`}
                    label="Expected Fields (comma-separated)"
                    className="sm:col-span-2"
                    value={d.expected_fields.join(", ")}
                    onChange={(e) => updateDocument(i, { expected_fields: e.target.value.split(",").map((f) => f.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean) })}
                    placeholder="e.g. name, annual_income, certificate_number, issue_date"
                    hint="The AI pipeline reports these back as found/missing after extraction."
                  />
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input type="checkbox" checked={d.validity_required} onChange={(e) => updateDocument(i, { validity_required: e.target.checked })} /> Validity / expiry check required
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={d.authenticity_check_required}
                      onChange={(e) => updateDocument(i, { authenticity_check_required: e.target.checked })}
                    />{" "}
                    Authenticity risk check required
                  </label>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={addDocument}>
            <Plus className="h-4 w-4" /> Add Document
          </Button>
        </section>

        {/* SECTION 5 — Important Dates */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text">Important Dates</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Application Start Date" type="date" value={form.application_start ?? ""} onChange={(e) => set("application_start", e.target.value)} />
            <Input label="Application Deadline" type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            <Input label="Correction Deadline" type="date" value={form.correction_deadline ?? ""} onChange={(e) => set("correction_deadline", e.target.value)} />
            <Input label="Result Date (optional)" type="date" value={form.result_date ?? ""} onChange={(e) => set("result_date", e.target.value)} />
          </div>
        </section>

        {/* SECTION 6 — Application process */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text">Application Process</h2>
          <Textarea label="Description shown to applicants" value={form.application_process} onChange={(e) => set("application_process", e.target.value)} />
        </section>

        {/* SECTION 7 — FAQs */}
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text">FAQ</h2>
          <div className="space-y-3">
            {form.faqs.map((f, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input aria-label="Question" value={f.question} onChange={(e) => updateFaq(i, { question: e.target.value })} placeholder="Question" />
                <Input aria-label="Answer" value={f.answer} onChange={(e) => updateFaq(i, { answer: e.target.value })} placeholder="Answer" />
                <Button variant="ghost" size="sm" onClick={() => removeFaq(i)} aria-label="Remove FAQ">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={addFaq}>
            <Plus className="h-4 w-4" /> Add FAQ
          </Button>
        </section>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        {isEdit && form.status !== "ACTIVE" && (
          <Button variant="secondary" onClick={() => activateMutation.mutate()} isLoading={activateMutation.isPending}>
            <Play className="h-4 w-4" /> Activate
          </Button>
        )}
        <Button onClick={handleSave} isLoading={saveMutation.isPending}>
          Save {isEdit ? "" : "as Draft"}
        </Button>
      </div>
    </div>
  );
}
