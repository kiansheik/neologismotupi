import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload

from app.core.deps import SessionDep, get_current_user
from app.core.errors import raise_api_error
from app.models.discussion import Notification, NotificationPreference
from app.models.entry import Entry
from app.models.user import User
from app.schemas.notifications import (
    NotificationListOut,
    NotificationOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    NotificationReadResponse,
)
from app.schemas.users import PublicProfileOut, PublicUserOut
from app.services.notifications import get_or_create_notification_preferences
from app.services.user_badges import get_user_badge_leaders, resolve_user_badges

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/notification-preferences", response_model=NotificationPreferenceOut)
async def get_my_notification_preferences(
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationPreferenceOut:
    pref = (
        await db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == user.id)
        )
    ).scalar_one_or_none()
    if pref is None:
        return NotificationPreferenceOut(
            in_app_enabled=True,
            email_enabled=True,
            push_enabled=True,
            notify_on_entry_comments=True,
            notify_on_mentions=True,
        )
    return NotificationPreferenceOut.model_validate(pref)


@router.patch("/me/notification-preferences", response_model=NotificationPreferenceOut)
async def update_my_notification_preferences(
    payload: NotificationPreferenceUpdate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationPreferenceOut:
    pref = await get_or_create_notification_preferences(db, user_id=user.id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(pref, field, value)
    await db.commit()
    await db.refresh(pref)
    return NotificationPreferenceOut.model_validate(pref)


@router.get("/me/notifications", response_model=NotificationListOut)
async def list_my_notifications(
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    unread_only: bool = False,
) -> NotificationListOut:
    base_stmt = (
        select(Notification)
        .where(Notification.recipient_user_id == user.id)
        .order_by(Notification.created_at.desc())
    )
    if unread_only:
        base_stmt = base_stmt.where(Notification.is_read.is_(False))

    count_stmt = select(func.count()).select_from(Notification).where(
        Notification.recipient_user_id == user.id
    )
    if unread_only:
        count_stmt = count_stmt.where(Notification.is_read.is_(False))

    unread_count_stmt = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.recipient_user_id == user.id)
        .where(Notification.is_read.is_(False))
    )

    notifications = (
        await db.execute(base_stmt.offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    total = int((await db.execute(count_stmt)).scalar_one())
    unread_count = int((await db.execute(unread_count_stmt)).scalar_one())

    actor_ids = {notification.actor_user_id for notification in notifications if notification.actor_user_id}
    actor_rows = (
        await db.execute(
            select(User).where(User.id.in_(list(actor_ids))).options(selectinload(User.profile))
        )
    ).scalars().all() if actor_ids else []
    actors_by_id = {actor.id: actor for actor in actor_rows}

    entry_ids = {notification.entry_id for notification in notifications if notification.entry_id}
    entry_rows = (
        await db.execute(select(Entry.id, Entry.slug, Entry.headword).where(Entry.id.in_(list(entry_ids))))
    ).all() if entry_ids else []
    entries_by_id = {entry_id: (slug, headword) for entry_id, slug, headword in entry_rows}

    items: list[NotificationOut] = []
    for notification in notifications:
        actor_display_name: str | None = None
        actor_profile_url: str | None = None
        if notification.actor_user_id and notification.actor_user_id in actors_by_id:
            actor = actors_by_id[notification.actor_user_id]
            if actor.profile and actor.profile.display_name:
                actor_display_name = actor.profile.display_name
            else:
                actor_display_name = actor.email.split("@", maxsplit=1)[0]
            actor_profile_url = f"/profiles/{actor.id}"

        entry_slug: str | None = None
        entry_headword: str | None = None
        entry_url: str | None = None
        if notification.entry_id and notification.entry_id in entries_by_id:
            entry_slug, entry_headword = entries_by_id[notification.entry_id]
            entry_url = f"/entries/{entry_slug}"

        items.append(
            NotificationOut(
                id=notification.id,
                kind=notification.kind,
                title=notification.title,
                body=notification.body,
                is_read=notification.is_read,
                read_at=notification.read_at,
                created_at=notification.created_at,
                actor_user_id=notification.actor_user_id,
                actor_display_name=actor_display_name,
                actor_profile_url=actor_profile_url,
                entry_id=notification.entry_id,
                entry_slug=entry_slug,
                entry_headword=entry_headword,
                entry_url=entry_url,
                comment_id=notification.comment_id,
            )
        )

    return NotificationListOut(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        unread_count=unread_count,
    )


@router.post("/me/notifications/{notification_id}/read", response_model=NotificationReadResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationReadResponse:
    notification = (
        await db.execute(
            select(Notification)
            .where(Notification.id == notification_id)
            .where(Notification.recipient_user_id == user.id)
        )
    ).scalar_one_or_none()
    if notification is None:
        raise_api_error(status_code=404, code="notification_not_found", message="Notification not found")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(UTC)
        await db.commit()

    return NotificationReadResponse(ok=True)


@router.post("/me/notifications/read-all", response_model=NotificationReadResponse)
async def mark_all_notifications_read(
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationReadResponse:
    now = datetime.now(UTC)
    await db.execute(
        update(Notification)
        .where(Notification.recipient_user_id == user.id)
        .where(Notification.is_read.is_(False))
        .values(is_read=True, read_at=now)
    )
    await db.commit()
    return NotificationReadResponse(ok=True)


@router.get("/{user_id}", response_model=PublicUserOut)
async def get_user_profile(user_id: uuid.UUID, db: SessionDep) -> PublicUserOut:
    user = (
        await db.execute(
            select(User).where(User.id == user_id).options(selectinload(User.profile))
        )
    ).scalar_one_or_none()
    if not user or not user.profile:
        raise_api_error(status_code=404, code="user_not_found", message="User not found")

    badge_leaders = await get_user_badge_leaders(db)
    profile_out = PublicProfileOut.model_validate(user.profile)
    profile_out.badges = resolve_user_badges(user.id, badge_leaders)
    return PublicUserOut(id=user.id, created_at=user.created_at, profile=profile_out)
