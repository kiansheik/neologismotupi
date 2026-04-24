import json
from datetime import UTC, datetime
from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_release: str = "dev-local"
    app_public_url: str = "http://localhost:5173"
    api_public_url: str = "http://localhost:8000"
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
    enforce_downvote_account_age: bool = True
    downvote_requires_comment: bool = True
    downvote_comment_min_length: int = 5
    downvote_comment_exempt_staff: bool = False
    entry_vote_cost: int = 3
    entry_vote_cost_exempt_staff: bool = False
    entry_vote_cost_start_at: datetime | None = None
    entry_vote_daily_step1_votes: int = 3
    entry_vote_daily_step1_posts: int = 1
    entry_vote_daily_step2_votes: int = 2
    entry_vote_daily_step2_posts: int = 3
    entry_vote_daily_step3_votes: int = 1
    entry_participation_gate_enabled: bool = True
    entry_participation_window_days: int = 4
    entry_participation_count_entry_votes: bool = True
    entry_participation_count_example_votes: bool = True
    entry_participation_count_audio_votes: bool = False
    entry_participation_count_comment_votes: bool = False
    entry_participation_count_comments: bool = False
    entry_participation_step1_actions: int = 3
    entry_participation_step1_posts: int = 1
    entry_participation_step2_actions: int = 5
    entry_participation_step2_posts: int = 2
    entry_participation_step3_actions: int = 6
    entry_participation_step3_unlimited: bool = True
    entry_participation_unlimited_daily_cap: int | None = None
    entry_participation_exempt_staff: bool = False
    entry_participation_entry_vote_weight: float = 3.0
    entry_participation_example_vote_weight: float = 2.0
    entry_participation_comment_vote_weight: float = 1.0
    entry_participation_page_excellent_weight: float = 2.0
    entry_participation_page_fair_weight: float = 1.0
    entry_participation_page_poor_weight: float = -0.5
    pending_entry_threshold: int = 3
    pending_example_threshold: int = 5
    auto_approve_after_threshold: int = -1

    signup_rate_limit_count: int = 5
    signup_rate_limit_window_seconds: int = 60 * 60
    login_rate_limit_count: int = 10
    login_rate_limit_window_seconds: int = 15 * 60
    entry_submission_rate_limit_count: int = 15
    entry_submission_rate_limit_window_seconds: int = 60 * 60
    example_submission_rate_limit_count: int = 30
    example_submission_rate_limit_window_seconds: int = 60 * 60
    comment_submission_rate_limit_count: int = 60
    comment_submission_rate_limit_window_seconds: int = 60 * 60
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
    smtp_from_name: str = "Dicionário de Tupi"
    smtp_use_tls: bool = True
    host_disk_usage_path: str = "/"
    media_root: str = "media"
    max_audio_bytes: int = 5 * 1024 * 1024
    audio_processing_enabled: bool = False
    audio_processing_timeout_seconds: int = 30
    ffmpeg_path: str = "ffmpeg"
    audio_trim_padding_seconds: float = 0.5

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

    @field_validator("auto_approve_after_threshold")
    @classmethod
    def validate_auto_approve_after_threshold(cls, value: int) -> int:
        if value < -1:
            raise ValueError("AUTO_APPROVE_AFTER_THRESHOLD must be -1 or >= 0")
        return value

    @field_validator(
        "entry_vote_daily_step1_votes",
        "entry_vote_daily_step1_posts",
        "entry_vote_daily_step2_votes",
        "entry_vote_daily_step2_posts",
        "entry_vote_daily_step3_votes",
    )
    @classmethod
    def validate_entry_vote_daily_steps(cls, value: int) -> int:
        if value < 0:
            raise ValueError("ENTRY_VOTE_DAILY step values must be >= 0")
        return value

    @field_validator(
        "entry_participation_window_days",
        "entry_participation_step1_actions",
        "entry_participation_step1_posts",
        "entry_participation_step2_actions",
        "entry_participation_step2_posts",
        "entry_participation_step3_actions",
    )
    @classmethod
    def validate_entry_participation_numbers(cls, value: int) -> int:
        if value < 0:
            raise ValueError("ENTRY_PARTICIPATION values must be >= 0")
        return value

    @field_validator(
        "entry_participation_entry_vote_weight",
        "entry_participation_example_vote_weight",
        "entry_participation_comment_vote_weight",
        "entry_participation_page_excellent_weight",
        "entry_participation_page_fair_weight",
    )
    @classmethod
    def validate_entry_participation_weights(cls, value: float) -> float:
        if value < 0:
            raise ValueError("ENTRY_PARTICIPATION vote weights must be >= 0")
        return value

    @field_validator("entry_participation_window_days")
    @classmethod
    def validate_entry_participation_window_days(cls, value: int) -> int:
        if value < 1:
            raise ValueError("ENTRY_PARTICIPATION_WINDOW_DAYS must be >= 1")
        return value

    @field_validator("entry_participation_unlimited_daily_cap", mode="before")
    @classmethod
    def normalize_entry_participation_unlimited_daily_cap(
        cls,
        value: str | int | None,
    ) -> int | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return int(value)

    @field_validator("entry_participation_unlimited_daily_cap")
    @classmethod
    def validate_entry_participation_unlimited_daily_cap(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("ENTRY_PARTICIPATION_UNLIMITED_DAILY_CAP must be >= 0")
        return value

    @field_validator("entry_vote_cost_start_at", mode="before")
    @classmethod
    def normalize_entry_vote_cost_start_at(cls, value: str | datetime | None) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("entry_vote_cost_start_at")
    @classmethod
    def ensure_entry_vote_cost_start_at_timezone(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value

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

        self._validate_entry_participation_steps()

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

    def _validate_entry_participation_steps(self) -> None:
        if self.entry_participation_step2_actions < self.entry_participation_step1_actions:
            raise ValueError("ENTRY_PARTICIPATION_STEP2_ACTIONS must be >= STEP1_ACTIONS")
        if self.entry_participation_step3_actions < self.entry_participation_step2_actions:
            raise ValueError("ENTRY_PARTICIPATION_STEP3_ACTIONS must be >= STEP2_ACTIONS")
        if self.entry_participation_step2_posts < self.entry_participation_step1_posts:
            raise ValueError("ENTRY_PARTICIPATION_STEP2_POSTS must be >= STEP1_POSTS")


@lru_cache
def get_settings() -> Settings:
    return Settings()
