import uuid
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_api_error
from app.models.entry import Entry
from app.models.participation import ReviewParticipationEvent
from app.models.user import User
from app.services.entries import count_user_entries

ENTRY_VOTE_ACTION = "entry_vote"
EXAMPLE_VOTE_ACTION = "example_vote"
AUDIO_VOTE_ACTION = "audio_vote"
COMMENT_VOTE_ACTION = "comment_vote"
ENTRY_COMMENT_ACTION = "entry_comment"
PAGE_ENGAGEMENT_ACTION = "page_engagement"

PAGE_ENGAGEMENT_TIERS = ("poor", "fair", "excellent")


@dataclass(frozen=True)
class EntryParticipationGate:
    window_start: datetime
    window_end: datetime
    participation_score: float
    review_actions: int
    entries_today: int
    allowed_posts: int | None
    remaining_posts: int | None
    unlimited: bool
    next_score_required: float
    score_required_for_unlimited: float
    votes_are_consumed: bool


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def get_entry_participation_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    settings = get_settings()
    window_end = _as_utc(now or datetime.now(UTC))
    window_start = window_end - timedelta(days=max(1, settings.entry_participation_window_days))
    return window_start, window_end


def _get_utc_day_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    day = _as_utc(now or datetime.now(UTC))
    day_start = datetime(day.year, day.month, day.day, tzinfo=UTC)
    return day_start, day_start + timedelta(days=1)


def _enabled_review_action_types() -> list[str]:
    settings = get_settings()
    action_types: list[str] = []
    if settings.entry_participation_count_entry_votes:
        action_types.append(ENTRY_VOTE_ACTION)
    if settings.entry_participation_count_example_votes:
        action_types.append(EXAMPLE_VOTE_ACTION)
    if settings.entry_participation_count_audio_votes:
        action_types.append(AUDIO_VOTE_ACTION)
    if settings.entry_participation_count_comment_votes:
        action_types.append(COMMENT_VOTE_ACTION)
    if settings.entry_participation_count_comments:
        action_types.append(ENTRY_COMMENT_ACTION)
    return action_types


