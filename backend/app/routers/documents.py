import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import require_applicant
from app.models.application import Application
from app.models.document import DOCUMENT_TYPES, Document, DocumentExtraction, DocumentReview, VerificationResult
from app.models.scheme import SchemeDocument
from app.models.user import User
from app.schemas.document import DocumentHistoryOut, DocumentOut
from app.services import ai_pipeline
from app.services.analysis_service import refresh_application_analysis
from app.services.audit_service import log_action

router = APIRouter(tags=["documents"])
settings = get_settings()

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/jpg", "image/png"}
MAX_FILE_SIZE = 10 * 1024 * 1024


def _owned_application(db: Session, application_id: str, user: User) -> Application:
    application = db.get(Application, application_id)
    if not application or application.applicant_id != user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


def _owned_document(db: Session, document_id: str, user: User) -> Document:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    application = db.get(Application, document.application_id)
    if not application or application.applicant_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def _matching_scheme_document(application: Application, doc_type: str) -> SchemeDocument | None:
    for sd in application.scheme.documents:
        if sd.document_type == doc_type:
            return sd
    return None


def _validate_against_scheme_document(scheme_document: SchemeDocument | None, *, content_type: str, size: int) -> None:
    """Per-document accepted-type and max-size configuration, falling back to
    the server-wide defaults for a document type the scheme doesn't configure
    (e.g. the applicant's own account-level documents)."""
    accepted = scheme_document.accepted_file_types if scheme_document else list(ALLOWED_CONTENT_TYPES)
    max_bytes = (scheme_document.max_file_size_mb if scheme_document else 10) * 1024 * 1024
    max_bytes = min(max_bytes, MAX_FILE_SIZE)  # server hard cap always applies
    if content_type not in accepted:
        friendly = ", ".join(t.split("/")[-1].upper() for t in accepted)
        raise HTTPException(status_code=400, detail=f"File type not supported. Accepted formats: {friendly}.")
    if size > max_bytes:
        raise HTTPException(status_code=400, detail=f"File is too large. Maximum size is {max_bytes // (1024 * 1024)}MB.")
    if size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")


def _store_and_process(
    db: Session,
    *,
    application: Application,
    doc_type: str,
    original_filename: str,
    content_type: str,
    contents: bytes,
    previous: Document | None,
    actor: User,
    source_language_hint: str | None = None,
) -> Document:
    """Creates a new (current) Document row, running it through the AI
    pipeline with this scheme's configured expected fields / authenticity
    settings, and supersedes `previous` (if any) rather than deleting it —
    document history is preserved."""

    os.makedirs(settings.upload_dir, exist_ok=True)
    extension = os.path.splitext(original_filename or "")[1] or ".bin"
    stored_filename = f"{uuid.uuid4().hex}{extension}"
    with open(os.path.join(settings.upload_dir, stored_filename), "wb") as f:
        f.write(contents)

    scheme_document = _matching_scheme_document(application, doc_type)

    document = Document(
        application_id=application.id,
        scheme_document_id=scheme_document.id if scheme_document else None,
        doc_type=doc_type,
        original_filename=original_filename or "document",
        stored_filename=stored_filename,
        content_type=content_type,
        file_size=len(contents),
        status="PROCESSING",
        version=(previous.version + 1) if previous else 1,
        is_current=True,
    )
    db.add(document)
    db.flush()

    result = ai_pipeline.process_document(
        document_id=document.id,
        doc_type=doc_type,
        contents=contents,
        content_type=content_type,
        original_filename=original_filename,
        expected_fields=scheme_document.expected_fields if scheme_document else [],
        authenticity_check_required=scheme_document.authenticity_check_required if scheme_document else True,
        source_language_hint=source_language_hint,
    )
    extraction = result["extraction"]
    verification = result["verification"]

    db.add(
        DocumentExtraction(
            document_id=document.id,
            extracted_fields=extraction["extracted_fields"],
            confidence=extraction["confidence"],
            raw_text_preview=extraction["raw_text_preview"],
        )
    )
    db.add(
        VerificationResult(
            document_id=document.id,
            result=verification["result"],
            reasons=verification["reasons"],
            document_type_match=verification["document_type_match"],
            expected_fields_found=verification["expected_fields_found"],
            expected_fields_missing=verification["expected_fields_missing"],
            authenticity_risk=verification["authenticity_risk"],
            authenticity_notes=verification["authenticity_notes"],
            review_required=verification["review_required"],
            expected_document_type=verification.get("expected_document_type"),
            detected_document_type=verification.get("detected_document_type"),
            document_type_detection_method=verification.get("document_type_detection_method"),
            layoutlm_result=verification.get("layoutlm"),
            translation_result=verification.get("translation"),
        )
    )
    document.status = verification["result"]
    document.processed_at = datetime.now(timezone.utc)

    if previous:
        previous.is_current = False
        previous.superseded_by_id = document.id

    log_action(
        db, actor_id=actor.id, actor_name=actor.full_name,
        action=f"{'Re-uploaded' if previous else 'Uploaded'} document: {doc_type.replace('_', ' ').title()} (v{document.version})",
        application_id=application.id, details=f"Verification result: {verification['result']}",
    )

    db.flush()
    refresh_application_analysis(db, application)
    return document


