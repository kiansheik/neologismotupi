import uuid

from pydantic import BaseModel


class SourceSuggestionOut(BaseModel):
    work_id: uuid.UUID
    edition_id: uuid.UUID
    authors: str | None
    title: str | None
    publication_year: int | None
    edition_label: str | None
    citation: str
