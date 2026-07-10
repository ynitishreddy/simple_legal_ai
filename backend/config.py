"""
config.py
─────────
Centralised application settings powered by Pydantic BaseSettings.

Priority order (highest → lowest):
  1. Environment variables
  2. .env file (if present)
  3. Default values defined here

Usage:
    from config import settings
    print(settings.database_url)
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    """Application-wide configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="sqlite:///./legal_timeline.db",
        description=(
            "SQLAlchemy connection string. "
            "Defaults to local SQLite for development; "
            "set to a PostgreSQL DSN for production."
        ),
    )

    # ── AWS / S3 ──────────────────────────────────────────────────────────────
    aws_access_key_id: str = Field(default="", description="AWS access key ID")
    aws_secret_access_key: str = Field(default="", description="AWS secret access key")
    aws_region: str = Field(default="ap-south-1", description="AWS region")
    s3_bucket: str = Field(
        default="indian-high-court-judgments", description="S3 bucket name"
    )
    s3_prefix: str = Field(default="raw/", description="Key prefix for judgment objects")

    # ── Application ───────────────────────────────────────────────────────────
    app_env: str = Field(default="development", description="Deployment environment")
    log_level: str = Field(default="INFO", description="Python logging level")


# Singleton instance – import this everywhere instead of re-instantiating.
settings = Settings()
