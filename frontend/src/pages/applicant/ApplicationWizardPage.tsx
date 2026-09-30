import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Save, CheckCircle2, Send } from "lucide-react";
import { getApplication, submitApplication, updateApplication } from "../../services/applications";
import { uploadDocument, deleteDocument, replaceDocument } from "../../services/documents";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { LoadingState, ErrorState } from "../../components/ui/States";
import { FileUploader } from "../../components/domain/FileUploader";
import { DocumentCard } from "../../components/domain/DocumentCard";
import { AIProcessingIndicator } from "../../components/domain/AIProcessingIndicator";
import { PipelineJourney } from "../../components/domain/PipelineJourney";
import { EligibilityPanel } from "../../components/domain/EligibilityPanel";
import { MismatchTable } from "../../components/domain/MismatchCard";
import { useToast } from "../../components/ui/Toast";
import { apiErrorMessage } from "../../services/api";
import { titleCase } from "../../utils/format";

const STEP_LABELS = [
  "Personal Information",
  "Academic Information",
  "Financial Information",
  "Category & Eligibility",
  "Document Upload",
  "AI Verification",
  "Eligibility Review",
  "Submit",
];

export function ApplicationWizardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: application, isLoading, isError } = useQuery({
    queryKey: ["application", id],
    queryFn: () => getApplication(id!),
    enabled: !!id,
  });

  const [step, setStep] = useState(1);
  const [personal, setPersonal] = useState<Record<string, any>>({});
  const [academic, setAcademic] = useState<Record<string, any>>({});
  const [financial, setFinancial] = useState<Record<string, any>>({});
  const [categoryInfo, setCategoryInfo] = useState<Record<string, any>>({});

  useEffect(() => {
    if (application) {
      setStep(Math.min(Math.max(application.current_step, 1), 8));
      setPersonal(application.personal_info ?? {});
      setAcademic(application.academic_info ?? {});
      setFinancial(application.financial_info ?? {});
      setCategoryInfo(application.category_info ?? {});
    }
  }, [application?.id]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => updateApplication(id!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application", id] }),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ docType, file }: { docType: string; file: File }) => uploadDocument(id!, docType, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      showToast("Document uploaded and processed.", "success");
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(docId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application", id] }),
  });

  const replaceMutation = useMutation({
    mutationFn: ({ docId, file }: { docId: string; file: File }) => replaceDocument(docId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      showToast("Document replaced and re-verified.", "success");
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitApplication(id!),
    onSuccess: (data) => {
      queryClient.setQueryData(["application", id], data);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      showToast("Application submitted successfully.", "success");
      navigate(`/app/applications/${id}`);
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  if (isLoading) return <LoadingState label="Loading your application..." />;
  if (isError || !application) return <ErrorState message="Application not found." />;

  const scheme = application.scheme!;
  const uploadedTypes = new Set(application.documents.map((d) => d.doc_type));
  const missingDocs = scheme.required_documents.filter((d) => !uploadedTypes.has(d));

  const goToStep = async (next: number, payload?: Record<string, any>) => {
    await saveMutation.mutateAsync({ ...payload, current_step: next });
    setStep(next);
  };

  const handleSaveDraft = () => {
    saveMutation.mutate(
      { personal_info: personal, academic_info: academic, financial_info: financial, category_info: categoryInfo, current_step: step },
      { onSuccess: () => showToast("Draft saved.", "success") },
    );
  };

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate("/app/applications")} className="mb-4 flex items-center gap-1.5 text-sm text-text-secondary hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to My Applications
      </button>

      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-secondary">{scheme.name}</p>
        <h1 className="text-2xl font-semibold text-text">{STEP_LABELS[step - 1]}</h1>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={(step / 8) * 100} className="flex-1" />
          <span className="whitespace-nowrap text-xs text-text-secondary">Step {step} of 8</span>
        </div>
      </div>

      <div className="card p-6">
        {step === 1 && (
          <div className="space-y-4">
            <Input label="Full name" value={personal.full_name ?? ""} onChange={(e) => setPersonal({ ...personal, full_name: e.target.value })} />
            <Input label="Date of birth" type="date" value={personal.dob ?? ""} onChange={(e) => setPersonal({ ...personal, dob: e.target.value })} />
            <Select label="Gender" value={personal.gender ?? ""} onChange={(e) => setPersonal({ ...personal, gender: e.target.value })}>
              <option value="">Select</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </Select>
            <Input label="Phone" value={personal.phone ?? ""} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} />
            <Input label="Address" value={personal.address ?? ""} onChange={(e) => setPersonal({ ...personal, address: e.target.value })} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Input label="Institution" value={academic.institution ?? ""} onChange={(e) => setAcademic({ ...academic, institution: e.target.value })} />
            <Input label="Course" value={academic.course ?? ""} onChange={(e) => setAcademic({ ...academic, course: e.target.value })} />
            <Input
              label="Latest marks (%)"
              type="number"
              value={academic.marks_percentage ?? ""}
              onChange={(e) => setAcademic({ ...academic, marks_percentage: Number(e.target.value) })}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Input
              label="Annual family income (₹)"
              type="number"
              value={financial.annual_income ?? ""}
              onChange={(e) => setFinancial({ ...financial, annual_income: Number(e.target.value) })}
            />
            <Input
              label="Income certificate issue date"
              type="date"
              value={financial.certificate_issue_date ?? ""}
              onChange={(e) => setFinancial({ ...financial, certificate_issue_date: e.target.value })}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <Select label="Category" value={categoryInfo.category ?? ""} onChange={(e) => setCategoryInfo({ ...categoryInfo, category: e.target.value })}>
              <option value="">Select category</option>
              {["General", "OBC", "SC", "ST", "Minority"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
              This scheme requires: {scheme.eligible_categories ? scheme.eligible_categories.join(", ") : "All categories"}
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Upload each required document. Files are processed automatically once uploaded.</p>
            {scheme.required_documents.map((docType) => {
              const doc = application.documents.find((d) => d.doc_type === docType);
              const config = scheme.documents.find((d) => d.document_type === docType);
              return (
                <div key={docType}>
                  <p className="text-sm font-medium text-text">{config?.document_name ?? titleCase(docType)}</p>
                  {config?.description && <p className="mb-2 text-xs text-text-secondary">{config.description}</p>}
                  {doc ? (
                    <DocumentCard
                      document={doc}
                      onDelete={() => deleteMutation.mutate(doc.id)}
                      onReplace={(file) => replaceMutation.mutate({ docId: doc.id, file })}
                    />
                  ) : (
                    <>
                      <FileUploader
                        disabled={uploadMutation.isPending}
                        acceptedTypes={config?.accepted_file_types}
                        maxSizeMb={config?.max_file_size_mb}
                        onFileSelected={(file) => uploadMutation.mutate({ docType, file })}
                      />
                      {uploadMutation.isPending && uploadMutation.variables?.docType === docType && (
                        <div className="mt-2">
                          <AIProcessingIndicator active />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <PipelineJourney
              documentsUploaded={application.documents.length > 0}
              documentsVerified={application.documents.every((d) => d.status !== "PROCESSING")}
              mismatchChecked={application.documents.some((d) => d.extraction)}
              eligibilityEvaluated={!!application.eligibility}
            />
            <p className="text-sm text-text-secondary">
              Each document has been processed through AI-assisted document verification and cross-document mismatch detection. Review the results below.
            </p>
            {application.documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                isMismatched={application.mismatches.some((m) => m.is_mismatch && m.values.some((v) => v.doc_type === doc.doc_type))}
                onReplace={(file) => replaceMutation.mutate({ docId: doc.id, file })}
              />
            ))}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-6">
            {application.eligibility ? <EligibilityPanel eligibility={application.eligibility} /> : <p className="text-sm text-text-secondary">Not yet evaluated.</p>}
            <div>
              <h3 className="mb-2 font-semibold text-text">Cross-Document Check</h3>
              <MismatchTable mismatches={application.mismatches} />
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-success-light px-4 py-3 text-success">
              <CheckCircle2 className="h-5 w-5" /> Your application is ready to submit.
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Scheme</dt>
                <dd className="font-medium text-text">{scheme.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Documents submitted</dt>
                <dd className="font-medium text-text">{application.documents.length} / {scheme.required_documents.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Preliminary eligibility</dt>
                <dd className="font-medium text-text">{application.eligibility?.eligible ? "Eligible" : "Not currently eligible"}</dd>
              </div>
            </dl>
            {missingDocs.length > 0 && (
              <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">
                Missing documents: {missingDocs.map(titleCase).join(", ")}. Please go back to Document Upload.
              </p>
            )}
            <p className="text-xs text-text-secondary">
              Submitting does not guarantee approval — an officer will review your application after automated checks complete.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
          <Button variant="ghost" onClick={handleSaveDraft} isLoading={saveMutation.isPending}>
            <Save className="h-4 w-4" /> Save Draft
          </Button>
        </div>

        {step < 8 ? (
          <Button
            onClick={() =>
              goToStep(step + 1, { personal_info: personal, academic_info: academic, financial_info: financial, category_info: categoryInfo })
            }
            isLoading={saveMutation.isPending}
            disabled={step === 5 && missingDocs.length > 0}
          >
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => submitMutation.mutate()} isLoading={submitMutation.isPending} disabled={missingDocs.length > 0}>
            <Send className="h-4 w-4" /> Submit Application
          </Button>
        )}
      </div>
    </div>
  );
}
