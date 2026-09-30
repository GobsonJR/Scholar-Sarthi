import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, Send, MessageSquareText } from "lucide-react";
import { getApplication, listCorrections, resubmitApplication } from "../../services/applications";
import { uploadDocument, deleteDocument, replaceDocument } from "../../services/documents";
import { StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingState, ErrorState } from "../../components/ui/States";
import { ApplicationTimeline } from "../../components/domain/Timeline";
import { DocumentCard } from "../../components/domain/DocumentCard";
import { FileUploader } from "../../components/domain/FileUploader";
import { AIProcessingIndicator } from "../../components/domain/AIProcessingIndicator";
import { PipelineJourney } from "../../components/domain/PipelineJourney";
import { EligibilityPanel } from "../../components/domain/EligibilityPanel";
import { MismatchTable } from "../../components/domain/MismatchCard";
import { useToast } from "../../components/ui/Toast";
import { apiErrorMessage } from "../../services/api";
import { formatDate, formatDateTime } from "../../utils/format";

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [reuploadDocType, setReuploadDocType] = useState<string | null>(null);

  const { data: application, isLoading, isError } = useQuery({
    queryKey: ["application", id],
    queryFn: () => getApplication(id!),
    enabled: !!id,
  });

  const { data: corrections } = useQuery({
    queryKey: ["corrections", id],
    queryFn: () => listCorrections(id!),
    enabled: !!id,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ docType, file }: { docType: string; file: File }) => uploadDocument(id!, docType, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      setReuploadDocType(null);
      showToast("Document re-uploaded and re-verified.", "success");
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

  const resubmitMutation = useMutation({
    mutationFn: () => resubmitApplication(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      queryClient.invalidateQueries({ queryKey: ["corrections", id] });
      showToast("Application resubmitted for officer review.", "success");
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  if (isLoading) return <LoadingState label="Loading application..." />;
  if (isError || !application) return <ErrorState message="Application not found." />;

  const scheme = application.scheme!;
  const openCorrections = corrections?.filter((c) => c.status === "OPEN") ?? [];

  return (
    <div className="max-w-5xl">
      <button onClick={() => navigate("/app/applications")} className="mb-4 flex items-center gap-1.5 text-sm text-text-secondary hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to My Applications
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-secondary">{application.display_id}</p>
          <h1 className="text-2xl font-semibold text-text">{scheme.name}</h1>
          <p className="mt-1 text-sm text-text-secondary">Deadline: {formatDate(scheme.deadline)}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      {openCorrections.length > 0 && (
        <section className="mb-6 space-y-3">
          {openCorrections.map((c) => (
            <div key={c.id} className="card border-amber-200 bg-warning-light/40 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div className="flex-1">
                  <p className="font-semibold text-text">{c.issue}</p>
                  <p className="mt-1 text-sm text-text-secondary">{c.comment}</p>
                  {c.deadline && <p className="mt-1 text-xs text-warning">Please resolve by {formatDate(c.deadline)}</p>}
                  {reuploadDocType === (application.documents.find((d) => d.id === c.document_id)?.doc_type ?? "") && (
                    <div className="mt-3 max-w-md space-y-2">
                      <FileUploader
                        disabled={uploadMutation.isPending}
                        onFileSelected={(file) => {
                          const docType = application.documents.find((d) => d.id === c.document_id)?.doc_type;
                          if (docType) uploadMutation.mutate({ docType, file });
                        }}
                      />
                      <AIProcessingIndicator active={uploadMutation.isPending} />
                    </div>
                  )}
                  {reuploadDocType !== (application.documents.find((d) => d.id === c.document_id)?.doc_type ?? "") && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => setReuploadDocType(application.documents.find((d) => d.id === c.document_id)?.doc_type ?? null)}
                    >
                      Re-upload Document
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {application.status === "CORRECTION_REQUIRED" && (
            <Button onClick={() => resubmitMutation.mutate()} isLoading={resubmitMutation.isPending}>
              <Send className="h-4 w-4" /> Resubmit Application
            </Button>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PipelineJourney
            documentsUploaded={application.documents.length > 0}
            documentsVerified={application.documents.every((d) => d.status !== "PROCESSING")}
            mismatchChecked={application.documents.some((d) => d.extraction)}
            eligibilityEvaluated={!!application.eligibility}
          />

          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-text">Documents</h2>
            <div className="space-y-3">
              {application.documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onDelete={application.status === "DRAFT" ? () => deleteMutation.mutate(doc.id) : undefined}
                  onReplace={(file) => replaceMutation.mutate({ docId: doc.id, file })}
                  isMismatched={application.mismatches.some((m) => m.is_mismatch && m.values.some((v) => v.doc_type === doc.doc_type))}
                />
              ))}
            </div>
          </section>

          {application.eligibility && (
            <section className="card p-5">
              <h2 className="mb-4 font-semibold text-text">Eligibility Result</h2>
              <EligibilityPanel eligibility={application.eligibility} />
            </section>
          )}

          {application.mismatches.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-4 font-semibold text-text">Cross-Document Check</h2>
              <MismatchTable mismatches={application.mismatches} />
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-text">Application Status</h2>
            <ApplicationTimeline status={application.status} />
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
              <MessageSquareText className="h-4 w-4" /> Need help?
            </h2>
            <p className="mb-3 text-sm text-text-secondary">Ask the AI assistant about this application's status, flags, or requirements.</p>
            <Button variant="outline" className="w-full" onClick={() => navigate(`/app/assistant?application=${application.id}`)}>
              Open Assistant
            </Button>
          </section>

          <section className="card p-5 text-xs text-text-secondary">
            <p className="mb-1">Submitted: {formatDateTime(application.submitted_at)}</p>
            <p>Last updated: {formatDateTime(application.updated_at)}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
