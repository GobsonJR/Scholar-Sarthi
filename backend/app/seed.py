"""Seeds the database with realistic demo data: two demo login accounts,
five demo schemes, and a set of applications spanning every status so the
applicant dashboard and officer queue both have something meaningful to show
immediately after a fresh install.

Run with:  python -m app.seed
"""

import io
import os
from datetime import date, datetime, timedelta, timezone

from app.config import get_settings
from app.database import SessionLocal, engine
from app.models.application import Application, CorrectionRequest, Decision, MismatchResult, EligibilityResult
from app.models.document import Document, DocumentExtraction, VerificationResult
from app.models.notification import Notification
from app.models.scheme import Scheme, SchemeDocument, SchemeRule
from app.models.user import ApplicantProfile, OfficerProfile, User
from app.security import hash_password
from app.services import ai_pipeline, rule_engine
from app.services.analysis_service import refresh_application_analysis
from app.services.audit_service import log_action
from app.services.explain import build_eligibility_explanation, explain_criterion
from app.services.notification_service import notify

settings = get_settings()
TODAY = date(2026, 9, 29)


# Header text per document type, chosen so it actually contains the keywords
# ai_pipeline._TYPE_TEXT_KEYWORDS looks for — the seed images are read by the
# REAL OCR pipeline, so the printed text has to be genuinely classifiable,
# not just decorative.
_DOC_HEADERS: dict[str, str] = {
    "IDENTITY_PROOF": "GOVERNMENT OF INDIA - IDENTITY PROOF",
    "MARKSHEET": "MARKSHEET - STATEMENT OF MARKS",
    "INCOME_CERTIFICATE": "INCOME CERTIFICATE",
    "COMMUNITY_CERTIFICATE": "COMMUNITY CERTIFICATE",
    "RESIDENCE_CERTIFICATE": "RESIDENCE CERTIFICATE",
    "DISABILITY_CERTIFICATE": "DISABILITY CERTIFICATE",
    "BANK_PASSBOOK": "BANK PASSBOOK",
    "BONAFIDE_CERTIFICATE": "BONAFIDE CERTIFICATE",
    "ADMISSION_PROOF": "ADMISSION PROOF - ADMISSION LETTER",
    "PASSPORT_PHOTO": "PASSPORT SIZE PHOTOGRAPH",
}

# Extra sentence per type containing a second classification keyword (e.g.
# "belongs to", "bonafide student", "is a resident of") beyond the header, so
# content-based classification has more than one signal to work with — the
# same margin a real certificate's boilerplate phrasing would give it.
_DOC_TAGLINES: dict[str, str] = {
    "COMMUNITY_CERTIFICATE": "This is to certify that the applicant belongs to the community category stated below.",
    "RESIDENCE_CERTIFICATE": "This is to certify that the applicant is a resident of the address stated below.",
    "BONAFIDE_CERTIFICATE": "This is to certify that the applicant is a bonafide student of the institution stated below.",
    "BANK_PASSBOOK": "Savings Account Passbook",
}

_FIELD_LABELS: dict[str, str] = {
    "name": "Name", "dob": "DOB", "gender": "Gender", "id_number": "ID Number",
    "institution": "Institution", "marks_percentage": "Marks Percentage", "certificate_number": "Certificate Number",
    "annual_income": "Annual Income", "issue_date": "Issue Date", "category": "Category",
    "address": "Address", "account_number": "Account Number", "ifsc": "IFSC", "course": "Course",
}


def _stable_suffix(*parts: str, digits: int = 6) -> str:
    import hashlib

    h = hashlib.sha256("::".join(parts).encode()).hexdigest()
    return str(int(h, 16))[:digits]


def _default_fields_for(doc_type: str, application: Application) -> dict:
    """Field values sourced from the applicant's own declared profile data —
    this is what actually gets PRINTED into the rendered demo document image,
    then independently re-derived by the real OCR pipeline. Consistent by
    default; specific seed calls override individual fields (e.g. the
    flagship scenario's deliberate name variants) to build a demo story."""
    personal = application.personal_info or {}
    academic = application.academic_info or {}
    financial = application.financial_info or {}
    category = application.category_info or {}
    name = personal.get("full_name", "Applicant")
    suffix = lambda prefix: f"{prefix}{_stable_suffix(application.id, doc_type)}"  # noqa: E731

    by_type = {
        "IDENTITY_PROOF": {"name": name, "dob": personal.get("dob", ""), "gender": personal.get("gender", ""), "id_number": f"XXXX XXXX {_stable_suffix(application.id, doc_type, digits=4)}"},
        "MARKSHEET": {"name": name, "institution": academic.get("institution", ""), "marks_percentage": academic.get("marks_percentage", ""), "certificate_number": suffix("MK")},
        "INCOME_CERTIFICATE": {"name": name, "annual_income": financial.get("annual_income", ""), "certificate_number": suffix("IC"), "issue_date": financial.get("certificate_issue_date", "")},
        "COMMUNITY_CERTIFICATE": {"name": name, "category": category.get("category", ""), "certificate_number": suffix("CC")},
        "RESIDENCE_CERTIFICATE": {"name": name, "address": personal.get("address", "Chennai, Tamil Nadu"), "certificate_number": suffix("RC")},
        "DISABILITY_CERTIFICATE": {"name": name, "certificate_number": suffix("DC")},
        "BANK_PASSBOOK": {"name": name, "account_number": f"XXXXXXXX{_stable_suffix(application.id, doc_type, digits=4)}", "ifsc": f"DEMO0{_stable_suffix(application.id, doc_type, digits=6)}"},
        "BONAFIDE_CERTIFICATE": {"name": name, "institution": academic.get("institution", "")},
        "ADMISSION_PROOF": {"name": name, "institution": academic.get("institution", ""), "course": academic.get("course", "")},
        "PASSPORT_PHOTO": {},
    }
    return by_type.get(doc_type, {})


