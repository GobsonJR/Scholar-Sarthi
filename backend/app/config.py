import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    jwt_secret_key: str = "demo-super-secret-key-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    database_url: str = "sqlite:///./scholarship.db"
    upload_dir: str = "./uploads"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    external_ai_api_key: str | None = None

    # Where PaddleOCR / LayoutLMv3 (and, in a later phase, IndicTrans2) cache
    # downloaded model weights. Set once via env so a restart never
    # re-downloads and a missing-model failure is easy to diagnose.
    model_cache_dir: str = "./models"

    # Phase 5: LayoutLMv3 document-understanding. Disabling it (e.g. on a
    # machine that can't fit the torch/transformers stack) makes the
    # pipeline fall back to the Phase 4 OCR-keyword/filename classifier for
    # every document — the app must keep working either way.
    layoutlm_enabled: bool = True
    layoutlm_model_name: str = "microsoft/layoutlmv3-base"

    # Phase 6: IndicTrans2 checkpoints are gated on Hugging Face — a token
    # from an account that has accepted the model license is required to
    # download them. Not committed anywhere; set locally in .env only.
    hf_token: str | None = None
    indictrans_enabled: bool = True
    indictrans_model_name: str = "ai4bharat/indictrans2-indic-en-dist-200M"

    # PaddlePaddle auto-detects CUDA and falls back to CPU on its own; this
    # flag only controls whether we *attempt* to request GPU inference at
    # all. Defaults off because a GPU is not guaranteed on demo/judge
    # hardware and the pipeline must run correctly on CPU regardless.
    use_gpu: bool = False

    # Gates POST /demo/reset. Defaults to on for this hackathon prototype;
    # set DEMO_MODE=false in .env to disable the endpoint entirely in any
    # deployment where resetting the database on demand would be unsafe.
    demo_mode: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Set as a side effect of importing app.config — which every service module
# imports first, before any lazy import of paddleocr/transformers can occur.
# This matters because PaddleX (PaddleOCR's underlying framework) ALSO uses
# huggingface_hub as one of its model sources; if huggingface_hub gets
# imported anywhere in the process before HF_HOME is set (e.g. during OCR
# engine load, which runs before LayoutLMv3 in the pipeline), its cache path
# is resolved from the OS default and setting HF_HOME afterward has no
# effect for that process. Setting it here, at the earliest possible point,
# is what actually makes MODEL_CACHE_DIR apply to every downloaded model.
_settings = get_settings()
os.environ.setdefault("HF_HOME", os.path.join(os.path.abspath(_settings.model_cache_dir), "hf_cache"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
if _settings.hf_token:
    os.environ.setdefault("HF_TOKEN", _settings.hf_token)
