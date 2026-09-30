# Scholar Sarthi — Explainable Multi-AI Scholarship & Fellowship Management System

Prototype built for **Smart India Hackathon 2026 — Problem Statement PS 239**.

A full-stack scholarship/fellowship management platform where applicants discover
schemes, submit applications and documents, get AI-assisted document verification
and cross-document mismatch detection, understand *why* they are eligible or not,
correct issues, and track their application — while officers review AI findings,
inspect a deterministic rule-engine eligibility result, and make the final
approve/reject/correction decision.

**Core product principle, enforced end-to-end in the architecture, not just the UI copy:**

> AI assists. Rules determine eligibility. Humans make the final decision.

No endpoint anywhere lets AI auto-approve or auto-reject an application. The
rule engine (`backend/app/services/rule_engine.py`) is pure, deterministic Python.
The AI modules (OCR extraction, verification, mismatch detection) only ever
produce flags, extracted fields and explanations — never a final decision.

---

## 1. Architecture

```
frontend/   React 18 + TypeScript + Vite + Tailwind CSS v4
backend/    FastAPI + SQLAlchemy + SQLite (Postgres-compatible)
```

```
Applicant flow:
  Login -> Discover Scheme -> Check Eligibility (preview) -> Start Application
  -> 8-step wizard (personal/academic/financial/category/documents/AI
     verification/eligibility review/submit) -> Track status -> Correction
     re-upload loop -> Officer decision -> Notification

Officer flow:
  Login -> Queue (filter by status/scheme/flag) -> Review page (applicant info,
  document verification, cross-document mismatch, eligibility engine,
  explanation) -> Approve / Reject / Request Correction (all require a
  recorded reason) -> Audit log entry -> Applicant notified
```

### AI / document-intelligence pipeline

The backend runs on **Python 3.11** specifically for this — PaddlePaddle/PaddleOCR
don't publish prebuilt wheels for very recent Python versions, so the backend
venv targets 3.11 while everything else (Node, the frontend) is unaffected.
See "Backend setup" below for the exact commands.

`backend/app/services/` implements a real, runtime-executed pipeline — every
stage below genuinely reads and processes the uploaded file, not the
applicant's typed-in form data:

- **OpenCV preprocessing** (`cv_preprocessing.py`) — decodes the upload (or
  rasterizes a PDF page via PyMuPDF at 200 DPI), computes real quality
  signals from the actual pixels (Laplacian-variance blur, contrast stddev,
  resolution), and conditionally applies denoising / CLAHE contrast
  enhancement / upscaling — only the operations the measured quality
  actually calls for, never a fixed pipeline run on every image.
- **PaddleOCR** (`ocr_service.py`) — a lazy-loaded, process-wide PP-OCRv6
  engine that runs real text detection + recognition on the preprocessed
  image and returns per-line text with genuine confidence scores. Model
  weights cache under `MODEL_CACHE_DIR` so a restart never re-downloads.
  `enable_mkldnn=False` is required on this stack — PaddlePaddle 3.3.1's
  oneDNN CPU kernel path hits a real PIR-executor bug on Windows; this is a
  verified workaround, not a guess.
- **LayoutLMv3 document understanding** (`layoutlm_service.py`) — see the
  dedicated section below. Added alongside the Phase 4 classifier as the
  first-priority signal, not a replacement for it.
- **Document type classification** (`ai_pipeline.detect_document_type`) —
  priority order: (1) LayoutLMv3, when it ran successfully at HIGH/MEDIUM
  confidence; (2) keyword-matching the *actual OCR text* against each known
  document type; (3) the original filename heuristic, as a last resort when
  OCR text is empty/unusable or inconclusive for every type.
- **Field extraction** (`ai_pipeline.extract_fields`) — regex "label: value"
  matching against real OCR output lines, per document type. A field that
  isn't found is `None` with 0.0 confidence — nothing is fabricated.
