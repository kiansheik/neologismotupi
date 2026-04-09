import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.enums import FlashcardDirection, FlashcardGrade, FlashcardQueue


class FlashcardSettingsOut(BaseModel):
    new_cards_per_day: int
    advanced_grading_enabled: bool

    model_config = {"from_attributes": True}


class FlashcardSettingsUpdate(BaseModel):
    new_cards_per_day: int | None = Field(default=None, ge=3, le=20)
    advanced_grading_enabled: bool | None = None


class FlashcardSessionSummary(BaseModel):
    new_remaining: int
    review_remaining: int
    completed_today: int
    due_now: int
    due_later_today: int


class FlashcardActiveSessionOut(BaseModel):
    id: uuid.UUID
    started_at: datetime
    elapsed_seconds: int
    review_count: int
    is_paused: bool


class FlashcardCardOut(BaseModel):
    entry_id: uuid.UUID
    direction: FlashcardDirection
    queue: FlashcardQueue
    slug: str
    headword: str
    gloss_pt: str
    short_definition: str
    part_of_speech: str | None
    audio_url: str | None = None
    audio_duration_seconds: int | None = None


class FlashcardSessionOut(BaseModel):
    settings: FlashcardSettingsOut
    summary: FlashcardSessionSummary
    current_card: FlashcardCardOut | None
    active_session: FlashcardActiveSessionOut | None


class FlashcardReviewRequest(BaseModel):
    entry_id: uuid.UUID
    direction: FlashcardDirection
    grade: FlashcardGrade
    response_ms: int | None = Field(default=None, ge=0, le=600_000)
    user_response: str | None = Field(default=None, max_length=1000)


class FlashcardReviewResponse(BaseModel):
    summary: FlashcardSessionSummary
    next_card: FlashcardCardOut | None
    active_session: FlashcardActiveSessionOut | None


class FlashcardFinishSessionRequest(BaseModel):
    remind_tomorrow: bool = False
    time_zone: str | None = Field(default=None, max_length=64)
    offset_minutes: int | None = Field(default=None, ge=-840, le=840)


class FlashcardSessionPresenceRequest(BaseModel):
    status: str = Field(pattern="^(active|away)$")


class FlashcardDailyStatsOut(BaseModel):
    date: date
    reviews: int
    new_seen: int
    study_minutes: int
    sessions: int


class FlashcardStatsOut(BaseModel):
    today: FlashcardDailyStatsOut
    last_7_days: list[FlashcardDailyStatsOut]


class FlashcardLeaderboardEntry(BaseModel):
    rank: int
    display_name: str
    reviews_this_week: int
    total_reviews: int


class FlashcardLeaderboardOut(BaseModel):
    entries: list[FlashcardLeaderboardEntry]