@router.post("/applications/{application_id}/documents", response_model=DocumentOut)
async def upload_document(
    application_id: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    source_language_hint: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_applicant),
):
    """`source_language_hint` is optional (e.g. "tam_Taml", "hin_Deva") — if
    the applicant knows the document is in a supported Indian language, this
    selects the matching OCR recognition model up front. Omitted (the
    default), this is the exact Phase 4/5 path, byte-for-byte unchanged."""
    application = _owned_application(db, application_id, user)

    if doc_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown document type")

    contents = await file.read()
    _validate_against_scheme_document(_matching_scheme_document(application, doc_type), content_type=file.content_type, size=len(contents))

    previous = (
        db.query(Document)
        .filter(Document.application_id == application_id, Document.doc_type == doc_type, Document.is_current.is_(True))
        .first()
    )

    document = _store_and_process(
        db, application=application, doc_type=doc_type, original_filename=file.filename or "document",
        content_type=file.content_type, contents=contents, previous=previous, actor=user,
        source_language_hint=source_language_hint,
    )
    db.commit()
    db.refresh(document)
    return document


@router.post("/documents/{document_id}/replace", response_model=DocumentOut)
async def replace_document(
    document_id: str,
    file: UploadFile = File(...),
    source_language_hint: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_applicant),
):
    """Replace an existing document by its own id (used by the "Replace
    Document" action on a document card) — same versioning behavior as a
    normal re-upload through the wizard."""
    previous = _owned_document(db, document_id, user)
    if not previous.is_current:
        raise HTTPException(status_code=400, detail="This document has already been replaced by a newer version.")
    application = db.get(Application, previous.application_id)

    contents = await file.read()
    _validate_against_scheme_document(_matching_scheme_document(application, previous.doc_type), content_type=file.content_type, size=len(contents))

    document = _store_and_process(
        db, application=application, doc_type=previous.doc_type, original_filename=file.filename or "document",
        content_type=file.content_type, contents=contents, previous=previous, actor=user,
        source_language_hint=source_language_hint,
    )
    db.commit()
    db.refresh(document)
    return document


@router.post("/documents/{document_id}/reprocess", response_model=DocumentOut)
def reprocess_document(document_id: str, db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    document = _owned_document(db, document_id, user)
    application = db.get(Application, document.application_id)
    scheme_document = _matching_scheme_document(application, document.doc_type)

    stored_path = os.path.join(settings.upload_dir, document.stored_filename)
    if not os.path.exists(stored_path):
        raise HTTPException(status_code=404, detail="Stored file for this document is missing; re-upload instead.")
    with open(stored_path, "rb") as f:
        contents = f.read()

    result = ai_pipeline.process_document(
        document_id=document.id,
        doc_type=document.doc_type,
        contents=contents,
        content_type=document.content_type,
        original_filename=document.original_filename,
        expected_fields=scheme_document.expected_fields if scheme_document else [],
        authenticity_check_required=scheme_document.authenticity_check_required if scheme_document else True,
    )
    extraction = result["extraction"]
    verification = result["verification"]

    if document.extraction:
        db.delete(document.extraction)
    if document.verification:
        db.delete(document.verification)
    db.flush()

    db.add(
        DocumentExtraction(
            document_id=document.id, extracted_fields=extraction["extracted_fields"],
            confidence=extraction["confidence"], raw_text_preview=extraction["raw_text_preview"],
        )
    )
    db.add(
        VerificationResult(
            document_id=document.id, result=verification["result"], reasons=verification["reasons"],
            document_type_match=verification["document_type_match"], expected_fields_found=verification["expected_fields_found"],
            expected_fields_missing=verification["expected_fields_missing"], authenticity_risk=verification["authenticity_risk"],
            authenticity_notes=verification["authenticity_notes"], review_required=verification["review_required"],
            expected_document_type=verification.get("expected_document_type"),
            detected_document_type=verification.get("detected_document_type"),
            document_type_detection_method=verification.get("document_type_detection_method"),
            layoutlm_result=verification.get("layoutlm"),
            translation_result=verification.get("translation"),
        )
    )
    document.status = verification["result"]

    db.flush()
    refresh_application_analysis(db, application)
    db.commit()
    db.refresh(document)
    return document


@router.get("/documents/{document_id}/verification", response_model=DocumentOut)
def get_document_verification(document_id: str, db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    document = _owned_document(db, document_id, user)
    return document


@router.get("/documents/{document_id}/history", response_model=DocumentHistoryOut)
def get_document_history(document_id: str, db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    anchor = _owned_document(db, document_id, user)
    versions = (
        db.query(Document)
        .filter(Document.application_id == anchor.application_id, Document.doc_type == anchor.doc_type)
        .order_by(Document.version.asc())
        .all()
    )
    version_ids = [v.id for v in versions]
    reviews = (
        db.query(DocumentReview).filter(DocumentReview.document_id.in_(version_ids)).order_by(DocumentReview.created_at.asc()).all()
        if version_ids else []
    )
    return DocumentHistoryOut(versions=versions, reviews=reviews)


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db), user: User = Depends(require_applicant)):
    document = _owned_document(db, document_id, user)
    application = db.get(Application, document.application_id)

    old_path = os.path.join(settings.upload_dir, document.stored_filename)
    if os.path.exists(old_path):
        os.remove(old_path)
    db.delete(document)
    db.flush()
    refresh_application_analysis(db, application)
    db.commit()
    return {"ok": True}