async def record_review_participation_event(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    action_type: str,
    target_type: str,
    target_id: uuid.UUID,
    source_key: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> ReviewParticipationEvent | None:
    source_key = source_key or f"{action_type}:{target_id}"
    existing_id = (
        await db.execute(
            select(ReviewParticipationEvent.id).where(
                and_(
                    ReviewParticipationEvent.user_id == user_id,
                    ReviewParticipationEvent.source_key == source_key,
                )
            )
        )
    ).scalar_one_or_none()
    if existing_id is not None:
        return None

    event = ReviewParticipationEvent(
        user_id=user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        source_key=source_key,
        metadata_json=metadata_json,
    )
    db.add(event)
    await db.flush()
    return event


async def compute_participation_score(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    window_start: datetime,
    window_end: datetime,
) -> float:
    """Weighted participation score over the rolling window.

    Vote events contribute by type weight; page engagement events add a
    tier-based bonus or small penalty. The total is floored at zero.
    """
    settings = get_settings()
    action_types = _enabled_review_action_types() + [PAGE_ENGAGEMENT_ACTION]
    if not action_types:
        return 0.0

    rows = (
        await db.execute(
            select(
                ReviewParticipationEvent.action_type,
                ReviewParticipationEvent.metadata_json,
            ).where(
                and_(
                    ReviewParticipationEvent.user_id == user_id,
                    ReviewParticipationEvent.action_type.in_(action_types),
                    ReviewParticipationEvent.created_at >= _as_utc(window_start),
                    ReviewParticipationEvent.created_at <= _as_utc(window_end),
                )
            )
        )
    ).all()

    score = 0.0
    for action_type, metadata in rows:
        if action_type == ENTRY_VOTE_ACTION:
            score += settings.entry_participation_entry_vote_weight
        elif action_type == EXAMPLE_VOTE_ACTION:
            score += settings.entry_participation_example_vote_weight
        elif action_type in (COMMENT_VOTE_ACTION, ENTRY_COMMENT_ACTION, AUDIO_VOTE_ACTION):
            score += settings.entry_participation_comment_vote_weight
        elif action_type == PAGE_ENGAGEMENT_ACTION:
            tier = (metadata or {}).get("tier", "poor")
            if tier == "excellent":
                score += settings.entry_participation_page_excellent_weight
            elif tier == "fair":
                score += settings.entry_participation_page_fair_weight
            else:
                score += settings.entry_participation_page_poor_weight

    return max(0.0, score)


async def compute_review_actions_count(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    window_start: datetime,
    window_end: datetime,
) -> int:
    """Count of distinct qualifying participation events in the rolling window."""
    action_types = _enabled_review_action_types()
    if not action_types:
        return 0

    count = (
        await db.execute(
            select(func.count()).where(
                and_(
                    ReviewParticipationEvent.user_id == user_id,
                    ReviewParticipationEvent.action_type.in_(action_types),
                    ReviewParticipationEvent.created_at >= _as_utc(window_start),
                    ReviewParticipationEvent.created_at <= _as_utc(window_end),
                )
            )
        )
    ).scalar_one()
    return int(count)


def compute_entry_participation_gate(
    participation_score: float,
    review_actions: int,
    entries_today: int,
    *,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> EntryParticipationGate:
    settings = get_settings()
    if window_start is None or window_end is None:
        default_window_start, default_window_end = get_entry_participation_window()
        window_start = window_start or default_window_start
        window_end = window_end or default_window_end
    window_start = _as_utc(window_start)
    window_end = _as_utc(window_end)

    score = max(0.0, participation_score)
    entries = max(0, entries_today)
    step1 = float(max(0, settings.entry_participation_step1_actions))
    step1_posts = max(0, settings.entry_participation_step1_posts)
    step2 = float(max(step1, settings.entry_participation_step2_actions))
    step2_posts = max(step1_posts, settings.entry_participation_step2_posts)
    step3 = float(max(step2, settings.entry_participation_step3_actions))
    daily_cap = settings.entry_participation_unlimited_daily_cap
    if daily_cap is not None:
        daily_cap = max(0, daily_cap)

    if not settings.entry_participation_gate_enabled:
        return EntryParticipationGate(
            window_start=window_start,
            window_end=window_end,
            participation_score=score,
            review_actions=review_actions,
            entries_today=entries,
            allowed_posts=None,
            remaining_posts=None,
            unlimited=True,
            next_score_required=0.0,
            score_required_for_unlimited=step3,
            votes_are_consumed=False,
        )

    unlimited = False
    allowed_posts: int | None
    if score >= step3:
        if settings.entry_participation_step3_unlimited and daily_cap is None:
            unlimited = True
            allowed_posts = None
        elif daily_cap is not None:
            allowed_posts = daily_cap
        else:
            allowed_posts = step2_posts
    elif score >= step2:
        allowed_posts = step2_posts
    elif score >= step1:
        allowed_posts = step1_posts
    else:
        allowed_posts = 0

    remaining_posts = (
        None if unlimited or allowed_posts is None else max(0, allowed_posts - entries)
    )
    if unlimited:
        next_score_required = 0.0
    elif score < step2:
        next_score_required = max(0.0, step2 - score)
    else:
        next_score_required = max(0.0, step3 - score)

    return EntryParticipationGate(
        window_start=window_start,
        window_end=window_end,
        participation_score=score,
        review_actions=review_actions,
        entries_today=entries,
        allowed_posts=allowed_posts,
        remaining_posts=remaining_posts,
        unlimited=unlimited,
        next_score_required=next_score_required,
        score_required_for_unlimited=step3,
        votes_are_consumed=False,
    )


async def get_entry_submission_participation_gate(
    db: AsyncSession,
    user: User,
    now: datetime | None = None,
) -> EntryParticipationGate:
    settings = get_settings()
    now = _as_utc(now or datetime.now(UTC))
    window_start, window_end = get_entry_participation_window(now)
    day_start, day_end = _get_utc_day_window(now)

    participation_score = 0.0
    review_actions = 0
    if settings.entry_participation_gate_enabled:
        participation_score = await compute_participation_score(
            db,
            user.id,
            window_start=window_start,
            window_end=window_end,
        )
        review_actions = await compute_review_actions_count(
            db,
            user.id,
            window_start=window_start,
            window_end=window_end,
        )
    entries_today = await count_user_entries(
        db,
        user.id,
        created_after=day_start,
        created_before=day_end,
    )
    gate = compute_entry_participation_gate(
        participation_score,
        review_actions,
        entries_today,
        window_start=window_start,
        window_end=window_end,
    )

    if user.is_superuser and settings.entry_participation_exempt_staff:
        return replace(
            gate,
            allowed_posts=None,
            remaining_posts=None,
            unlimited=True,
            next_score_required=0.0,
        )
    return gate


def entry_participation_gate_error_details(gate: EntryParticipationGate) -> dict[str, Any]:
    return {
        "participation_score": gate.participation_score,
        "review_actions": gate.review_actions,
        "window_start": gate.window_start.isoformat(),
        "window_end": gate.window_end.isoformat(),
        "entries_today": gate.entries_today,
        "allowed_posts": gate.allowed_posts,
        "remaining_posts": gate.remaining_posts,
        "next_score_required": gate.next_score_required,
        "needed": gate.next_score_required,
        "score_required_for_unlimited": gate.score_required_for_unlimited,
        "votes_are_consumed": False,
    }


async def enforce_entry_submission_participation_gate(
    db: AsyncSession,
    user: User,
    now: datetime | None = None,
) -> EntryParticipationGate:
    gate = await get_entry_submission_participation_gate(db, user, now)
    if not gate.unlimited and (gate.remaining_posts or 0) <= 0:
        raise_api_error(
            status_code=403,
            code="entry_participation_gate",
            message="Not enough recent review participation to submit another entry today",
            details=entry_participation_gate_error_details(gate),
        )
    return gate


async def record_page_engagement_event(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
    tier: str,
    now: datetime | None = None,
) -> None:
    if tier not in PAGE_ENGAGEMENT_TIERS:
        return
    day = _as_utc(now or datetime.now(UTC)).date().isoformat()
    await record_review_participation_event(
        db,
        user_id=user_id,
        action_type=PAGE_ENGAGEMENT_ACTION,
        target_type="entry",
        target_id=entry_id,
        source_key=f"{PAGE_ENGAGEMENT_ACTION}:{entry_id}:{day}",
        metadata_json={"tier": tier},
    )


async def record_entry_comment_participation(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    entry: Entry,
    comment_id: uuid.UUID,
    now: datetime | None = None,
) -> None:
    if entry.proposer_user_id == user_id:
        return
    day = _as_utc(now or datetime.now(UTC)).date().isoformat()
    await record_review_participation_event(
        db,
        user_id=user_id,
        action_type=ENTRY_COMMENT_ACTION,
        target_type="comment",
        target_id=comment_id,
        source_key=f"{ENTRY_COMMENT_ACTION}:{entry.id}:{day}",
        metadata_json={"entry_id": str(entry.id)},
    )
