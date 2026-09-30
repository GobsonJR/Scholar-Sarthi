from sqlalchemy.orm import Session

from app.models.application import Application, EligibilityResult, MismatchResult
from app.models.document import Document
from app.services import ai_pipeline, rule_engine
from app.services.explain import build_eligibility_explanation, explain_criterion, explain_mismatch


def refresh_application_analysis(db: Session, application: Application) -> dict:
    documents: list[Document] = (
        db.query(Document).filter(Document.application_id == application.id, Document.is_current.is_(True)).all()
    )

    documents_data = [
        {"doc_type": d.doc_type, "extracted_fields": d.extraction.extracted_fields if d.extraction else {}}
        for d in documents
    ]
    raw_mismatches = ai_pipeline.detect_mismatches(documents_data)

    db.query(MismatchResult).filter(MismatchResult.application_id == application.id).delete()
    mismatch_rows = []
    for m in raw_mismatches:
        row = MismatchResult(
            application_id=application.id,
            field=m["field"],
            is_mismatch=m["is_mismatch"],
            severity=m["severity"],
            values=m["values"],
            similarity=m["similarity"],
        )
        db.add(row)
        mismatch_rows.append({**m, "explanation": explain_mismatch(m)})

    eligibility = rule_engine.evaluate_eligibility(application, application.scheme, documents)
    for criterion in eligibility["criteria"]:
        criterion["explanation"] = explain_criterion(criterion)
    explanation_text = build_eligibility_explanation(eligibility)

    db.query(EligibilityResult).filter(EligibilityResult.application_id == application.id).delete()
    db.add(
        EligibilityResult(
            application_id=application.id,
            eligible=eligibility["eligible"],
            criteria=eligibility["criteria"],
            explanation=explanation_text,
        )
    )
    db.flush()

    return {
        "mismatches": mismatch_rows,
        "eligibility": {
            "eligible": eligibility["eligible"],
            "criteria": eligibility["criteria"],
            "explanation": explanation_text,
        },
    }
