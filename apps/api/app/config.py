import json
from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_release: str = "dev-local"
    app_public_url: str = "http://localhost:5173"
    founder_email: str | None = "kiansheik3128@gmail.com"
    database_url: str = "postgresql+asyncpg://localhost/nheenga_dev"
    secret_key: str = "change-me"
    cors_origins: list[str] = ["http://localhost:5173"]
    turnstile_enabled: bool = False
    turnstile_secret_key: str | None = None
    turnstile_include_remote_ip: bool = False
    first_user_is_admin: bool = False

    require_verified_email: bool = False
    session_cookie_name: str = "nheenga_session"
    session_ttl_hours: int = 24 * 7
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    session_cookie_domain: str | None = None
    session_cookie_path: str = "/"

    downvote_min_account_age_hours: int = 72
    pending_entry_threshold: int = 3
    pending_example_threshold: int = 5

    signup_rate_limit_count: int = 5
    signup_rate_limit_window_seconds: int = 60 * 60
    login_rate_limit_count: int = 10
    login_rate_limit_window_seconds: int = 15 * 60
    entry_submission_rate_limit_count: int = 15
    entry_submission_rate_limit_window_seconds: int = 60 * 60
    example_submission_rate_limit_count: int = 30
    example_submission_rate_limit_window_seconds: int = 60 * 60
    report_rate_limit_count: int = 20
    report_rate_limit_window_seconds: int = 60 * 60
    password_reset_request_rate_limit_count: int = 10
    password_reset_request_rate_limit_window_seconds: int = 60 * 60

    verification_token_ttl_minutes: int = 30
    password_reset_token_ttl_minutes: int = 30

    email_delivery: str = "log"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Nheenga Neologismos"
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        enable_decoding=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("session_cookie_samesite", mode="before")
    @classmethod
    def normalize_cookie_samesite(cls, value: str) -> str:
        normalized = str(value).strip().lower()
        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("SESSION_COOKIE_SAMESITE must be one of: lax, strict, none")
        return normalized

    @field_validator("session_cookie_domain", mode="before")
    @classmethod
    def normalize_cookie_domain(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if cleaned == "":
            return None
        return cleaned

    @field_validator("email_delivery", mode="before")
    @classmethod
    def normalize_email_delivery(cls, value: str) -> str:
        normalized = str(value).strip().lower()
        if normalized not in {"log", "smtp"}:
            raise ValueError("EMAIL_DELIVERY must be one of: log, smtp")
        return normalized

    @model_validator(mode="after")
    def validate_production_safety(self) -> "Settings":
        if self.turnstile_enabled and not self.turnstile_secret_key:
            raise ValueError("TURNSTILE_SECRET_KEY is required when TURNSTILE_ENABLED=true")

        if self.email_delivery == "smtp":
            if not self.smtp_host:
                raise ValueError("SMTP_HOST is required when EMAIL_DELIVERY=smtp")
            if not self.smtp_from_email:
                raise ValueError("SMTP_FROM_EMAIL is required when EMAIL_DELIVERY=smtp")

        if self.app_env != "production":
            return self

        if self.first_user_is_admin:
            raise ValueError("FIRST_USER_IS_ADMIN must be false in production")

        default_like_keys = {"change-me", "changeme", "test-secret", "dev-secret"}
        if (
            not self.secret_key
            or len(self.secret_key) < 32
            or self.secret_key.lower() in default_like_keys
        ):
            raise ValueError(
                "SECRET_KEY must be set to a strong random value (>=32 chars) in production"
            )

        if not self.session_cookie_secure:
            raise ValueError("SESSION_COOKIE_SECURE must be true in production")

        localhost_values = ("localhost", "127.0.0.1")
        if any(
            any(marker in origin for marker in localhost_values)
            for origin in self.cors_origins
        ):
            raise ValueError("CORS_ORIGINS cannot include localhost/127.0.0.1 in production")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
