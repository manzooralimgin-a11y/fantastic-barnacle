import logging
import os
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings

_config_logger = logging.getLogger("app.config")
_DEFAULT_SECRET_KEY = "change-me-to-a-random-secret-key-in-production"
_DEFAULT_VOICEBOOKER_SECRET = "dev_secret_key"
_DEFAULT_EMAIL_INGEST_SECRET = "dev-email-inbox-secret"
_LOCAL_HOSTNAMES = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _points_to_localhost(url: str) -> bool:
    if not url:
        return True
    parsed = urlparse(url)
    hostname = parsed.hostname
    return hostname in _LOCAL_HOSTNAMES


class Settings(BaseSettings):
    app_name: str = "Gestronomy"
    app_version: str = "0.1.0"
    app_env: str = "production"
    debug: bool = False
    backend_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:5173,https://gestronomy-web-ipjw.onrender.com,https://gestronomy-guest.onrender.com,https://das-elb-hotel.onrender.com,https://das-elb-rest.onrender.com,https://hotel-guest.onrender.com,https://hotel-owner.onrender.com,https://www.zukunftwebs.com,https://zukunftwebs.com"
    database_url: str = "postgresql+asyncpg://gestronomy:gestronomy@localhost:5432/gestronomy"
    database_url_sync: str = "postgresql://gestronomy:gestronomy@localhost:5432/gestronomy"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = _DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"
    max_request_size_bytes: int = 1048576
    auth_rate_limit_per_minute: int = 12
    public_rate_limit_per_minute: int = 60
    availability_rate_limit_per_minute: int = 120
    availability_rate_limit_burst_per_10_seconds: int = 40
    reservation_write_rate_limit_per_minute: int = 30
    reservation_write_rate_limit_burst_per_10_seconds: int = 10
    stripe_api_key: str = ""
    stripe_webhook_secret: str = ""
    anthropic_api_key: str = ""
    resend_api_key: str = ""
    voicebooker_secret: str = _DEFAULT_VOICEBOOKER_SECRET
    aws_region: str = ""
    s3_bucket_name: str = ""
    s3_documents_prefix: str = "documents/"
    s3_uploads_prefix: str = "uploads/"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    celery_log_level: str = "INFO"
    celery_worker_concurrency: int = 4
    uvicorn_log_level: str = "info"
    uvicorn_workers: int = 1
    uvicorn_forwarded_allow_ips: str = "*"
    slo_api_p95_ms_threshold: int = 800
    slo_api_p95_ms_critical_threshold: int = 1500
    slo_error_rate_pct_threshold: float = 1.0
    slo_error_rate_pct_critical_threshold: float = 5.0
    slo_queue_lag_threshold: int = 100
    slo_queue_lag_critical_threshold: int = 500
    websocket_broadcast_failure_threshold: int = 5
    reservation_create_failure_threshold: int = 5
    reservation_availability_slow_ms: int = 200
    reservation_lock_contention_threshold_ms: int = 50
    reservation_lock_timeout_ms: int = 2500
    reservation_idempotency_ttl_seconds: int = 86400
    reservation_idempotency_pending_ttl_seconds: int = 120
    reservation_idempotency_poll_interval_ms: int = 50
    reservation_idempotency_max_wait_ms: int = 1500
    reservation_reconciliation_lookback_hours: int = 6
    reservation_reconciliation_interval_minutes: int = 30
    email_inbox_ingest_secret: str = _DEFAULT_EMAIL_INGEST_SECRET
    email_inbox_ai_model: str = "claude-3-5-sonnet-latest"
    email_inbox_min_confidence: float = 0.65
    email_inbox_reply_mode: str = "generate_only"
    email_inbox_from_name: str = "DAS ELB Reservations"
    email_inbox_from_address: str = "reservations@daselb.local"
    email_inbox_default_property_id: int | None = None
    email_inbox_default_restaurant_id: int | None = None
    availability_cache_ttl_seconds: int = 30
    availability_cache_version_ttl_seconds: int = 3600
    availability_cache_redis_timeout_ms: int = 75
    redis_operation_timeout_ms: int = 75
    availability_cache_redis_failure_threshold: int = 1
    availability_cache_circuit_cooldown_seconds: int = 15
    restaurant_availability_slot_minutes: int = 30
    restaurant_availability_duration_minutes: int = 90
    availability_query_timeout_ms: int = 1500
    availability_read_failure_threshold: int = 3
    availability_read_circuit_cooldown_seconds: int = 15
    mcp_rate_limit_per_minute: int = 120
    mcp_rate_limit_burst_per_10_seconds: int = 30
    mcp_booking_rate_limit_per_minute: int = 20
    mcp_booking_rate_limit_burst_per_10_seconds: int = 8
    mcp_availability_rate_limit_per_minute: int = 90
    mcp_availability_rate_limit_burst_per_10_seconds: int = 20
    mcp_overload_active_call_threshold: int = 30
    mcp_overload_trip_threshold: int = 5
    mcp_overload_circuit_cooldown_seconds: int = 15
    slo_availability_p95_ms_threshold: int = 300
    slo_availability_p95_ms_critical_threshold: int = 800
    reservation_lock_contention_alert_threshold: int = 20
    availability_cache_min_queries_for_alert: int = 20
    availability_cache_hit_ratio_warning_threshold: float = 0.5
    celery_monitor_timeout_seconds: float = 1.5
    metrics_snapshot_cache_ttl_seconds: int = 5
    metrics_dependency_timeout_ms: int = 100
    metrics_response_timeout_ms: int = 1000
    startup_validation_enforced: bool = True
    startup_validation_require_redis: bool = True
    startup_validation_require_migrations: bool = True

    @model_validator(mode="before")
    @classmethod
    def build_database_urls(cls, values: dict) -> dict:
        """Handle Replit/Render DATABASE_URL format.

        Replit provides postgresql:// URLs, sometimes with ?sslmode=... which
        asyncpg does not accept as a query parameter — strip it and handle via
        connect_args in the engine instead.
        """
        import urllib.parse

        raw_url = os.environ.get("DATABASE_URL", "")
        if raw_url:
            if raw_url.startswith("postgres://"):
                raw_url = raw_url.replace("postgres://", "postgresql://", 1)

            # Parse and strip sslmode so asyncpg doesn't choke on it.
            parsed = urllib.parse.urlparse(raw_url)
            qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            qs.pop("sslmode", None)
            cleaned = parsed._replace(query=urllib.parse.urlencode(qs, doseq=True))
            clean_url = urllib.parse.urlunparse(cleaned)

            async_url = clean_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            values["database_url"] = async_url

            sync_url = clean_url
            if "postgresql+asyncpg://" in sync_url:
                sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql://", 1)
            values["database_url_sync"] = sync_url
        return values

    @model_validator(mode="after")
    def validate_security_defaults(self) -> "Settings":
        explicit_production_config = (
            "app_env" in self.model_fields_set
            or "secret_key" in self.model_fields_set
            or "APP_ENV" in os.environ
            or "SECRET_KEY" in os.environ
        )
        if (
            explicit_production_config
            and self.app_env.lower() == "production"
            and self.secret_key == _DEFAULT_SECRET_KEY
        ):
            raise ValueError("SECRET_KEY must be set to a non-default value in production")
        if (
            explicit_production_config
            and self.app_env.lower() == "production"
            and self.voicebooker_secret == _DEFAULT_VOICEBOOKER_SECRET
        ):
            raise ValueError("VOICEBOOKER_SECRET must be set to a non-default value in production")
        if (
            explicit_production_config
            and self.app_env.lower() == "production"
            and self.email_inbox_ingest_secret == _DEFAULT_EMAIL_INGEST_SECRET
        ):
            raise ValueError(
                "EMAIL_INBOX_INGEST_SECRET must be set to a non-default value in production"
            )
        if explicit_production_config and self.app_env.lower() == "production":
            if _points_to_localhost(self.database_url):
                raise ValueError("DATABASE_URL must point to a non-local database in production")
            if _points_to_localhost(self.redis_url):
                raise ValueError("REDIS_URL must point to a non-local Redis instance in production")
            if _points_to_localhost(self.celery_broker_url):
                raise ValueError("CELERY_BROKER_URL must point to a non-local broker in production")
            if _points_to_localhost(self.celery_result_backend):
                raise ValueError(
                    "CELERY_RESULT_BACKEND must point to a non-local result backend in production"
                )
            if _points_to_localhost(self.backend_url):
                raise ValueError("BACKEND_URL must be set to the production API URL")
            if _points_to_localhost(self.frontend_url):
                raise ValueError("FRONTEND_URL must be set to the production frontend URL")
            if self.stripe_api_key and not self.stripe_webhook_secret:
                raise ValueError(
                    "STRIPE_WEBHOOK_SECRET must be set in production when Stripe is enabled"
                )
        return self

    @property
    def sql_echo(self) -> bool:
        return self.debug and self.app_env.lower() == "development"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
