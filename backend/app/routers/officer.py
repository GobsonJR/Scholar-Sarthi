import csv
import io
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_officer
from app.models.application import (
    Application,
    CorrectionRequest,
    Decision,
    EligibilityResult,
    MismatchResult,
)
from app.models.document import Document
from app.models.scheme import Scheme
from app.models.user import User
from app.routers.applications import _serialize_detail
from app.schemas.application import (
    ApplicationDetailOut,
    CorrectionRequestCreate,
    CorrectionRequestOut,
    DecisionOut,
    DecisionRequest,
    OfficerApplicationListItem,
)
from app.schemas.officer import DocumentVerificationStats, MonthlyCount, OfficerStatistics, StatusCount
from app.services.audit_service import log_action
from app.services.notification_service import notify

router = APIRouter(prefix="/officer", tags=["officer"])


def _get_submitted_application(db: Session, application_id: str) -> Application:
    """Officers act only on applications the applicant has actually
    submitted — a DRAFT is invisible to the queue (list_officer_applications
    excludes it) and to direct-id reads (get_officer_application), so
    write actions (approve/reject/request-correction) must refuse it the
    same way rather than silently mutating an application the officer was
    never supposed to see."""
    application = db.get(Application, application_id)
    if not application or application.status == "DRAFT":
        raise HTTPException(status_code=404, detail="Application not found")
    return application


def _is_flagged(db: Session, application_id: str) -> bool:
    has_mismatch = (
        db.query(MismatchResult)
        .filter(MismatchResult.application_id == application_id, MismatchResult.is_mismatch.is_(True))
        .first()
        is not None
    )
    has_flagged_doc = (
        db.query(Document)
        .filter(
            Document.application_id == application_id,
            Document.is_current.is_(True),
            Document.status.in_(["NEEDS_REVIEW", "INVALID"]),
        )
        .first()
        is not None
    )
    return has_mismatch or has_flagged_doc


@router.get("/applications", response_model=list[OfficerApplicationListItem])
def list_officer_applications(
    db: Session = Depends(get_db),
    officer: User = Depends(require_officer),
    status: str | None = None,
    scheme_id: str | None = None,
    flagged: bool | None = None,
    search: str | None = None,
):
    query = db.query(Application).filter(Application.status != "DRAFT")
    if status:
        query = query.filter(Application.status == status)
    if scheme_id:
        query = query.filter(Application.scheme_id == scheme_id)

    applications = query.order_by(Application.updated_at.desc()).all()

    items = []
    for app in applications:
        applicant = db.get(User, app.applicant_id)
        scheme = db.get(Scheme, app.scheme_id)
        eligibility_row = (
            db.query(EligibilityResult)
            .filter(EligibilityResult.application_id == app.id)
            .order_by(EligibilityResult.created_at.desc())
            .first()
        )
        doc_count = db.query(Document).filter(Document.application_id == app.id, Document.is_current.is_(True)).count()
        is_flagged = _is_flagged(db, app.id)

        if flagged is not None and is_flagged != flagged:
            continue
        if search:
            haystack = f"{applicant.full_name} {applicant.email} {app.display_id}".lower()
            if search.lower() not in haystack:
                continue

        items.append(
            OfficerApplicationListItem(
                id=app.id,
                display_id=app.display_id,
                status=app.status,
                applicant_name=applicant.full_name,
                applicant_email=applicant.email,
                scheme_name=scheme.name,
                scheme_id=scheme.id,
                submitted_at=app.submitted_at,
                updated_at=app.updated_at,
                flagged=is_flagged,
                eligible=eligibility_row.eligible if eligibility_row else None,
                document_count=doc_count,
            )
        )

    return items


