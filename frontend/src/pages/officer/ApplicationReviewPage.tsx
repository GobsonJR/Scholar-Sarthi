import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, XCircle, MessageSquareWarning, User, GraduationCap, IndianRupee } from "lucide-react";
import { getOfficerApplication, approveApplication, rejectApplication, requestCorrection, verifyDocument, invalidateDocument } from "../../services/officer";
import { listAuditLogs } from "../../services/notifications";
import { StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingState, ErrorState } from "../../components/ui/States";
import { DocumentCard } from "../../components/domain/DocumentCard";
import { EligibilityPanel } from "../../components/domain/EligibilityPanel";
import { MismatchTable } from "../../components/domain/MismatchCard";
import { ApplicationTimeline } from "../../components/domain/Timeline";
import { PipelineJourney } from "../../components/domain/PipelineJourney";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { Input, Select, Textarea } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { apiErrorMessage } from "../../services/api";
import { formatDateTime, titleCase } from "../../utils/format";

export function ApplicationReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionDoc, setCorrectionDoc] = useState("");
  const [correctionIssue, setCorrectionIssue] = useState("");
  const [correctionComment, setCorrectionComment] = useState("");
  const [correctionDeadline, setCorrectionDeadline] = useState("");
  const [docActionTarget, setDocActionTarget] = useState<{ id: string; label: string; action: "verify" | "invalidate" } | null>(null);

  const { data: application, isLoading, isError } = useQuery({
    queryKey: ["officer-application", id],
    queryFn: () => getOfficerApplication(id!),
    enabled: !!id,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs", id],
    queryFn: () => listAuditLogs(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["officer-application", id] });
    queryClient.invalidateQueries({ queryKey: ["officer-apps"] });
    queryClient.invalidateQueries({ queryKey: ["officer-stats"] });
    queryClient.invalidateQueries({ queryKey: ["audit-logs", id] });
  };

  const approveMutation = useMutation({
    mutationFn: (reason: string) => approveApplication(id!, reason),
    onSuccess: () => {
      showToast("Application approved.", "success");
      setShowApprove(false);
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectApplication(id!, reason),
    onSuccess: () => {
      showToast("Application rejected.", "success");
      setShowReject(false);
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const correctionMutation = useMutation({
    mutationFn: () =>
      requestCorrection(id!, {
        document_id: correctionDoc || undefined,
        issue: correctionIssue,
        comment: correctionComment,
        deadline: correctionDeadline || undefined,
      }),
    onSuccess: () => {
      showToast("Correction requested. The applicant has been notified.", "success");
      setShowCorrection(false);
      setCorrectionDoc("");
      setCorrectionIssue("");
      setCorrectionComment("");
      setCorrectionDeadline("");
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const verifyDocMutation = useMutation({
    mutationFn: (reason?: string) => verifyDocument(docActionTarget!.id, reason ?? ""),
    onSuccess: () => {
      showToast("Document verified.", "success");
      setDocActionTarget(null);
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  const invalidateDocMutation = useMutation({
    mutationFn: (reason?: string) => invalidateDocument(docActionTarget!.id, reason ?? ""),
    onSuccess: () => {
      showToast("Document marked invalid. The applicant has been notified.", "success");
      setDocActionTarget(null);
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  if (isLoading) return <LoadingState label="Loading application..." />;
  if (isError || !application) return <ErrorState message="Application not found." />;

  const scheme = application.scheme!;
  const canDecide = !["APPROVED", "REJECTED"].includes(application.status);

  return (
    <div className="max-w-7xl">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1.5 text-sm text-text-secondary hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-secondary">{application.display_id}</p>
          <h1 className="text-2xl font-semibold text-text">{scheme.name}</h1>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr_320px]">
        {/* LEFT: Applicant info */}
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
              <User className="h-4 w-4" /> Applicant
            </h2>
            <p className="font-medium text-text">{application.applicant_name}</p>
            <p className="text-sm text-text-secondary">{application.applicant_email}</p>
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">DOB</dt>
                <dd className="text-text">{application.personal_info.dob ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Gender</dt>
                <dd className="text-text">{application.personal_info.gender ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Category</dt>
                <dd className="text-text">{application.category_info.category ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-text">Application Status</h2>
            <ApplicationTimeline status={application.status} />
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
              <GraduationCap className="h-4 w-4" /> Academic
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Institution</dt>
                <dd className="text-right text-text">{application.academic_info.institution ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Marks</dt>
                <dd className="text-text">{application.academic_info.marks_percentage ?? "—"}%</dd>
              </div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
              <IndianRupee className="h-4 w-4" /> Financial
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Annual income</dt>
                <dd className="text-text">₹{Number(application.financial_info.annual_income ?? 0).toLocaleString("en-IN")}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-text">Applicant History</h2>
            <p className="text-xs text-text-secondary">Submitted: {formatDateTime(application.submitted_at)}</p>
            <p className="text-xs text-text-secondary">Application current step: {application.current_step}/8</p>
          </section>
        </div>

        {/* CENTER: Documents & analysis */}
        <div className="space-y-6">
          <PipelineJourney
            documentsUploaded={application.documents.length > 0}
            documentsVerified={application.documents.every((d) => d.status !== "PROCESSING")}
            mismatchChecked={application.documents.some((d) => d.extraction)}
            eligibilityEvaluated={!!application.eligibility}
          />

          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-text">Document Verification</h2>
            <div className="space-y-3">
              {application.documents.map((doc) => (
                <div key={doc.id}>
                  <DocumentCard
                    document={doc}
                    isMismatched={application.mismatches.some((m) => m.is_mismatch && m.values.some((v) => v.doc_type === doc.doc_type))}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={doc.status === "VERIFIED"}
                      onClick={() => setDocActionTarget({ id: doc.id, label: titleCase(doc.doc_type), action: "verify" })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCorrectionDoc(doc.id);
                        setShowCorrection(true);
                      }}
                    >
                      <MessageSquareWarning className="h-3.5 w-3.5 text-warning" /> Request Replacement
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={doc.status === "INVALID"}
                      onClick={() => setDocActionTarget({ id: doc.id, label: titleCase(doc.doc_type), action: "invalidate" })}
                    >
                      <XCircle className="h-3.5 w-3.5 text-danger" /> Mark Invalid
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-text">Cross-Document Check</h2>
            <MismatchTable mismatches={application.mismatches} />
          </section>
        </div>

        {/* RIGHT: Eligibility + decision */}
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-text">Eligibility Engine</h2>
            {application.eligibility ? <EligibilityPanel eligibility={application.eligibility} /> : <p className="text-sm text-text-secondary">Not yet evaluated.</p>}
          </section>

          {canDecide && (
            <section className="card p-5">
              <h2 className="mb-1 font-semibold text-text">Officer Decision</h2>
              <p className="mb-4 text-xs text-text-secondary">
                AI assists with verification and rules determine formal eligibility, but the final decision is always yours.
              </p>

              <Button variant="warning" className="w-full" onClick={() => setShowCorrection(true)}>
                <MessageSquareWarning className="h-4 w-4" /> Request Correction
              </Button>
              <p className="mb-4 mt-1.5 text-xs text-text-secondary">Not final — sends the applicant back to fix a specific issue.</p>

              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Final decision</p>
                <Button className="w-full" onClick={() => setShowApprove(true)}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
                <Button variant="danger" className="w-full" onClick={() => setShowReject(true)}>
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 font-semibold text-text">Audit Trail</h2>
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {auditLogs?.map((log) => (
            <div key={log.id} className="border-l-2 border-border pl-3 text-sm">
              <p className="text-text">{log.action}</p>
              {log.details && <p className="text-xs text-text-secondary">{log.details}</p>}
              <p className="text-xs text-text-secondary/70">
                {formatDateTime(log.created_at)} · {log.actor_name}
              </p>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={showApprove}
        onClose={() => setShowApprove(false)}
        onConfirm={(reason) =>
          approveMutation.mutate(reason?.trim() ? reason.trim() : "All eligibility criteria and submitted documents were reviewed and found satisfactory.")
        }
        title="Approve Application"
        description={`Approve ${application.display_id} for ${application.applicant_name}? This will notify the applicant.`}
        confirmLabel="Approve"
        requireReason
        reasonOptional
        reasonLabel="Decision note"
        isLoading={approveMutation.isPending}
      />

      <ConfirmDialog
        open={showReject}
        onClose={() => setShowReject(false)}
        onConfirm={(reason) => rejectMutation.mutate(reason ?? "")}
        title="Reject Application"
        description={`Reject ${application.display_id} for ${application.applicant_name}? A reason is required and will be shown to the applicant.`}
        confirmLabel="Reject"
        variant="danger"
        requireReason
        reasonLabel="Reason for rejection"
        isLoading={rejectMutation.isPending}
      />

      <ConfirmDialog
        open={!!docActionTarget && docActionTarget.action === "verify"}
        onClose={() => setDocActionTarget(null)}
        onConfirm={(reason) => verifyDocMutation.mutate(reason)}
        title="Verify Document"
        description={`Mark ${docActionTarget?.label ?? "this document"} as verified? This is the officer's final confirmation, independent of the automated result.`}
        confirmLabel="Verify"
        requireReason
        reasonOptional
        reasonLabel="Note (optional)"
        isLoading={verifyDocMutation.isPending}
      />

      <ConfirmDialog
        open={!!docActionTarget && docActionTarget.action === "invalidate"}
        onClose={() => setDocActionTarget(null)}
        onConfirm={(reason) => invalidateDocMutation.mutate(reason ?? "")}
        title="Mark Document Invalid"
        description={`Mark ${docActionTarget?.label ?? "this document"} as invalid? A reason is required and will be shown to the applicant.`}
        confirmLabel="Mark Invalid"
        variant="danger"
        requireReason
        reasonLabel="Reason"
        isLoading={invalidateDocMutation.isPending}
      />

      <Modal
        open={showCorrection}
        onClose={() => setShowCorrection(false)}
        title="Request Correction"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCorrection(false)}>
              Cancel
            </Button>
            <Button
              disabled={!correctionIssue.trim() || !correctionComment.trim()}
              isLoading={correctionMutation.isPending}
              onClick={() => correctionMutation.mutate()}
            >
              Send Request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Document (optional)" value={correctionDoc} onChange={(e) => setCorrectionDoc(e.target.value)}>
            <option value="">General / not document-specific</option>
            {application.documents.map((d) => (
              <option key={d.id} value={d.id}>
                {titleCase(d.doc_type)}
              </option>
            ))}
          </Select>
          <Input label="Issue" value={correctionIssue} onChange={(e) => setCorrectionIssue(e.target.value)} placeholder="e.g. Income certificate unreadable" />
          <Textarea label="Comment" value={correctionComment} onChange={(e) => setCorrectionComment(e.target.value)} placeholder="Explain what the applicant needs to do." />
          <Input
            label="Deadline (optional)"
            type="date"
            value={correctionDeadline}
            onChange={(e) => setCorrectionDeadline(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>
      </Modal>
    </div>
  );
}
