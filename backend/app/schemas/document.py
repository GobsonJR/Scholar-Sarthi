from datetime import datetime

from pydantic import BaseModel


class ExtractionOut(BaseModel):
    extracted_fields: dict
    confidence: dict
    raw_text_preview: str

    model_config = {"from_attributes": True}


class LayoutLMOut(BaseModel):
    model: str
    status: str
    document_type: str | None
    confidence: float
    processing_time_ms: int
    fallback_used: bool


class TranslationOut(BaseModel):
    status: str
    source_language: str
    target_language: str
    translated_text: str | None
    model: str
    fallback_used: bool
    lines_translated: int
    total_lines: int


class VerificationOut(BaseModel):
    result: str
    reasons: list[str]
    document_type_match: bool
    expected_fields_found: list[str]
    expected_fields_missing: list[str]
    authenticity_risk: str
    authenticity_notes: list[str]
    review_required: bool
    expected_document_type: str | None = None
    detected_document_type: str | None = None
    document_type_detection_method: str | None = None
    layoutlm_result: LayoutLMOut | None = None
    translation_result: TranslationOut | None = None

    model_config = {"from_attributes": True}


class DocumentReviewOut(BaseModel):
    id: str
    document_id: str
    action: str
    reason: str
    officer_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentOut(BaseModel):
    id: str
    application_id: str
    scheme_document_id: str | None
    doc_type: str
    original_filename: str
    content_type: str
    file_size: int
    status: str
    version: int
    is_current: bool
    uploaded_at: datetime
    processed_at: datetime | None
    extraction: ExtractionOut | None = None
    verification: VerificationOut | None = None

    model_config = {"from_attributes": True}


class DocumentHistoryOut(BaseModel):
    versions: list[DocumentOut]
    reviews: list[DocumentReviewOut]


class DocumentReviewRequest(BaseModel):
    reason: str


class MismatchOut(BaseModel):
    field: str
    is_mismatch: bool
    severity: str
    similarity: float | None
    values: list[dict]
    explanation: str

    model_config = {"from_attributes": True}
