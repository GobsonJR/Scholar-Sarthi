"""Deterministic rule-based eligibility engine.

Per the project's core design principle, generative/AI components never decide
formal eligibility. This module is pure, deterministic Python: given a
scheme's configured `SchemeRule` rows and an applicant's declared/extracted
data, it always produces the same criterion-level breakdown and final result.

Eligibility rules are data (`SchemeRule.field`/`operator`/`value`/`label`),
configured by an officer through the scheme builder — never hardcoded into
this engine. Adding a scheme with different criteria (a different income
ceiling, an extra category restriction, a state requirement, ...) requires no
code change here, only new `SchemeRule` rows. `evaluate_rules` is the single
implementation shared by real application evaluation (`evaluate_eligibility`
below) and the applicant-facing pre-application preview
(`routers/schemes.py::check_eligibility_preview`) — there is exactly one
eligibility implementation in this codebase.
"""

from datetime import date, datetime
from typing import Any

from app.models.application import Application
from app.models.document import Document
from app.models.scheme import Scheme, SchemeRule

# Presentational unit suffix per field, used only for the human-readable
# "required" string (e.g. "60%", "17 years") — never affects the comparison.
_UNITS: dict[str, str] = {"marks": "%", "age": " years"}

# Fallback explanatory sentence per field when no bespoke explanation exists
# in app.services.explain (which still has richer copy for the well-known
# fields: income, marks, age, category, required_documents).
_DETAIL_TEXT: dict[str, str] = {
    "income": "Annual family income must not exceed the scheme's income ceiling.",
    "marks": "Most recent qualifying examination percentage.",
    "age": "Applicant age calculated from date of birth on record.",
    "category": "Social/economic category eligible for this scheme.",
    "education_level": "Education level this scheme is offered for.",
    "state": "State of residence this scheme is offered in.",
}


def _calculate_age(dob_str: str | None) -> int | None:
    if not dob_str:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            dob = datetime.strptime(dob_str, fmt).date()
            today = date.today()
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except ValueError:
            continue
    return None


def build_applicant_data(
    *,
    personal_info: dict[str, Any] | None = None,
    academic_info: dict[str, Any] | None = None,
    financial_info: dict[str, Any] | None = None,
    category_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Maps an applicant's raw declared/extracted data onto the generic rule
    fields in `app.models.scheme.RULE_FIELDS`. This is the one place that
    knows where each rule field's value comes from — extend it (and the
    RULE_FIELDS registry) to support a new field everywhere at once."""

    personal_info = personal_info or {}
    academic_info = academic_info or {}
    financial_info = financial_info or {}
    category_info = category_info or {}

    return {
        "income": financial_info.get("annual_income"),
        "marks": academic_info.get("marks_percentage"),
        "age": _calculate_age(personal_info.get("dob")),
        "category": category_info.get("category"),
        "education_level": academic_info.get("education_level"),
        "state": personal_info.get("state"),
    }


def _compare(actual: Any, operator: str, expected: Any) -> bool:
    if actual is None:
        return False
    try:
        if operator == ">=":
            return actual >= expected
        if operator == "<=":
            return actual <= expected
        if operator == ">":
            return actual > expected
        if operator == "<":
            return actual < expected
        if operator == "=":
            return str(actual).strip().lower() == str(expected).strip().lower()
        if operator == "in":
            values = expected if isinstance(expected, list) else [expected]
            return str(actual).strip().lower() in [str(v).strip().lower() for v in values]
    except TypeError:
        return False
    return False


def _format_required(field: str, operator: str, value: Any) -> str:
    if operator == "in":
        values = value if isinstance(value, list) else [value]
        return ", ".join(str(v) for v in values)
    unit = _UNITS.get(field, "")
    if isinstance(value, bool):
        num = str(value)
    elif isinstance(value, (int, float)):
        num = f"{value:,.0f}" if float(value).is_integer() else f"{value:,}"
    else:
        num = str(value)
    return f"{operator} {num}{unit}"


def evaluate_rules(rules: list[SchemeRule], applicant_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Generic evaluator: one criterion dict per configured rule."""
    criteria: list[dict[str, Any]] = []
    for rule in rules:
        actual = applicant_data.get(rule.field)
        passed = _compare(actual, rule.operator, rule.value)
        required_str = _format_required(rule.field, rule.operator, rule.value)
        criteria.append(
            {
                "field": rule.field,
                "name": rule.label,
                "passed": bool(passed),
                "actual": actual,
                "required": required_str,
                "detail": _DETAIL_TEXT.get(rule.field, f"{rule.label} must be {required_str}."),
            }
        )
    return criteria


def evaluate_eligibility(application: Application, scheme: Scheme, documents: list[Document]) -> dict[str, Any]:
    applicant_data = build_applicant_data(
        personal_info=application.personal_info,
        academic_info=application.academic_info,
        financial_info=application.financial_info,
        category_info=application.category_info,
    )
    criteria = evaluate_rules(scheme.rules, applicant_data)

    # --- Documents complete (configured per scheme via SchemeDocument) ---
    submitted_types = {d.doc_type for d in documents if d.status != "INVALID"}
    required_types = {d.document_type for d in scheme.documents if d.required}
    missing = sorted(required_types - submitted_types)
    invalid_docs = [d for d in documents if d.status == "INVALID"]
    needs_review_docs = [d for d in documents if d.status == "NEEDS_REVIEW"]

    documents_passed = len(missing) == 0 and len(invalid_docs) == 0
    doc_status = "passed" if documents_passed else "failed"
    if documents_passed and needs_review_docs:
        doc_status = "needs_review"

    criteria.append(
        {
            "field": "required_documents",
            "name": "Required Documents",
            "passed": documents_passed,
            "status": doc_status,
            "actual": f"{len(submitted_types)}/{len(required_types)} submitted" if required_types else "N/A",
            "required": "All required documents submitted and valid",
            "detail": "Missing: " + (", ".join(missing) if missing else "none"),
            "missing_documents": missing,
        }
    )

    for c in criteria:
        c.setdefault("status", "passed" if c["passed"] else "failed")

    eligible = all(c["passed"] for c in criteria) if criteria else False

    return {"eligible": eligible, "criteria": criteria}
