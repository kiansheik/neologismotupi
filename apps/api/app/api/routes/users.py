import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import SessionDep, get_current_user
from app.core.errors import raise_api_error
from app.models.discussion import EntryComment, Notification, NotificationPreference
from app.models.entry import Entry, Example
from app.models.user import Profile, Session, User
from app.schemas.notifications import (
    NotificationListOut,
    NotificationOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    NotificationReadResponse,
)
from app.schemas.users import (
    MentionResolveRequest,
    MentionUserOut,
    ProfileUpdateRequest,
    PublicProfileOut,
    PublicProfileStatsOut,
    PublicUserOut,
)
from app.services.notifications import (
    get_or_create_notification_preferences,
    normalize_mention_key,
)
from app.services.user_badges import get_user_badge_leaders, resolve_user_badges

router = APIRouter(prefix="/users", tags=["users"])


@dataclass(frozen=True)
class MentionCandidate:
    user_id: uuid.UUID
    display_name: str
    mention_handle: str
    profile_url: str
    reputation_score: int
    created_at: datetime
    email_local_key: str


def _iter_mention_candidates(
    rows: list[tuple[uuid.UUID, datetime, str, str, int]],
) -> list[MentionCandidate]:
    candidates: list[MentionCandidate] = []
    for user_id, created_at, email, display_name, reputation_score in rows:
        cleaned_name = (display_name or "").strip()
        if not cleaned_name:
            continue
        mention_handle = normalize_mention_key(cleaned_name)
        if not mention_handle:
            continue
        local_part = email.split("@", maxsplit=1)[0] if email else ""
        candidates.append(
            MentionCandidate(
                user_id=user_id,
                display_name=cleaned_name,
                mention_handle=mention_handle,
                profile_url=f"/profiles/{user_id}",
                reputation_score=int(reputation_score or 0),
                created_at=created_at,
                email_local_key=normalize_mention_key(local_part),
            )
        )
    return candidates


def _match_priority(candidate: MentionCandidate, query_key: str) -> int:
    if not query_key:
        return 0
    handle = candidate.mention_handle
    if handle == query_key:
        return 0
    if handle.startswith(query_key):
        return 1
    if query_key in handle:
        return 2
    if candidate.email_local_key.startswith(query_key):
        return 3
    return 4


def _latest_timestamp(values: list[datetime | None]) -> datetime | None:
    available = [value for value in values if value is not None]
    if not available:
        return None
    return max(available)


def _earliest_timestamp(values: list[datetime | None]) -> datetime | None:
    available = [value for value in values if value is not None]
    if not available:
        return None
    return min(available)


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned


