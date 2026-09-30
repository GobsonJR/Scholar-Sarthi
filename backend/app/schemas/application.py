from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.document import DocumentOut, MismatchOut
from app.schemas.scheme import SchemeOut


class ApplicationCreateRequest(BaseModel):
    scheme_id: str


class ApplicationUpdateRequest(BaseModel):
    personal_info: dict[str, Any] | None = None
    academic_info: dict[str, Any] | None = None
    financial_info: dict[str, Any] | None = None
    category_info: dict[str, Any] | None = None
    current_step: int | None = None


class EligibilityCriterionOut(BaseModel):
    name: str
    passed: bool
    status: str
    actual: Any
    required: Any
    detail: str
    missing_documents: list[str] | None = None
    explanation: dict[str, str] | None = None


class EligibilityOut(BaseModel):
    eligible: bool
    criteria: list[EligibilityCriterionOut]
    explanation: str


class ApplicationOut(BaseModel):
    id: str
    display_id: str
    applicant_id: str
    scheme_id: str
    scheme_version: int
    status: str
    personal_info: dict
    academic_info: dict
    financial_info: dict
    category_info: dict
    current_step: int
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    scheme: SchemeOut | None = None

    model_config = {"from_attributes": True}


class ApplicationDetailOut(ApplicationOut):
    documents: list[DocumentOut] = []
    mismatches: list[MismatchOut] = []
    eligibility: EligibilityOut | None = None
    applicant_name: str | None = None
    applicant_email: str | None = None


class CorrectionRequestCreate(BaseModel):
    document_id: str | None = None
    issue: str
    comment: str
    deadline: str | None = None


class CorrectionRequestOut(BaseModel):
    id: str
    application_id: str
    document_id: str | None
    issue: str
    comment: str
    deadline: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class DecisionRequest(BaseModel):
    reason: str


class OfficerApplicationListItem(BaseModel):
    id: str
    display_id: str
    status: str
    applicant_name: str
    applicant_email: str
    scheme_name: str
    scheme_id: str
    submitted_at: datetime | None
    updated_at: datetime
    flagged: bool
    eligible: bool | None
    document_count: int


class DecisionOut(BaseModel):
    id: str
    application_id: str
    decision: str
    reason: str
    officer_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
