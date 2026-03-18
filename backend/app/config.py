import os
import logging
from pydantic_settings import BaseSettings
from pydantic import model_validator


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