async def _build_public_profile_stats(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> PublicProfileStatsOut:
    total_entries = int(
        (
            await db.execute(
                select(func.count()).select_from(Entry).where(Entry.proposer_user_id == user_id)
            )
        ).scalar_one()
    )
    total_comments = int(
        (
            await db.execute(
                select(func.count())
                .select_from(EntryComment)
                .where(EntryComment.user_id == user_id)
            )
        ).scalar_one()
    )

    first_entry_at = (
        await db.execute(
            select(func.min(Entry.created_at)).where(Entry.proposer_user_id == user_id)
        )
    ).scalar_one_or_none()
    first_example_at = (
        await db.execute(select(func.min(Example.created_at)).where(Example.user_id == user_id))
    ).scalar_one_or_none()
    first_comment_at = (
        await db.execute(
            select(func.min(EntryComment.created_at)).where(EntryComment.user_id == user_id)
        )
    ).scalar_one_or_none()

    latest_entry_at = (
        await db.execute(
            select(func.max(Entry.created_at)).where(Entry.proposer_user_id == user_id)
        )
    ).scalar_one_or_none()
    latest_example_at = (
        await db.execute(select(func.max(Example.created_at)).where(Example.user_id == user_id))
    ).scalar_one_or_none()
    latest_comment_at = (
        await db.execute(
            select(func.max(EntryComment.created_at)).where(EntryComment.user_id == user_id)
        )
    ).scalar_one_or_none()

    last_seen_at = (
        await db.execute(select(func.max(Session.last_seen_at)).where(Session.user_id == user_id))
    ).scalar_one_or_none()

    return PublicProfileStatsOut(
        total_entries=total_entries,
        total_comments=total_comments,
        last_seen_at=last_seen_at,
        last_active_at=_latest_timestamp([latest_entry_at, latest_example_at, latest_comment_at]),
        submitting_since_at=_earliest_timestamp(
            [first_entry_at, first_example_at, first_comment_at]
        ),
    )


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


@router.patch("/me/profile", response_model=PublicProfileOut)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> PublicProfileOut:
    profile = (
        await db.execute(select(Profile).where(Profile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None:
        raise_api_error(status_code=404, code="user_not_found", message="User not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field == "display_name":
            if value is None:
                continue
            cleaned_display_name = value.strip()
            if len(cleaned_display_name) < 2:
                raise_api_error(
                    status_code=422,
                    code="invalid_profile",
                    message="Display name must have at least 2 characters",
                )
            setattr(profile, field, cleaned_display_name)
            continue
        setattr(profile, field, _normalize_optional_text(value))

    await db.commit()
    await db.refresh(profile)

    badge_leaders = await get_user_badge_leaders(db)
    profile_out = PublicProfileOut.model_validate(profile)
    profile_out.badges = resolve_user_badges(user.id, badge_leaders)
    profile_out.stats = await _build_public_profile_stats(db, user_id=user.id)
    return profile_out


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

    actor_ids = {
        notification.actor_user_id
        for notification in notifications
        if notification.actor_user_id
    }
    actor_rows = (
        await db.execute(
            select(User).where(User.id.in_(list(actor_ids))).options(selectinload(User.profile))
        )
    ).scalars().all() if actor_ids else []
    actors_by_id = {actor.id: actor for actor in actor_rows}

    entry_ids = {
        notification.entry_id
        for notification in notifications
        if notification.entry_id
    }
    entry_rows = (
        await db.execute(
            select(Entry.id, Entry.slug, Entry.headword).where(
                Entry.id.in_(list(entry_ids))
            )
        )
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
        raise_api_error(
            status_code=404,
            code="notification_not_found",
            message="Notification not found",
        )

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


@router.get("/mentions", response_model=list[MentionUserOut])
async def list_mention_candidates(
    db: SessionDep,
    _user: Annotated[User, Depends(get_current_user)],
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=8, ge=1, le=20),
) -> list[MentionUserOut]:
    query_key = normalize_mention_key(q.strip())
    rows = (
        await db.execute(
            select(
                User.id,
                User.created_at,
                User.email,
                Profile.display_name,
                Profile.reputation_score,
            )
            .join(Profile, Profile.user_id == User.id)
            .where(User.is_active.is_(True))
        )
    ).all()
    candidates = _iter_mention_candidates(rows)
    if query_key:
        candidates = [
            candidate
            for candidate in candidates
            if query_key in candidate.mention_handle or query_key in candidate.email_local_key
        ]

    candidates.sort(
        key=lambda candidate: (
            _match_priority(candidate, query_key),
            -candidate.reputation_score,
            candidate.display_name.lower(),
            str(candidate.user_id),
        )
    )
    selected = candidates[:limit]
    return [
        MentionUserOut(
            id=candidate.user_id,
            display_name=candidate.display_name,
            mention_handle=candidate.mention_handle,
            profile_url=candidate.profile_url,
        )
        for candidate in selected
    ]


@router.post("/mentions/resolve", response_model=list[MentionUserOut])
async def resolve_mentions(
    payload: MentionResolveRequest,
    db: SessionDep,
) -> list[MentionUserOut]:
    ordered_keys: list[str] = []
    seen_keys: set[str] = set()
    for raw_handle in payload.handles:
        cleaned = raw_handle.strip()
        if cleaned.startswith("@"):
            cleaned = cleaned[1:]
        key = normalize_mention_key(cleaned)
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        ordered_keys.append(key)

    if not ordered_keys:
        return []

    rows = (
        await db.execute(
            select(
                User.id,
                User.created_at,
                User.email,
                Profile.display_name,
                Profile.reputation_score,
            )
            .join(Profile, Profile.user_id == User.id)
            .where(User.is_active.is_(True))
        )
    ).all()
    candidates = _iter_mention_candidates(rows)

    best_by_key: dict[str, MentionCandidate] = {}
    for candidate in candidates:
        key = candidate.mention_handle
        if key not in seen_keys:
            continue
        current_best = best_by_key.get(key)
        if current_best is None:
            best_by_key[key] = candidate
            continue
        if candidate.reputation_score > current_best.reputation_score:
            best_by_key[key] = candidate
            continue
        if (
            candidate.reputation_score == current_best.reputation_score
            and candidate.created_at < current_best.created_at
        ):
            best_by_key[key] = candidate

    out: list[MentionUserOut] = []
    for key in ordered_keys:
        candidate = best_by_key.get(key)
        if candidate is None:
            continue
        out.append(
            MentionUserOut(
                id=candidate.user_id,
                display_name=candidate.display_name,
                mention_handle=candidate.mention_handle,
                profile_url=candidate.profile_url,
            )
        )
    return out


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
    profile_out.stats = await _build_public_profile_stats(db, user_id=user.id)
    return PublicUserOut(id=user.id, created_at=user.created_at, profile=profile_out)
