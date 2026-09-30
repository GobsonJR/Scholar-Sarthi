"""Real document-intelligence pipeline: OpenCV preprocessing -> PaddleOCR ->
content-based document type classification -> regex field extraction over the
actual OCR text -> verification -> RapidFuzz cross-document matching ->
authenticity risk scoring from genuine quality/consistency signals.

This replaces the earlier deterministic-demo pipeline (which fabricated
"extracted" fields from the applicant's own typed-in form data and never read
the uploaded file). The upgrade path this module's own predecessor predicted
is exactly what happened: only the body of the extraction step changed: every
router, model and frontend screen that depends on the *shape* of the result
is unchanged.

What is still NOT real, and is not claimed to be:
- Field extraction is regex/label matching over OCR text, not a learned
  extraction model (LayoutLMv3 integration is a separate, later phase).
- Document type classification is keyword matching over OCR text, not a
  trained classifier (same LayoutLMv3 phase).
- Authenticity risk combines real signals (type match, OCR quality, field
  completeness, OCR confidence) into LOW/MEDIUM/HIGH — it is a disclosed
  screening signal, never a claim that a document is definitively fake. The
  officer makes the final call.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from rapidfuzz import fuzz

from app.services import cv_preprocessing, indictrans_service, layoutlm_service, ocr_service

logger = logging.getLogger("app.ai_pipeline")

MIN_VALID_FILE_SIZE = 3_000  # bytes; below this a file can't plausibly contain a readable page
NAME_MATCH_THRESHOLD = 0.92
NAME_REVIEW_THRESHOLD = 0.65

# Minimum characters of OCR text required before content-based document-type
# classification is trusted over the filename fallback.
MIN_USABLE_OCR_CHARS = 15

# Keyword bank used to classify document type from actual OCR TEXT (primary
# signal) and, unchanged, from the original filename (fallback only, used
# when OCR text is unusable or inconclusive for every type).
_TYPE_TEXT_KEYWORDS: dict[str, list[str]] = {
    "IDENTITY_PROOF": ["identity proof", "aadhaar", "aadhar", "election commission", "voter id", "government of india", "id number"],
    "MARKSHEET": ["marksheet", "statement of marks", "grade card", "semester", "total marks", "percentage of marks", "candidate"],
    "INCOME_CERTIFICATE": ["income certificate", "annual family income", "annual income", "revenue department"],
    "COMMUNITY_CERTIFICATE": ["community certificate", "caste certificate", "belongs to", "community category"],
    "RESIDENCE_CERTIFICATE": ["residence certificate", "domicile certificate", "is a resident of"],
    "DISABILITY_CERTIFICATE": ["disability certificate", "percentage of disability", "medical board"],
    "BANK_PASSBOOK": ["bank passbook", "account holder", "ifsc", "savings account"],
    "BONAFIDE_CERTIFICATE": ["bonafide certificate", "bonafide student"],
    "ADMISSION_PROOF": ["admission proof", "admission letter", "provisional admission", "enrollment", "enrolment"],
}

_TYPE_FILENAME_KEYWORDS: dict[str, list[str]] = {
    "IDENTITY_PROOF": ["identity", "aadhaar", "aadhar", "voter", "passport_id", "id_proof", "idproof"],
    "MARKSHEET": ["marksheet", "mark_sheet", "transcript", "grade"],
    "INCOME_CERTIFICATE": ["income"],
    "COMMUNITY_CERTIFICATE": ["community", "caste"],
    "RESIDENCE_CERTIFICATE": ["residence", "domicile"],
    "DISABILITY_CERTIFICATE": ["disability"],
    "BANK_PASSBOOK": ["bank", "passbook"],
    "BONAFIDE_CERTIFICATE": ["bonafide"],
    "ADMISSION_PROOF": ["admission", "enrollment", "enrolment"],
    "PASSPORT_PHOTO": ["photo", "passport_photo"],
}

# Per-document-type "label: value" line patterns, matched against each
# individual OCR line (OCR already segments the page into lines, so matching
# per-line is far more robust than one regex over the whole joined text).
FIELD_LABEL_PATTERNS: dict[str, dict[str, str]] = {
    "IDENTITY_PROOF": {
        "name": r"^name\s*[:.]?\s*(.+)$",
        "dob": r"^(?:dob|date of birth)\s*[:.]?\s*(.+)$",
        "gender": r"^gender\s*[:.]?\s*(.+)$",
        "id_number": r"^id(?:entity)? number\s*[:.]?\s*(.+)$",
    },
    "MARKSHEET": {
        "name": r"^(?:name|candidate)\s*[:.]?\s*(.+)$",
        "institution": r"^institution\s*[:.]?\s*(.+)$",
        "marks_percentage": r"^(?:marks percentage|percentage of marks|percentage)\s*[:.]?\s*([\d.]+)",
        "certificate_number": r"^certificate number\s*[:.]?\s*(.+)$",
    },
    "INCOME_CERTIFICATE": {
        "name": r"^name\s*[:.]?\s*(.+)$",
        "annual_income": r"^annual(?: family)? income\s*[:.]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+)",
        "certificate_number": r"^certificate number\s*[:.]?\s*(.+)$",
        "issue_date": r"^issue date\s*[:.]?\s*(.+)$",
    },
    "COMMUNITY_CERTIFICATE": {
        "name": r"^name\s*[:.]?\s*(.+)$",
        "category": r"^category\s*[:.]?\s*(.+)$",
        "certificate_number": r"^certificate number\s*[:.]?\s*(.+)$",
    },
    "RESIDENCE_CERTIFICATE": {
        "name": r"^name\s*[:.]?\s*(.+)$",
        "address": r"^address\s*[:.]?\s*(.+)$",
        "certificate_number": r"^certificate number\s*[:.]?\s*(.+)$",
    },
    "DISABILITY_CERTIFICATE": {
        "name": r"^name\s*[:.]?\s*(.+)$",
        "certificate_number": r"^certificate number\s*[:.]?\s*(.+)$",
    },
    "BANK_PASSBOOK": {
        "name": r"^(?:account holder|name)\s*[:.]?\s*(.+)$",
        "account_number": r"^account number\s*[:.]?\s*(.+)$",
        "ifsc": r"^ifsc(?: code)?\s*[:.]?\s*(.+)$",
    },
    "BONAFIDE_CERTIFICATE": {
        "name": r"^name\s*[:.]?\s*(.+)$",
        "institution": r"^institution\s*[:.]?\s*(.+)$",
    },
    "ADMISSION_PROOF": {
        "name": r"^name\s*[:.]?\s*(.+)$",
        "institution": r"^institution\s*[:.]?\s*(.+)$",
        "course": r"^course\s*[:.]?\s*(.+)$",
    },
    "PASSPORT_PHOTO": {},
}


def classify_document_type_from_text(ocr_text: str) -> tuple[str | None, int]:
    """Scores every known document type by keyword hits against real OCR
    text and returns the best match. Returns (None, 0) if nothing scores."""
    lowered = ocr_text.lower()
    best_type, best_score = None, 0
    for doc_type, keywords in _TYPE_TEXT_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in lowered)
        if score > best_score:
            best_type, best_score = doc_type, score
    return best_type, best_score


def _detect_type_mismatch_from_filename(*, expected_doc_type: str, original_filename: str) -> str | None:
    """Fallback only: used when OCR text is empty/unusable. Not the primary
    signal — see `classify_document_type_from_text` for that."""
    name = (original_filename or "").lower()
    for other_type, keywords in _TYPE_FILENAME_KEYWORDS.items():
        if other_type == expected_doc_type:
            continue
        if any(kw in name for kw in keywords):
            expected_keywords = _TYPE_FILENAME_KEYWORDS.get(expected_doc_type, [])
            if any(kw in name for kw in expected_keywords):
                continue
            return other_type
    return None


def detect_document_type(
    *,
    expected_doc_type: str,
    ocr_text: str,
    original_filename: str | None,
    layoutlm_result: layoutlm_service.LayoutLMResult | None = None,
) -> dict[str, Any]:
    """Priority, per the Phase 5 spec (LayoutLMv3 ADDED to the pipeline, not
    a replacement for it): (1) LayoutLMv3 document-understanding, when it ran
    successfully at HIGH or MEDIUM confidence; (2) the Phase 4 OCR-text
    keyword classifier; (3) the original filename heuristic, as a last
    resort when OCR text itself is too short/absent or inconclusive for
    every type.

    A LOW-confidence LayoutLMv3 result is deliberately NOT trusted as the
    deciding signal — it falls through to the keyword classifier — but is
    still recorded by the caller for the officer-facing "conflicting
    signals" case.
    """
    if layoutlm_result is not None and layoutlm_result.status == "success":
        band = layoutlm_service.confidence_band(layoutlm_result.confidence)
        if band in ("HIGH", "MEDIUM"):
            return {
                "match": layoutlm_result.document_type == expected_doc_type,
                "detected_type": layoutlm_result.document_type,
                "method": "layoutlm",
                "confidence_band": band,
            }
        # LOW confidence -> don't decide on this alone; fall through below.

    usable_text = len((ocr_text or "").strip()) >= MIN_USABLE_OCR_CHARS

    if usable_text:
        detected_type, score = classify_document_type_from_text(ocr_text)
        if detected_type is not None and score > 0:
            return {
                "match": detected_type == expected_doc_type,
                "detected_type": detected_type,
                "method": "keyword",
            }
        # Content classifier found nothing for ANY type (e.g. handwriting,
        # non-textual page) -> fall through to filename as a weaker signal.

    if original_filename:
        suspected = _detect_type_mismatch_from_filename(expected_doc_type=expected_doc_type, original_filename=original_filename)
        if suspected:
            return {"match": False, "detected_type": suspected, "method": "filename"}

    return {"match": True, "detected_type": expected_doc_type, "method": "keyword" if usable_text else "none"}


def _clean_numeric(raw: str) -> str:
    return raw.replace(",", "").replace("Rs.", "").replace("₹", "").strip()


def extract_fields(*, doc_type: str, ocr_result: ocr_service.OCRResult) -> dict[str, Any]:
    """Extracts scheme-relevant fields from REAL OCR output — label:value
    line matching per document type. A field that isn't found is `None` with
    confidence 0.0; nothing here is fabricated from applicant form data."""

    patterns = FIELD_LABEL_PATTERNS.get(doc_type, {})
    fields: dict[str, Any] = {key: None for key in patterns}
    confidence: dict[str, float] = {key: 0.0 for key in patterns}

    for line in ocr_result.lines:
        for field_name, pattern in patterns.items():
            if fields[field_name] is not None:
                continue
            m = re.match(pattern, line.text.strip(), re.IGNORECASE)
            if not m:
                continue
            # The label/value separator match is deliberately lenient (":" or
            # "." — OCR on a low-DPI synthetic or scanned colon sometimes
            # reads as a period), which can leave a stray leading punctuation
            # mark on the captured value; strip it defensively.
            value = m.group(1).strip().lstrip(".:").strip()
            if field_name in ("marks_percentage",):
                try:
                    value = float(_clean_numeric(value))
                except ValueError:
                    pass
            elif field_name == "annual_income":
                try:
                    value = int(float(_clean_numeric(value)))
                except ValueError:
                    pass
            fields[field_name] = value
            confidence[field_name] = round(line.confidence, 2)

    return {
        "extracted_fields": fields,
        "confidence": confidence,
        "raw_text_preview": ocr_result.full_text[:500] if ocr_result.available else "",
        "avg_confidence": round(ocr_result.avg_confidence, 2),
    }


def check_expected_fields(*, extracted_fields: dict[str, Any], expected_fields: list[str]) -> tuple[list[str], list[str]]:
    if not expected_fields:
        return [], []
    found = [f for f in expected_fields if extracted_fields.get(f) not in (None, "")]
    missing = [f for f in expected_fields if f not in found]
    return found, missing


def assess_authenticity_risk(
    *,
    authenticity_check_required: bool,
    document_type_match: bool,
    expected_fields_missing: list[str],
    quality: cv_preprocessing.QualitySignals | None,
    avg_ocr_confidence: float,
) -> dict[str, Any]:
    """Combines only signals this pipeline genuinely has: document-type
    match, scan quality (real OpenCV blur/contrast/resolution measurements),
    expected-field completeness, and OCR confidence. Never a claim that a
    document is definitively fake — LOW/MEDIUM/HIGH is a screening signal for
    officer review, full stop."""

    if not authenticity_check_required:
        return {"authenticity_risk": "LOW", "authenticity_notes": [], "review_required": False}

    notes: list[str] = []
    risk = "LOW"

    if not document_type_match:
        return {
            "authenticity_risk": "HIGH",
            "authenticity_notes": ["Uploaded document's content does not appear to match the required document type."],
            "review_required": True,
        }

    if quality and quality.is_low_resolution:
        risk = "MEDIUM"
        notes.append(f"Low scan resolution ({quality.width}x{quality.height}px) reduces confidence in automated checks.")
    if quality and quality.is_blurry:
        risk = "MEDIUM"
        notes.append(f"Image sharpness is low (Laplacian variance {quality.blur_variance:.0f}); text may be hard to verify.")
    if quality and quality.is_low_contrast:
        risk = "MEDIUM"
        notes.append(f"Low image contrast (stddev {quality.contrast_stddev:.0f}) may hide faint print or watermarks.")

    if expected_fields_missing:
        risk = "MEDIUM"
        notes.append(
            "Expected field(s) not detected by OCR: "
            f"{', '.join(f.replace('_', ' ').title() for f in expected_fields_missing)}."
        )

    if avg_ocr_confidence and avg_ocr_confidence < 0.6:
        risk = "HIGH" if risk == "MEDIUM" else "MEDIUM"
        notes.append(f"OCR text-recognition confidence is low (avg {avg_ocr_confidence:.0%}), reducing verification reliability.")

    return {"authenticity_risk": risk, "authenticity_notes": notes, "review_required": risk in ("MEDIUM", "HIGH")}


def verify_document(
    *,
    doc_type: str,
    extraction: dict[str, Any],
    type_detection: dict[str, Any],
    quality: cv_preprocessing.QualitySignals | None,
    ocr_available: bool,
    ocr_error: str | None,
    layoutlm_result: layoutlm_service.LayoutLMResult | None = None,
    expected_fields: list[str] | None = None,
    authenticity_check_required: bool = True,
) -> dict[str, Any]:
    reasons: list[str] = []

    # Attached to every return path so the officer/API always sees what
    # LayoutLMv3 actually did on this document, even when it wasn't the
    # signal that decided the outcome (unavailable, error, or low
    # confidence and overridden by the Phase 4 keyword classifier).
    layoutlm_out = layoutlm_result.to_dict() if layoutlm_result is not None else {
        "model": layoutlm_service.MODEL_CHECKPOINT, "status": "unavailable",
        "document_type": None, "confidence": 0.0, "processing_time_ms": 0, "fallback_used": True,
    }
    common = {
        "expected_document_type": doc_type,
        "detected_document_type": type_detection.get("detected_type"),
        "document_type_detection_method": type_detection.get("method"),
        "layoutlm": layoutlm_out,
    }
    # A LayoutLMv3 result that ran successfully but at LOW confidence is a
    # genuine "the model itself is unsure" signal — surfaced for officer
    # review regardless of which classifier ultimately decided the type,
    # per the Phase 5 confidence policy (never silently discarded).
    layoutlm_low_confidence = (
        layoutlm_result is not None and layoutlm_result.status == "success"
        and layoutlm_service.confidence_band(layoutlm_result.confidence) == "LOW"
    )

    if not ocr_available:
        # Section 31 fallback: never fabricate. Report unavailability plainly
        # and cap the result at NEEDS_REVIEW — content was never confirmed.
        reasons.append(f"Advanced document analysis unavailable ({ocr_error}). Manual review required.")
        return {
            "result": "NEEDS_REVIEW", "reasons": reasons, "document_type_match": True,
            "expected_fields_found": [], "expected_fields_missing": list(expected_fields or []),
            "authenticity_risk": "MEDIUM", "authenticity_notes": ["OCR engine unavailable for this document."],
            "review_required": True, **common,
        }

    document_type_match = type_detection["match"]
    if not document_type_match:
        reasons.append(
            f"The uploaded document's content appears to be a {type_detection['detected_type'].replace('_', ' ').title()}, "
            f"but a {doc_type.replace('_', ' ').title()} was requested."
        )
        auth = assess_authenticity_risk(
            authenticity_check_required=authenticity_check_required, document_type_match=False,
            expected_fields_missing=[], quality=quality, avg_ocr_confidence=extraction["avg_confidence"],
        )
        return {
            "result": "INVALID", "reasons": reasons, "document_type_match": False,
            "expected_fields_found": [], "expected_fields_missing": list(expected_fields or []), **auth, **common,
        }

    if quality is None:
        reasons.append("Uploaded file could not be read as an image or PDF page.")
        return {
            "result": "INVALID", "reasons": reasons, "document_type_match": True,
            "expected_fields_found": [], "expected_fields_missing": list(expected_fields or []),
            "authenticity_risk": "MEDIUM", "authenticity_notes": ["File could not be decoded."], "review_required": True,
            **common,
        }

    if quality.is_low_quality:
        reasons.append("Scan quality is low (blur, low resolution, or low contrast) — some fields may not be reliably readable.")

    fields = extraction["extracted_fields"]
    if doc_type != "PASSPORT_PHOTO":
        missing_core = [k for k, v in fields.items() if v in (None, "")]
        if missing_core:
            reasons.append(f"Could not read from the document: {', '.join(m.replace('_', ' ').title() for m in missing_core)}.")

    fields_found, fields_missing = check_expected_fields(extracted_fields=fields, expected_fields=expected_fields or [])
    if fields_missing:
        reasons.append(f"Expected field(s) not found: {', '.join(f.replace('_', ' ').title() for f in fields_missing)}.")

    if layoutlm_low_confidence:
        reasons.append(
            f"LayoutLMv3 document-type confidence is low ({layoutlm_result.confidence:.0%}); "
            "routed for officer review rather than trusted automatically."
        )

    auth = assess_authenticity_risk(
        authenticity_check_required=authenticity_check_required, document_type_match=True,
        expected_fields_missing=fields_missing, quality=quality, avg_ocr_confidence=extraction["avg_confidence"],
    )
    auth["review_required"] = auth["review_required"] or layoutlm_low_confidence

    avg_conf = extraction["avg_confidence"]
    if avg_conf < 0.65:
        result = "NEEDS_REVIEW"
        if not reasons:
            reasons.append("OCR extraction confidence is low; manual review is recommended before this is relied upon.")
    elif reasons or auth["review_required"] or layoutlm_low_confidence:
        result = "NEEDS_REVIEW"
    else:
        result = "VERIFIED"
        reasons.append("Document type, readability and expected fields all check out.")

    return {
        "result": result, "reasons": reasons, "document_type_match": document_type_match,
        "expected_fields_found": fields_found, "expected_fields_missing": fields_missing,
        **auth, **common,
    }


def detect_mismatches(documents_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compares extracted fields across an application's documents using
    RapidFuzz (rapidfuzz.fuzz.ratio is a fast, verified-equivalent
    replacement for difflib.SequenceMatcher.ratio()*100 — see the Phase 4
    integration notes; thresholds below are unchanged from the prior
    pipeline on purpose)."""

    fields_to_compare = ["name", "dob", "category", "annual_income", "institution"]
    results: list[dict[str, Any]] = []

    for field in fields_to_compare:
        entries = [
            {"doc_type": d["doc_type"], "value": d["extracted_fields"].get(field)}
            for d in documents_data
            if d["extracted_fields"].get(field) not in (None, "")
        ]
        if len(entries) < 2:
            continue

        worst_similarity = 1.0
        for i in range(len(entries)):
            for j in range(i + 1, len(entries)):
                a, b = str(entries[i]["value"]), str(entries[j]["value"])
                if field in ("dob", "category"):
                    similarity = 1.0 if a.strip().lower() == b.strip().lower() else 0.0
                elif field == "annual_income":
                    try:
                        a_val, b_val = float(a), float(b)
                        diff_ratio = abs(a_val - b_val) / max(a_val, b_val, 1)
                        similarity = max(0.0, 1 - diff_ratio)
                    except ValueError:
                        similarity = 0.0
                else:
                    similarity = fuzz.ratio(a.lower(), b.lower()) / 100
                worst_similarity = min(worst_similarity, similarity)

        if field == "name":
            is_mismatch = worst_similarity < NAME_MATCH_THRESHOLD
            severity = "high" if worst_similarity < NAME_REVIEW_THRESHOLD else "medium"
        else:
            is_mismatch = worst_similarity < 0.98
            severity = "high" if worst_similarity < 0.5 else "medium"

        results.append(
            {
                "field": field,
                "is_mismatch": is_mismatch,
                "severity": severity if is_mismatch else "low",
                "similarity": round(worst_similarity, 2),
                "values": entries,
            }
        )

    return results


