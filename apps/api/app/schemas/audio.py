import uuid
from datetime import datetime

from pydantic import BaseModel


class AudioSampleOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID | None
    example_id: uuid.UUID | None
    user_id: uuid.UUID
    uploader_display_name: str | None = None
    uploader_profile_url: str | None = None
    url: str
    mime_type: str
    duration_seconds: int | None
    score_cache: int
    upvote_count_cache: int
    downvote_count_cache: int
    current_user_vote: int | None = None
    created_at: datetime


class AudioVoteOut(BaseModel):
    audio_id: uuid.UUID
    user_id: uuid.UUID
    value: int
    score_cache: int


class AudioSubmissionOut(BaseModel):
    id: uuid.UUID
    url: str
    mime_type: str
    duration_seconds: int | None
    score_cache: int
    created_at: datetime
    entry_id: uuid.UUID | None
    entry_slug: str | None
    entry_headword: str | None
    example_id: uuid.UUID | None
    example_sentence_original: str | None


class AudioSubmissionListOut(BaseModel):
    items: list[AudioSubmissionOut]
    page: int
    page_size: int
    total: int
