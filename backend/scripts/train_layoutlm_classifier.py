"""Trains the small linear classification head used by
app/services/layoutlm_service.py on top of frozen LayoutLMv3 [CLS]
embeddings.

HONEST DATASET DISCLOSURE (read this before citing any number from this
script's output):
- Source: 100% SYNTHETIC. Every training image is rendered by this script
  using the same PIL-based document renderer as backend/app/seed.py, with
  randomly varied names/institutions/amounts/certificate numbers per sample.
  No real scanned documents, no real applicant data, no external dataset.
- This exists because the actual demo database (backend/app/seed.py) only
  has ~33 documents across ~10 types — far too few to train or validate a
  classifier. This script generates a purpose-built, larger, disclosed-as-
  synthetic corpus instead of pretending the tiny demo DB is enough.
- Labels: the 9 document types that have distinguishing printed text (see
  LABELS below). PASSPORT_PHOTO and OTHER are excluded — they have no
  consistent textual content to classify from.
- Every rendered image is run through the REAL PaddleOCR + LayoutLMv3
  backbone (the same code path used at request time), not a shortcut.
- The measured validation accuracy this script prints and saves is real,
  computed on a held-out split of this synthetic set. It is a demo-scale
  number on synthetic data, not a production accuracy claim — the saved
  metadata says so explicitly, and so does every place that number is shown.

Run from backend/: python -m scripts.train_layoutlm_classifier
"""

from __future__ import annotations

import io
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np

from app.config import get_settings
from app.seed import _render_document_image  # reuse the Phase 4 renderer, not a duplicate one
from app.services import cv_preprocessing, layoutlm_service, ocr_service

settings = get_settings()

LABELS = [
    "IDENTITY_PROOF", "MARKSHEET", "INCOME_CERTIFICATE", "COMMUNITY_CERTIFICATE",
    "RESIDENCE_CERTIFICATE", "DISABILITY_CERTIFICATE", "BANK_PASSBOOK",
    "BONAFIDE_CERTIFICATE", "ADMISSION_PROOF",
]

SAMPLES_PER_CLASS = 15
VAL_FRACTION = 0.2
EPOCHS = 60
LR = 0.01
SEED = 42

_NAMES = [
    "Priya Kumar", "Ramesh Iyer", "Lakshmi Narayanan", "Arjun Mehta", "Divya Nair",
    "Karthik Subramaniam", "Ayesha Siddiqui", "Sanjay Rao", "Meera Pillai", "Vikram Singh",
    "Anjali Desai", "Rahul Verma", "Sneha Reddy", "Farhan Ahmed", "Pooja Iyengar",
]
_INSTITUTIONS = ["Government Arts College, Chennai", "Anna University", "Delhi University", "Osmania University"]
_CATEGORIES = ["OBC", "SC", "ST", "General", "EWS"]


def _sample_fields(doc_type: str, rng: random.Random) -> dict:
    name = rng.choice(_NAMES)
    suffix = rng.randint(100000, 999999)
    if doc_type == "IDENTITY_PROOF":
        return {"name": name, "dob": f"200{rng.randint(0,5)}-0{rng.randint(1,9)}-1{rng.randint(0,9)}", "gender": rng.choice(["Male", "Female"]), "id_number": f"XXXX XXXX {rng.randint(1000,9999)}"}
    if doc_type == "MARKSHEET":
        return {"name": name, "institution": rng.choice(_INSTITUTIONS), "marks_percentage": round(rng.uniform(55, 95), 1), "certificate_number": f"MK{suffix}"}
    if doc_type == "INCOME_CERTIFICATE":
        return {"name": name, "annual_income": rng.choice([120000, 180000, 210000, 300000, 350000]), "certificate_number": f"IC{suffix}", "issue_date": "2026-04-10"}
    if doc_type == "COMMUNITY_CERTIFICATE":
        return {"name": name, "category": rng.choice(_CATEGORIES), "certificate_number": f"CC{suffix}"}
    if doc_type == "RESIDENCE_CERTIFICATE":
        return {"name": name, "address": "Chennai, Tamil Nadu", "certificate_number": f"RC{suffix}"}
    if doc_type == "DISABILITY_CERTIFICATE":
        return {"name": name, "certificate_number": f"DC{suffix}"}
    if doc_type == "BANK_PASSBOOK":
        return {"name": name, "account_number": f"XXXXXXXX{rng.randint(1000,9999)}", "ifsc": f"DEMO0{rng.randint(100000,999999)}"}
    if doc_type == "BONAFIDE_CERTIFICATE":
        return {"name": name, "institution": rng.choice(_INSTITUTIONS)}
    if doc_type == "ADMISSION_PROOF":
        return {"name": name, "institution": rng.choice(_INSTITUTIONS), "course": rng.choice(["B.Sc Computer Science", "B.A Economics", "B.Com", "B.Tech"])}
    return {}


def _extract_embedding(doc_type: str, fields: dict) -> np.ndarray | None:
    data = _render_document_image(doc_type, fields, low_quality=False)
    image = cv_preprocessing.load_image(data, "image/png")
    if image is None:
        return None
    quality = cv_preprocessing.assess_quality(image)
    preprocessed = cv_preprocessing.preprocess_for_ocr(image, quality)
    ocr_result = ocr_service.run_ocr(preprocessed)
    words, boxes = layoutlm_service.ocr_to_words_and_boxes(ocr_result, image.shape)
    if not words:
        return None
    return layoutlm_service.embed(image, words, boxes)