def _render_document_image(doc_type: str, fields: dict, *, low_quality: bool = False) -> bytes:
    """Renders an actually-OCR-readable certificate-style demo image: a
    header line (classification keywords), an optional tagline (a second
    classification signal), and one "Label: Value" line per field (the exact
    shape ai_pipeline.FIELD_LABEL_PATTERNS matches against real OCR output).

    `low_quality=True` genuinely degrades the image — smaller canvas,
    Gaussian blur, reduced contrast — rather than padding the file with null
    bytes. The pipeline's quality signals are computed from real pixels now,
    so the "low quality" demo scenario has to actually produce a low-quality
    image.
    """
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

    # PIL's built-in bitmap font is tiny (~11px) and OCRs poorly (words
    # merge, e.g. "GOVERNMENT OF" -> "GOVERNMENTOF"). A real TrueType font at
    # a legible size is what makes this a genuine OCR test rather than a
    # font-rendering edge case. Falls back to the bitmap font if the system
    # has no Arial (e.g. a non-Windows CI runner).
    try:
        header_font = ImageFont.truetype("arial.ttf", 22)
        body_font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        header_font = body_font = ImageFont.load_default()

    width, height = (420, 300) if low_quality else (900, 560)
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    y = 20
    draw.text((30, y), _DOC_HEADERS.get(doc_type, doc_type.replace("_", " ")), fill=(15, 23, 42), font=header_font)
    y += 40
    tagline = _DOC_TAGLINES.get(doc_type)
    if tagline:
        draw.text((30, y), tagline, fill=(15, 23, 42), font=body_font)
        y += 32
    for field_name, value in fields.items():
        label = _FIELD_LABELS.get(field_name, field_name.replace("_", " ").title())
        if field_name == "annual_income" and value not in (None, ""):
            value = f"Rs. {value}"
        draw.text((30, y), f"{label}: {value}", fill=(15, 23, 42), font=body_font)
        y += 32

    if low_quality:
        img = img.filter(ImageFilter.GaussianBlur(radius=2.2))
        img = ImageEnhance.Contrast(img).enhance(0.35)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _save_file(filename: str, data: bytes) -> None:
    os.makedirs(settings.upload_dir, exist_ok=True)
    with open(os.path.join(settings.upload_dir, filename), "wb") as f:
        f.write(data)


def _create_user(db, *, email, password, full_name, role, phone=None, **profile_kwargs) -> User:
    user = User(email=email, password_hash=hash_password(password), full_name=full_name, role=role, phone=phone)
    db.add(user)
    db.flush()
    if role == "applicant":
        db.add(ApplicantProfile(user_id=user.id, **profile_kwargs))
    else:
        db.add(OfficerProfile(user_id=user.id, **profile_kwargs))
    db.flush()
    return user


# Expected fields per document type, matching exactly what
# ai_pipeline.extract_fields() actually produces for that type — so the
# "expected fields found/missing" check is meaningful, not decorative.
EXPECTED_FIELDS_BY_TYPE = {
    "IDENTITY_PROOF": ["name", "dob", "gender", "id_number"],
    "MARKSHEET": ["name", "institution", "marks_percentage", "certificate_number"],
    "INCOME_CERTIFICATE": ["name", "annual_income", "certificate_number", "issue_date"],
    "COMMUNITY_CERTIFICATE": ["name", "category", "certificate_number"],
    "RESIDENCE_CERTIFICATE": ["name", "address", "certificate_number"],
    "DISABILITY_CERTIFICATE": ["name", "certificate_number"],
    "BANK_PASSBOOK": ["name", "account_number", "ifsc"],
    "BONAFIDE_CERTIFICATE": ["name", "institution"],
    "ADMISSION_PROOF": ["name", "institution", "course"],
    "PASSPORT_PHOTO": [],
}


