from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_officer
from app.models.application import Application, CorrectionRequest, Decision
from app.models.document import DOCUMENT_TYPES
from app.models.scheme import RULE_OPERATORS, RULE_FIELDS, SCHEME_STATUSES, Scheme, SchemeDocument, SchemeRule
from app.models.user import User
from app.routers.officer import _is_flagged
from app.schemas.application import OfficerApplicationListItem
from app.schemas.scheme import SchemeAdminListItem, SchemeOut, SchemeStatistics, SchemeWriteRequest
from app.services.audit_service import log_action

router = APIRouter(prefix="/officer/schemes", tags=["officer-schemes"])


def _validate_payload(payload: SchemeWriteRequest) -> None:
    if payload.status not in SCHEME_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {SCHEME_STATUSES}.")
    if payload.application_start and payload.deadline < payload.application_start:
        raise HTTPException(status_code=400, detail="Application deadline cannot be before the application start date.")
    if payload.correction_deadline and payload.correction_deadline < payload.deadline:
        raise HTTPException(status_code=400, detail="Correction deadline cannot be before the application deadline.")
    for rule in payload.rules:
        if rule.field not in RULE_FIELDS:
            raise HTTPException(status_code=400, detail=f"Unknown eligibility field '{rule.field}'.")
        if rule.operator not in RULE_OPERATORS:
            raise HTTPException(status_code=400, detail=f"Unknown operator '{rule.operator}'.")
    for doc in payload.documents:
        if doc.document_type not in DOCUMENT_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown document type '{doc.document_type}'.")
        if not doc.document_name.strip():
            raise HTTPException(status_code=400, detail="Every document requires a name.")
        if doc.max_file_size_mb <= 0 or doc.max_file_size_mb > 10:
            raise HTTPException(status_code=400, detail="Maximum file size must be between 1 and 10 MB (server upload limit).")
        if not doc.accepted_file_types:
            raise HTTPException(status_code=400, detail=f"'{doc.document_name}' needs at least one accepted file type.")


def _rule_signature(rules) -> set[tuple]:
    """Works for both ORM SchemeRule rows and incoming SchemeRuleIn payload items."""
    return {(r.field, r.operator, str(r.value), r.required) for r in rules}


def _apply_rules(db: Session, scheme: Scheme, rules_in) -> None:
    for r in list(scheme.rules):
        db.delete(r)
    db.flush()
    for i, r in enumerate(rules_in):
        db.add(SchemeRule(scheme_id=scheme.id, field=r.field, operator=r.operator, value=r.value, label=r.label, required=r.required, sort_order=i))


def _apply_documents(db: Session, scheme: Scheme, docs_in) -> None:
    for d in list(scheme.documents):
        db.delete(d)
    db.flush()
    for i, d in enumerate(docs_in):
        db.add(
            SchemeDocument(
                scheme_id=scheme.id, document_type=d.document_type, document_name=d.document_name,
                description=d.description, required=d.required, sort_order=i,
                accepted_file_types=d.accepted_file_types, max_file_size_mb=d.max_file_size_mb,
                validity_required=d.validity_required, authenticity_check_required=d.authenticity_check_required,
                expected_fields=d.expected_fields,
            )
        )


def _application_counts(db: Session, scheme_id: str) -> dict:
    apps = db.query(Application).filter(Application.scheme_id == scheme_id, Application.status != "DRAFT").all()
    pending = sum(1 for a in apps if a.status in ("SUBMITTED", "UNDER_VERIFICATION", "UNDER_OFFICER_REVIEW"))
    correction = sum(1 for a in apps if a.status in ("CORRECTION_REQUIRED", "RESUBMITTED"))
    approved = sum(1 for a in apps if a.status == "APPROVED")
    rejected = sum(1 for a in apps if a.status == "REJECTED")
    return {"total_applications": len(apps), "pending_review": pending, "correction_required": correction, "approved": approved, "rejected": rejected}


