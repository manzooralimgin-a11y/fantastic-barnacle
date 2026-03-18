import os
import logging
from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import Optional


_config_logger = logging.getLogger("app.config")


_DEFAULT_SECRET = "change-me-to-a-random-secret-key-in-production"


class Settings(BaseSettings):
            # App
            app_name: str = "Gestronomy"
            app_env: str = "development"
            debug: bool = True
            backend_url: str = "http://localhost:8000"
            frontend_url: str = "http://localhost:3000"
            cors_origins: str = "http://localhost:3000,https://gestronomy-web.onrender.com,https://das-elb-hotel.onrender.com,https://das-elb-rest.onrender.com"

    # Database
            database_url: str = "postgresql+asyncpg://gestronomy:gestronomy@localhost:5432/gestronomy"
            database_url_sync: str = "postgresql://gestronomy:gestronomy@localhost:5432/gestronomy"

    # Redis
            redis_url: str = "redis://localhost:6379/0"

    # Auth
            secret_key: str = _DEFAULT_SECRET
            access_token_expire_minutes: int = 30
            refresh_token_expire_days: int = 7
            algorithm: str = "HS256"

    # Security
            max_request_size_bytes: int = 1_048_576
            auth_rate_limit_per_minute: int = 12
            public_rate_limit_per_minute: int = 60

    # Stripe
            stripe_api_key: str = ""
            stripe_webhook_secret: str = ""

    # Other Integrations
            anthropic_api_key: str = ""
            resend_api_key: str = ""
            voicebooker_secret: str = "dev_secret_key"

    @property
    def sql_echo(self) -> bool:
                    return self.debug and self.app_env.lower() == "development"

    @model_validator(mode="after")
    def _validate_production_settings(self) -> "Settings":
                    is_prod = self.app_env.lower() == "production"
                    if is_prod:
                                        if self.secret_key == _DEFAULT_SECRET:
                                                                raise ValueError("SECRET_KEY must be set in production")
                                                        return self

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
