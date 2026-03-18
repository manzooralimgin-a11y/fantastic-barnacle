import os
import logging
from pydantic_settings import BaseSettings
from pydantic import model_validator

_config_logger = logging.getLogger("app.config")


class Settings(BaseSettings):
    app_name: str = "Gestronomy"
    app_env: str = "production"
    debug: bool = False
    backend_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000,https://gestronomy-web.onrender.com,https://das-elb-hotel.onrender.com,https://das-elb-rest.onrender.com"
    database_url: str = "postgresql+asyncpg://gestronomy:gestronomy@localhost:5432/gestronomy"
    database_url_sync: str = "postgresql://gestronomy:gestronomy@localhost:5432/gestronomy"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"
    max_request_size_bytes: int = 1048576
    auth_rate_limit_per_minute: int = 12
    public_rate_limit_per_minute: int = 60
    stripe_api_key: str = ""
    stripe_webhook_secret: str = ""
    anthropic_api_key: str = ""
    resend_api_key: str = ""
    voicebooker_secret: str = "dev_secret_key"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    slo_api_p95_ms_threshold: int = 800
    slo_error_rate_pct_threshold: float = 1.0
    slo_queue_lag_threshold: int = 100

    @model_validator(mode="before")
    @classmethod
    def build_database_urls(cls, values: dict) -> dict:
        """Handle Render's DATABASE_URL format.

        Render provides DATABASE_URL as postgres:// or postgresql://
        We need postgresql+asyncpg:// for async and postgresql:// for sync.
        """
        raw_url = os.environ.get("DATABASE_URL", "")
        if raw_url:
            if raw_url.startswith("postgres://"):
                raw_url = raw_url.replace("postgres://", "postgresql://", 1)
            async_url = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            values["database_url"] = async_url
            sync_url = raw_url
            if "postgresql+asyncpg://" in sync_url:
                sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql://", 1)
            values["database_url_sync"] = sync_url
        return values

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
