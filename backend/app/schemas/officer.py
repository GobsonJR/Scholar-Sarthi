from pydantic import BaseModel


class StatusCount(BaseModel):
    status: str
    count: int


class MonthlyCount(BaseModel):
    month: str
    count: int


class DocumentVerificationStats(BaseModel):
    total_documents: int
    verified: int
    needs_review: int
    verification_failed: int
    high_risk_flags: int  # "high-risk verification flags" — never phrased as "fraud detected"


class OfficerStatistics(BaseModel):
    total_applications: int
    pending_review: int
    correction_required: int
    approved: int
    rejected: int
    verification_flags: int
    avg_processing_days: float
    status_distribution: list[StatusCount]
    monthly_applications: list[MonthlyCount]
    document_issue_frequency: list[StatusCount]
    document_verification: DocumentVerificationStats
