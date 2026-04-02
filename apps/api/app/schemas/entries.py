import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.core.enums import EntryStatus, ExampleStatus, ReportReasonCode, TagType
from app.schemas.badges import UserBadgeKind
from app.schemas.audio import AudioSampleOut


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
    badges: list[UserBadgeKind] = Field(default_factory=list)


class SourceInput(BaseModel):
    authors: str | None = Field(default=None, max_length=255)
    title: str | None = Field(default=None, max_length=400)
    publication_year: int | None = Field(default=None, ge=1, le=3000)
    edition_label: str | None = Field(default=None, max_length=120)
    pages: str | None = Field(default=None, max_length=120)
    url: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def validate_minimum_fields(self) -> "SourceInput":
        if not (self.authors and self.authors.strip()) and not (self.title and self.title.strip()):
            raise ValueError("Source requires at least authors or title")
        cleaned_url = self.url.strip() if self.url else None
        if cleaned_url and not (cleaned_url.startswith("http://") or cleaned_url.startswith("https://")):
            raise ValueError("Source URL must start with http:// or https://")
        return self


class EntrySourceOut(BaseModel):
    work_id: uuid.UUID
    edition_id: uuid.UUID
    authors: str | None
    title: str | None
    publication_year: int | None
    edition_label: str | None
    pages: str | None
    urls: list[str] = Field(default_factory=list)
    citation: str


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
    current_user_vote: int | None = None
    proposer_user_id: uuid.UUID
    proposer: EntryAuthorOut
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = Field(default_factory=list)


class EntryVersionOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    edited_by_user_id: uuid.UUID
    edited_by_display_name: str | None = None
    version_number: int
    snapshot_json: dict
    edit_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EntryHistoryEventOut(BaseModel):
    id: uuid.UUID
    kind: Literal["version", "moderation"]
    version_number: int | None = None
    action_type: str | None = None
    summary: str | None = None
    actor_user_id: uuid.UUID | None = None
    actor_display_name: str | None = None
    created_at: datetime


class ExampleOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    user_id: uuid.UUID
    sentence_original: str
    translation_pt: str | None
    translation_en: str | None
    source_citation: str | None
    source: EntrySourceOut | None = None
    usage_note: str | None
    context_tag: str | None
    status: ExampleStatus
    score_cache: int
    upvote_count_cache: int
    downvote_count_cache: int
    current_user_vote: int | None = None
    moderation_reason: str | None = None
    moderation_notes: str | None = None
    moderated_at: datetime | None = None
    audio_samples: list[AudioSampleOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExampleVersionOut(BaseModel):
    id: uuid.UUID
    example_id: uuid.UUID
    edited_by_user_id: uuid.UUID
    version_number: int
    snapshot_json: dict
    edit_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EntryCommentOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    user_id: uuid.UUID
    parent_comment_id: uuid.UUID | None
    body: str
    score_cache: int
    upvote_count_cache: int
    downvote_count_cache: int
    current_user_vote: int | None = None
    created_at: datetime
    updated_at: datetime
    author: EntryAuthorOut


class EntryDetailOut(EntrySummaryOut):
    source_citation: str | None
    source: EntrySourceOut | None = None
    morphology_notes: str | None
    approved_at: datetime | None
    approved_by_user_id: uuid.UUID | None
    moderation_reason: str | None = None
    moderation_notes: str | None = None
    moderated_at: datetime | None = None
    versions: list[EntryVersionOut] = Field(default_factory=list)
    history_events: list[EntryHistoryEventOut] = Field(default_factory=list)
    examples: list[ExampleOut] = Field(default_factory=list)
    comments: list[EntryCommentOut] = Field(default_factory=list)
    audio_samples: list[AudioSampleOut] = Field(default_factory=list)


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


class EntryConstraintsOut(BaseModel):
    entry_vote_cost: int
    downvote_requires_comment: bool
    downvote_comment_min_length: int


class EntrySubmissionGateOut(BaseModel):
    window_start: datetime
    window_end: datetime
    votes_today: int
    entries_today: int
    unlocked_posts: int | None
    remaining_posts: int | None
    unlimited: bool
    next_votes_required: int
    votes_required_for_unlimited: int
    step1_votes: int
    step1_posts: int
    step2_votes: int
    step2_posts: int
    step3_votes: int


class EntryCreate(BaseModel):
    headword: str = Field(min_length=1, max_length=180)
    gloss_pt: str = Field(min_length=1, max_length=255)
    gloss_en: str | None = Field(default=None, max_length=255)
    part_of_speech: str | None = Field(default=None, max_length=64)
    short_definition: str | None = None
    source_citation: str | None = Field(default=None, max_length=500)
    source: SourceInput | None = None
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
    source_citation: str | None = Field(default=None, max_length=500)
    source: SourceInput | None = None
    morphology_notes: str | None = None
    tag_ids: list[uuid.UUID] | None = None
    edit_summary: str | None = Field(default=None, max_length=280)


class ExampleCreate(BaseModel):
    sentence_original: str = Field(min_length=3)
    translation_pt: str | None = None
    translation_en: str | None = None
    source_citation: str | None = Field(default=None, max_length=500)
    source: SourceInput | None = None
    usage_note: str | None = None
    context_tag: str | None = Field(default=None, max_length=120)
    turnstile_token: str | None = None


class ExampleUpdate(BaseModel):
    sentence_original: str | None = Field(default=None, min_length=3)
    translation_pt: str | None = None
    translation_en: str | None = None
    source_citation: str | None = Field(default=None, max_length=500)
    source: SourceInput | None = None
    usage_note: str | None = None
    context_tag: str | None = Field(default=None, max_length=120)
    edit_summary: str | None = Field(default=None, max_length=280)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    parent_comment_id: uuid.UUID | None = None
    turnstile_token: str | None = None


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


class CommentVoteOut(BaseModel):
    comment_id: uuid.UUID
    user_id: uuid.UUID
    value: int
    score_cache: int


class ReportCreate(BaseModel):
    reason_code: ReportReasonCode
    free_text: str | None = Field(default=None, min_length=5, max_length=280)
    turnstile_token: str | None = None