- **Cross-document mismatch** (`ai_pipeline.detect_mismatches`) — compares
  name / DOB / category / income / institution across an application's
  documents using **RapidFuzz** (`fuzz.ratio`), a verified numeric-equivalent
  replacement for the previous `difflib.SequenceMatcher` — thresholds were
  not recalibrated.
- **Authenticity risk** (`ai_pipeline.assess_authenticity_risk`) — combines
  document-type match, real CV quality signals, expected-field completeness
  and OCR confidence into LOW/MEDIUM/HIGH. This is a disclosed screening
  signal for officer review, never a "this document is fake" claim.
- **Explainability** — `explain.py`: unchanged, deterministic template engine
  turning rule-engine criteria and mismatch results into "what happened ->
  why -> what to do next" text. Not an LLM, by design.

### LayoutLMv3 document understanding (Phase 5)

**MODEL:** `microsoft/layoutlmv3-base` — a publicly available checkpoint,
downloaded from Hugging Face on first use and cached under `MODEL_CACHE_DIR`.
**MODEL STATUS: pretrained backbone, unmodified** (Microsoft did not
fine-tune this checkpoint for any downstream task, and neither do we) **+ a
small trained classification head** on top of it.

**TASK:** document-type classification. `layoutlm_service.py` reuses the
Phase 4 PaddleOCR output for the same uploaded document (line-level text +
boxes, converted to word-level tokens with each word inheriting its line's
box — PaddleOCR in this configuration doesn't return true word-level boxes,
documented as an approximation in `ocr_to_words_and_boxes`), runs a real
LayoutLMv3 forward pass, and feeds the frozen 768-dim pooled `[CLS]`
embedding into a linear classification head (`torch.nn.Linear(768, 9)`).

**The classification head's training data is 100% synthetic — this matters,
so it's stated plainly rather than left to a metadata file:**
`backend/scripts/train_layoutlm_classifier.py` renders 135 synthetic
documents (15 per class × 9 classes — the document types that have
distinguishing printed text; `PASSPORT_PHOTO`/`OTHER` are excluded) using
this project's own PIL-based renderer, runs each through the real
PaddleOCR + LayoutLMv3 pipeline, and trains the head on a stratified 108/27
train/val split (Adam, 60 epochs). **Measured validation accuracy: 100%
(27/27) — on this synthetic, demo-scale validation set.** This is not a
production or real-scanned-document accuracy claim; on two genuinely new
(non-training) documents generated during manual testing, real-world
confidence measured 67-70%, correctly classified but far more modest —
exactly what you'd expect from a linear head trained on 135 synthetic
samples. Full dataset/training disclosure lives in
`layoutlm_head/training_metadata.json` (path under `MODEL_CACHE_DIR`),
written by the training script itself, not hand-edited.

**Confidence policy** (`layoutlm_service.confidence_band`, engineering
thresholds — not statistically calibrated, and labelled as such in code):
≥75% HIGH (LayoutLMv3 decides document type), 50-75% MEDIUM (LayoutLMv3
decides, but the result is still routed toward review by the normal
verification logic if anything else is off), <50% LOW (LayoutLMv3's guess is
recorded and shown, but the Phase 4 keyword classifier decides instead, and
the document is flagged for officer review specifically because of the low
model confidence).

**Fallback:** if `LAYOUTLM_ENABLED=false`, the model fails to load (missing
weights, OOM, etc.), or a specific document has no usable OCR words, the
result carries `status: "unavailable"` or `"error"` and `fallback_used:
true`, and document-type classification falls straight through to the
Phase 4 keyword/filename chain — verified working via a test that disables
LayoutLMv3 via config and confirms the pipeline still produces a correct
result through the Phase 4 classifier alone. The frontend and API can always tell a real model result
from a fallback one; a fallback is never presented as if it came from the
model.

**Still not real, and not claimed to be:** the React Native mobile client is
a scoped, later phase, not yet built.

### IndicTrans2 multilingual document-text normalization (Phase 6)

