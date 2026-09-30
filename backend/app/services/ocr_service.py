"""PaddleOCR wrapper: lazy-loaded, process-wide singleton engine that runs
real text detection + recognition on the actual preprocessed document image.

Model weights are cached under `settings.model_cache_dir` (env `MODEL_CACHE_DIR`)
via PaddleOCR's own `PADDLE_PDX_CACHE_HOME`, so a restart never re-downloads
them and a missing-model failure is reported clearly rather than hanging.

`enable_mkldnn=False` is required on this stack: PaddlePaddle 3.3.1's oneDNN
CPU kernel path hits a real engine bug on the PIR executor
(`NotImplementedError: ConvertPirAttribute2RuntimeAttribute ... onednn_instruction.cc`)
during text-detection inference on Windows. Disabling MKL-DNN trades a small
amount of CPU throughput for actually working; this is a documented,
verified workaround, not a guess.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.config import get_settings

logger = logging.getLogger("app.ocr")
settings = get_settings()

# "default" is the original, Phase 4/5-verified engine (no `lang=` kwarg —
# unchanged from before Phase 6, so existing English-document behavior is
# byte-for-byte the same). Additional entries are lazily added for specific
# non-English scripts when a caller passes a language hint (see
# `run_ocr(..., lang=...)`) — PaddleOCR requires the correct
# language-specific recognition model to be selected per script; there is no
# single model that reads every script well (confirmed empirically: the
# default engine returns high-confidence GARBAGE on Tamil/Hindi input rather
# than a low-confidence signal, so this can't be solved by a quality check
# after the fact — see indictrans_service module docstring / README).
_engines: dict[str, Any] = {}
_engine_errors: dict[str, str] = {}
_engine_lock = threading.Lock()

# Maps the FLORES-200-style codes indictrans_service uses to PaddleOCR's own
# `lang=` codes. Only languages actually verified to have a working
# PaddleOCR recognition model in this project are listed; anything else
# falls back to the default (English-oriented) engine.
FLORES_TO_PADDLE_LANG: dict[str, str] = {
    "tam_Taml": "ta",
    "hin_Deva": "hi",
}


@dataclass
class OCRLine:
    text: str
    confidence: float
    box: list[list[float]] | None = None


@dataclass
class OCRResult:
    lines: list[OCRLine] = field(default_factory=list)
    available: bool = True
    error: str | None = None

    @property
    def full_text(self) -> str:
        return "\n".join(line.text for line in self.lines)

    @property
    def avg_confidence(self) -> float:
        if not self.lines:
            return 0.0
        return sum(line.confidence for line in self.lines) / len(self.lines)


def _load_engine(key: str) -> None:
    """Loads one PaddleOCR engine (keyed by "default" or a PaddleOCR `lang=`
    code) once per process. Any failure here (missing model files with no
    network access, an incompatible wheel, etc.) is surfaced as a real error
    string — the caller must not pretend OCR ran."""
    os.makedirs(settings.model_cache_dir, exist_ok=True)
    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", os.path.abspath(settings.model_cache_dir))

    try:
        from paddleocr import PaddleOCR

        kwargs = dict(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,  # see module docstring
        )
        if key != "default":
            kwargs["lang"] = key
        logger.info("Loading PaddleOCR engine key=%s (cache: %s)...", key, settings.model_cache_dir)
        _engines[key] = PaddleOCR(**kwargs)
        logger.info("PaddleOCR engine key=%s loaded.", key)
    except Exception as exc:  # noqa: BLE001 - we deliberately convert any load failure into a reported blocker
        _engine_errors[key] = f"{type(exc).__name__}: {exc}"
        logger.error("PaddleOCR engine key=%s failed to load: %s", key, _engine_errors[key])


def get_engine(key: str = "default"):
    if key not in _engines and key not in _engine_errors:
        with _engine_lock:
            if key not in _engines and key not in _engine_errors:
                _load_engine(key)
    return _engines.get(key)


def run_ocr(image: np.ndarray, lang: str | None = None) -> OCRResult:
    """`lang`, when given, is a FLORES-200-style code (e.g. "tam_Taml") from
    indictrans_service's script detection — mapped to the matching PaddleOCR
    language-specific recognition model via FLORES_TO_PADDLE_LANG. Defaults
    to the original English-oriented engine when no mapping exists, which is
    the entire Phase 4/5 behavior, unchanged."""
    key = FLORES_TO_PADDLE_LANG.get(lang or "", "default")
    engine = get_engine(key)
    if engine is None:
        return OCRResult(lines=[], available=False, error=_engine_errors.get(key) or f"OCR engine ({key}) unavailable")

    try:
        raw_results = engine.predict(image)
    except Exception as exc:  # noqa: BLE001 - a bad frame must degrade, not 500 the request
        logger.error("PaddleOCR inference failed (key=%s): %s", key, exc)
        return OCRResult(lines=[], available=False, error=f"{type(exc).__name__}: {exc}")

    lines: list[OCRLine] = []
    for res in raw_results:
        texts = res.get("rec_texts", [])
        scores = res.get("rec_scores", [])
        boxes = res.get("rec_polys") or res.get("dt_polys") or [None] * len(texts)
        for text, score, box in zip(texts, scores, boxes):
            if not text or not text.strip():
                continue
            box_list = box.tolist() if hasattr(box, "tolist") else box
            lines.append(OCRLine(text=text.strip(), confidence=float(score), box=box_list))

    return OCRResult(lines=lines, available=True, error=None)


def engine_status() -> dict[str, Any]:
    """For developer diagnostics / startup health checks."""
    return {
        "loaded_engines": list(_engines.keys()),
        "errors": dict(_engine_errors),
        "model_cache_dir": settings.model_cache_dir,
    }
