"""IndicTrans2 multilingual text normalization: translates real PaddleOCR
output from a supported Indian language into English, so the existing Phase
4 keyword classifier and regex field extraction (both written for English
labels) can work on non-English documents without themselves being rewritten.

MODEL: ai4bharat/indictrans2-indic-en-dist-200M — a real, publicly available
(gated — requires an HF token from an account that accepted the license)
checkpoint, distilled 200M-parameter indic-to-English direction. PRETRAINED,
not fine-tuned by this project. Loaded via `trust_remote_code=True` (it uses
a custom `IndicTransForConditionalGeneration` architecture) and the official
`IndicTransToolkit` package for the model's required pre/post-processing
(FLORES-200 language-tag prefixing, script normalization, sentence handling).

LANGUAGE SCOPE — read this before trusting any language claim in this file:
- The model's OWN card declares support for ~25 Indian languages (see
  `_SCRIPT_RANGES` below for the ones this module can even detect).
- Only Tamil (tam_Taml) and Hindi (hin_Deva) were actually run through real
  inference and manually checked in this project (see
  scripts/test_indictrans.py). Every other language in `_SCRIPT_RANGES` is
  "the model likely supports it and this module can detect the script," NOT
  "this was tested." `TESTED_LANGUAGES` below is the honest list.

LANGUAGE DETECTION is a deterministic Unicode-script-range counter, NOT an
AI/ML language identifier — disclosed as such in `detect_script_language`.

This module is a layer ADDED alongside Phase 4/5, not a replacement: it
never touches LayoutLMv3's input (which still gets the original, untranslated
OCR result — see ai_pipeline.process_document), and on any failure it falls
back to preserving the original OCR text untouched, never presenting
untranslated text as if it were a translation.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from app.config import get_settings
from app.services import ocr_service

logger = logging.getLogger("app.indictrans")
settings = get_settings()

# FLORES-200-style codes matching what the model/IndicTransToolkit expect.
# Devanagari is shared by Hindi/Marathi/Sanskrit/Nepali; this module defaults
# it to Hindi (the most common case for Indian government certificates) —
# a documented simplification, not a claim of true language ID.
_SCRIPT_RANGES: dict[str, tuple[int, int]] = {
    "tam_Taml": (0x0B80, 0x0BFF),
    "hin_Deva": (0x0900, 0x097F),
    "tel_Telu": (0x0C00, 0x0C7F),
    "kan_Knda": (0x0C80, 0x0CFF),
    "mal_Mlym": (0x0D00, 0x0D7F),
    "ben_Beng": (0x0980, 0x09FF),
    "guj_Gujr": (0x0A80, 0x0AFF),
    "pan_Guru": (0x0A00, 0x0A7F),
    "ory_Orya": (0x0B00, 0x0B7F),
}

# Actually run through real model inference and manually checked this
# session — see the module docstring. Everything else in _SCRIPT_RANGES is
# script-detectable only.
TESTED_LANGUAGES = frozenset({"tam_Taml", "hin_Deva"})

MODEL_CHECKPOINT = "ai4bharat/indictrans2-indic-en-dist-200M"

_model = None
_tokenizer = None
_processor = None
_load_error: str | None = None
_lock = threading.Lock()


def detect_script_language(text: str) -> dict[str, Any]:
    """Deterministic Unicode-script counting — explicitly NOT an AI language
    identifier. Returns the FLORES-200 code of whichever known Indic script
    has the most codepoints in `text`, or "eng_Latn" if no Indic script is
    present, or "unknown" for empty/unusable text."""
    if not text or not text.strip():
        return {"language": "unknown", "method": "script_range", "confidence": 0.0}

    counts = dict.fromkeys(_SCRIPT_RANGES, 0)
    total_indic = 0
    for ch in text:
        cp = ord(ch)
        for lang, (lo, hi) in _SCRIPT_RANGES.items():
            if lo <= cp <= hi:
                counts[lang] += 1
                total_indic += 1
                break

    if total_indic == 0:
        return {"language": "eng_Latn", "method": "script_range", "confidence": 1.0}

    best_lang = max(counts, key=counts.get)
    return {"language": best_lang, "method": "script_range", "confidence": round(counts[best_lang] / total_indic, 2)}


def _load_backbone() -> None:
    global _model, _tokenizer, _processor, _load_error

    if not settings.indictrans_enabled:
        _load_error = "IndicTrans2 disabled via INDICTRANS_ENABLED=false"
        logger.info(_load_error)
        return

    checkpoint = settings.indictrans_model_name
    try:
        import torch  # noqa: F401
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        from IndicTransToolkit import IndicProcessor

        logger.info("Loading IndicTrans2 (%s)...", checkpoint)
        _tokenizer = AutoTokenizer.from_pretrained(checkpoint, trust_remote_code=True)
        _model = AutoModelForSeq2SeqLM.from_pretrained(checkpoint, trust_remote_code=True)
        _model.eval()
        _processor = IndicProcessor(inference=True)
        logger.info("IndicTrans2 loaded.")
    except Exception as exc:  # noqa: BLE001 - a load failure must degrade, not crash the app
        _load_error = f"{type(exc).__name__}: {exc}"
        logger.error("IndicTrans2 failed to load: %s", _load_error)


def _ensure_loaded() -> None:
    if _model is None and _load_error is None:
        with _lock:
            if _model is None and _load_error is None:
                _load_backbone()


@dataclass
class TranslationResult:
    status: str  # "success" | "skipped" | "fallback" | "error"
    source_language: str
    target_language: str = "eng_Latn"
    source_text: str = ""
    translated_text: str | None = None
    model: str = field(default_factory=lambda: settings.indictrans_model_name)
    fallback_used: bool = True
    processing_time_ms: int = 0
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "source_language": self.source_language,
            "target_language": self.target_language,
            "source_text": self.source_text,
            "translated_text": self.translated_text,
            "model": self.model,
            "fallback_used": self.fallback_used,
            "processing_time_ms": self.processing_time_ms,
        }


def translate(text: str, source_language: str, target_language: str = "eng_Latn") -> TranslationResult:
    """Translates one string. Never raises — every failure mode returns a
    TranslationResult with status/fallback_used set, and `translated_text`
    is only ever populated on a genuine successful model translation."""
    t0 = time.time()

    if source_language in ("eng_Latn", "unknown") or source_language == target_language:
        return TranslationResult(
            status="skipped", source_language=source_language, target_language=target_language,
            source_text=text, translated_text=text, fallback_used=False,
            reason="Source is already English or could not be identified — no translation needed.",
        )

    _ensure_loaded()
    if _model is None:
        return TranslationResult(
            status="fallback", source_language=source_language, target_language=target_language,
            source_text=text, translated_text=None, fallback_used=True,
            reason=_load_error or "IndicTrans2 model not loaded",
        )
    if source_language not in TESTED_LANGUAGES:
        # The model may well support this language, but this project has not
        # verified it with a real inference test — attempt it anyway (it's
        # genuinely the same model/code path) but don't hide that it's
        # outside the tested set; the caller/UI can choose to flag this.
        logger.info("Translating untested-but-model-declared language: %s", source_language)

    try:
        batch = _processor.preprocess_batch([text], src_lang=source_language, tgt_lang=target_language)
        inputs = _tokenizer(batch, truncation=True, padding="longest", return_tensors="pt")
        import torch

        with torch.no_grad():
            generated = _model.generate(**inputs, use_cache=True, min_length=0, max_length=256, num_beams=5)
        decoded = _tokenizer.batch_decode(generated, skip_special_tokens=True, clean_up_tokenization_spaces=True)
        translated = _processor.postprocess_batch(decoded, lang=target_language)[0]
        return TranslationResult(
            status="success", source_language=source_language, target_language=target_language,
            source_text=text, translated_text=translated, fallback_used=False,
            processing_time_ms=int((time.time() - t0) * 1000),
        )
    except Exception as exc:  # noqa: BLE001 - translation failure must degrade, not break verification
        logger.error("IndicTrans2 translation failed: %s", exc)
        return TranslationResult(
            status="error", source_language=source_language, target_language=target_language,
            source_text=text, translated_text=None, fallback_used=True,
            reason=f"{type(exc).__name__}: {exc}",
        )


# A line is treated as "label: value" if it has a colon separator — in that
# case only the label is translated and the value is preserved character-
# for-character (names, certificate numbers, dates, amounts must never be
# run through a translation model — see module docstring / Phase 6 spec §10).
_LABEL_VALUE_SPLIT = re.compile(r"^([^:：]{1,40})[:：]\s*(.*)$")


@dataclass
class LineTranslation:
    original_text: str
    translated_text: str
    source_language: str
    status: str
    fallback_used: bool


@dataclass
class TranslationBundle:
    lines: list[LineTranslation]
    translated_ocr_result: ocr_service.OCRResult  # same boxes/confidence, English text — feeds extract_fields/keyword classifier
    any_translation_applied: bool


def translate_ocr_result(ocr_result: ocr_service.OCRResult) -> TranslationBundle:
    """Per-line: detect script, and if it's a supported Indic script,
    translate the label portion of "label: value" lines (preserving the
    value verbatim) or the whole line otherwise. English/undetected lines
    pass through unchanged. Returns a new OCRResult-shaped object with the
    (possibly) translated text but the SAME confidence/box per line, so
    ai_pipeline.extract_fields / classify_document_type_from_text — both
    written for English labels — work unmodified on the result.
    """
    line_records: list[LineTranslation] = []
    new_lines: list[ocr_service.OCRLine] = []
    any_translated = False

    for line in ocr_result.lines:
        detection = detect_script_language(line.text)
        source_lang = detection["language"]

        if source_lang in ("eng_Latn", "unknown"):
            line_records.append(LineTranslation(line.text, line.text, source_lang, "skipped", False))
            new_lines.append(line)
            continue

        m = _LABEL_VALUE_SPLIT.match(line.text)
        if m:
            label_part, value_part = m.group(1), m.group(2)
            label_result = translate(label_part, source_language=source_lang)
            translated_line = f"{label_result.translated_text or label_part}: {value_part}"
        else:
            label_result = translate(line.text, source_language=source_lang)
            translated_line = label_result.translated_text or line.text

        used = label_result.status == "success"
        any_translated = any_translated or used
        line_records.append(LineTranslation(line.text, translated_line, source_lang, label_result.status, label_result.fallback_used))
        new_lines.append(ocr_service.OCRLine(text=translated_line, confidence=line.confidence, box=line.box))

    return TranslationBundle(
        lines=line_records,
        translated_ocr_result=ocr_service.OCRResult(lines=new_lines, available=ocr_result.available, error=ocr_result.error),
        any_translation_applied=any_translated,
    )


def status() -> dict[str, Any]:
    return {"loaded": _model is not None, "error": _load_error, "tested_languages": sorted(TESTED_LANGUAGES)}