def main() -> None:
    rng = random.Random(SEED)
    print(f"Generating {SAMPLES_PER_CLASS} synthetic samples x {len(LABELS)} classes "
          f"= {SAMPLES_PER_CLASS * len(LABELS)} images, each run through real PaddleOCR + LayoutLMv3...")
    print("(This is a one-time training run. Real OCR makes each sample take a few seconds.)")

    layoutlm_service._load_backbone()
    if layoutlm_service._model is None:
        print(f"FATAL: LayoutLMv3 backbone failed to load: {layoutlm_service._load_error}")
        sys.exit(1)

    X, y = [], []
    t_start = time.time()
    for label in LABELS:
        for i in range(SAMPLES_PER_CLASS):
            fields = _sample_fields(label, rng)
            emb = _extract_embedding(label, fields)
            if emb is None:
                print(f"  [skip] {label} sample {i}: no usable OCR text")
                continue
            X.append(emb)
            y.append(label)
        print(f"  {label}: done ({time.time()-t_start:.0f}s elapsed)")

    print(f"Collected {len(X)} embeddings in {time.time()-t_start:.0f}s.")

    X = np.array(X, dtype=np.float32)
    label_to_idx = {label: i for i, label in enumerate(LABELS)}
    y_idx = np.array([label_to_idx[label] for label in y], dtype=np.int64)

    # Stratified train/val split
    rng_np = np.random.RandomState(SEED)
    train_idx, val_idx = [], []
    for label in LABELS:
        idxs = np.where(y_idx == label_to_idx[label])[0]
        rng_np.shuffle(idxs)
        n_val = max(1, int(len(idxs) * VAL_FRACTION))
        val_idx.extend(idxs[:n_val])
        train_idx.extend(idxs[n_val:])
    train_idx, val_idx = np.array(train_idx), np.array(val_idx)

    import torch
    X_train = torch.tensor(X[train_idx])
    y_train = torch.tensor(y_idx[train_idx])
    X_val = torch.tensor(X[val_idx])
    y_val = torch.tensor(y_idx[val_idx])

    head = torch.nn.Linear(X.shape[1], len(LABELS))
    optimizer = torch.optim.Adam(head.parameters(), lr=LR)
    loss_fn = torch.nn.CrossEntropyLoss()

    print(f"Training linear head: {len(train_idx)} train / {len(val_idx)} val samples, {EPOCHS} epochs...")
    for epoch in range(EPOCHS):
        optimizer.zero_grad()
        logits = head(X_train)
        loss = loss_fn(logits, y_train)
        loss.backward()
        optimizer.step()
        if (epoch + 1) % 20 == 0 or epoch == EPOCHS - 1:
            with torch.no_grad():
                train_acc = (head(X_train).argmax(1) == y_train).float().mean().item()
                val_acc = (head(X_val).argmax(1) == y_val).float().mean().item() if len(val_idx) else float("nan")
            print(f"  epoch {epoch+1}/{EPOCHS}  loss={loss.item():.4f}  train_acc={train_acc:.3f}  val_acc={val_acc:.3f}")

    with torch.no_grad():
        final_val_acc = (head(X_val).argmax(1) == y_val).float().mean().item() if len(val_idx) else None
        val_predictions = head(X_val).argmax(1).tolist() if len(val_idx) else []

    out_dir = os.path.join(settings.model_cache_dir, "layoutlm_head")
    os.makedirs(out_dir, exist_ok=True)

    weight = head.weight.detach().numpy().tolist()
    bias = head.bias.detach().numpy().tolist()
    with open(os.path.join(out_dir, "head.json"), "w", encoding="utf-8") as f:
        json.dump({"weight": weight, "bias": bias, "labels": LABELS}, f)

    metadata = {
        "dataset_source": "synthetic (this project's own PIL document renderer, app/seed.py._render_document_image)",
        "dataset_is_real_scanned_documents": False,
        "num_samples_total": len(X),
        "num_samples_per_class_requested": SAMPLES_PER_CLASS,
        "labels": LABELS,
        "train_samples": len(train_idx),
        "val_samples": len(val_idx),
        "val_fraction": VAL_FRACTION,
        "training_procedure": f"Linear(768,{len(LABELS)}) head on frozen LayoutLMv3-base [CLS] embeddings; "
                               f"Adam(lr={LR}), CrossEntropyLoss, {EPOCHS} epochs, seed={SEED}",
        "measured_validation_accuracy": final_val_acc,
        "measured_on": "held-out split of the SYNTHETIC dataset described above — not a production/real-world accuracy measurement",
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open(os.path.join(out_dir, "training_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print()
    print("=" * 60)
    print(f"Saved classifier head to {out_dir}")
    print(f"Measured validation accuracy: {final_val_acc}" if final_val_acc is not None else "No validation samples.")
    print("This is a demo-scale number on a synthetic dataset — see training_metadata.json.")
    print("=" * 60)


if __name__ == "__main__":
    main()
