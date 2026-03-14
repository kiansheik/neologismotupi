import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationPreferenceOut(BaseModel):
    in_app_enabled: bool
    email_enabled: bool
    push_enabled: bool
    notify_on_entry_comments: bool
    notify_on_mentions: bool

    model_config = {"from_attributes": True}


class NotificationPreferenceUpdate(BaseModel):
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    push_enabled: bool | None = None
    notify_on_entry_comments: bool | None = None
    notify_on_mentions: bool | None = None


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str | None
    is_read: bool
    read_at: datetime | None
    created_at: datetime
    actor_user_id: uuid.UUID | None = None
    actor_display_name: str | None = None
    actor_profile_url: str | None = None
    entry_id: uuid.UUID | None = None
    entry_slug: str | None = None
    entry_headword: str | None = None
    entry_url: str | None = None
    comment_id: uuid.UUID | None = None


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    page: int
    page_size: int
    total: int
    unread_count: int


class NotificationReadResponse(BaseModel):
    ok: bool
