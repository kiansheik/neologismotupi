import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import EntryStatus, ExampleStatus, ReportReasonCode, TagType


class TagOut(BaseModel):
    id: uuid.UUID
    name: str
    type: TagType
    slug: str

    model_config = {"from_attributes": True}


class EntryAuthorOut(BaseModel):
    id: uuid.UUID
    display_name: str
    reputation_score: int


class EntrySummaryOut(BaseModel):
    id: uuid.UUID
    slug: str
    headword: str
    normalized_headword: str
    gloss_pt: str | None
    gloss_en: str | None
    part_of_speech: str | None
    short_definition: str
    status: EntryStatus
    score_cache: int
    upvote_count_cache: int
    downvote_count_cache: int
    example_count_cache: int
    proposer_user_id: uuid.UUID
    proposer: EntryAuthorOut
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = Field(default_factory=list)


class EntryVersionOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    edited_by_user_id: uuid.UUID
    version_number: int
    snapshot_json: dict
    edit_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExampleOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    user_id: uuid.UUID
    sentence_original: str
    translation_pt: str | None
    translation_en: str | None
    usage_note: str | None
    context_tag: str | None
    status: ExampleStatus
    score_cache: int
    upvote_count_cache: int
    downvote_count_cache: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EntryDetailOut(EntrySummaryOut):
    morphology_notes: str | None
    approved_at: datetime | None
    approved_by_user_id: uuid.UUID | None
    versions: list[EntryVersionOut] = Field(default_factory=list)
    examples: list[ExampleOut] = Field(default_factory=list)


class DuplicateHintOut(BaseModel):
    id: uuid.UUID
    slug: str
    headword: str
    gloss_pt: str | None
    gloss_en: str | None


class EntryListOut(BaseModel):
    items: list[EntrySummaryOut]
    page: int
    page_size: int
    total: int


class EntryCreate(BaseModel):
    headword: str = Field(min_length=1, max_length=180)
    gloss_pt: str | None = Field(default=None, max_length=255)
    gloss_en: str | None = Field(default=None, max_length=255)
    part_of_speech: str | None = Field(default=None, max_length=64)
    short_definition: str = Field(min_length=3)
    morphology_notes: str | None = None
    tag_ids: list[uuid.UUID] = Field(default_factory=list)
    force_submit: bool = False
    turnstile_token: str | None = None


class EntryUpdate(BaseModel):
    headword: str | None = Field(default=None, min_length=1, max_length=180)
    gloss_pt: str | None = Field(default=None, max_length=255)
    gloss_en: str | None = Field(default=None, max_length=255)
    part_of_speech: str | None = Field(default=None, max_length=64)
    short_definition: str | None = Field(default=None, min_length=3)
    morphology_notes: str | None = None
    tag_ids: list[uuid.UUID] | None = None
    edit_summary: str | None = Field(default=None, max_length=280)


class ExampleCreate(BaseModel):
    sentence_original: str = Field(min_length=3)
    translation_pt: str | None = None
    translation_en: str | None = None
    usage_note: str | None = None
    context_tag: str | None = Field(default=None, max_length=120)
    turnstile_token: str | None = None


class ExampleUpdate(BaseModel):
    sentence_original: str | None = Field(default=None, min_length=3)
    translation_pt: str | None = None
    translation_en: str | None = None
    usage_note: str | None = None
    context_tag: str | None = Field(default=None, max_length=120)


class VoteRequest(BaseModel):
    value: int = Field(description="-1 or 1")


class VoteOut(BaseModel):
    entry_id: uuid.UUID
    user_id: uuid.UUID
    value: int
    score_cache: int


class ExampleVoteOut(BaseModel):
    example_id: uuid.UUID
    user_id: uuid.UUID
    value: int
    score_cache: int


class ReportCreate(BaseModel):
    reason_code: ReportReasonCode
    free_text: str | None = Field(default=None, min_length=5, max_length=280)
    turnstile_token: str | None = None
