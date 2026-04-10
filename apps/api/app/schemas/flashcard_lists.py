import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.entries import EntryAuthorOut, EntrySummaryOut


class FlashcardListCreate(BaseModel):
    title_pt: str = Field(min_length=2, max_length=140)
    title_en: str | None = Field(default=None, max_length=140)
    description_pt: str | None = Field(default=None, max_length=1000)
    description_en: str | None = Field(default=None, max_length=1000)
    theme_label: str | None = Field(default=None, max_length=120)
    is_public: bool = True


class FlashcardListUpdate(BaseModel):
    title_pt: str | None = Field(default=None, min_length=2, max_length=140)
    title_en: str | None = Field(default=None, max_length=140)
    description_pt: str | None = Field(default=None, max_length=1000)
    description_en: str | None = Field(default=None, max_length=1000)
    theme_label: str | None = Field(default=None, max_length=120)
    is_public: bool | None = None


class FlashcardListOut(BaseModel):
    id: uuid.UUID
    owner: EntryAuthorOut
    title_pt: str
    title_en: str | None
    description_pt: str | None
    description_en: str | None
    theme_label: str | None
    is_public: bool
    score_cache: int
    upvote_count_cache: int
    downvote_count_cache: int
    item_count_cache: int
    current_user_vote: int | None = None
    contains_entry: bool | None = None
    created_at: datetime
    updated_at: datetime


class FlashcardListListOut(BaseModel):
    items: list[FlashcardListOut]
    page: int
    page_size: int
    total: int


class FlashcardListDetailOut(BaseModel):
    list: FlashcardListOut
    items: list[EntrySummaryOut]
    page: int
    page_size: int
    total: int


class FlashcardListItemCreate(BaseModel):
    entry_id: uuid.UUID


class FlashcardListVoteOut(BaseModel):
    list_id: uuid.UUID
    user_id: uuid.UUID
    value: int
    score_cache: int


class FlashcardListCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class FlashcardListCommentOut(BaseModel):
    id: uuid.UUID
    list_id: uuid.UUID
    user_id: uuid.UUID
    body: str
    created_at: datetime
    updated_at: datetime
    author: EntryAuthorOut


class FlashcardListCommentListOut(BaseModel):
    items: list[FlashcardListCommentOut]
    page: int
    page_size: int
    total: int