**MODEL:** `ai4bharat/indictrans2-indic-en-dist-200M` — a real, publicly
available checkpoint, **gated** on Hugging Face (requires an account that
has accepted the model's license — see `.env.example`). 200M-parameter
distilled indic-to-English direction. **PRETRAINED, not fine-tuned** by
Microsoft/AI4Bharat for any specific task, and not by this project either.
Loaded via `trust_remote_code=True` with the official `IndicTransToolkit`
package for the model's required pre/post-processing.

**Two real environment blockers were hit and resolved, not routed around:**
1. `IndicTransToolkit` has a Cython extension with no prebuilt Windows
   wheel — needed a C++ compiler. Resolved by installing the actual MSVC
   Build Tools (C++ workload only, directed to install on the D: drive to
   avoid the tight C: drive) via winget, then building the toolkit from
   source for real.
2. IndicTrans2's `trust_remote_code=True` model files were written against
   transformers' ~4.4x-era internal API (raised a real `AttributeError` deep
   in tokenizer init under transformers 5.17.0 — not a simple import-path
   issue). Resolved by pinning `transformers==4.44.2` project-wide and
   **re-verifying LayoutLMv3 (Phase 5) still works correctly** on the
   downgraded version before proceeding (it does — LayoutLMv3 is a
   long-stable, mainline architecture with broad version support).

**TASK:** translates real PaddleOCR output line-by-line from a supported
Indian language into English, so the Phase 4 keyword classifier and regex
field extraction (both written for English labels) can work on non-English
documents without being rewritten. Pipeline: PaddleOCR -> per-line script
detection -> IndicTrans2 (label portion only, when a line looks like
"label: value") -> the translated `OCRResult` feeds `extract_fields` /
`classify_document_type_from_text`. **LayoutLMv3 deliberately still
receives the original, untranslated OCR result** — per design, its
layout/text representation is preserved as-is rather than forcing translated
text into it.

**Names, numbers, dates and certificate numbers are never translated.** A
line matching `"label: value"` has only the label translated; the value is
preserved character-for-character. Verified directly: Tamil "பெயர்: பிரியா
குமார்" (Name: Priya Kumar) translated to "Name: பிரியா குமார்" — the label
translated, the name untouched.

**LANGUAGE SCOPE — read before trusting any language claim here:**
- **Tested with real inference and manually checked:** Tamil (`tam_Taml`),
  Hindi (`hin_Deva`) — both text-level (`scripts/`, ad-hoc test scripts) and
  full end-to-end (real Tamil/Hindi image -> PaddleOCR -> IndicTrans2 ->
  field extraction -> classification).
- **Script-detectable, model-declared-supported, NOT individually
  tested:** Telugu, Kannada, Malayalam, Bengali, Gujarati, Punjabi, Odia
  (the model's card claims ~25 languages total; this project only verified
  two).
- Language detection (`indictrans_service.detect_script_language`) is a
  **deterministic Unicode-script-range counter, explicitly not an AI/ML
  language identifier** — disclosed as such in code and here.

**A real, discovered limitation — not glossed over:** PaddleOCR requires
selecting the correct language-specific recognition model *before* running
OCR; there is no single model that reads every script well, and — this
matters — **the wrong-language model returns confidently WRONG text rather
than a detectably-low-confidence result** (measured: 0.83-0.94 confidence on
garbled Latin-looking output from a Tamil image using the English engine).
This means blind auto-detection of a document's language from a raw image,
with zero hints, is **not solved by this phase**. The fix implemented:
`process_document(..., source_language_hint=...)` — an optional FLORES-200
code that selects the matching PaddleOCR engine up front. The upload API
accepts this as an optional form field (`source_language_hint`); omitting it
is the exact, unchanged Phase 4/5 path. There is no frontend language
picker yet — exposing the hint end-to-end through the UI is deferred.

