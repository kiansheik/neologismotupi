from __future__ import annotations

import re
import uuid
import unicodedata
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discussion import Notification, NotificationPreference

MENTION_PATTERN = re.compile(r"(?<![\w@])@([A-Za-z0-9._-]{2,50})")


@dataclass(frozen=True)
class NotificationPreferenceFlags:
    in_app_enabled: bool = True
    email_enabled: bool = True
    push_enabled: bool = True
    notify_on_entry_comments: bool = True
    notify_on_mentions: bool = True

    def allows_in_app(self, *, is_mention: bool) -> bool:
        if not self.in_app_enabled:
            return False
        if is_mention:
            return self.notify_on_mentions
        return self.notify_on_entry_comments

    def allows_email(self, *, is_mention: bool) -> bool:
        if not self.email_enabled:
            return False
        if is_mention:
            return self.notify_on_mentions
        return self.notify_on_entry_comments

    def allows_push(self, *, is_mention: bool) -> bool:
        if not self.push_enabled:
            return False
        if is_mention:
            return self.notify_on_mentions
        return self.notify_on_entry_comments


def normalize_mention_key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return "".join(ch.lower() for ch in without_marks if ch.isalnum())


def extract_mention_keys(text: str) -> set[str]:
    keys: set[str] = set()
    for raw in MENTION_PATTERN.findall(text or ""):
        key = normalize_mention_key(raw)
        if key:
            keys.add(key)
    return keys


def preferences_to_flags(pref: NotificationPreference | None) -> NotificationPreferenceFlags:
    if pref is None:
        return NotificationPreferenceFlags()
    return NotificationPreferenceFlags(
        in_app_enabled=pref.in_app_enabled,
        email_enabled=pref.email_enabled,
        push_enabled=pref.push_enabled,
        notify_on_entry_comments=pref.notify_on_entry_comments,
        notify_on_mentions=pref.notify_on_mentions,
    )


async def get_or_create_notification_preferences(
    db: AsyncSession, *, user_id: uuid.UUID
) -> NotificationPreference:
    pref = (
        await db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == user_id)
        )
    ).scalar_one_or_none()
    if pref is not None:
        return pref

    pref = NotificationPreference(user_id=user_id)
    db.add(pref)
    await db.flush()
    return pref


async def get_notification_preferences_map(
    db: AsyncSession, *, user_ids: set[uuid.UUID]
) -> dict[uuid.UUID, NotificationPreferenceFlags]:
    if not user_ids:
        return {}

    rows = (
        await db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id.in_(list(user_ids)))
        )
    ).scalars().all()

    out: dict[uuid.UUID, NotificationPreferenceFlags] = {
        row.user_id: preferences_to_flags(row) for row in rows
    }
    for user_id in user_ids:
        out.setdefault(user_id, NotificationPreferenceFlags())
    return out


def truncate_for_notification(value: str, *, limit: int = 280) -> str:
    cleaned = " ".join((value or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: max(0, limit - 3)].rstrip()}..."


async def create_notification(
    db: AsyncSession,
    *,
    recipient_user_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    entry_id: uuid.UUID | None,
    comment_id: uuid.UUID | None,
    kind: str,
    title: str,
    body: str | None,
    metadata_json: dict | None = None,
) -> Notification:
    notification = Notification(
        recipient_user_id=recipient_user_id,
        actor_user_id=actor_user_id,
        entry_id=entry_id,
        comment_id=comment_id,
        kind=kind,
        title=title,
        body=body,
        metadata_json=metadata_json,
    )
    db.add(notification)
    await db.flush()
    return notification