def _create_scheme(db, *, rules: list[tuple], documents: list[tuple], **kwargs) -> Scheme:
    """rules: [(field, operator, value, label)], documents: [(document_type, document_name, description)]."""
    scheme = Scheme(status=kwargs.pop("status", "ACTIVE"), version=1, **kwargs)
    db.add(scheme)
    db.flush()
    for i, (field, operator, value, label) in enumerate(rules):
        db.add(SchemeRule(scheme_id=scheme.id, field=field, operator=operator, value=value, label=label, sort_order=i))
    for i, (doc_type, doc_name, description) in enumerate(documents):
        db.add(
            SchemeDocument(
                scheme_id=scheme.id, document_type=doc_type, document_name=doc_name, description=description, sort_order=i,
                accepted_file_types=["application/pdf", "image/jpeg", "image/png"],
                max_file_size_mb=5 if doc_type == "INCOME_CERTIFICATE" else 10,
                validity_required=doc_type == "INCOME_CERTIFICATE",
                authenticity_check_required=doc_type != "PASSPORT_PHOTO",
                expected_fields=EXPECTED_FIELDS_BY_TYPE.get(doc_type, []),
            )
        )
    db.flush()
    return scheme


_display_counter = {"n": 0}


def _next_display_id() -> str:
    _display_counter["n"] += 1
    return f"APP-2026-{_display_counter['n']:05d}"


def _add_document(
    db,
    *,
    application: Application,
    doc_type: str,
    low_quality: bool = False,
    field_overrides: dict | None = None,
) -> Document:
    """Renders a real, OCR-readable demo document image and runs it through
    the ACTUAL ai_pipeline.process_document() — no hand-inserted fabricated
    extraction/verification rows. `field_overrides` lets specific seed calls
    deliberately vary a field (e.g. the flagship scenario's name variants)
    while everything else still comes from the applicant's own profile data."""
    fields = _default_fields_for(doc_type, application)
    if field_overrides:
        fields.update(field_overrides)

    data = _render_document_image(doc_type, fields, low_quality=low_quality)
    stored_filename = f"seed_{application.id}_{doc_type.lower()}.png"
    _save_file(stored_filename, data)

    original_filename = f"{doc_type.title().replace('_', ' ')}.png"
    document = Document(
        application_id=application.id,
        doc_type=doc_type,
        original_filename=original_filename,
        stored_filename=stored_filename,
        content_type="image/png",
        file_size=len(data),
        status="UPLOADED",
        version=1,
        is_current=True,
    )
    db.add(document)
    db.flush()

    scheme_document = next((sd for sd in application.scheme.documents if sd.document_type == doc_type), None)
    document.scheme_document_id = scheme_document.id if scheme_document else None

    result = ai_pipeline.process_document(
        document_id=document.id,
        doc_type=doc_type,
        contents=data,
        content_type="image/png",
        original_filename=original_filename,
        expected_fields=scheme_document.expected_fields if scheme_document else [],
        authenticity_check_required=scheme_document.authenticity_check_required if scheme_document else True,
    )
    extraction, verification = result["extraction"], result["verification"]

    db.add(
        DocumentExtraction(
            document_id=document.id,
            extracted_fields=extraction["extracted_fields"],
            confidence=extraction["confidence"],
            raw_text_preview=extraction["raw_text_preview"],
        )
    )
    db.add(
        VerificationResult(
            document_id=document.id,
            result=verification["result"],
            reasons=verification["reasons"],
            document_type_match=verification.get("document_type_match", True),
            expected_fields_found=verification.get("expected_fields_found", []),
            expected_fields_missing=verification.get("expected_fields_missing", []),
            authenticity_risk=verification.get("authenticity_risk", "LOW"),
            authenticity_notes=verification.get("authenticity_notes", []),
            review_required=verification.get("review_required", False),
            expected_document_type=verification.get("expected_document_type"),
            detected_document_type=verification.get("detected_document_type"),
            document_type_detection_method=verification.get("document_type_detection_method"),
            layoutlm_result=verification.get("layoutlm"),
            translation_result=verification.get("translation"),
        )
    )
    document.status = verification["result"]
    document.processed_at = datetime.now(timezone.utc)
    db.flush()
    return document


def _finalize_analysis(db, application: Application):
    refresh_application_analysis(db, application)


def _reset_schema_via_alembic() -> None:
    """Recreates the schema by actually exercising the migration chain
    (downgrade to base, then upgrade to head) rather than
    Base.metadata.drop_all()/create_all() — this is what "the schema is
    owned by Alembic" means in practice: even a full reset goes through the
    same migrations that `alembic upgrade head` would run in production,
    proving on every reset that the migrations remain reproducible from
    scratch."""
    from alembic.config import Config
    from alembic import command

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    engine.dispose()  # release any pooled connections before DDL that recreates every table
    command.downgrade(alembic_cfg, "base")
    command.upgrade(alembic_cfg, "head")


