import os

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.database import engine
from app.routers import ai, applications, audit_logs, auth, demo, documents, notifications, officer, officer_documents, officer_schemes, schemes

settings = get_settings()

app = FastAPI(
    title="Explainable Multi-AI Scholarship & Fellowship Management System",
    description="SIH 2026 (PS 239) prototype API. AI assists, rules determine eligibility, humans decide.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Schema is owned by Alembic migrations (`alembic upgrade head`), never
    # by an auto-create-tables call — that would let a production database
    # silently drift from what's actually in version control. Startup only
    # VERIFIES the database is at the migrations' current head; it never
    # creates or mutates the schema itself. See README "Database & migrations".
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import inspect

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    script = ScriptDirectory.from_config(alembic_cfg)
    expected_head = script.get_current_head()

    with engine.connect() as connection:
        if not inspect(connection).has_table("alembic_version"):
            raise RuntimeError(
                "Database has no 'alembic_version' table — it has not been migrated yet. "
                "Run `alembic upgrade head` before starting the application. See README 'Database & migrations'."
            )
        current_rev = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar()

    if current_rev != expected_head:
        raise RuntimeError(
            f"Database is at migration '{current_rev}' but the code expects '{expected_head}'. "
            "Run `alembic upgrade head` before starting the application."
        )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": "Invalid request data.", "errors": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred. Please try again."})


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(schemes.router)
app.include_router(applications.router)
app.include_router(documents.router)
app.include_router(officer.router)
app.include_router(officer_schemes.router)
app.include_router(officer_documents.router)
app.include_router(notifications.router)
app.include_router(audit_logs.router)
app.include_router(ai.router)
app.include_router(demo.router)