def process_document(
    *,
    document_id: str,
    doc_type: str,
    contents: bytes,
    content_type: str,
    original_filename: str | None = None,
    expected_fields: list[str] | None = None,
    authenticity_check_required: bool = True,
    source_language_hint: str | None = None,
) -> dict[str, Any]:
    """Real runtime path: bytes -> (PDF rasterize / decode) -> OpenCV quality
    assessment + conditional preprocessing -> PaddleOCR -> content-based type
    classification -> regex field extraction over OCR text -> verification.

    `source_language_hint` (a FLORES-200 code like "tam_Taml"/"hin_Deva"), if
    given, selects the matching PaddleOCR language-specific recognition
    model up front. This is a real, disclosed limitation, not a shortcut:
    PaddleOCR's default (English-oriented) engine returns confidently WRONG
    text on non-Latin scripts rather than a detectably-low-confidence
    result, so this project cannot reliably auto-detect "wrong OCR engine
    was used" after the fact — see indictrans_service module docstring.
    Omitting the hint (the default) is the exact, unchanged Phase 4/5 path.
    """

    # This floor only makes sense for raster images: a PDF's byte size
    # reflects vector/font instructions, not pixel count, so a perfectly
    # legitimate small PDF (a text-only certificate with no scanned image)
    # can be a few KB and still rasterize into a fully readable page. PDFs
    # are judged on the *rasterized* page's real quality signals below
    # instead (resolution/blur/contrast), not raw byte size.
    is_pdf = content_type == "application/pdf" or contents[:4] == b"%PDF"
    if not is_pdf and len(contents) < MIN_VALID_FILE_SIZE:
        unavailable_layoutlm = {
            "model": layoutlm_service.MODEL_CHECKPOINT, "status": "unavailable",
            "document_type": None, "confidence": 0.0, "processing_time_ms": 0, "fallback_used": True,
        }
        unavailable_translation = {
            "status": "skipped", "source_language": "unknown", "target_language": "eng_Latn",
            "translated_text": None, "model": indictrans_service.MODEL_CHECKPOINT,
            "fallback_used": False, "lines_translated": 0, "total_lines": 0,
        }
        return {
            "extraction": {"extracted_fields": {}, "confidence": {}, "raw_text_preview": "", "avg_confidence": 0.0},
            "verification": {
                "result": "INVALID",
                "reasons": ["File is too small to plausibly contain a readable document. Please upload a clearer scan."],
                "document_type_match": True, "expected_fields_found": [], "expected_fields_missing": list(expected_fields or []),
                "authenticity_risk": "MEDIUM", "authenticity_notes": ["File below minimum plausible size."], "review_required": True,
                "expected_document_type": doc_type, "detected_document_type": None,
                "document_type_detection_method": "none", "layoutlm": unavailable_layoutlm,
                "translation": unavailable_translation,
            },
        }

    image = cv_preprocessing.load_image(contents, content_type)
    quality = cv_preprocessing.assess_quality(image) if image is not None else None

    if image is not None:
        preprocessed = cv_preprocessing.preprocess_for_ocr(image, quality)
        logger.info("doc=%s stage=preprocess quality=%s", document_id, quality.to_dict())
        ocr_result = ocr_service.run_ocr(preprocessed, lang=source_language_hint)
        logger.info(
            "doc=%s stage=ocr available=%s lines=%d avg_conf=%.2f",
            document_id, ocr_result.available, len(ocr_result.lines), ocr_result.avg_confidence,
        )
    else:
        ocr_result = ocr_service.OCRResult(lines=[], available=True, error=None)  # decodable-image check happens in verify_document via `quality is None`

    # LayoutLMv3 ADDED alongside the Phase 4 pipeline, not replacing it: it
    # reuses this same OCR result (no separate OCR run) and its result feeds
    # into detect_document_type() as the first-priority signal, with the
    # Phase 4 keyword/filename chain preserved as the documented fallback.
    # Deliberately uses the ORIGINAL (untranslated) OCR result — see Phase 6
    # spec: LayoutLMv3's layout/text representation is preserved as-is.
    if image is not None:
        layoutlm_result = layoutlm_service.classify_document_type(image, ocr_result)
        logger.info(
            "doc=%s stage=layoutlm status=%s type=%s conf=%.2f fallback=%s",
            document_id, layoutlm_result.status, layoutlm_result.document_type,
            layoutlm_result.confidence, layoutlm_result.fallback_used,
        )
    else:
        layoutlm_result = layoutlm_service.LayoutLMResult(status="unavailable", fallback_used=True, error="Image could not be decoded")

    # IndicTrans2 ADDED alongside Phase 4/5: translates non-English OCR lines
    # to English (preserving names/numbers/identifiers verbatim — see
    # indictrans_service module docstring) so the EXISTING English-language
    # keyword classifier and regex field extraction can work on the result
    # unmodified. English documents pass through with zero lines translated.
    translation_bundle = indictrans_service.translate_ocr_result(ocr_result)
    effective_ocr_result = translation_bundle.translated_ocr_result
    translation_summary = _summarize_translation(translation_bundle)
    logger.info(
        "doc=%s stage=translate applied=%s lines=%d source_langs=%s",
        document_id, translation_bundle.any_translation_applied, len(translation_bundle.lines),
        translation_summary["source_language"],
    )

    extraction = extract_fields(doc_type=doc_type, ocr_result=effective_ocr_result)

    type_detection = detect_document_type(
        expected_doc_type=doc_type, ocr_text=effective_ocr_result.full_text, original_filename=original_filename,
        layoutlm_result=layoutlm_result,
    )
    logger.info("doc=%s stage=classify method=%s detected=%s", document_id, type_detection["method"], type_detection["detected_type"])

    verification = verify_document(
        doc_type=doc_type, extraction=extraction, type_detection=type_detection, quality=quality,
        ocr_available=ocr_result.available, ocr_error=ocr_result.error, layoutlm_result=layoutlm_result,
        expected_fields=expected_fields, authenticity_check_required=authenticity_check_required,
    )
    verification["translation"] = translation_summary
    logger.info("doc=%s stage=verify result=%s risk=%s", document_id, verification["result"], verification["authenticity_risk"])

    return {"extraction": extraction, "verification": verification}