@router.get("/applications/{application_id}", response_model=ApplicationDetailOut)
def get_officer_application(application_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    application = db.get(Application, application_id)
    # DRAFT applications aren't submitted yet and are excluded from the
    # officer queue (list_officer_applications) — direct-ID access must
    # match that, not leak an applicant's still-unsubmitted data.
    if not application or application.status == "DRAFT":
        raise HTTPException(status_code=404, detail="Application not found")
    return _serialize_detail(db, application)


@router.post("/applications/{application_id}/corrections", response_model=CorrectionRequestOut)
def request_correction(
    application_id: str,
    payload: CorrectionRequestCreate,
    db: Session = Depends(get_db),
    officer: User = Depends(require_officer),
):
    application = _get_submitted_application(db, application_id)

    correction = CorrectionRequest(
        application_id=application_id,
        document_id=payload.document_id,
        issue=payload.issue,
        comment=payload.comment,
        deadline=payload.deadline,
        created_by=officer.id,
    )
    db.add(correction)
    application.status = "CORRECTION_REQUIRED"

    log_action(
        db, actor_id=officer.id, actor_name=officer.full_name,
        action=f"Requested correction: {payload.issue}", application_id=application_id, details=payload.comment,
    )
    notify(
        db,
        user_id=application.applicant_id,
        title="Correction required",
        message=f"{payload.issue}: {payload.comment}",
        type="WARNING",
        application_id=application_id,
    )
    db.commit()
    db.refresh(correction)
    return correction


@router.post("/applications/{application_id}/approve", response_model=DecisionOut)
def approve_application(
    application_id: str,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    officer: User = Depends(require_officer),
):
    application = _get_submitted_application(db, application_id)

    decision = Decision(application_id=application_id, decision="APPROVED", reason=payload.reason, officer_id=officer.id)
    db.add(decision)
    application.status = "APPROVED"

    log_action(db, actor_id=officer.id, actor_name=officer.full_name, action="Approved application", application_id=application_id, details=payload.reason)
    notify(
        db,
        user_id=application.applicant_id,
        title="Application approved",
        message=f"Congratulations! Your application {application.display_id} has been approved. Reason: {payload.reason}",
        type="SUCCESS",
        application_id=application_id,
    )
    db.commit()
    db.refresh(decision)
    return decision


@router.post("/applications/{application_id}/reject", response_model=DecisionOut)
def reject_application(
    application_id: str,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    officer: User = Depends(require_officer),
):
    application = _get_submitted_application(db, application_id)
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required to reject an application")

    decision = Decision(application_id=application_id, decision="REJECTED", reason=payload.reason, officer_id=officer.id)
    db.add(decision)
    application.status = "REJECTED"

    log_action(db, actor_id=officer.id, actor_name=officer.full_name, action="Rejected application", application_id=application_id, details=payload.reason)
    notify(
        db,
        user_id=application.applicant_id,
        title="Application rejected",
        message=f"Your application {application.display_id} was not approved. Reason: {payload.reason}",
        type="ERROR",
        application_id=application_id,
    )
    db.commit()
    db.refresh(decision)
    return decision


@router.get("/statistics", response_model=OfficerStatistics)
def officer_statistics(db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    applications = db.query(Application).filter(Application.status != "DRAFT").all()

    status_counts = Counter(a.status for a in applications)
    total = len(applications)
    pending_review = status_counts.get("UNDER_OFFICER_REVIEW", 0) + status_counts.get("UNDER_VERIFICATION", 0)
    correction_required = status_counts.get("CORRECTION_REQUIRED", 0) + status_counts.get("RESUBMITTED", 0)
    approved = status_counts.get("APPROVED", 0)
    rejected = status_counts.get("REJECTED", 0)

    flagged_count = sum(1 for a in applications if _is_flagged(db, a.id))

    processing_days = []
    for a in applications:
        if a.submitted_at and a.status in ("APPROVED", "REJECTED"):
            decision = (
                db.query(Decision).filter(Decision.application_id == a.id).order_by(Decision.created_at.desc()).first()
            )
            if decision:
                delta = decision.created_at - a.submitted_at
                processing_days.append(max(delta.total_seconds() / 86400, 0))
    avg_days = round(sum(processing_days) / len(processing_days), 1) if processing_days else 0.0

    monthly = Counter()
    for a in applications:
        if a.submitted_at:
            key = a.submitted_at.strftime("%Y-%m")
            monthly[key] += 1

    issue_freq = Counter()
    docs = (
        db.query(Document)
        .join(Application, Document.application_id == Application.id)
        .filter(Application.status != "DRAFT", Document.is_current.is_(True))
        .all()
    )
    for d in docs:
        if d.status in ("NEEDS_REVIEW", "INVALID"):
            issue_freq[d.doc_type.replace("_", " ").title()] += 1

    high_risk_flags = sum(1 for d in docs if d.verification and d.verification.authenticity_risk == "HIGH")
    doc_stats = DocumentVerificationStats(
        total_documents=len(docs),
        verified=sum(1 for d in docs if d.status == "VERIFIED"),
        needs_review=sum(1 for d in docs if d.status == "NEEDS_REVIEW"),
        verification_failed=sum(1 for d in docs if d.status == "INVALID"),
        high_risk_flags=high_risk_flags,
    )

    return OfficerStatistics(
        total_applications=total,
        pending_review=pending_review,
        correction_required=correction_required,
        approved=approved,
        rejected=rejected,
        verification_flags=flagged_count,
        avg_processing_days=avg_days,
        status_distribution=[StatusCount(status=k, count=v) for k, v in status_counts.items()],
        monthly_applications=[MonthlyCount(month=k, count=v) for k, v in sorted(monthly.items())],
        document_issue_frequency=[StatusCount(status=k, count=v) for k, v in issue_freq.items()],
        document_verification=doc_stats,
    )


@router.get("/reports/export")
def export_report(db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    applications = db.query(Application).filter(Application.status != "DRAFT").all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Application ID", "Applicant", "Scheme", "Status", "Submitted At", "Eligible", "Flagged"])
    for a in applications:
        applicant = db.get(User, a.applicant_id)
        scheme = db.get(Scheme, a.scheme_id)
        eligibility_row = (
            db.query(EligibilityResult).filter(EligibilityResult.application_id == a.id).order_by(EligibilityResult.created_at.desc()).first()
        )
        writer.writerow([
            a.display_id,
            applicant.full_name if applicant else "",
            scheme.name if scheme else "",
            a.status,
            a.submitted_at.isoformat() if a.submitted_at else "",
            eligibility_row.eligible if eligibility_row else "",
            _is_flagged(db, a.id),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=applications_report.csv"},
    )
