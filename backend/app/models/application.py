import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


STATUS_FLOW = [
    "DRAFT",
    "SUBMITTED",
    "UNDER_VERIFICATION",
    "CORRECTION_REQUIRED",
    "RESUBMITTED",
    "UNDER_OFFICER_REVIEW",
    "APPROVED",
    "REJECTED",
]


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    display_id: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    applicant_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    scheme_id: Mapped[str] = mapped_column(ForeignKey("schemes.id"), nullable=False)
    scheme_version: Mapped[int] = mapped_column(default=1)

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="DRAFT")

    personal_info: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    academic_info: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    financial_info: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    category_info: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    current_step: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    scheme: Mapped["Scheme"] = relationship()
    documents: Mapped[list["Document"]] = relationship(back_populates="application", cascade="all, delete-orphan")


class MismatchResult(Base):
    __tablename__ = "mismatch_results"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    is_mismatch: Mapped[bool] = mapped_column(Boolean, default=False)
    severity: Mapped[str] = mapped_column(String(20), default="low")  # low | medium | high
    values: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{document, value, confidence}]
    similarity: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EligibilityResult(Base):
    __tablename__ = "eligibility_results"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), nullable=False)
    eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    explanation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CorrectionRequest(Base):
    __tablename__ = "correction_requests"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), nullable=False)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    issue: Mapped[str] = mapped_column(String(255), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    deadline: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN")  # OPEN | RESOLVED
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # APPROVED | REJECTED
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