def _summarize_translation(bundle: "indictrans_service.TranslationBundle") -> dict[str, Any]:
    """Collapses the per-line translation records into one document-level
    summary for storage/API — the per-line detail still lives in each
    LineTranslation if ever needed, but callers mostly want "was this
    document translated, from what language, and can it be trusted"."""
    non_english = [ln for ln in bundle.lines if ln.source_language not in ("eng_Latn", "unknown")]
    if not non_english:
        return {
            "status": "skipped", "source_language": "eng_Latn", "target_language": "eng_Latn",
            "translated_text": None, "model": indictrans_service.MODEL_CHECKPOINT,
            "fallback_used": False, "lines_translated": 0, "total_lines": len(bundle.lines),
        }

    lang_counts: dict[str, int] = {}
    for ln in non_english:
        lang_counts[ln.source_language] = lang_counts.get(ln.source_language, 0) + 1
    primary_language = max(lang_counts, key=lang_counts.get)

    succeeded = [ln for ln in non_english if ln.status == "success"]
    any_fallback = any(ln.fallback_used for ln in non_english)
    status = "success" if succeeded and not any_fallback else ("partial" if succeeded else "fallback")

    return {
        "status": status,
        "source_language": primary_language,
        "target_language": "eng_Latn",
        "translated_text": effective_full_text(bundle) if succeeded else None,
        "model": indictrans_service.MODEL_CHECKPOINT,
        "fallback_used": any_fallback,
        "lines_translated": len(succeeded),
        "total_lines": len(bundle.lines),
    }


def effective_full_text(bundle: "indictrans_service.TranslationBundle") -> str:
    return bundle.translated_ocr_result.full_text
