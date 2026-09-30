import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models.application import Application, CorrectionRequest, EligibilityResult, MismatchResult
from app.models.document import Document
from app.models.scheme import Scheme
from app.models.user import User
from app.services import ai_pipeline
from app.services.explain import explain_mismatch

router = APIRouter(tags=["ai"])
settings = get_settings()


def _owned_or_officer(db: Session, application_id: str, user: User) -> Application:
    application = db.get(Application, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    if user.role == "applicant" and application.applicant_id != user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    if user.role == "officer" and application.status == "DRAFT":
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.get("/documents/{document_id}/file")
def get_document_file(document_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    application = db.get(Application, document.application_id)
    if user.role == "applicant" and application.applicant_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    if user.role == "officer" and application.status == "DRAFT":
        raise HTTPException(status_code=404, detail="Document not found")

    path = os.path.join(settings.upload_dir, document.stored_filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not available")
    return FileResponse(path, media_type=document.content_type, filename=document.original_filename)


@router.post("/ai/mismatch/{application_id}")
def run_mismatch_preview(application_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Standalone endpoint exposing the cross-document mismatch AI module directly, per the documented AI pipeline API."""
    application = _owned_or_officer(db, application_id, user)
    documents = db.query(Document).filter(Document.application_id == application.id).all()
    documents_data = [
        {"doc_type": d.doc_type, "extracted_fields": d.extraction.extracted_fields if d.extraction else {}}
        for d in documents
    ]
    results = ai_pipeline.detect_mismatches(documents_data)
    return [{**r, "explanation": explain_mismatch(r)} for r in results]


@router.get("/assistant/context/{application_id}")
def assistant_context(application_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    application = _owned_or_officer(db, application_id, user)
    scheme = db.get(Scheme, application.scheme_id)
    return {
        "display_id": application.display_id,
        "status": application.status,
        "scheme_name": scheme.name if scheme else None,
        "deadline": scheme.deadline.isoformat() if scheme else None,
    }


@router.post("/assistant/ask")
def assistant_ask(payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Deterministic, data-grounded AI assistant. No external API key required:
    answers are generated from the applicant's own application state rather
    than a general-purpose language model, keeping every answer verifiable."""
    question = (payload.get("question") or "").strip()
    application_id = payload.get("application_id")

    if not question:
        return {"answer": "Please type a question about your scheme, application status, documents or deadlines."}

    application = None
    scheme = None
    if application_id:
        application = db.get(Application, application_id)
        if application and user.role == "applicant" and application.applicant_id != user.id:
            application = None
        if application:
            scheme = db.get(Scheme, application.scheme_id)

    q = question.lower()

    if not application:
        return {
            "answer": "I can answer questions once you select an application. Open one of your applications and ask "
            "me about its status, flags, required documents or deadlines from there."
        }

    if any(word in q for word in ["flag", "mismatch", "issue", "wrong", "why was"]):
        mismatches = db.query(MismatchResult).filter(
            MismatchResult.application_id == application.id, MismatchResult.is_mismatch.is_(True)
        ).all()
        flagged_docs = db.query(Document).filter(
            Document.application_id == application.id, Document.status.in_(["NEEDS_REVIEW", "INVALID"])
        ).all()
        if not mismatches and not flagged_docs:
            return {"answer": "Good news — your application currently has no verification flags or cross-document mismatches."}
        parts = []
        for m in mismatches:
            parts.append(explain_mismatch({"field": m.field, "is_mismatch": m.is_mismatch, "values": m.values}))
        for d in flagged_docs:
            reasons = d.verification.reasons if d.verification else []
            parts.append(f"{d.doc_type.replace('_', ' ').title()}: {' '.join(reasons)}")
        return {"answer": " ".join(parts) + " This does not automatically mean rejection — an officer will review it manually."}

    if any(word in q for word in ["document", "upload", "need", "required"]):
        required = scheme.required_documents if scheme else []
        submitted = {d.doc_type for d in db.query(Document).filter(Document.application_id == application.id).all()}
        missing = [d for d in required if d not in submitted]
        if missing:
            return {"answer": f"You still need to upload: {', '.join(m.replace('_', ' ').title() for m in missing)}."}
        return {"answer": "All required documents for this scheme have been uploaded."}

    if any(word in q for word in ["status", "track", "where", "stage"]):
        return {"answer": f"Application {application.display_id} is currently in status: {application.status.replace('_', ' ').title()}."}

    if any(word in q for word in ["eligib", "qualify"]):
        eligibility_row = (
            db.query(EligibilityResult).filter(EligibilityResult.application_id == application.id)
            .order_by(EligibilityResult.created_at.desc()).first()
        )
        if not eligibility_row:
            return {"answer": "Eligibility has not been evaluated yet — this happens automatically once you submit your application with all required documents."}
        return {"answer": eligibility_row.explanation}

    if any(word in q for word in ["deadline", "date", "when", "close"]):
        if scheme:
            return {"answer": f"The deadline for {scheme.name} is {scheme.deadline.isoformat()}."}

    if any(word in q for word in ["correct", "fix", "reupload", "re-upload"]):
        open_corrections = db.query(CorrectionRequest).filter(
            CorrectionRequest.application_id == application.id, CorrectionRequest.status == "OPEN"
        ).all()
        if not open_corrections:
            return {"answer": "There are no pending correction requests on this application right now."}
        details = "; ".join(f"{c.issue}: {c.comment}" for c in open_corrections)
        return {"answer": f"You have open correction request(s): {details}. Re-upload the affected document(s) from the Documents tab."}

    return {
        "answer": f"Application {application.display_id} for {scheme.name if scheme else 'this scheme'} is currently "
        f"{application.status.replace('_', ' ').title()}. You can ask me about its status, required documents, "
        "verification flags, eligibility, or the scheme's deadline."
    }
