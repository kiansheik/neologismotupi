import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import EntryStatus, ExampleStatus, ReportReasonCode, ReportStatus, ReportTargetType


class ModerationEntryOut(BaseModel):
    id: uuid.UUID
    slug: str
    headword: str
    status: EntryStatus
    proposer_user_id: uuid.UUID
    created_at: datetime


class ModerationExampleOut(BaseModel):
    id: uuid.UUID
    entry_id: uuid.UUID
    user_id: uuid.UUID
    sentence_original: str
    status: ExampleStatus
    created_at: datetime


class ModerationQueueOut(BaseModel):
    entries: list[ModerationEntryOut]
    examples: list[ModerationExampleOut]


class ModerationActionRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=1000)
    reason: str | None = Field(default=None, max_length=120)


class ReportOut(BaseModel):
    id: uuid.UUID
    reporter_user_id: uuid.UUID
    target_type: ReportTargetType
    target_id: uuid.UUID
    reason_code: ReportReasonCode
    free_text: str | None
    status: ReportStatus
    created_at: datetime
    reviewed_at: datetime | None
    reviewed_by_user_id: uuid.UUID | None

    model_config = {"from_attributes": True}


class ReportReviewRequest(BaseModel):
    status: ReportStatus = ReportStatus.resolved
    notes: str | None = Field(default=None, max_length=1000)
