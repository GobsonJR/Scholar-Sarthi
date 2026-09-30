from datetime import date, datetime

from pydantic import BaseModel, Field


class SchemeRuleOut(BaseModel):
    id: str
    field: str
    operator: str
    value: object
    label: str
    required: bool

    model_config = {"from_attributes": True}


class SchemeDocumentOut(BaseModel):
    id: str
    document_type: str
    document_name: str
    description: str | None
    required: bool
    accepted_file_types: list[str]
    max_file_size_mb: int
    validity_required: bool
    authenticity_check_required: bool
    expected_fields: list[str]

    model_config = {"from_attributes": True}


class FAQOut(BaseModel):
    question: str
    answer: str


class SchemeOut(BaseModel):
    id: str
    name: str
    provider: str
    category: str
    scheme_type: str
    education_level: str
    state: str
    institution_type: str
    short_description: str
    overview: str
    benefits: str
    benefit_amount: str
    benefit_duration: str | None
    benefit_coverage: str | None
    application_process: str

    deadline: date
    application_start: date | None
    correction_deadline: date | None
    result_date: date | None

    status: str
    version: int
    is_demo: bool
    faqs: list[FAQOut]

    rules: list[SchemeRuleOut]
    documents: list[SchemeDocumentOut]

    # Backward-compatible derived fields (computed from `rules`/`documents`
    # on the model — see app.models.scheme.Scheme). Kept so the application
    # wizard, scheme cards etc. that already read these need no changes.
    income_limit: float | None
    min_marks: float | None
    min_age: int | None
    max_age: int | None
    eligible_categories: list[str] | None
    required_documents: list[str]
    is_active: bool

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EligibilityCheckRequest(BaseModel):
    dob: str | None = None
    annual_income: float | None = None
    marks_percentage: float | None = None
    category: str | None = None


# --- Officer create/edit payloads --------------------------------------

class SchemeRuleIn(BaseModel):
    field: str
    operator: str
    value: object
    label: str
    required: bool = True


class SchemeDocumentIn(BaseModel):
    document_type: str
    document_name: str
    description: str | None = None
    required: bool = True
    accepted_file_types: list[str] = Field(default_factory=lambda: ["application/pdf", "image/jpeg", "image/png"])
    max_file_size_mb: int = 10
    validity_required: bool = False
    authenticity_check_required: bool = True
    expected_fields: list[str] = Field(default_factory=list)


class SchemeWriteRequest(BaseModel):
    name: str
    provider: str
    category: str
    scheme_type: str
    education_level: str
    state: str = "All India"
    institution_type: str = "Any"

    short_description: str
    overview: str
    benefits: str
    benefit_amount: str = "Varies"
    benefit_duration: str | None = None
    benefit_coverage: str | None = None
    application_process: str

    deadline: date
    application_start: date | None = None
    correction_deadline: date | None = None
    result_date: date | None = None

    status: str = "DRAFT"
    faqs: list[FAQOut] = Field(default_factory=list)

    rules: list[SchemeRuleIn] = Field(default_factory=list)
    documents: list[SchemeDocumentIn] = Field(default_factory=list)


class SchemeStatistics(BaseModel):
    total_applications: int
    pending_review: int
    correction_required: int
    approved: int
    rejected: int


class SchemeAdminListItem(SchemeOut):
    """SchemeOut plus the application-count summary the officer scheme table shows."""

    application_counts: SchemeStatistics
