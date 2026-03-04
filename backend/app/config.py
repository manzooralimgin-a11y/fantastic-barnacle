import os
from pydantic_settings import BaseSettings
from pydantic import model_validator


class Settings(BaseSettings):
    # App
    app_name: str = "Gestronomy"
    app_env: str = "development"
    debug: bool = True
    backend_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    # Database — set via DATABASE_URL env var on Render
    database_url: str = "postgresql+asyncpg://gestronomy:gestronomy@localhost:5432/gestronomy"
    database_url_sync: str = "postgresql://gestronomy:gestronomy@localhost:5432/gestronomy"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "change-me-to-a-random-secret-key-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"

    # Security hardening
    max_request_size_bytes: int = 1_048_576
    auth_rate_limit_per_minute: int = 12
    public_rate_limit_per_minute: int = 60
    slo_api_p95_ms_threshold: int = 800
    slo_error_rate_pct_threshold: float = 1.0
    slo_queue_lag_threshold: int = 100

    # AI / LLM
    anthropic_api_key: str = ""

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    @model_validator(mode="before")
    @classmethod
    def build_database_urls(cls, values: dict) -> dict:
        """Handle Render's DATABASE_URL format.

        Render provides DATABASE_URL as postgres:// or postgresql://
        We need postgresql+asyncpg:// for async and postgresql:// for sync.
        """
        raw_url = os.environ.get("DATABASE_URL", "")
        if raw_url:
            # Render gives postgres:// or postgresql:// — normalize
            if raw_url.startswith("postgres://"):
                raw_url = raw_url.replace("postgres://", "postgresql://", 1)

            # Build async URL
            async_url = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            values["database_url"] = async_url

            # Build sync URL (for Alembic)
            sync_url = raw_url
            if "postgresql+asyncpg://" in sync_url:
                sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql://", 1)
            values["database_url_sync"] = sync_url

        return values

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS as comma-separated string.
        Always includes Tauri desktop app origins so the desktop app can reach the API.
        """
        configured = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        # Always allow Tauri desktop origins (tauri://localhost and file:// are used by Tauri 2.x on macOS/Windows)
        desktop_origins = [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "http://localhost:3000",
        ]
        all_origins = list(dict.fromkeys(configured + desktop_origins))  # deduplicate, preserve order
        return all_origins

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