def seed():
    print("Resetting database (via Alembic downgrade base -> upgrade head)...")
    _reset_schema_via_alembic()

    db = SessionLocal()
    try:
        print("Creating demo users...")
        applicant = _create_user(
            db,
            email="applicant@demo.com",
            password="Demo@123",
            full_name="Priya Kumar",
            role="applicant",
            phone="+91-9840012345",
            dob="2005-06-12",
            gender="Female",
            category="OBC",
            state="Tamil Nadu",
            address="14 Anna Nagar, Chennai, Tamil Nadu",
        )
        officer = _create_user(
            db,
            email="officer@demo.com",
            password="Demo@123",
            full_name="Arjun Mehta",
            role="officer",
            phone="+91-9900011122",
            department="State Scholarship Directorate",
            designation="Verification Officer",
        )

        others = []
        for email, name, category, state in [
            ("ramesh.yadav@example.com", "Ramesh Yadav", "General", "Uttar Pradesh"),
            ("sneha.reddy@example.com", "Sneha Reddy", "SC", "Telangana"),
            ("mohammed.imran@example.com", "Mohammed Imran", "Minority", "Karnataka"),
            ("ayesha.siddiqui@example.com", "Ayesha Siddiqui", "General", "Maharashtra"),
            ("karthik.s@example.com", "Karthik Subramaniam", "OBC", "Tamil Nadu"),
            ("divya.nair@example.com", "Divya Nair", "General", "Kerala"),
        ]:
            others.append(
                _create_user(
                    db, email=email, password="Demo@123", full_name=name, role="applicant",
                    dob="2004-03-15", gender="Other", category=category, state=state, address=f"Demo address, {state}",
                )
            )
        ramesh, sneha, imran, ayesha, karthik, divya = others

        print("Creating demo schemes...")

        DOCS4 = [
            ("IDENTITY_PROOF", "Identity Proof", "Any government-issued photo ID (Aadhaar, voter ID, passport)."),
            ("MARKSHEET", "Marksheet", "Most recent qualifying examination marksheet."),
            ("INCOME_CERTIFICATE", "Income Certificate", "Valid income certificate for the current financial year."),
            ("COMMUNITY_CERTIFICATE", "Community Certificate", "Caste/community certificate issued by a competent authority."),
        ]

        scheme_merit = _create_scheme(
            db, name="Merit-cum-Means Undergraduate Scholarship", provider="State Higher Education Board (Demo)",
            category="merit", scheme_type="scholarship", education_level="Undergraduate", state="All India",
            institution_type="Government", short_description="Financial support for meritorious undergraduate students from low-income families.",
            overview="This demo scheme supports undergraduate students who demonstrate strong academic performance while belonging to families with limited annual income. It covers tuition support and a yearly stipend, disbursed directly after verification.",
            benefits="Tuition support plus a one-time book grant, disbursed directly to the student's account after officer approval.",
            benefit_amount="Rs. 50,000/year", benefit_duration="1 year, renewable on re-application", benefit_coverage="Tuition fees + Rs. 5,000 book grant",
            application_process="Apply online, upload required documents, complete AI-assisted verification, and await officer review. Decisions are typically communicated within 15 working days of submission.",
            deadline=date(2026, 11, 30), application_start=date(2026, 8, 1), correction_deadline=date(2026, 12, 15), result_date=date(2027, 1, 15),
            faqs=[
                {"question": "Can I apply if I'm in my final year?", "answer": "Yes, students at any undergraduate year are eligible as long as the other criteria are met."},
                {"question": "What if my income certificate is more than a year old?", "answer": "Upload the most recent certificate you have; an officer will flag it for renewal if needed."},
            ],
            rules=[
                ("income", "<=", 250000, "Annual Family Income"),
                ("marks", ">=", 60, "Academic Marks"),
                ("age", ">=", 17, "Minimum Age"),
                ("age", "<=", 25, "Maximum Age"),
            ],
            documents=DOCS4,
        )
        scheme_postmatric = _create_scheme(
            db, name="Post-Matric Scholarship for SC/ST/OBC Students", provider="Ministry of Social Welfare (Demo)",
            category="need-based", scheme_type="scholarship", education_level="Undergraduate", state="All India",
            institution_type="Any",
            short_description="Income-linked support for SC/ST/OBC students pursuing post-matriculation studies.",
            overview="Provides tuition and maintenance allowance to students from SC, ST and OBC communities who are pursuing studies beyond the 10th standard, subject to an income ceiling.",
            benefits="Full tuition reimbursement plus a monthly maintenance allowance for hostel/day-scholar students.",
            benefit_amount="Rs. 2,500/month + tuition", benefit_duration="Full academic year", benefit_coverage="Tuition fees + monthly maintenance allowance",
            application_process="Apply online with community and income certificates. Applications are reviewed by a designated verification officer after automated document checks.",
            deadline=date(2026, 10, 31), application_start=date(2026, 7, 15), correction_deadline=date(2026, 11, 15), result_date=date(2026, 12, 10),
            faqs=[{"question": "Is this scheme open to General category students?", "answer": "No — this scheme is reserved for OBC, SC and ST students only."}],
            rules=[
                ("income", "<=", 200000, "Annual Family Income"),
                ("marks", ">=", 50, "Academic Marks"),
                ("age", ">=", 15, "Minimum Age"),
                ("age", "<=", 30, "Maximum Age"),
                ("category", "in", ["OBC", "SC", "ST"], "Eligible Category"),
            ],
            documents=DOCS4,
        )
        scheme_fellowship = _create_scheme(
            db, name="Postgraduate Research Fellowship", provider="National Research Council (Demo)",
            category="research", scheme_type="fellowship", education_level="Postgraduate", state="All India",
            institution_type="University",
            short_description="Monthly fellowship for postgraduate scholars engaged in full-time research.",
            overview="Supports postgraduate and pre-doctoral scholars conducting full-time research at recognised universities, with a monthly fellowship and annual contingency grant.",
            benefits="Monthly fellowship plus an annual contingency grant for research-related expenses.",
            benefit_amount="Rs. 31,000/month", benefit_duration="Up to 3 years, reviewed annually", benefit_coverage="Monthly stipend + Rs. 20,000/year contingency grant",
            application_process="Apply with proof of admission and academic transcripts. A verification officer reviews research proposals alongside automated document checks.",
            deadline=date(2026, 12, 15), application_start=date(2026, 9, 1), correction_deadline=date(2027, 1, 5), result_date=date(2027, 2, 1),
            faqs=[{"question": "Do I need a supervisor's letter?", "answer": "Not at application stage — the admission proof document is sufficient for the initial review."}],
            rules=[
                ("marks", ">=", 70, "Academic Marks"),
                ("age", ">=", 21, "Minimum Age"),
                ("age", "<=", 32, "Maximum Age"),
            ],
            documents=[
                ("IDENTITY_PROOF", "Identity Proof", "Any government-issued photo ID."),
                ("MARKSHEET", "Marksheet", "Most recent qualifying degree marksheet/transcript."),
                ("ADMISSION_PROOF", "Admission Proof", "Bonafide/admission certificate from the research institution."),
            ],
        )
        scheme_girls = _create_scheme(
            db, name="Girls' Education Encouragement Scholarship", provider="Directorate of School Education (Demo)",
            category="gender-equity", scheme_type="scholarship", education_level="Secondary", state="All India",
            institution_type="Any",
            short_description="Encouraging secondary and higher-secondary education among girl students from low-income households.",
            overview="A one-time scholarship encouraging girl students to continue secondary and higher-secondary education, aimed at reducing dropout rates.",
            benefits="One-time grant paid directly to the student, plus free textbooks for the academic year.",
            benefit_amount="Rs. 15,000 one-time", benefit_duration="One-time", benefit_coverage="Cash grant + textbooks",
            application_process="Apply with school ID, income certificate and latest marksheet. Reviewed by the state education office.",
            deadline=date(2026, 10, 15), application_start=date(2026, 7, 1), correction_deadline=date(2026, 10, 31), result_date=date(2026, 11, 20),
            faqs=[{"question": "Is this scheme only for girls?", "answer": "Yes, this demo scheme is specifically for girl students in secondary/higher-secondary education."}],
            rules=[
                ("income", "<=", 300000, "Annual Family Income"),
                ("marks", ">=", 50, "Academic Marks"),
                ("age", ">=", 13, "Minimum Age"),
                ("age", "<=", 19, "Maximum Age"),
            ],
            documents=[
                ("IDENTITY_PROOF", "Identity Proof", "School ID or any government-issued photo ID."),
                ("MARKSHEET", "Marksheet", "Latest available marksheet."),
                ("INCOME_CERTIFICATE", "Income Certificate", "Valid income certificate for the current financial year."),
            ],
        )
        scheme_minority = _create_scheme(
            db, name="Minority Community Merit Scholarship", provider="Minority Welfare Board (Demo)",
            category="minority", scheme_type="scholarship", education_level="Undergraduate", state="All India",
            institution_type="Any",
            short_description="Merit-based support for undergraduate students from notified minority communities.",
            overview="Supports undergraduate students from notified minority communities who maintain strong academic standing, with an emphasis on transparent, explainable eligibility review.",
            benefits="Annual tuition support paid in two installments.",
            benefit_amount="Rs. 40,000/year", benefit_duration="1 year, renewable", benefit_coverage="Tuition fees",
            application_process="Apply with community certificate and academic records. Automated checks run before officer sign-off.",
            deadline=date(2026, 12, 31), application_start=date(2026, 9, 15), correction_deadline=date(2027, 1, 15), result_date=date(2027, 2, 10),
            faqs=[{"question": "Which communities are notified minorities for this scheme?", "answer": "This demo scheme uses a single 'Minority' category for simplicity; a production system would list each notified community."}],
            rules=[
                ("income", "<=", 250000, "Annual Family Income"),
                ("marks", ">=", 55, "Academic Marks"),
                ("age", ">=", 17, "Minimum Age"),
                ("age", "<=", 26, "Maximum Age"),
                ("category", "in", ["Minority"], "Eligible Category"),
            ],
            documents=DOCS4,
        )
        scheme_stem_draft = _create_scheme(
            db, name="Demo STEM Fellowship", provider="Women in STEM Foundation (Demo)",
            category="stem", scheme_type="fellowship", education_level="Undergraduate", state="All India",
            institution_type="Any",
            short_description="Draft fellowship supporting women pursuing STEM degrees. Not yet published to applicants.",
            overview="A draft scheme used to demonstrate the officer scheme-management workflow: create, configure, then activate.",
            benefits="Annual fellowship for tuition and research materials.",
            benefit_amount="Rs. 60,000/year", benefit_duration="1 year", benefit_coverage="Tuition + research materials",
            application_process="Apply online, upload required documents, complete AI-assisted verification, and await officer review.",
            deadline=date(2027, 3, 31), application_start=date(2027, 1, 1), correction_deadline=None, result_date=None,
            status="DRAFT",
            faqs=[],
            rules=[
                ("marks", ">=", 65, "Academic Marks"),
                ("age", ">=", 17, "Minimum Age"),
                ("age", "<=", 28, "Maximum Age"),
            ],
            documents=[
                ("IDENTITY_PROOF", "Identity Proof", "Any government-issued photo ID."),
                ("MARKSHEET", "Marksheet", "Most recent qualifying examination marksheet."),
                ("ADMISSION_PROOF", "Admission Proof", "Proof of enrollment in a STEM undergraduate program."),
            ],
        )
        db.flush()

        # ---------------------------------------------------------------
        # Flagship application: Priya Kumar — name mismatch + income-based
        # ineligibility, awaiting officer review. This is the primary demo
        # scenario described in the product brief.
        # ---------------------------------------------------------------
        print("Creating flagship demo application (Priya Kumar)...")
        flagship = Application(
            display_id=_next_display_id(),
            applicant_id=applicant.id,
            scheme_id=scheme_merit.id,
            status="UNDER_OFFICER_REVIEW",
            personal_info={"full_name": "Priya Kumar", "dob": "2005-06-12", "gender": "Female", "phone": "+91-9840012345"},
            academic_info={"institution": "Government Arts College, Chennai", "course": "B.Sc Computer Science", "marks_percentage": 82.5},
            financial_info={"annual_income": 300000, "certificate_issue_date": "2026-04-10"},
            category_info={"category": "OBC"},
            current_step=8,
            submitted_at=datetime.now(timezone.utc) - timedelta(hours=6),
        )
        db.add(flagship)
        db.flush()

        # Name deliberately varies per document — printed into the actual
        # rendered image, then independently read back by real OCR. This is
        # what drives the flagship cross-document name-mismatch demo now;
        # nothing about the mismatch result is hand-inserted.
        _add_document(db, application=flagship, doc_type="IDENTITY_PROOF", field_overrides={"name": "Priya Kumar"})
        _add_document(db, application=flagship, doc_type="MARKSHEET", field_overrides={"name": "Priya K."})
        _add_document(db, application=flagship, doc_type="INCOME_CERTIFICATE", field_overrides={"name": "Priya Kumari"})
        _add_document(db, application=flagship, doc_type="COMMUNITY_CERTIFICATE", field_overrides={"name": "Priya Kumar"})
        _finalize_analysis(db, flagship)
        log_action(db, actor_id=applicant.id, actor_name=applicant.full_name, action="Application submitted", application_id=flagship.id)
        log_action(db, actor_id=None, actor_name="AI Pipeline", action="AI verification completed", application_id=flagship.id, details="Eligible: False (income exceeds limit); possible name mismatch flagged")
        log_action(db, actor_id=None, actor_name="System", action="Moved to officer review queue", application_id=flagship.id)
        notify(db, user_id=applicant.id, title="Application under officer review", message=f"Your application {flagship.display_id} has completed automated checks and is now awaiting officer review.", type="INFO", application_id=flagship.id)

        # ---------------------------------------------------------------
        # Priya's second application: correction required (low-quality
        # income certificate) — drives the dashboard action-required cards
        # and the correction/re-upload flow.
        # ---------------------------------------------------------------
        print("Creating Priya's correction-required application...")
        app_correction = Application(
            display_id=_next_display_id(), applicant_id=applicant.id, scheme_id=scheme_postmatric.id,
            status="SUBMITTED",
            personal_info={"full_name": "Priya Kumar", "dob": "2005-06-12", "gender": "Female", "phone": "+91-9840012345"},
            academic_info={"institution": "Government Arts College, Chennai", "course": "B.Sc Computer Science", "marks_percentage": 82.5},
            financial_info={"annual_income": 180000, "certificate_issue_date": "2026-03-01"},
            category_info={"category": "OBC"},
            current_step=8, submitted_at=datetime.now(timezone.utc) - timedelta(days=2),
        )
        db.add(app_correction)
        db.flush()
        _add_document(db, application=app_correction, doc_type="IDENTITY_PROOF")
        _add_document(db, application=app_correction, doc_type="MARKSHEET")
        _add_document(db, application=app_correction, doc_type="COMMUNITY_CERTIFICATE")
        income_doc = _add_document(db, application=app_correction, doc_type="INCOME_CERTIFICATE", low_quality=True)
        _finalize_analysis(db, app_correction)
        app_correction.status = "CORRECTION_REQUIRED"
        db.add(CorrectionRequest(
            application_id=app_correction.id, document_id=income_doc.id,
            issue="Income certificate needs correction",
            comment="The uploaded income certificate scan is too low quality to confidently verify the certificate number and income figure. Please upload a clearer copy.",
            deadline=(TODAY + timedelta(days=10)).isoformat(), created_by=officer.id,
        ))
        log_action(db, actor_id=applicant.id, actor_name=applicant.full_name, action="Application submitted", application_id=app_correction.id)
        log_action(db, actor_id=officer.id, actor_name=officer.full_name, action="Requested correction: Income certificate needs correction", application_id=app_correction.id, details="Low quality scan")
        notify(db, user_id=applicant.id, title="Correction required", message="Income certificate needs correction: the uploaded scan is too low quality to verify. Please upload a clearer copy.", type="WARNING", application_id=app_correction.id)

        # ---------------------------------------------------------------
        # Priya's third application: previously approved (success story).
        # ---------------------------------------------------------------
        print("Creating Priya's approved application...")
        app_approved = Application(
            display_id=_next_display_id(), applicant_id=applicant.id, scheme_id=scheme_girls.id, status="APPROVED",
            personal_info={"full_name": "Priya Kumar", "dob": "2005-06-12", "gender": "Female", "phone": "+91-9840012345"},
            academic_info={"institution": "Government Arts College, Chennai", "course": "Higher Secondary", "marks_percentage": 88.0},
            financial_info={"annual_income": 210000, "certificate_issue_date": "2025-11-01"},
            category_info={"category": "OBC"},
            current_step=8, submitted_at=datetime.now(timezone.utc) - timedelta(days=45),
        )
        db.add(app_approved)
        db.flush()
        _add_document(db, application=app_approved, doc_type="IDENTITY_PROOF")
        _add_document(db, application=app_approved, doc_type="MARKSHEET")
        _add_document(db, application=app_approved, doc_type="INCOME_CERTIFICATE")
        _finalize_analysis(db, app_approved)
        db.add(Decision(application_id=app_approved.id, decision="APPROVED", reason="All eligibility criteria met; documents verified without issues.", officer_id=officer.id))
        log_action(db, actor_id=officer.id, actor_name=officer.full_name, action="Approved application", application_id=app_approved.id, details="All eligibility criteria met; documents verified without issues.")
        notify(db, user_id=applicant.id, title="Application approved", message=f"Congratulations! Your application {app_approved.display_id} has been approved.", type="SUCCESS", application_id=app_approved.id, )

        # ---------------------------------------------------------------
        # Priya's fourth application: still a draft (in-progress wizard).
        # ---------------------------------------------------------------
        print("Creating Priya's draft application...")
        app_draft = Application(
            display_id=_next_display_id(), applicant_id=applicant.id, scheme_id=scheme_fellowship.id, status="DRAFT",
            personal_info={"full_name": "Priya Kumar", "dob": "2005-06-12", "gender": "Female", "phone": "+91-9840012345"},
            academic_info={}, financial_info={}, category_info={"category": "OBC"}, current_step=3,
        )
        db.add(app_draft)
        db.flush()
        log_action(db, actor_id=applicant.id, actor_name=applicant.full_name, action=f"Started application for {scheme_fellowship.name}", application_id=app_draft.id)

        # ---------------------------------------------------------------
        # Other applicants — populate the officer queue with variety.
        # ---------------------------------------------------------------
        print("Creating supporting applications for the officer queue...")

        def build_full_application(user, scheme, *, income, marks, category, institution, course, status_hint, low_quality_doc=None):
            app = Application(
                display_id=_next_display_id(), applicant_id=user.id, scheme_id=scheme.id, status="SUBMITTED",
                personal_info={"full_name": user.full_name, "dob": "2004-03-15", "gender": "Other", "phone": "+91-9000000000"},
                academic_info={"institution": institution, "course": course, "marks_percentage": marks},
                financial_info={"annual_income": income, "certificate_issue_date": "2026-02-10"},
                category_info={"category": category},
                current_step=8, submitted_at=datetime.now(timezone.utc) - timedelta(days=3),
            )
            db.add(app)
            db.flush()
            for doc_type in scheme.required_documents:
                _add_document(db, application=app, doc_type=doc_type, low_quality=(doc_type == low_quality_doc))
            _finalize_analysis(db, app)
            log_action(db, actor_id=user.id, actor_name=user.full_name, action="Application submitted", application_id=app.id)
            log_action(db, actor_id=None, actor_name="AI Pipeline", action="AI verification completed", application_id=app.id)
            return app

        app_ramesh = build_full_application(ramesh, scheme_merit, income=150000, marks=78, category="General", institution="Delhi University", course="B.A Economics", status_hint="approve")
        app_ramesh.status = "UNDER_OFFICER_REVIEW"
        db.add(Decision(application_id=app_ramesh.id, decision="APPROVED", reason="Income, marks, age and document criteria all satisfied.", officer_id=officer.id))
        app_ramesh.status = "APPROVED"
        log_action(db, actor_id=officer.id, actor_name=officer.full_name, action="Approved application", application_id=app_ramesh.id, details="Income, marks, age and document criteria all satisfied.")
        notify(db, user_id=ramesh.id, title="Application approved", message=f"Congratulations! Your application {app_ramesh.display_id} has been approved.", type="SUCCESS", application_id=app_ramesh.id)

        app_sneha = build_full_application(sneha, scheme_postmatric, income=320000, marks=65, category="SC", institution="Osmania University", course="B.Com", status_hint="reject")
        app_sneha.status = "UNDER_OFFICER_REVIEW"
        db.add(Decision(application_id=app_sneha.id, decision="REJECTED", reason="Annual income of Rs. 3,20,000 exceeds the scheme's eligibility ceiling of Rs. 2,00,000.", officer_id=officer.id))
        app_sneha.status = "REJECTED"
        log_action(db, actor_id=officer.id, actor_name=officer.full_name, action="Rejected application", application_id=app_sneha.id, details="Income exceeds eligibility ceiling.")
        notify(db, user_id=sneha.id, title="Application rejected", message=f"Your application {app_sneha.display_id} was not approved. Reason: Annual income exceeds the eligibility ceiling.", type="ERROR", application_id=app_sneha.id)

        app_imran = build_full_application(imran, scheme_fellowship, income=0, marks=74, category="Minority", institution="IISc Bangalore", course="M.Tech Research", status_hint="correction", low_quality_doc="MARKSHEET")
        marksheet_doc = next(d for d in db.query(Document).filter(Document.application_id == app_imran.id).all() if d.doc_type == "MARKSHEET")
        db.add(CorrectionRequest(application_id=app_imran.id, document_id=marksheet_doc.id, issue="Marks document unreadable", comment="The marksheet scan is too blurred to verify the marks percentage. Please re-upload a higher resolution copy.", deadline=(TODAY + timedelta(days=7)).isoformat(), created_by=officer.id))
        app_imran.status = "CORRECTION_REQUIRED"
        log_action(db, actor_id=officer.id, actor_name=officer.full_name, action="Requested correction: Marks document unreadable", application_id=app_imran.id)
        notify(db, user_id=imran.id, title="Correction required", message="Marks document unreadable: please re-upload a higher resolution copy.", type="WARNING", application_id=app_imran.id)

        app_ayesha = build_full_application(ayesha, scheme_girls, income=180000, marks=91, category="General", institution="Mumbai Public School", course="Class 12", status_hint="verifying")
        app_ayesha.status = "UNDER_VERIFICATION"

        app_karthik = build_full_application(karthik, scheme_minority, income=240000, marks=58, category="OBC", institution="Anna University", course="B.E Mechanical", status_hint="submitted")
        app_karthik.status = "SUBMITTED"

        app_divya = build_full_application(divya, scheme_merit, income=120000, marks=88, category="General", institution="Kerala University", course="B.Sc Physics", status_hint="clean")
        app_divya.status = "UNDER_OFFICER_REVIEW"

        db.commit()
        print("Seed complete.")
        print(f"  Users: {db.query(User).count()}")
        print(f"  Schemes: {db.query(Scheme).count()}")
        print(f"  Applications: {db.query(Application).count()}")
        print(f"  Documents: {db.query(Document).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
