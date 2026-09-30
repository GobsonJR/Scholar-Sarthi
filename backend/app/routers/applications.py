from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_applicant
from app.models.application import Application, CorrectionRequest, EligibilityResult, MismatchResult
from app.models.document import Document
from app.models.scheme import Scheme
from app.models.user import User
from app.schemas.application import (
    ApplicationCreateRequest,
    ApplicationDetailOut,
    ApplicationOut,
    ApplicationUpdateRequest,
    CorrectionRequestOut,
)
from app.services.analysis_service import refresh_application_analysis
from app.services.audit_service import log_action
from app.services.explain import explain_mismatch
from app.services.notification_service import notify

router = APIRouter(prefix="/applications", tags=["applications"])


def _next_display_id(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.query(Application).filter(Application.display_id.like(f"APP-{year}-%")).count()
    return f"APP-{year}-{count + 1:05d}"


def _serialize_detail(db: Session, application: Application, applicant: User | None = None) -> ApplicationDetailOut:
    documents = (
        db.query(Document)
        .filter(Document.application_id == application.id, Document.is_current.is_(True))
        .order_by(Document.uploaded_at)
        .all()
    )
    mismatch_rows = db.query(MismatchResult).filter(MismatchResult.application_id == application.id).all()
    eligibility_row = (
        db.query(EligibilityResult)
        .filter(EligibilityResult.application_id == application.id)
        .order_by(EligibilityResult.created_at.desc())
        .first()
    )

    mismatches = [
        {
            "field": m.field,
            "is_mismatch": m.is_mismatch,
            "severity": m.severity,
            "similarity": m.similarity,
            "values": m.values,
            "explanation": explain_mismatch(
                {"field": m.field, "is_mismatch": m.is_mismatch, "values": m.values}
            ),
        }
        for m in mismatch_rows
    ]

    eligibility = None
    if eligibility_row:
        eligibility = {
            "eligible": eligibility_row.eligible,
            "criteria": eligibility_row.criteria,
            "explanation": eligibility_row.explanation,
        }

    applicant_user = applicant or db.get(User, application.applicant_id)

    base = ApplicationOut.model_validate(application)
    return ApplicationDetailOut(
        **base.model_dump(),
        documents=documents,
        mismatches=mismatches,
        eligibility=eligibility,
        applicant_name=applicant_user.full_name if applicant_user else None,
        applicant_email=applicant_user.email if applicant_user else None,
    )


def _get_owned_application(db: Session, application_id: str, user: User) -> Application:
    application = db.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if user.role == "applicant" and application.applicant_id != user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    # A DRAFT application hasn't been submitted yet and is excluded from the
    # officer queue (list_officer_applications) — direct-ID access must be
    # blocked the same way, or an officer who knows/guesses an id could read
    # an applicant's unsubmitted personal/financial data early.
    if user.role == "officer" and application.status == "DRAFT":
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.post("", response_model=ApplicationOut)
def create_application(payload: ApplicationCreateRequest, db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    scheme = db.get(Scheme, payload.scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")

    existing = (
        db.query(Application)
        .filter(Application.applicant_id == user.id, Application.scheme_id == payload.scheme_id, Application.status == "DRAFT")
        .first()
    )
    if existing:
        return existing

    if scheme.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="This scheme is not currently accepting new applications.")

    profile = user.applicant_profile
    personal_info = {"full_name": user.full_name, "phone": user.phone}
    if profile:
        personal_info.update({"dob": profile.dob, "gender": profile.gender, "address": profile.address})
    category_info = {"category": profile.category} if profile and profile.category else {}

    application = Application(
        display_id=_next_display_id(db),
        applicant_id=user.id,
        scheme_id=payload.scheme_id,
        scheme_version=scheme.version,
        status="DRAFT",
        personal_info=personal_info,
        academic_info={},
        financial_info={},
        category_info=category_info,
        current_step=1,
    )
    db.add(application)
    log_action(db, actor_id=user.id, actor_name=user.full_name, action=f"Started application for {scheme.name}", application_id=application.id)
    db.commit()
    db.refresh(application)
    return application


@router.get("", response_model=list[ApplicationOut])
def list_applications(db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    return (
        db.query(Application)
        .filter(Application.applicant_id == user.id)
        .order_by(Application.updated_at.desc())
        .all()
    )


@router.get("/{application_id}", response_model=ApplicationDetailOut)
def get_application(application_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    application = _get_owned_application(db, application_id, user)
    return _serialize_detail(db, application)


@router.get("/{application_id}/corrections", response_model=list[CorrectionRequestOut])
def list_corrections(application_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    application = _get_owned_application(db, application_id, user)
    return (
        db.query(CorrectionRequest)
        .filter(CorrectionRequest.application_id == application.id)
        .order_by(CorrectionRequest.created_at.desc())
        .all()
    )


@router.patch("/{application_id}", response_model=ApplicationOut)
def update_application(
    application_id: str,
    payload: ApplicationUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_applicant),
):
    application = _get_owned_application(db, application_id, user)
    if application.status not in ("DRAFT", "CORRECTION_REQUIRED"):
        raise HTTPException(status_code=400, detail="Application can no longer be edited")

    if payload.personal_info is not None:
        application.personal_info = {**application.personal_info, **payload.personal_info}
    if payload.academic_info is not None:
        application.academic_info = {**application.academic_info, **payload.academic_info}
    if payload.financial_info is not None:
        application.financial_info = {**application.financial_info, **payload.financial_info}
    if payload.category_info is not None:
        application.category_info = {**application.category_info, **payload.category_info}
    if payload.current_step is not None:
        application.current_step = payload.current_step

    db.commit()
    db.refresh(application)
    return application


@router.post("/{application_id}/submit", response_model=ApplicationDetailOut)
def submit_application(application_id: str, db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    application = _get_owned_application(db, application_id, user)
    if application.status not in ("DRAFT",):
        raise HTTPException(status_code=400, detail="Application has already been submitted")

    documents = db.query(Document).filter(Document.application_id == application_id).all()
    scheme = db.get(Scheme, application.scheme_id)
    submitted_types = {d.doc_type for d in documents}
    missing = set(scheme.required_documents or []) - submitted_types
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required documents: {', '.join(sorted(missing))}")

    application.submitted_at = datetime.now(timezone.utc)
    application.status = "UNDER_VERIFICATION"
    application.current_step = 8

    log_action(db, actor_id=user.id, actor_name=user.full_name, action="Application submitted", application_id=application.id)
    analysis = refresh_application_analysis(db, application)
    log_action(db, actor_id=None, actor_name="AI Pipeline", action="AI verification completed", application_id=application.id,
               details=f"Eligible: {analysis['eligibility']['eligible']}")

    notify(
        db,
        user_id=user.id,
        title="Application submitted",
        message=f"Your application {application.display_id} for {scheme.name} has been submitted and is now under AI-assisted verification.",
        type="INFO",
        application_id=application.id,
    )

    application.status = "UNDER_OFFICER_REVIEW"
    log_action(db, actor_id=None, actor_name="System", action="Moved to officer review queue", application_id=application.id)
    notify(
        db,
        user_id=user.id,
        title="Application under officer review",
        message=f"Your application {application.display_id} has completed automated checks and is now awaiting officer review.",
        type="INFO",
        application_id=application.id,
    )

    db.commit()
    db.refresh(application)
    return _serialize_detail(db, application)


@router.post("/{application_id}/resubmit", response_model=ApplicationDetailOut)
def resubmit_application(application_id: str, db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    application = _get_owned_application(db, application_id, user)
    if application.status != "CORRECTION_REQUIRED":
        raise HTTPException(status_code=400, detail="No correction is pending for this application")

    application.status = "RESUBMITTED"
    open_corrections = (
        db.query(CorrectionRequest)
        .filter(CorrectionRequest.application_id == application_id, CorrectionRequest.status == "OPEN")
        .all()
    )
    for c in open_corrections:
        c.status = "RESOLVED"
        c.resolved_at = datetime.now(timezone.utc)

    log_action(db, actor_id=user.id, actor_name=user.full_name, action="Applicant resubmitted application", application_id=application.id)
    analysis = refresh_application_analysis(db, application)
    log_action(db, actor_id=None, actor_name="AI Pipeline", action="AI re-verification completed", application_id=application.id,
               details=f"Eligible: {analysis['eligibility']['eligible']}")

    application.status = "UNDER_OFFICER_REVIEW"
    notify(
        db,
        user_id=user.id,
        title="Resubmission received",
        message=f"Your corrected documents for {application.display_id} were re-verified and sent back to the officer for review.",
        type="INFO",
        application_id=application.id,
    )

    db.commit()
    db.refresh(application)
    return _serialize_detail(db, application)
