"""Explainable-AI engine.

Turns rule-engine + mismatch/verification output into plain-language
explanations that always follow: what happened -> why -> evidence -> what to
do next. This module only explains decisions that other, deterministic
services already made — it never changes the eligibility result itself.
"""

from typing import Any


def _format_money(value: Any) -> str:
    try:
        return f"Rs. {int(value):,}"
    except (TypeError, ValueError):
        return str(value)


def explain_criterion(criterion: dict[str, Any]) -> dict[str, str]:
    field = criterion.get("field") or criterion["name"]
    passed = criterion["passed"]

    if field == "income":
        if passed:
            return {
                "what": "Income criterion met.",
                "why": f"Your detected annual family income is {_format_money(criterion['actual'])}, "
                f"which is within the scheme's limit of {criterion['required']}.",
                "next_action": "No action needed for this criterion.",
            }
        return {
            "what": "Income criterion not met.",
            "why": f"Your detected annual family income is {_format_money(criterion['actual'])}. "
            f"This scheme requires annual income {criterion['required']}.",
            "next_action": "Review the submitted income information and check the scheme's official eligibility criteria. "
            "If this figure is incorrect, upload a corrected income certificate.",
        }

    if field == "marks":
        if passed:
            return {
                "what": "Academic marks criterion met.",
                "why": f"Your recorded marks are {criterion['actual']}%, meeting the requirement of {criterion['required']}.",
                "next_action": "No action needed for this criterion.",
            }
        return {
            "what": "Academic marks criterion not met.",
            "why": f"Your recorded marks are {criterion['actual']}%. This scheme requires {criterion['required']}.",
            "next_action": "Double-check that the correct marksheet was uploaded. If the extracted percentage looks wrong, "
            "re-upload a clearer copy.",
        }

    if field == "age":
        if passed:
            return {
                "what": "Age criterion met.",
                "why": f"Your calculated age is {criterion['actual']}, within the required range of {criterion['required']}.",
                "next_action": "No action needed for this criterion.",
            }
        return {
            "what": "Age criterion not met.",
            "why": f"Your calculated age is {criterion['actual']}. This scheme requires an age of {criterion['required']}.",
            "next_action": "Confirm your date of birth is correctly entered and matches your identity document.",
        }

    if field == "category":
        if passed:
            return {
                "what": "Category criterion met.",
                "why": f"Your declared category ({criterion['actual']}) is eligible for this scheme.",
                "next_action": "No action needed for this criterion.",
            }
        return {
            "what": "Category criterion not met.",
            "why": f"Your declared category ({criterion['actual']}) is not among the eligible categories "
            f"for this scheme ({criterion['required']}).",
            "next_action": "This scheme's category requirement may not match your profile. Consider other schemes, "
            "or contact an officer if you believe your category was recorded incorrectly.",
        }

    if field == "required_documents":
        if passed:
            return {
                "what": "All required documents are present.",
                "why": "Every document this scheme requires has been submitted and passed basic validation.",
                "next_action": "No action needed for this criterion.",
            }
        missing = criterion.get("missing_documents") or []
        missing_label = ", ".join(m.replace("_", " ").title() for m in missing) if missing else "one or more documents"
        return {
            "what": "Required documents are incomplete or invalid.",
            "why": f"The following document(s) are missing or could not be validated: {missing_label}.",
            "next_action": f"Upload a valid {missing_label} to proceed.",
        }

    return {
        "what": f"{criterion['name']} criterion",
        "why": criterion.get("detail") or "See criterion detail.",
        "next_action": "Review this criterion with an officer if unclear.",
    }


def build_eligibility_explanation(eligibility: dict[str, Any]) -> str:
    criteria = eligibility["criteria"]
    lines: list[str] = []

    if eligibility["eligible"]:
        lines.append("Based on the information and documents on record, you meet all eligibility criteria for this scheme.")
    else:
        failed = [c for c in criteria if not c["passed"]]
        lines.append(
            f"Based on the information and documents on record, {len(failed)} of {len(criteria)} "
            "eligibility criteria were not met."
        )
        for c in failed:
            exp = explain_criterion(c)
            lines.append(f"\n• {exp['why']} {exp['next_action']}")

    return "\n".join(lines)


def explain_mismatch(mismatch: dict[str, Any]) -> str:
    field_label = mismatch["field"].replace("_", " ").title()
    if not mismatch["is_mismatch"]:
        return f"{field_label} matches consistently across all submitted documents."

    doc_values = "; ".join(f"{v['doc_type'].replace('_', ' ').title()}: {v['value']}" for v in mismatch["values"])
    return (
        f"Possible {field_label.lower()} mismatch detected ({doc_values}). Different representations were found "
        "across submitted documents. The system flags this for officer review rather than automatically rejecting "
        "the application. If this is a data entry issue, you can re-upload a clearer or corrected document."
    )


def explain_document_flag(reasons: list[str]) -> str:
    if not reasons:
        return "No issues detected with this document."
    return " ".join(reasons)
