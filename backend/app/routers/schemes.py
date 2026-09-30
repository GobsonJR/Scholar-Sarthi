from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.scheme import Scheme
from app.schemas.scheme import EligibilityCheckRequest, SchemeDocumentOut, SchemeOut
from app.services.rule_engine import build_applicant_data, evaluate_rules

router = APIRouter(prefix="/schemes", tags=["schemes"])

# Statuses an applicant / the public site may ever see. DRAFT and PAUSED
# schemes never appear here regardless of filters.
_PUBLIC_STATUSES = ("ACTIVE", "CLOSED")


@router.get("", response_model=list[SchemeOut])
def list_schemes(
    db: Session = Depends(get_db),
    search: str | None = None,
    category: str | None = None,
    education_level: str | None = None,
    state: str | None = None,
    scheme_type: str | None = None,
    institution_type: str | None = None,
    max_income: float | None = None,
    status: str | None = None,
):
    query = db.query(Scheme)
    if status and status in _PUBLIC_STATUSES:
        query = query.filter(Scheme.status == status)
    else:
        query = query.filter(Scheme.status == "ACTIVE")
    if search:
        like = f"%{search}%"
        query = query.filter(Scheme.name.ilike(like) | Scheme.short_description.ilike(like) | Scheme.provider.ilike(like))
    if category:
        query = query.filter(Scheme.category == category)
    if education_level:
        query = query.filter(Scheme.education_level == education_level)
    if state:
        query = query.filter((Scheme.state == state) | (Scheme.state == "All India"))
    if scheme_type:
        query = query.filter(Scheme.scheme_type == scheme_type)
    if institution_type:
        query = query.filter((Scheme.institution_type == institution_type) | (Scheme.institution_type == "Any"))
    schemes = query.order_by(Scheme.deadline.asc()).all()
    if max_income is not None:
        schemes = [s for s in schemes if s.income_limit is None or s.income_limit >= max_income]
    return schemes


@router.get("/{scheme_id}", response_model=SchemeOut)
def get_scheme(scheme_id: str, db: Session = Depends(get_db)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme or scheme.status not in _PUBLIC_STATUSES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
    return scheme


@router.get("/{scheme_id}/documents", response_model=list[SchemeDocumentOut])
def list_scheme_documents(scheme_id: str, db: Session = Depends(get_db)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme or scheme.status not in _PUBLIC_STATUSES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
    return scheme.documents


@router.post("/{scheme_id}/check-eligibility")
def check_eligibility_preview(scheme_id: str, payload: EligibilityCheckRequest, db: Session = Depends(get_db)):
    """Quick, no-application-required eligibility preview used on the scheme
    details page before an applicant commits to starting a full application.

    Uses the exact same rule evaluator as formal application-time evaluation
    (app.services.rule_engine.evaluate_rules) — there is no second,
    parallel eligibility implementation."""
    scheme = db.get(Scheme, scheme_id)
    if not scheme or scheme.status not in _PUBLIC_STATUSES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")

    applicant_data = build_applicant_data(
        personal_info={"dob": payload.dob},
        financial_info={"annual_income": payload.annual_income},
        academic_info={"marks_percentage": payload.marks_percentage},
        category_info={"category": payload.category},
    )
    criteria = evaluate_rules(scheme.rules, applicant_data)
    for c in criteria:
        c["status"] = "passed" if c["passed"] else "needs_review" if c["actual"] is None else "failed"

    likely_eligible = all(c["passed"] for c in criteria) if criteria else None
    return {"criteria": criteria, "likely_eligible": likely_eligible, "note": "This is a preliminary preview. Formal eligibility is determined after document verification."}