**Another real, discovered limitation — LayoutLMv3 on non-English script:**
LayoutLMv3's classifier head (Phase 5) was trained only on English synthetic
documents. On a real Hindi income certificate, it returned 52% confidence
(just above the MEDIUM trust threshold) for the *wrong* document type
(`COMMUNITY_CERTIFICATE`), overriding what would otherwise have been a
correct keyword-classifier result on the translated text. This is a genuine,
demonstrated limitation of applying an English-trained classifier to
non-English-script input — reported here because it happened during real
testing, not hidden because it's inconvenient. On the equivalent Tamil test,
LayoutLMv3's confidence stayed appropriately LOW (49.79%) and correctly
deferred to the keyword classifier, which got it right. Confidence-band
behavior on non-English script is inconsistent, not reliably calibrated.

**Fallback:** `INDICTRANS_ENABLED=false`, a model/token failure, or an
unsupported language all degrade to `status: "fallback"` or `"skipped"` —
the original OCR text is always preserved untouched, downstream
verification continues normally (with fewer fields extractable, honestly,
since the regex patterns expect English), and the API/UI can always tell a
real translation from a fallback. Verified live: disabling IndicTrans2 via
config on a real Tamil document correctly preserves the original Tamil OCR
text, sets `translated_text: null`, and never fabricates a translation.

