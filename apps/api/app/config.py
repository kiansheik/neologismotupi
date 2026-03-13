from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql+asyncpg://localhost/nheenga_dev"
    secret_key: str = "change-me"
    cors_origins: list[str] = ["http://localhost:5173"]
    turnstile_enabled: bool = False
    turnstile_secret_key: str | None = None
    first_user_is_admin: bool = True

    require_verified_email: bool = False
    session_cookie_name: str = "nheenga_session"
    session_ttl_hours: int = 24 * 7

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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
