import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


DOCUMENT_TYPES = [
    "IDENTITY_PROOF",
    "MARKSHEET",
    "INCOME_CERTIFICATE",
    "COMMUNITY_CERTIFICATE",
    "RESIDENCE_CERTIFICATE",
    "DISABILITY_CERTIFICATE",
    "BANK_PASSBOOK",
    "BONAFIDE_CERTIFICATE",
    "ADMISSION_PROOF",
    "PASSPORT_PHOTO",
    "OTHER",
]


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), nullable=False)
    scheme_document_id: Mapped[str | None] = mapped_column(ForeignKey("scheme_documents.id"), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="UPLOADED")
    # UPLOADED -> PROCESSING -> VERIFIED | NEEDS_REVIEW | INVALID

    # --- Versioning: a re-upload never deletes the old row, it supersedes it. ---
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    superseded_by_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    application: Mapped["Application"] = relationship(back_populates="documents")
    extraction: Mapped["DocumentExtraction | None"] = relationship(
        back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    verification: Mapped["VerificationResult | None"] = relationship(
        back_populates="document", uselist=False, cascade="all, delete-orphan"
    )


class DocumentExtraction(Base):
    __tablename__ = "document_extractions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), unique=True, nullable=False)
    extracted_fields: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    confidence: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    raw_text_preview: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    document: Mapped[Document] = relationship(back_populates="extraction")


class VerificationResult(Base):
    __tablename__ = "verification_results"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), unique=True, nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)  # VERIFIED | NEEDS_REVIEW | INVALID
    reasons: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # --- Richer, disclosed-as-demo verification signals (never a fraud claim) ---
    document_type_match: Mapped[bool] = mapped_column(Boolean, default=True)
    expected_fields_found: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    expected_fields_missing: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    authenticity_risk: Mapped[str] = mapped_column(String(10), nullable=False, default="LOW")  # LOW | MEDIUM | HIGH
    authenticity_notes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    review_required: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Phase 5: LayoutLMv3 document-understanding (added alongside the
    # Phase 4 signals above, not replacing them). `layoutlm_result` is the
    # full structured dict from layoutlm_service.LayoutLMResult.to_dict()
    # (model checkpoint, status, document_type, confidence, processing_time_ms,
    # fallback_used) — one JSON column rather than five new scalar ones.
    # `expected_document_type`/`detected_document_type` are pulled out as
    # plain columns since officer queries/filters read them directly.
    expected_document_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    detected_document_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    document_type_detection_method: Mapped[str | None] = mapped_column(String(20), nullable=True)  # layoutlm | keyword | filename | none
    layoutlm_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # --- Phase 6: IndicTrans2 multilingual normalization (added alongside
    # Phase 4/5). One JSON column (indictrans_service's document-level
    # summary — status, source_language, translated_text, model,
    # fallback_used, lines_translated/total_lines), not a duplicate copy of
    # OCR text in five places — the full per-line detail isn't persisted,
    # only the summary an officer or API consumer actually needs.
    translation_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    document: Mapped[Document] = relationship(back_populates="verification")


class DocumentReview(Base):
    """An officer's direct decision on a single document (Verify / Mark
    Invalid) — the document-level counterpart to `Decision` on applications.
    "Request Replacement" reuses the existing `CorrectionRequest` flow rather
    than duplicating it here."""

    __tablename__ = "document_reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # VERIFIED | INVALID
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