**Performance (measured, not invented):** model load ~5-30s (varies by
whether it's a cold process start); real translation inference on a
short label/sentence: 0.3-0.6s on CPU. Full end-to-end (image -> OCR ->
translation -> classification) for a 3-4 line Tamil/Hindi certificate:
roughly 6-12s beyond the existing OCR+LayoutLMv3 cost. CPU-only in this
build; no GPU path implemented for this phase.

**No accuracy benchmark was run.** This project did not measure BLEU,
COMET, or any other translation-quality score, and does not claim
"production-ready" or "100% accurate" translation — six short test
sentences (three Tamil, three Hindi, all certificate-domain vocabulary)
were manually checked and were correct, which is evidence of "the real
model runs and produces sensible output," not a quality benchmark.

### Rule-based eligibility engine

`backend/app/services/rule_engine.py` is a pure function:
`evaluate_eligibility(application, scheme, documents) -> {eligible, criteria[]}`.
Each criterion (Income, Academic Marks, Age, Category, Required Documents) is
evaluated independently and returned with `passed`, `actual`, `required` and a
`detail` string — this is what the applicant and officer both see, so nothing
about the eligibility result is a black box.

---

## 2. Tech stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, React Router,
TanStack Query, Lucide icons, Recharts.
*(React Hook Form / Zod were evaluated but the wizard's step-shaped state made
plain controlled inputs simpler than a schema-driven form for this prototype;
both packages are installed and ready if you want to add stricter validation.)*

**Backend:** Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2.x ORM, Alembic
(schema migrations — see "Database & migrations"), SQLite (local dev) /
PostgreSQL + psycopg v3 (production — both real-tested, same models/code),
python-jose (JWT), bcrypt (password hashing, called directly — see note
below), Pillow (demo document image generation for seed data).

**AI / document processing:** PaddleOCR 3.7 + PaddlePaddle 3.3 (real OCR,
CPU — English by default, plus Tamil/Hindi language-specific recognition
models when a language hint is given), OpenCV (`opencv-contrib-python`, real
preprocessing + quality signals), RapidFuzz (real cross-document fuzzy
matching), PyMuPDF (real PDF rasterization), LayoutLMv3
(`microsoft/layoutlmv3-base` via PyTorch 2.14 CPU + Transformers 4.44 —
pretrained backbone, small classifier head trained on a disclosed synthetic
dataset), IndicTrans2 (`ai4bharat/indictrans2-indic-en-dist-200M` — gated,
pretrained, real Tamil/Hindi translation verified). See "AI
document-intelligence pipeline" above for what's genuinely tested vs.
model-declared-but-untested. React Native mobile is not yet built — a scoped
follow-up phase.

Note: `transformers` is pinned to **4.44.2** (not the 5.x line originally
used for LayoutLMv3 alone) — required for IndicTrans2's remote-code
compatibility, re-verified not to break LayoutLMv3.

**Auth:** JWT bearer tokens, role claim (`applicant` / `officer`), local —
no paid API keys required anywhere in the app.

> **Note on `passlib`:** the originally-planned `passlib[bcrypt]` combination
> is currently broken with `bcrypt>=4.1` (a known upstream incompatibility —
> passlib's backend probe raises on newer bcrypt's stricter 72-byte-password
> handling). `backend/app/security.py` calls the `bcrypt` library directly
> instead; behavior is identical, one fewer dependency.

---

## 3. Folder structure

```
backend/
  app/
    main.py            FastAPI app, CORS, error handlers, router registration
    config.py           Settings (env-driven)
    database.py         SQLAlchemy engine/session
    security.py          JWT + password hashing
    deps.py               get_current_user / require_applicant / require_officer
    models/               SQLAlchemy models (users, schemes, applications, documents,
                          extractions, verifications, mismatches, eligibility,
                          corrections, decisions, notifications, audit logs)
    schemas/               Pydantic request/response schemas
    routers/               auth, schemes, applications, documents, officer,
                          notifications, audit_logs, ai (assistant + file serving)
    services/
      rule_engine.py        Deterministic eligibility rules
      ai_pipeline.py         Extraction / verification / mismatch detection
      explain.py              Explainability templates
      analysis_service.py      Recomputes + persists mismatch/eligibility snapshots
      notification_service.py, audit_service.py
    seed.py                 Demo data seed script
  requirements.txt
  .env.example

frontend/
  src/
    components/
      ui/                  Button, Card, Badge, Modal, Input, SearchBar, Toast,
                          ConfirmDialog, ProgressBar, States (loading/empty/error)
      domain/               FileUploader, DocumentCard, MismatchTable,
                          EligibilityPanel, Timeline, NotificationItem, StatCard,
                          SchemeCard
    layouts/                 ApplicantLayout (dark sidebar + mobile bottom nav),
                          OfficerLayout, PublicShell
    pages/
      applicant/             Dashboard, DiscoverSchemes, MyApplications,
                          ApplicationWizard (8 steps), ApplicationDetail,
                          Notifications, Profile, Assistant
      officer/                Dashboard, ApplicationsList, ApplicationReview,
                          Reports, AuditLogs, SchemesAdmin
      LandingPage, LoginPage, RegisterPage, SchemesExplorer, SchemeDetailsPage
    services/                 Typed axios wrappers per API resource
    hooks/useAuth.tsx           Auth context (JWT in localStorage)
    types/                      Shared TS types mirroring backend schemas
```

---

## 4. Installation & running

### Prerequisites
- **Python 3.11.x specifically** — PaddlePaddle/PaddleOCR do not publish
  prebuilt wheels for newer Python versions (3.12+/3.14). If `python
  --version` on your machine isn't 3.11, install it alongside whatever you
  already have (this does not replace or affect any other Python install):
  - Windows: `winget install Python.Python.3.11` (or the installer from
    python.org), then use `py -3.11` in place of `python` below.
  - macOS/Linux: via your version manager of choice (`pyenv install 3.11`),
    or your OS package manager.
- Node.js 18+ (tested on 24)
- ~5GB free disk space for the OCR/CV model+library stack (PaddlePaddle,
  PaddleOCR, OpenCV and their model weights). If your primary drive is
  tight, see the `MODEL_CACHE_DIR` note below — the venv itself also doesn't
  have to live on a constrained drive; create it wherever you have room and
  reference that path in place of `.venv` below.

### Backend

```bash
cd backend

# Windows:
py -3.11 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
# macOS/Linux:
python3.11 -m venv .venv
source .venv/bin/activate && pip install -r requirements.txt

copy .env.example .env      # (or `cp` on macOS/Linux)
# Defaults work as-is (SQLite). If your system drive is space-constrained,
# edit MODEL_CACHE_DIR in .env to point at a volume with room — PaddleOCR
# downloads ~100MB of model weights to it on first run.

alembic upgrade head        # creates the schema — REQUIRED before seeding
                             # or starting the app (see "Database &
                             # migrations" below); the app deliberately does
                             # NOT auto-create tables on startup
python -m app.seed          # populates demo data (this runs every seed
                             # document through the real OCR pipeline —
                             # first run downloads OCR models and can take a
                             # few minutes; subsequent runs use the cached
                             # models)
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://127.0.0.1:8000` (docs at `/docs`).

**Known real-hardware note:** OCR inference is CPU-bound by default (GPU is
optional — see `USE_GPU` in `.env.example`) and takes roughly 5-50 seconds
per document depending on file size and DPI, measured on this project's
reference machine. This is real processing time, not a fixed delay — plan
demo pacing around it.

### Database & migrations (Phase 7)

The schema is owned by **Alembic** (`backend/alembic/`), not by
`Base.metadata.create_all()` — the app startup code actively checks the
database is at the migrations' current head and **refuses to start
otherwise**, rather than silently creating or drifting the schema. This
applies identically to SQLite (default, local dev) and PostgreSQL
(production) — same SQLAlchemy models, same migrations, same application
code; only `DATABASE_URL` changes.

**Fresh environment:**
```bash
# SQLite (default) — nothing to create, the file is made on first connect:
alembic upgrade head
python -m app.seed

# PostgreSQL — create the database first:
createdb -U postgres scholarship          # or: CREATE DATABASE scholarship;
# Set DATABASE_URL in .env, e.g.:
#   DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/scholarship
alembic upgrade head
python -m app.seed
```

**Existing environment (schema change to apply):**
```bash
# Back up first — this project does not do this for you.
#   SQLite:     cp scholarship.db scholarship.db.backup
#   PostgreSQL: pg_dump -U postgres scholarship > backup.sql
alembic upgrade head
```

**Rollback:** `alembic downgrade <revision>` is supported by the migration
framework, and the full downgrade-to-base path is genuinely exercised every
time `python -m app.seed` resets the demo database (downgrade to base, then
upgrade to head — not `drop_all`/`create_all`). A *partial* downgrade to a
specific intermediate revision has not been tested in this project (there is
currently only one migration, so there is no intermediate revision to
downgrade to) — do not assume it is production-proven beyond what's
described here.

**Driver:** `psycopg` v3 (not the legacy `psycopg2`), installed via the
`[binary]` extra so no C compiler or libpq headers are needed. PostgreSQL
URLs use the `postgresql+psycopg://` scheme.

**What's out of scope for this phase, deliberately:** Docker, Redis,
Kubernetes, replication, sharding, or any deployment/orchestration tooling —
none of that was requested or added. This is migration infrastructure only.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app is now at `http://localhost:5173`. The Vite dev server proxies
`/api/*` to `http://127.0.0.1:8000` (see `vite.config.ts`) — no CORS
configuration needed in development.

### Production build

```bash
cd frontend && npm run build   # outputs frontend/dist
```
Serve `frontend/dist` behind any static host / reverse proxy, pointing
`/api` at the FastAPI service (adjust `CORS_ORIGINS` in `backend/.env`
accordingly).

---

## 5. Demo accounts

| Role      | Email                  | Password  |
|-----------|-------------------------|-----------|
| Applicant | `applicant@demo.com`   | `Demo@123`|
| Officer   | `officer@demo.com`     | `Demo@123`|

The Login page also has one-click "Applicant Demo" / "Officer Demo" buttons
that fill these in.

Six additional applicant accounts (Ramesh Yadav, Sneha Reddy, Mohammed Imran,
Ayesha Siddiqui, Karthik Subramaniam, Divya Nair — all password `Demo@123`)
exist purely to populate the officer queue with realistic variety; they aren't
meant to be advertised as demo logins.

---

## 6. The flagship demo scenario

Priya Kumar's **Merit-cum-Means Undergraduate Scholarship** application
(`APP-2026-00001`) is the scenario described in the product brief, seeded
exactly:

- **Identity Proof:** "Priya Kumar" · **Marksheet:** "Priya K." ·
  **Income Certificate:** "Priya Kumari" · **Community Certificate:** "Priya Kumar"
  → the cross-document mismatch AI flags a **possible name mismatch** without
  auto-rejecting.
- **Declared annual income: ₹3,00,000**, scheme requires **≤ ₹2,50,000** → the
  rule engine returns **NOT ELIGIBLE** on the Income criterion (all other
  criteria pass), with a plain-language explanation:
  *"Your detected annual family income is ₹3,00,000. This scheme requires
  annual income ≤ ₹2,50,000. Review the submitted income information..."*
- Status: `UNDER_OFFICER_REVIEW` — ready for the officer to approve, reject,
  or request a correction live during a demo.

Also seeded: an application already sitting in `CORRECTION_REQUIRED` (to show
the re-upload/resubmit loop instantly, without needing to re-trigger it), one
`APPROVED`, one `DRAFT` (mid-wizard), plus five more applications across the
other demo applicants covering `REJECTED`, `SUBMITTED` and a clean
`UNDER_OFFICER_REVIEW` case with no flags — so the officer dashboard's charts
and every status filter have real data on first run.

**Resetting the demo:** re-run `python -m app.seed` at any time from
`backend/` — it drops and recreates all tables, so you always get back to this
exact state.

---

## 7. How to demonstrate at SIH

A suggested 5-minute walkthrough:

1. **Landing page** (`/`) — explain the "AI assists, rules decide, humans
   approve" principle and the workflow diagram.
2. **Log in as applicant.** Dashboard shows 4 applications across every status
   plus an "Action Required" card.
3. Open the **correction-required** application → show the officer's issue,
   click **Re-upload Document**, drop any PDF/JPG/PNG → watch it re-verify
   live → **Resubmit Application** → status flips to Under Officer Review.
4. Open **APP-2026-00001** (the flagship) → walk through Documents →
   Eligibility Result (NOT ELIGIBLE, income) → Cross-Document Check (name
   mismatch table) → point out the explanation text.
5. **Log out, log in as officer.** Dashboard charts, then open the same
   application from the queue → same data, officer's three-column review
   layout → click **Request Correction** (fill the modal) or **Approve**
   (reason required, confirmation dialog) — show the resulting audit trail
   entry and the notification that would reach the applicant.
6. **Discover Schemes** (public, `/schemes`, no login needed) → scheme detail
   page's "Check Your Eligibility" quick preview.
7. Optional: start a brand-new application end-to-end, uploading real files,
   to prove the AI pipeline reacts to live input, not just canned data.

---

## 8. API overview

All endpoints are under the FastAPI app; interactive docs at `/docs`.

```
POST   /auth/register | /auth/login              GET /auth/me
GET    /schemes                                    GET /schemes/{id}
POST   /schemes/{id}/check-eligibility              (public preview, no application needed)

POST   /applications                                GET /applications
GET    /applications/{id}                           PATCH /applications/{id}
GET    /applications/{id}/corrections
POST   /applications/{id}/submit                    POST /applications/{id}/resubmit

POST   /applications/{id}/documents  (multipart)     POST /documents/{id}/reprocess
DELETE /documents/{id}                                GET  /documents/{id}/file

GET    /officer/applications  (filters: status, scheme_id, flagged, search)
GET    /officer/applications/{id}
POST   /officer/applications/{id}/corrections
POST   /officer/applications/{id}/approve            POST /officer/applications/{id}/reject
GET    /officer/statistics                            GET /officer/reports/export  (CSV)

GET    /notifications                                 POST /notifications/{id}/read
GET    /audit-logs   (officer only)

POST   /assistant/ask         (data-grounded, no external LLM required)
POST   /ai/mismatch/{application_id}
```

Role separation is enforced server-side via `deps.require_applicant` /
`deps.require_officer` — an applicant JWT can never call an officer endpoint
and vice versa, regardless of what the frontend shows.

---

## 9. Security & privacy notes

- Passwords are bcrypt-hashed, never logged or returned by any endpoint.
- JWTs carry `sub` (user id), `role`, and `name`, signed with `JWT_SECRET_KEY`
  (change this in `.env` for any non-demo deployment).
- File uploads are validated by content-type and size (10MB) server-side, and
  stored under a random UUID filename (`documents.py`) — the original filename
  is only ever used for display, never for the on-disk path.
- Every approve/reject/correction records `officer_id`, a timestamp, and a
  mandatory reason in the `decisions` / `correction_requests` tables, and a
  parallel entry in `audit_logs` — nothing is a hidden or reversible action.
- Sensitive identifiers (e.g. ID numbers) are generated pre-masked in the demo
  extraction (`XXXX XXXX 4821`) rather than displayed in full.

---

## 10. Known limitations / what's optional to extend

- **PostgreSQL is implemented and real-tested (Phase 7)** — see "Database &
  migrations". `psycopg` v3 is a real dependency, and a local PostgreSQL 17
  instance was actually installed and exercised (migrations, seed, CRUD
  through live HTTP routes, the full AI regression suite) during
  development — not just declared in `requirements.txt`.
- **Alembic migrations are wired up (Phase 7)** — one migration exists so
  far (`initial schema`), generated from and matching the current models
  exactly. Partial/intermediate-revision downgrade has not been tested
  (there's only one migration); the full downgrade-to-base -> upgrade-to-head
  cycle has been, repeatedly (every demo reset exercises it for real).
- **LayoutLMv3 is integrated (Phase 5)** — see the dedicated section above.
  Its classification head is trained on a small, disclosed **synthetic**
  dataset (135 rendered demo documents), not real scanned documents; do not
  cite its 100% synthetic-validation-set accuracy as a real-world number.
  Its confidence on non-English-script documents (Phase 6) is not reliably
  calibrated — a real Hindi test document was confidently misclassified.
- **IndicTrans2 is integrated (Phase 6)** — see the dedicated section above.
  Only Tamil and Hindi were tested with real inference; other languages the
  model's card claims support are untested. Blind language auto-detection
  from a raw image is NOT solved — the wrong-language OCR model returns
  confidently wrong text rather than a detectable low-confidence signal, so
  a `source_language_hint` API parameter is required for non-English
  documents; there is no frontend language picker yet.
- **No translation-quality benchmark was run** for IndicTrans2 — no BLEU/
  COMET/accuracy score, real or invented. Six manually-checked sentences is
  evidence the real model runs correctly, not a quality measurement.
- **No React Native mobile client exists.** The applicant/officer web app is
  fully responsive, but there is no separate mobile codebase yet.
- Document-type classification and authenticity screening operate on
  real OCR text/quality signals but are not a fraud-detection system — see
  the "AI / document-intelligence pipeline" section for exactly what signals
  are real and what they are (and are not) claimed to mean.
- OCR inference is CPU-bound and takes roughly 5-50 seconds per document on
  this project's reference machine — real processing time, not artificial
  delay. A GPU path exists (`USE_GPU`) but isn't required.
- No email/SMS delivery is wired up for notifications — they're stored and
  shown in-app only (`notifications` table); hooking up a real provider is a
  matter of calling it from `notification_service.notify()`.
- CSV export exists for officer reports; PDF report generation was left out
  for time.
- Bundle size warning on `npm run build` (~850KB main chunk, mostly Recharts)
  — fine for a demo; a production rollout would code-split officer-only
  routes with `React.lazy`.

---

## 11. Verified working (this build)

- Full applicant journey tested live end-to-end, including uploading real
  files through the browser: draft → fill all 4 info steps → upload 3
  documents (each auto-verified) → AI verification step → eligibility review
  (ELIGIBLE) → submit → status correctly moves to `UNDER_OFFICER_REVIEW`.
- Full correction loop tested live: officer requests correction on the
  flagship application → applicant sees the banner with the officer's exact
  issue/comment → re-uploads a document → sees "re-uploaded and re-verified" →
  clicks Resubmit → status returns to `UNDER_OFFICER_REVIEW`, correction
  marked resolved, audit trail updated.
- No console errors or broken routes across applicant, officer and public
  pages, at both desktop (1440px, 1280px) and mobile (390px) viewports.
- `npm run build` (`tsc -b && vite build`) passes with zero TypeScript errors.
