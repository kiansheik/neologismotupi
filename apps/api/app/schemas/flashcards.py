import uuid

from pydantic import BaseModel, Field

from app.core.enums import (
    FlashcardDirection,
    FlashcardQueueType,
    FlashcardReviewResult,
)


class FlashcardSettingsOut(BaseModel):
    new_cards_per_day: int

    model_config = {"from_attributes": True}


class FlashcardSettingsUpdate(BaseModel):
    new_cards_per_day: int | None = Field(default=None, ge=3, le=20)


class FlashcardSessionSummary(BaseModel):
    new_remaining: int
    review_remaining: int
    completed_today: int
    due_now: int


class FlashcardCardOut(BaseModel):
    entry_id: uuid.UUID
    direction: FlashcardDirection
    queue_type: FlashcardQueueType
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


class FlashcardReviewRequest(BaseModel):
    entry_id: uuid.UUID
    direction: FlashcardDirection
    result: FlashcardReviewResult
    response_ms: int | None = Field(default=None, ge=0, le=600_000)


class FlashcardReviewResponse(BaseModel):
    summary: FlashcardSessionSummary
    next_card: FlashcardCardOut | None
