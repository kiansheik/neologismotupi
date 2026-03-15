import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import EntryStatus, ExampleStatus


class SourceSuggestionOut(BaseModel):
    work_id: uuid.UUID
    edition_id: uuid.UUID
    authors: str | None
    title: str | None
    publication_year: int | None
    edition_label: str | None
    citation: str


class SourceLinkOut(BaseModel):
    id: uuid.UUID
    url: str
    created_at: datetime


class SourceEditionStatsOut(BaseModel):
    edition_id: uuid.UUID
    publication_year: int | None
    edition_label: str | None
    entry_count: int
    example_count: int
    links: list[SourceLinkOut] = Field(default_factory=list)


class SourceEntryRefOut(BaseModel):
    id: uuid.UUID
    slug: str
    headword: str
    gloss_pt: str | None
    part_of_speech: str | None
    short_definition: str
    status: EntryStatus
    score_cache: int
    example_count_cache: int
    proposer_user_id: uuid.UUID
    proposer_display_name: str | None
    created_at: datetime


class SourceExampleRefOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    entry_slug: str
    entry_headword: str
    sentence_original: str
    status: ExampleStatus
    created_at: datetime


class SourceDetailOut(BaseModel):
    work_id: uuid.UUID
    authors: str | None
    title: str | None
    editions: list[SourceEditionStatsOut]
    entries_count: int
    examples_count: int
    entries: list[SourceEntryRefOut]
    examples: list[SourceExampleRefOut]