@router.get("", response_model=list[SchemeAdminListItem])
def list_all_schemes(db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    """All schemes regardless of status — the officer scheme-management table."""
    schemes = db.query(Scheme).order_by(Scheme.updated_at.desc()).all()
    return [
        SchemeAdminListItem(**SchemeOut.model_validate(s).model_dump(), application_counts=SchemeStatistics(**_application_counts(db, s.id)))
        for s in schemes
    ]


@router.get("/meta")
def scheme_builder_metadata(officer: User = Depends(require_officer)):
    """Field/operator/document-type options for the rule and document builders."""
    return {
        "rule_fields": [{"field": k, "label": v} for k, v in RULE_FIELDS.items()],
        "operators": RULE_OPERATORS,
        "document_types": DOCUMENT_TYPES,
        "statuses": SCHEME_STATUSES,
    }


@router.post("", response_model=SchemeOut)
def create_scheme(payload: SchemeWriteRequest, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    _validate_payload(payload)
    scheme = Scheme(
        name=payload.name, provider=payload.provider, category=payload.category, scheme_type=payload.scheme_type,
        education_level=payload.education_level, state=payload.state, institution_type=payload.institution_type,
        short_description=payload.short_description, overview=payload.overview, benefits=payload.benefits,
        benefit_amount=payload.benefit_amount, benefit_duration=payload.benefit_duration, benefit_coverage=payload.benefit_coverage,
        application_process=payload.application_process, deadline=payload.deadline, application_start=payload.application_start,
        correction_deadline=payload.correction_deadline, result_date=payload.result_date, status=payload.status,
        version=1, is_demo=True, faqs=[f.model_dump() for f in payload.faqs],
    )
    db.add(scheme)
    db.flush()
    _apply_rules(db, scheme, payload.rules)
    _apply_documents(db, scheme, payload.documents)
    log_action(db, actor_id=officer.id, actor_name=officer.full_name, action=f"Created scheme: {scheme.name}", details=f"Status: {scheme.status}")
    db.commit()
    db.refresh(scheme)
    return scheme


@router.get("/{scheme_id}", response_model=SchemeOut)
def get_scheme_for_officer(scheme_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return scheme


@router.put("/{scheme_id}", response_model=SchemeOut)
def update_scheme(scheme_id: str, payload: SchemeWriteRequest, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    _validate_payload(payload)

    old_signature = _rule_signature(scheme.rules)

    scheme.name, scheme.provider, scheme.category = payload.name, payload.provider, payload.category
    scheme.scheme_type, scheme.education_level = payload.scheme_type, payload.education_level
    scheme.state, scheme.institution_type = payload.state, payload.institution_type
    scheme.short_description, scheme.overview, scheme.benefits = payload.short_description, payload.overview, payload.benefits
    scheme.benefit_amount, scheme.benefit_duration, scheme.benefit_coverage = payload.benefit_amount, payload.benefit_duration, payload.benefit_coverage
    scheme.application_process = payload.application_process
    scheme.deadline, scheme.application_start = payload.deadline, payload.application_start
    scheme.correction_deadline, scheme.result_date = payload.correction_deadline, payload.result_date
    scheme.status = payload.status
    scheme.faqs = [f.model_dump() for f in payload.faqs]

    _apply_rules(db, scheme, payload.rules)
    _apply_documents(db, scheme, payload.documents)
    db.flush()

    new_signature = _rule_signature(payload.rules)
    version_bumped = False
    if old_signature != new_signature:
        scheme.version += 1
        version_bumped = True

    log_action(
        db, actor_id=officer.id, actor_name=officer.full_name, action=f"Edited scheme: {scheme.name}",
        details=f"Version {scheme.version}" + (" (eligibility rules changed)" if version_bumped else ""),
    )
    db.commit()
    db.expire(scheme)  # rules/documents were already loaded above; force a fresh reload for the response
    return scheme


@router.delete("/{scheme_id}")
def delete_scheme(scheme_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    has_applications = db.query(Application).filter(Application.scheme_id == scheme_id).first() is not None
    if has_applications:
        raise HTTPException(status_code=400, detail="This scheme has existing applications and cannot be deleted. Deactivate or close it instead.")
    name = scheme.name
    db.delete(scheme)
    log_action(db, actor_id=officer.id, actor_name=officer.full_name, action=f"Deleted scheme: {name}")
    db.commit()
    return {"ok": True}


@router.post("/{scheme_id}/activate", response_model=SchemeOut)
def activate_scheme(scheme_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    scheme.status = "ACTIVE"
    log_action(db, actor_id=officer.id, actor_name=officer.full_name, action=f"Activated scheme: {scheme.name}")
    db.commit()
    db.refresh(scheme)
    return scheme


@router.post("/{scheme_id}/deactivate", response_model=SchemeOut)
def deactivate_scheme(scheme_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    scheme.status = "PAUSED"
    log_action(db, actor_id=officer.id, actor_name=officer.full_name, action=f"Deactivated scheme: {scheme.name}")
    db.commit()
    db.refresh(scheme)
    return scheme


@router.post("/{scheme_id}/duplicate", response_model=SchemeOut)
def duplicate_scheme(scheme_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    original = db.get(Scheme, scheme_id)
    if not original:
        raise HTTPException(status_code=404, detail="Scheme not found")

    copy = Scheme(
        name=f"{original.name} (Copy)", provider=original.provider, category=original.category,
        scheme_type=original.scheme_type, education_level=original.education_level, state=original.state,
        institution_type=original.institution_type, short_description=original.short_description,
        overview=original.overview, benefits=original.benefits, benefit_amount=original.benefit_amount,
        benefit_duration=original.benefit_duration, benefit_coverage=original.benefit_coverage,
        application_process=original.application_process, deadline=original.deadline,
        application_start=original.application_start, correction_deadline=original.correction_deadline,
        result_date=original.result_date, status="DRAFT", version=1, is_demo=original.is_demo,
        faqs=list(original.faqs or []),
    )
    db.add(copy)
    db.flush()
    for i, r in enumerate(original.rules):
        db.add(SchemeRule(scheme_id=copy.id, field=r.field, operator=r.operator, value=r.value, label=r.label, required=r.required, sort_order=i))
    for i, d in enumerate(original.documents):
        db.add(
            SchemeDocument(
                scheme_id=copy.id, document_type=d.document_type, document_name=d.document_name,
                description=d.description, required=d.required, sort_order=i,
                accepted_file_types=list(d.accepted_file_types), max_file_size_mb=d.max_file_size_mb,
                validity_required=d.validity_required, authenticity_check_required=d.authenticity_check_required,
                expected_fields=list(d.expected_fields),
            )
        )

    log_action(db, actor_id=officer.id, actor_name=officer.full_name, action=f"Duplicated scheme: {original.name}", details=f"New draft: {copy.name}")
    db.commit()
    db.refresh(copy)
    return copy


@router.get("/{scheme_id}/applications", response_model=list[OfficerApplicationListItem])
def scheme_applications(scheme_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    applications = (
        db.query(Application)
        .filter(Application.scheme_id == scheme_id, Application.status != "DRAFT")
        .order_by(Application.updated_at.desc())
        .all()
    )
    items = []
    for app in applications:
        applicant = db.get(User, app.applicant_id)
        from app.models.application import EligibilityResult
        from app.models.document import Document

        eligibility_row = (
            db.query(EligibilityResult).filter(EligibilityResult.application_id == app.id).order_by(EligibilityResult.created_at.desc()).first()
        )
        doc_count = db.query(Document).filter(Document.application_id == app.id).count()
        items.append(
            OfficerApplicationListItem(
                id=app.id, display_id=app.display_id, status=app.status, applicant_name=applicant.full_name,
                applicant_email=applicant.email, scheme_name=scheme.name, scheme_id=scheme.id,
                submitted_at=app.submitted_at, updated_at=app.updated_at, flagged=_is_flagged(db, app.id),
                eligible=eligibility_row.eligible if eligibility_row else None, document_count=doc_count,
            )
        )
    return items


@router.get("/{scheme_id}/statistics", response_model=SchemeStatistics)
def scheme_statistics(scheme_id: str, db: Session = Depends(get_db), officer: User = Depends(require_officer)):
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return SchemeStatistics(**_application_counts(db, scheme_id))
