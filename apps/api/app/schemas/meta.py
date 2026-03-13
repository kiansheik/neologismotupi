from pydantic import BaseModel

from app.core.enums import EntryStatus, TagType


class TagOut(BaseModel):
    id: str
    name: str
    type: TagType
    slug: str


class PartsOfSpeechOut(BaseModel):
    values: list[str]


class StatusesOut(BaseModel):
    entry_statuses: list[EntryStatus]
    example_statuses: list[str]
