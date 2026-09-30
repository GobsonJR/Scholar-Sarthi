from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_officer
from app.models.application import Application
from app.models.document import Document, DocumentReview
from app.models.user import User
from app.schemas.document import DocumentOut, DocumentReviewRequest
from app.services.analysis_service import refresh_application_analysis
from app.services.audit_service import log_action
from app.services.notification_service import notify

router = APIRouter(prefix="/officer/documents", tags=["officer-documents"])


def _get_document(db: Session, document_id: str) -> Document:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    application = db.get(Application, document.application_id)
    if not application or application.status == "DRAFT":
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.post("/{document_id}/verify", response_model=DocumentOut)
def verify_document(document_id: str, payload: DocumentReviewRequest, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    """Officer confirms a document is acceptable — the human always makes the
    final call, regardless of what the AI pipeline's automated result was."""
    document = _get_document(db, document_id)
    application = db.get(Application, document.application_id)

    document.status = "VERIFIED"
    if document.verification:
        document.verification.review_required = False

    db.add(DocumentReview(document_id=document.id, action="VERIFIED", reason=payload.reason or "Verified by officer.", officer_id=officer.id))
    log_action(
        db, actor_id=officer.id, actor_name=officer.full_name,
        action=f"Verified document: {document.doc_type.replace('_', ' ').title()}",
        application_id=application.id, details=payload.reason,
    )
    db.flush()
    refresh_application_analysis(db, application)
    db.commit()
    db.refresh(document)
    return document


@router.post("/{document_id}/invalidate", response_model=DocumentOut)
def invalidate_document(document_id: str, payload: DocumentReviewRequest, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    document = _get_document(db, document_id)
    application = db.get(Application, document.application_id)
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required to mark a document invalid.")

    document.status = "INVALID"
    if document.verification:
        document.verification.review_required = False

    db.add(DocumentReview(document_id=document.id, action="INVALID", reason=payload.reason, officer_id=officer.id))
    log_action(
        db, actor_id=officer.id, actor_name=officer.full_name,
        action=f"Marked document invalid: {document.doc_type.replace('_', ' ').title()}",
        application_id=application.id, details=payload.reason,
    )
    notify(
        db, user_id=application.applicant_id, title="Document marked invalid",
        message=f"{document.doc_type.replace('_', ' ').title()}: {payload.reason}", type="ERROR", application_id=application.id,
    )
    db.flush()
    refresh_application_analysis(db, application)
    db.commit()
    db.refresh(document)
    return document
