import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


SCHEME_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "CLOSED"]

# Registry of eligibility-rule fields the rule builder / engine understands.
# Adding a new field to a scheme's rules only requires an entry here (plus,
# if it should be checkable from real application data, a mapping in
# rule_engine.build_applicant_data) — no other code needs to change, which is
# what keeps the rule builder genuinely extensible rather than hardcoded.
RULE_FIELDS: dict[str, str] = {
    "income": "Annual Family Income",
    "marks": "Academic Marks",
    "age": "Age",
    "category": "Category",
    "education_level": "Education Level",
    "state": "State",
}
RULE_OPERATORS = [">=", "<=", ">", "<", "=", "in"]


class Scheme(Base):
    __tablename__ = "schemes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # merit, need-based, minority, research...
    scheme_type: Mapped[str] = mapped_column(String(30), nullable=False)  # scholarship | fellowship
    education_level: Mapped[str] = mapped_column(String(50), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False, default="All India")
    institution_type: Mapped[str] = mapped_column(String(50), nullable=False, default="Any")

    short_description: Mapped[str] = mapped_column(String(500), nullable=False)
    overview: Mapped[str] = mapped_column(Text, nullable=False)
    benefits: Mapped[str] = mapped_column(Text, nullable=False)
    benefit_amount: Mapped[str] = mapped_column(String(120), nullable=False, default="Varies")
    benefit_duration: Mapped[str | None] = mapped_column(String(120), nullable=True)
    benefit_coverage: Mapped[str | None] = mapped_column(String(255), nullable=True)
    application_process: Mapped[str] = mapped_column(Text, nullable=False)

    deadline: Mapped[date] = mapped_column(Date, nullable=False)  # application deadline
    application_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    correction_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    result_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")  # DRAFT|ACTIVE|PAUSED|CLOSED
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    faqs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{"question","answer"}]

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    rules: Mapped[list["SchemeRule"]] = relationship(
        back_populates="scheme", cascade="all, delete-orphan", order_by="SchemeRule.sort_order"
    )
    documents: Mapped[list["SchemeDocument"]] = relationship(
        back_populates="scheme", cascade="all, delete-orphan", order_by="SchemeDocument.sort_order"
    )

    # --- Backward-compatible read-only views over `rules`/`documents`. These
    # are what the applicant-facing schema/wizard/cards read; they are never
    # used by the eligibility evaluator itself (that reads `rules` directly),
    # so there is exactly one source of truth for eligibility, not two. ---

    @property
    def is_active(self) -> bool:
        return self.status == "ACTIVE"

    @property
    def required_documents(self) -> list[str]:
        return [d.document_type for d in self.documents if d.required]

    def _rule_value(self, field: str, operators: tuple[str, ...]):
        for r in self.rules:
            if r.field == field and r.operator in operators:
                return r.value
        return None

    @property
    def income_limit(self):
        return self._rule_value("income", ("<=", "<"))

    @property
    def min_marks(self):
        return self._rule_value("marks", (">=", ">"))

    @property
    def min_age(self):
        return self._rule_value("age", (">=", ">"))

    @property
    def max_age(self):
        return self._rule_value("age", ("<=", "<"))

    @property
    def eligible_categories(self) -> list[str] | None:
        for r in self.rules:
            if r.field == "category":
                return r.value if isinstance(r.value, list) else [r.value]
        return None


class SchemeRule(Base):
    """One eligibility criterion: `field operator value`, e.g. income <= 250000.

    Evaluated generically by app.services.rule_engine — nothing about a
    specific field is hardcoded into the engine or the officer's rule
    builder UI; see RULE_FIELDS above.
    """

    __tablename__ = "scheme_rules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    scheme_id: Mapped[str] = mapped_column(ForeignKey("schemes.id"), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    operator: Mapped[str] = mapped_column(String(10), nullable=False)
    value: Mapped[object] = mapped_column(JSON, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    scheme: Mapped[Scheme] = relationship(back_populates="rules")


class SchemeDocument(Base):
    """A document requirement configured for a scheme, plus how it should be
    verified. `document_type` is normally one of document.DOCUMENT_TYPES, but
    "OTHER" is allowed with a free-text `document_name` for schemes that need
    a document outside the controlled list."""

    __tablename__ = "scheme_documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    scheme_id: Mapped[str] = mapped_column(ForeignKey("schemes.id"), nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    document_name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # --- Verification configuration ---
    accepted_file_types: Mapped[list] = mapped_column(JSON, nullable=False, default=lambda: ["application/pdf", "image/jpeg", "image/png"])
    max_file_size_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    validity_required: Mapped[bool] = mapped_column(Boolean, default=False)
    authenticity_check_required: Mapped[bool] = mapped_column(Boolean, default=True)
    expected_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    scheme: Mapped[Scheme] = relationship(back_populates="documents")
