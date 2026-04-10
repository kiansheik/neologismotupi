import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, case, func, or_, select


def _to_date(val) -> "date":
    """Normalize DB date result to a Python date (works for SQLite strings and PG date/datetime)."""
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val))
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.enums import (
    EntryStatus,
    FlashcardCardType,
    FlashcardDirection,
    FlashcardGrade,
    FlashcardQueue,
)
from app.models.audio import AudioSample
from app.models.entry import Entry
from app.models.user import Profile, User
from app.models.flashcards import (
    FlashcardListItem,
    FlashcardProgress,
    FlashcardReminder,
    FlashcardReviewLog,
    FlashcardSessionSegment,
    FlashcardSettings,
    FlashcardStudySession,
)
from app.services.audio import build_audio_url
from app.services.email_delivery import send_flashcard_reminder_email
from app.services.flashcards_scheduler import (
    DEFAULT_FSRS_PARAMS,
    DEFAULT_FSRS_VERSION,
    MemoryState,
    fsrs_step,
    grade_to_rating,
    next_interval_days,
)

NEW_CARD_MIN = 3
NEW_CARD_SCAN_LIMIT = 400
DEFAULT_LEARNING_STEPS = [1, 10]
DEFAULT_RELEARNING_STEPS = [10]
DEFAULT_DESIRED_RETENTION = 0.9
DEFAULT_HISTORICAL_RETENTION = 0.9


@dataclass(frozen=True)
class PlannedCard:
    entry_id: uuid.UUID
    direction: FlashcardDirection
    queue: FlashcardQueue


@dataclass(frozen=True)
class FlashcardSummary:
    new_remaining: int
    review_remaining: int
    completed_today: int
    due_now: int
    due_later_today: int


@dataclass(frozen=True)
class FlashcardActiveSession:
    id: uuid.UUID
    started_at: datetime
    elapsed_seconds: int
    review_count: int
    is_paused: bool


@dataclass(frozen=True)
class FlashcardDailyStats:
    date: date
    reviews: int
    new_seen: int
    study_minutes: int
    sessions: int


@dataclass(frozen=True)
class FlashcardStats:
    today: FlashcardDailyStats
    last_7_days: list[FlashcardDailyStats]


@dataclass(frozen=True)
class FlashcardCardPayload:
    entry_id: uuid.UUID
    direction: FlashcardDirection
    queue: FlashcardQueue
    slug: str
    headword: str
    gloss_pt: str
    short_definition: str
    part_of_speech: str | None
    audio_url: str | None
    audio_duration_seconds: int | None


def utc_now() -> datetime:
    return datetime.now(UTC)


def _resolve_reminder_timezone(time_zone: str | None, offset_minutes: int | None) -> timezone | ZoneInfo:
    if time_zone:
        try:
            return ZoneInfo(time_zone)
        except ZoneInfoNotFoundError:
            pass
    if offset_minutes is not None:
        return timezone(timedelta(minutes=-offset_minutes))
    return UTC


def _format_reminder_timezone(tz: timezone | ZoneInfo) -> str | None:
    if isinstance(tz, ZoneInfo):
        return tz.key
    offset = tz.utcoffset(None) if tz else None
    if offset is None:
        return None
    total_minutes = int(offset.total_seconds() // 60)
    sign = "+" if total_minutes >= 0 else "-"
    hours = abs(total_minutes) // 60
    minutes = abs(total_minutes) % 60
    return f"UTC{sign}{hours:02d}:{minutes:02d}"


def _entry_card_filters():
    return and_(
        Entry.status == EntryStatus.approved,
        func.length(func.trim(Entry.headword)) > 0,
        Entry.gloss_pt.isnot(None),
        func.length(func.trim(Entry.gloss_pt)) > 0,
        func.length(func.trim(Entry.short_definition)) > 0,
    )


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=UTC)
    end = start + timedelta(days=1)
    return start, end


def _sibling_direction(direction: FlashcardDirection) -> FlashcardDirection:
    if direction == FlashcardDirection.headword_to_gloss:
        return FlashcardDirection.gloss_to_headword
    return FlashcardDirection.headword_to_gloss


def _normalize_steps(steps: list[int] | None, fallback: list[int]) -> list[int]:
    if not steps:
        return fallback
    return [step for step in steps if step > 0] or fallback


def _normalize_retention(value: float | None) -> float:
    if value is None:
        return DEFAULT_DESIRED_RETENTION
    return max(0.7, min(0.99, value))


def _memory_state_from_progress(progress: FlashcardProgress | None) -> MemoryState:
    if not progress:
        return MemoryState(stability=0.0, difficulty=0.0)
    return MemoryState(
        stability=progress.memory_stability or 0.0,
        difficulty=progress.memory_difficulty or 0.0,
    )


def _seconds_to_days(seconds: float) -> float:
    return seconds / 86400.0


def _elapsed_days(progress: FlashcardProgress | None, now: datetime) -> float:
    if not progress or not progress.last_review_at:
        return 0.0
    elapsed = _seconds_to_days((now - progress.last_review_at).total_seconds())
    if elapsed < 1:
        return 0.0
    return elapsed


async def get_or_create_flashcard_settings(
    db: AsyncSession, user_id: uuid.UUID
) -> FlashcardSettings:
    settings = (
        await db.execute(select(FlashcardSettings).where(FlashcardSettings.user_id == user_id))
    ).scalar_one_or_none()
    if not settings:
        settings = FlashcardSettings(
            user_id=user_id,
            new_cards_per_day=NEW_CARD_MIN,
            desired_retention=DEFAULT_DESIRED_RETENTION,
            learning_steps_minutes=list(DEFAULT_LEARNING_STEPS),
            relearning_steps_minutes=list(DEFAULT_RELEARNING_STEPS),
            bury_siblings=True,
            fsrs_params=list(DEFAULT_FSRS_PARAMS),
            fsrs_params_version=DEFAULT_FSRS_VERSION,
            historical_retention=DEFAULT_HISTORICAL_RETENTION,
            advanced_grading_enabled=False,
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
        return settings

    changed = False
    if settings.desired_retention is None:
        settings.desired_retention = DEFAULT_DESIRED_RETENTION
        changed = True
    if settings.learning_steps_minutes is None:
        settings.learning_steps_minutes = list(DEFAULT_LEARNING_STEPS)
        changed = True
    if settings.relearning_steps_minutes is None:
        settings.relearning_steps_minutes = list(DEFAULT_RELEARNING_STEPS)
        changed = True
    if settings.bury_siblings is None:
        settings.bury_siblings = True
        changed = True
    if settings.fsrs_params is None:
        settings.fsrs_params = list(DEFAULT_FSRS_PARAMS)
        changed = True
    if settings.fsrs_params_version is None:
        settings.fsrs_params_version = DEFAULT_FSRS_VERSION
        changed = True
    if settings.historical_retention is None:
        settings.historical_retention = DEFAULT_HISTORICAL_RETENTION
        changed = True
    if settings.advanced_grading_enabled is None:
        settings.advanced_grading_enabled = False
        changed = True

    if changed:
        await db.commit()
        await db.refresh(settings)
    return settings


async def _load_progress_map(
    db: AsyncSession, user_id: uuid.UUID
) -> dict[uuid.UUID, set[FlashcardDirection]]:
    stmt = select(FlashcardProgress.entry_id, FlashcardProgress.direction).where(
        FlashcardProgress.user_id == user_id
    )
    rows = (await db.execute(stmt)).all()
    progress_map: dict[uuid.UUID, set[FlashcardDirection]] = {}
    for entry_id, direction in rows:
        progress_map.setdefault(entry_id, set()).add(direction)
    return progress_map


async def _load_reviewed_cards_today(
    db: AsyncSession, user_id: uuid.UUID, start: datetime, end: datetime, list_id: uuid.UUID | None
) -> set[tuple[uuid.UUID, FlashcardDirection]]:
    stmt = select(FlashcardReviewLog.entry_id, FlashcardReviewLog.direction).where(
        FlashcardReviewLog.user_id == user_id,
        FlashcardReviewLog.reviewed_at >= start,
        FlashcardReviewLog.reviewed_at < end,
    )
    if list_id:
        stmt = stmt.where(
            FlashcardReviewLog.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    rows = (await db.execute(stmt)).all()
    return {(entry_id, direction) for entry_id, direction in rows}


def _sibling_buried(
    entry_id: uuid.UUID,
    direction: FlashcardDirection,
    reviewed_cards_today: set[tuple[uuid.UUID, FlashcardDirection]],
) -> bool:
    sibling = _sibling_direction(direction)
    return (entry_id, sibling) in reviewed_cards_today


async def _get_active_session(
    db: AsyncSession, user_id: uuid.UUID
) -> FlashcardStudySession | None:
    stmt = (
        select(FlashcardStudySession)
        .where(
            FlashcardStudySession.user_id == user_id,
            FlashcardStudySession.ended_at.is_(None),
        )
        .order_by(FlashcardStudySession.started_at.desc())
    )
    return (await db.execute(stmt)).scalars().first()


async def _get_open_segment(
    db: AsyncSession, session_id: uuid.UUID
) -> FlashcardSessionSegment | None:
    stmt = (
        select(FlashcardSessionSegment)
        .where(
            FlashcardSessionSegment.session_id == session_id,
            FlashcardSessionSegment.ended_at.is_(None),
        )
        .order_by(FlashcardSessionSegment.started_at.desc())
    )
    return (await db.execute(stmt)).scalars().first()


async def _load_session_segments(
    db: AsyncSession, session_id: uuid.UUID
) -> list[FlashcardSessionSegment]:
    stmt = (
        select(FlashcardSessionSegment)
        .where(FlashcardSessionSegment.session_id == session_id)
        .order_by(FlashcardSessionSegment.started_at.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


def _as_utc(dt: datetime) -> datetime:
    """Return dt as UTC-aware, adding UTC tzinfo if it's naive (e.g. from SQLite)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _sum_segment_seconds(segments: list[FlashcardSessionSegment], end_time: datetime) -> int:
    end = _as_utc(end_time)
    total = 0
    for segment in segments:
        seg_end = _as_utc(segment.ended_at) if segment.ended_at is not None else end
        seg_start = _as_utc(segment.started_at)
        seg_end = min(seg_end, end)
        if seg_end <= seg_start:
            continue
        total += int((seg_end - seg_start).total_seconds())
    return total


async def _ensure_active_segment(
    db: AsyncSession,
    *,
    session: FlashcardStudySession,
    user_id: uuid.UUID,
    now: datetime,
) -> FlashcardSessionSegment | None:
    segment = await _get_open_segment(db, session.id)
    if segment:
        return segment
    segment = FlashcardSessionSegment(
        session_id=session.id,
        user_id=user_id,
        started_at=now,
    )
    db.add(segment)
    return segment


async def _end_open_segment(
    db: AsyncSession,
    *,
    session_id: uuid.UUID,
    now: datetime,
) -> FlashcardSessionSegment | None:
    segment = await _get_open_segment(db, session_id)
    if not segment:
        return None
    segment.ended_at = now
    return segment


async def _count_reviews_for_session(
    db: AsyncSession, session_id: uuid.UUID
) -> int:
    stmt = (
        select(func.count())
        .select_from(FlashcardReviewLog)
        .where(FlashcardReviewLog.session_id == session_id)
    )
    return int((await db.execute(stmt)).scalar_one())


async def build_session_payload(
    db: AsyncSession, session: FlashcardStudySession | None, now: datetime
) -> FlashcardActiveSession | None:
    if not session:
        return None
    end_time = session.ended_at or now
    segments = await _load_session_segments(db, session.id)
    elapsed = _sum_segment_seconds(segments, end_time)
    is_paused = not any(segment.ended_at is None for segment in segments)
    review_count = await _count_reviews_for_session(db, session.id)
    return FlashcardActiveSession(
        id=session.id,
        started_at=session.started_at,
        elapsed_seconds=elapsed,
        review_count=review_count,
        is_paused=is_paused,
    )


def _normalize_queue(card_type: FlashcardCardType) -> FlashcardQueue:
    if card_type in (FlashcardCardType.learn, FlashcardCardType.relearn):
        return FlashcardQueue.learn
    if card_type == FlashcardCardType.review:
        return FlashcardQueue.review
    return FlashcardQueue.new


def _coerce_progress_defaults(progress: FlashcardProgress) -> None:
    if progress.reps is None:
        progress.reps = 0
    if progress.lapses is None:
        progress.lapses = 0
    if progress.scheduled_days is None:
        progress.scheduled_days = 0
    if progress.learning_step_index is None:
        progress.learning_step_index = 0
    if progress.remaining_steps is None:
        progress.remaining_steps = 0
    if progress.ease_factor is None:
        progress.ease_factor = 2.5


async def _ensure_sibling_progress(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
    direction: FlashcardDirection,
    now: datetime,
    created_at: datetime | None = None,
) -> FlashcardProgress:
    sibling_direction = _sibling_direction(direction)
    sibling = (
        await db.execute(
            select(FlashcardProgress).where(
                FlashcardProgress.user_id == user_id,
                FlashcardProgress.entry_id == entry_id,
                FlashcardProgress.direction == sibling_direction,
            )
        )
    ).scalar_one_or_none()
    if not sibling:
        timestamp = created_at or now
        sibling = FlashcardProgress(
            user_id=user_id,
            entry_id=entry_id,
            direction=sibling_direction,
            card_type=FlashcardCardType.new,
            queue=FlashcardQueue.new,
            due_at=now,
            scheduled_days=0,
            learning_step_index=0,
            remaining_steps=0,
            reps=0,
            lapses=0,
            ease_factor=2.5,
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(sibling)
        return sibling
    _coerce_progress_defaults(sibling)
    if (sibling.reps or 0) == 0 and (sibling.due_at is None or sibling.due_at > now):
        sibling.due_at = now
    return sibling


async def _select_pending_sibling(
    db: AsyncSession,
    user_id: uuid.UUID,
    now: datetime,
    list_id: uuid.UUID | None,
) -> FlashcardProgress | None:
    primary = aliased(FlashcardProgress)
    sibling = aliased(FlashcardProgress)
    stmt = (
        select(primary)
        .join(
            sibling,
            and_(
                sibling.user_id == primary.user_id,
                sibling.entry_id == primary.entry_id,
                sibling.direction == FlashcardDirection.headword_to_gloss,
            ),
        )
        .where(
            primary.user_id == user_id,
            primary.direction == FlashcardDirection.gloss_to_headword,
            primary.card_type == FlashcardCardType.new,
            primary.reps == 0,
            or_(primary.due_at.is_(None), primary.due_at <= now),
            sibling.reps > 0,
        )
        .order_by(sibling.last_review_at.desc().nullslast(), sibling.updated_at.desc())
        .limit(1)
    )
    if list_id:
        stmt = stmt.where(
            primary.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    pending = (await db.execute(stmt)).scalars().first()
    if pending:
        return pending

    orphan_primary = aliased(FlashcardProgress)
    orphan_sibling = aliased(FlashcardProgress)
    orphan_stmt = (
        select(orphan_primary)
        .outerjoin(
            orphan_sibling,
            and_(
                orphan_sibling.user_id == orphan_primary.user_id,
                orphan_sibling.entry_id == orphan_primary.entry_id,
                orphan_sibling.direction == FlashcardDirection.gloss_to_headword,
            ),
        )
        .where(
            orphan_primary.user_id == user_id,
            orphan_primary.direction == FlashcardDirection.headword_to_gloss,
            orphan_primary.reps > 0,
            orphan_sibling.id.is_(None),
        )
        .order_by(
            orphan_primary.last_review_at.desc().nullslast(),
            orphan_primary.updated_at.desc(),
        )
        .limit(1)
    )
    if list_id:
        orphan_stmt = orphan_stmt.where(
            orphan_primary.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    orphan = (await db.execute(orphan_stmt)).scalars().first()
    if orphan:
        return await _ensure_sibling_progress(
            db,
            user_id=user_id,
            entry_id=orphan.entry_id,
            direction=orphan.direction,
            now=now,
            created_at=orphan.created_at,
        )

    orphan_primary = aliased(FlashcardProgress)
    orphan_sibling = aliased(FlashcardProgress)
    reverse_stmt = (
        select(orphan_primary)
        .outerjoin(
            orphan_sibling,
            and_(
                orphan_sibling.user_id == orphan_primary.user_id,
                orphan_sibling.entry_id == orphan_primary.entry_id,
                orphan_sibling.direction == FlashcardDirection.headword_to_gloss,
            ),
        )
        .where(
            orphan_primary.user_id == user_id,
            orphan_primary.direction == FlashcardDirection.gloss_to_headword,
            orphan_primary.reps > 0,
            orphan_sibling.id.is_(None),
        )
        .order_by(
            orphan_primary.last_review_at.desc().nullslast(),
            orphan_primary.updated_at.desc(),
        )
        .limit(1)
    )
    if list_id:
        reverse_stmt = reverse_stmt.where(
            orphan_primary.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    orphan = (await db.execute(reverse_stmt)).scalars().first()
    if orphan:
        return await _ensure_sibling_progress(
            db,
            user_id=user_id,
            entry_id=orphan.entry_id,
            direction=orphan.direction,
            now=now,
            created_at=orphan.created_at,
        )

    return None


def _graduate_to_review(
    progress: FlashcardProgress,
    now: datetime,
    desired_retention: float,
    params: list[float],
    memory_state: MemoryState,
) -> None:
    interval = next_interval_days(memory_state.stability, desired_retention, params)
    interval_days = max(1, int(round(interval)))
    progress.card_type = FlashcardCardType.review
    progress.queue = FlashcardQueue.review
    progress.scheduled_days = interval_days
    progress.learning_step_index = 0
    progress.remaining_steps = 0
    progress.due_at = now + timedelta(days=interval_days)


def _apply_learning_step(
    progress: FlashcardProgress,
    now: datetime,
    steps: list[int],
    grade: FlashcardGrade,
    desired_retention: float,
    params: list[float],
    memory_state: MemoryState,
    *,
    learning_type: FlashcardCardType,
) -> None:
    if not steps:
        _graduate_to_review(progress, now, desired_retention, params, memory_state)
        return

    current_index = progress.learning_step_index
    if grade == FlashcardGrade.again:
        next_index = 0
    elif grade == FlashcardGrade.hard:
        next_index = max(0, current_index)
    elif grade == FlashcardGrade.good:
        next_index = current_index + 1
    else:
        _graduate_to_review(progress, now, desired_retention, params, memory_state)
        return

    if next_index >= len(steps):
        _graduate_to_review(progress, now, desired_retention, params, memory_state)
        return

    delay_minutes = steps[next_index]
    progress.card_type = learning_type
    progress.queue = FlashcardQueue.learn
    progress.learning_step_index = next_index
    progress.remaining_steps = max(0, len(steps) - next_index)
    progress.scheduled_days = 0
    progress.due_at = now + timedelta(minutes=delay_minutes)


def _build_audio_payload(sample: AudioSample | None) -> tuple[str | None, int | None]:
    if not sample:
        return None, None
    return build_audio_url(sample.file_path), sample.duration_seconds


def _flashcard_queue_for_progress(progress: FlashcardProgress) -> FlashcardQueue:
    return _normalize_queue(progress.card_type)


def _review_limit_remaining(max_reviews: int | None, reviews_done_today: int) -> int | None:
    if not max_reviews:
        return None
    return max(0, max_reviews - reviews_done_today)


async def _count_reviews_today(
    db: AsyncSession, user_id: uuid.UUID, start: datetime, end: datetime, list_id: uuid.UUID | None
) -> int:
    stmt = (
        select(func.count())
        .select_from(FlashcardReviewLog)
        .where(
            FlashcardReviewLog.user_id == user_id,
            FlashcardReviewLog.reviewed_at >= start,
            FlashcardReviewLog.reviewed_at < end,
        )
    )
    if list_id:
        stmt = stmt.where(
            FlashcardReviewLog.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    return int((await db.execute(stmt)).scalar_one())


async def _count_review_queue_today(
    db: AsyncSession, user_id: uuid.UUID, start: datetime, end: datetime, list_id: uuid.UUID | None
) -> int:
    stmt = (
        select(func.count())
        .select_from(FlashcardReviewLog)
        .where(
            FlashcardReviewLog.user_id == user_id,
            FlashcardReviewLog.reviewed_at >= start,
            FlashcardReviewLog.reviewed_at < end,
            FlashcardReviewLog.card_type_before == FlashcardCardType.review,
        )
    )
    if list_id:
        stmt = stmt.where(
            FlashcardReviewLog.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    return int((await db.execute(stmt)).scalar_one())


async def _select_due_progress(
    db: AsyncSession,
    user_id: uuid.UUID,
    now: datetime,
    card_types: list[FlashcardCardType],
    reviewed_cards_today: set[tuple[uuid.UUID, FlashcardDirection]],
    *,
    bury_siblings: bool,
    list_id: uuid.UUID | None = None,
    limit: int | None = None,
) -> list[FlashcardProgress]:
    stmt = (
        select(FlashcardProgress)
        .join(Entry, Entry.id == FlashcardProgress.entry_id)
        .where(
            FlashcardProgress.user_id == user_id,
            FlashcardProgress.card_type.in_(card_types),
            FlashcardProgress.due_at.isnot(None),
            FlashcardProgress.due_at <= now,
            _entry_card_filters(),
        )
        .order_by(FlashcardProgress.due_at.asc(), FlashcardProgress.updated_at.asc())
    )
    if list_id:
        stmt = stmt.where(
            FlashcardProgress.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = list((await db.execute(stmt)).scalars().all())
    if not bury_siblings:
        return rows
    return [
        row
        for row in rows
        if not _sibling_buried(row.entry_id, row.direction, reviewed_cards_today)
    ]


async def _count_due_later_today(
    db: AsyncSession,
    user_id: uuid.UUID,
    now: datetime,
    day_end: datetime,
    reviewed_cards_today: set[tuple[uuid.UUID, FlashcardDirection]],
    *,
    bury_siblings: bool,
    list_id: uuid.UUID | None = None,
) -> int:
    stmt = (
        select(FlashcardProgress)
        .join(Entry, Entry.id == FlashcardProgress.entry_id)
        .where(
            FlashcardProgress.user_id == user_id,
            FlashcardProgress.card_type.in_(
                [FlashcardCardType.learn, FlashcardCardType.relearn, FlashcardCardType.review]
            ),
            FlashcardProgress.due_at.isnot(None),
            FlashcardProgress.due_at > now,
            FlashcardProgress.due_at < day_end,
            _entry_card_filters(),
        )
    )
    if list_id:
        stmt = stmt.where(
            FlashcardProgress.entry_id.in_(
                select(FlashcardListItem.entry_id).where(FlashcardListItem.list_id == list_id)
            )
        )
    rows = list((await db.execute(stmt)).scalars().all())
    if not bury_siblings:
        return len(rows)
    return sum(
        1
        for row in rows
        if not _sibling_buried(row.entry_id, row.direction, reviewed_cards_today)
    )


async def _select_new_candidates(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int,
    reviewed_cards_today: set[tuple[uuid.UUID, FlashcardDirection]],
    list_id: uuid.UUID | None = None,
) -> tuple[list[PlannedCard], int]:
    limit = max(0, limit)
    progress_map = await _load_progress_map(db, user_id)
    reviewed_entry_ids = {entry_id for entry_id, _ in reviewed_cards_today}

    if list_id:
        stmt = (
            select(Entry)
            .join(FlashcardListItem, FlashcardListItem.entry_id == Entry.id)
            .where(FlashcardListItem.list_id == list_id, _entry_card_filters())
            .order_by(
                FlashcardListItem.position.asc(),
                FlashcardListItem.created_at.asc(),
                Entry.created_at.asc(),
                Entry.id.asc(),
            )
            .limit(NEW_CARD_SCAN_LIMIT)
        )
    else:
        stmt = (
            select(Entry)
            .where(_entry_card_filters())
            .order_by(
                Entry.score_cache.desc(),
                Entry.example_count_cache.desc(),
                Entry.created_at.asc(),
                Entry.id.asc(),
            )
            .limit(NEW_CARD_SCAN_LIMIT)
        )
    entries = list((await db.execute(stmt)).scalars().all())

    planned: list[PlannedCard] = []
    eligible_total = 0
    if list_id:
        eligible_stmt = (
            select(func.count())
            .select_from(FlashcardListItem)
            .join(Entry, Entry.id == FlashcardListItem.entry_id)
            .where(FlashcardListItem.list_id == list_id, _entry_card_filters())
        )
        if reviewed_entry_ids:
            eligible_stmt = eligible_stmt.where(~Entry.id.in_(reviewed_entry_ids))
        if progress_map:
            eligible_stmt = eligible_stmt.where(~Entry.id.in_(list(progress_map.keys())))
        eligible_total = int((await db.execute(eligible_stmt)).scalar_one())

    for entry in entries:
        if entry.id in reviewed_entry_ids:
            continue
        if entry.id in progress_map:
            continue
        if not list_id:
            eligible_total += 1
        if len(planned) >= limit:
            continue
        planned.append(
            PlannedCard(
                entry_id=entry.id,
                direction=FlashcardDirection.headword_to_gloss,
                queue=FlashcardQueue.new,
            )
        )

    return planned, eligible_total


async def build_flashcard_card_payload(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    direction: FlashcardDirection,
    queue: FlashcardQueue,
) -> FlashcardCardPayload | None:
    entry = (await db.execute(select(Entry).where(Entry.id == entry_id))).scalar_one_or_none()
    if not entry or not _entry_card_exists(entry):
        return None
    audio_stmt = (
        select(AudioSample)
        .where(AudioSample.entry_id == entry.id)
        .order_by(
            AudioSample.upvote_count_cache.desc(),
            AudioSample.created_at.asc(),
            AudioSample.id.asc(),
        )
        .limit(1)
    )
    sample = (await db.execute(audio_stmt)).scalar_one_or_none()
    audio_url, audio_duration = _build_audio_payload(sample)

    return FlashcardCardPayload(
        entry_id=entry.id,
        direction=direction,
        queue=queue,
        slug=entry.slug,
        headword=entry.headword,
        gloss_pt=entry.gloss_pt or "",
        short_definition=entry.short_definition,
        part_of_speech=entry.part_of_speech,
        audio_url=audio_url,
        audio_duration_seconds=audio_duration,
    )


def _entry_card_exists(entry: Entry) -> bool:
    if entry.status != EntryStatus.approved:
        return False
    if not entry.headword or not entry.headword.strip():
        return False
    if not entry.gloss_pt or not entry.gloss_pt.strip():
        return False
    if not entry.short_definition or not entry.short_definition.strip():
        return False
    return True


async def build_flashcard_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    list_id: uuid.UUID | None = None,
) -> tuple[
    FlashcardSettings,
    FlashcardSummary,
    FlashcardCardPayload | None,
    FlashcardActiveSession | None,
]:
    now = utc_now()
    today = now.date()
    day_start, day_end = _day_bounds(today)

    settings = await get_or_create_flashcard_settings(db, user_id)
    active_session = await build_session_payload(
        db, await _get_active_session(db, user_id), now
    )

    reviewed_cards_today = await _load_reviewed_cards_today(db, user_id, day_start, day_end, list_id)
    completed_today = await _count_reviews_today(db, user_id, day_start, day_end, list_id)
    reviews_done_today = await _count_review_queue_today(db, user_id, day_start, day_end, list_id)

    review_limit_remaining = _review_limit_remaining(settings.max_reviews_per_day, reviews_done_today)

    pending_sibling = await _select_pending_sibling(db, user_id, now, list_id)
    due_learning = await _select_due_progress(
        db,
        user_id,
        now,
        [FlashcardCardType.learn, FlashcardCardType.relearn],
        reviewed_cards_today,
        bury_siblings=settings.bury_siblings,
        list_id=list_id,
    )
    due_review = await _select_due_progress(
        db,
        user_id,
        now,
        [FlashcardCardType.review],
        reviewed_cards_today,
        bury_siblings=settings.bury_siblings,
        list_id=list_id,
        limit=review_limit_remaining,
    )
    review_remaining = len(due_learning) + len(due_review)

    new_candidates, eligible_total = await _select_new_candidates(
        db, user_id, NEW_CARD_SCAN_LIMIT, reviewed_cards_today, list_id
    )
    new_remaining = eligible_total

    due_later_today = await _count_due_later_today(
        db,
        user_id,
        now,
        day_end,
        reviewed_cards_today,
        bury_siblings=settings.bury_siblings,
        list_id=list_id,
    )

    due_now = review_remaining + new_remaining + (1 if pending_sibling else 0)

    current_card: FlashcardCardPayload | None = None
    if due_learning:
        progress = due_learning[0]
        current_card = await build_flashcard_card_payload(
            db,
            entry_id=progress.entry_id,
            direction=progress.direction,
            queue=_flashcard_queue_for_progress(progress),
        )
    elif pending_sibling:
        current_card = await build_flashcard_card_payload(
            db,
            entry_id=pending_sibling.entry_id,
            direction=pending_sibling.direction,
            queue=_flashcard_queue_for_progress(pending_sibling),
        )
    elif due_review:
        progress = due_review[0]
        current_card = await build_flashcard_card_payload(
            db,
            entry_id=progress.entry_id,
            direction=progress.direction,
            queue=_flashcard_queue_for_progress(progress),
        )
    elif new_remaining > 0 and new_candidates:
        candidate = new_candidates[0]
        current_card = await build_flashcard_card_payload(
            db,
            entry_id=candidate.entry_id,
            direction=candidate.direction,
            queue=candidate.queue,
        )

    summary = FlashcardSummary(
        new_remaining=new_remaining,
        review_remaining=review_remaining,
        completed_today=completed_today,
        due_now=due_now,
        due_later_today=due_later_today,
    )

    return settings, summary, current_card, active_session


async def apply_flashcard_review(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
    direction: FlashcardDirection,
    grade: FlashcardGrade,
    response_ms: int | None,
    user_response: str | None = None,
) -> FlashcardProgress:
    now = utc_now()
    settings = await get_or_create_flashcard_settings(db, user_id)
    active_session = await _get_active_session(db, user_id)
    if not active_session:
        active_session = FlashcardStudySession(user_id=user_id, started_at=now)
        db.add(active_session)
    await _ensure_active_segment(db, session=active_session, user_id=user_id, now=now)
    params = list(settings.fsrs_params or DEFAULT_FSRS_PARAMS)
    desired_retention = _normalize_retention(settings.desired_retention)
    learning_steps = _normalize_steps(settings.learning_steps_minutes, DEFAULT_LEARNING_STEPS)
    relearning_steps = _normalize_steps(settings.relearning_steps_minutes, DEFAULT_RELEARNING_STEPS)

    progress = (
        await db.execute(
            select(FlashcardProgress).where(
                FlashcardProgress.user_id == user_id,
                FlashcardProgress.entry_id == entry_id,
                FlashcardProgress.direction == direction,
            )
        )
    ).scalar_one_or_none()
    if not progress:
        progress = FlashcardProgress(
            user_id=user_id,
            entry_id=entry_id,
            direction=direction,
            card_type=FlashcardCardType.new,
            queue=FlashcardQueue.new,
            due_at=now,
            scheduled_days=0,
            learning_step_index=0,
            remaining_steps=0,
            reps=0,
            lapses=0,
            ease_factor=2.5,
        )
        db.add(progress)
    else:
        _coerce_progress_defaults(progress)

    is_first_review = (progress.reps or 0) == 0
    state_before = progress.card_type
    scheduled_before = progress.scheduled_days
    memory_before = _memory_state_from_progress(progress)

    rating = grade_to_rating(grade)
    elapsed_days = _elapsed_days(progress, now)
    is_initial = (progress.reps or 0) == 0
    memory_after = fsrs_step(
        memory_before,
        rating,
        elapsed_days,
        params,
        is_initial=is_initial,
    )

    if progress.card_type in (FlashcardCardType.new, FlashcardCardType.learn):
        _apply_learning_step(
            progress,
            now,
            learning_steps,
            grade,
            desired_retention,
            params,
            memory_after,
            learning_type=FlashcardCardType.learn,
        )
    elif progress.card_type == FlashcardCardType.relearn:
        _apply_learning_step(
            progress,
            now,
            relearning_steps,
            grade,
            desired_retention,
            params,
            memory_after,
            learning_type=FlashcardCardType.relearn,
        )
    else:
        if grade == FlashcardGrade.again:
            progress.lapses += 1
            _apply_learning_step(
                progress,
                now,
                relearning_steps,
                grade,
                desired_retention,
                params,
                memory_after,
                learning_type=FlashcardCardType.relearn,
            )
        else:
            _graduate_to_review(progress, now, desired_retention, params, memory_after)

    progress.memory_stability = memory_after.stability
    progress.memory_difficulty = memory_after.difficulty
    progress.last_review_at = now
    progress.last_result = grade
    progress.last_response_ms = response_ms
    progress.reps = (progress.reps or 0) + 1

    if is_first_review and direction == FlashcardDirection.headword_to_gloss:
        await _ensure_sibling_progress(
            db,
            user_id=user_id,
            entry_id=entry_id,
            direction=direction,
            now=now,
        )

    db.add(
        FlashcardReviewLog(
            user_id=user_id,
            session_id=active_session.id if active_session else None,
            entry_id=entry_id,
            direction=direction,
            grade=grade,
            response_ms=response_ms,
            user_response=user_response,
            reviewed_at=now,
            card_type_before=state_before,
            card_type_after=progress.card_type,
            scheduled_days_before=scheduled_before,
            scheduled_days_after=progress.scheduled_days,
            memory_stability_before=memory_before.stability,
            memory_stability_after=memory_after.stability,
            memory_difficulty_before=memory_before.difficulty,
            memory_difficulty_after=memory_after.difficulty,
        )
    )

    return progress


async def finish_flashcard_session(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> FlashcardStudySession | None:
    now = utc_now()
    session = await _get_active_session(db, user_id)
    if not session:
        return None
    open_segment = await _get_open_segment(db, session.id)
    if open_segment:
        open_segment.ended_at = now
        session.ended_at = now
    else:
        last_end = (
            await db.execute(
                select(func.max(FlashcardSessionSegment.ended_at)).where(
                    FlashcardSessionSegment.session_id == session.id,
                    FlashcardSessionSegment.ended_at.isnot(None),
                )
            )
        ).scalar_one_or_none()
        session.ended_at = last_end or now
    await db.commit()
    await db.refresh(session)
    return session


async def update_flashcard_presence(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    status: str,
) -> FlashcardActiveSession | None:
    session = await _get_active_session(db, user_id)
    if not session:
        return None
    now = utc_now()
    if status == "away":
        await _end_open_segment(db, session_id=session.id, now=now)
    elif status == "active":
        await _ensure_active_segment(db, session=session, user_id=user_id, now=now)
    else:
        return await build_session_payload(db, session, now)
    await db.commit()
    return await build_session_payload(db, session, now)


async def schedule_flashcard_reminder(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    session: FlashcardStudySession | None,
    time_zone: str | None,
    offset_minutes: int | None,
) -> FlashcardReminder | None:
    if not session:
        return None

    now = utc_now()
    tz = _resolve_reminder_timezone(time_zone, offset_minutes)
    start_local = session.started_at.astimezone(tz)
    target_local = start_local + timedelta(days=1)
    remind_at = target_local.astimezone(UTC)
    tz_label = _format_reminder_timezone(tz)

    pending = list(
        (
            await db.execute(
                select(FlashcardReminder)
                .where(
                    FlashcardReminder.user_id == user_id,
                    FlashcardReminder.sent_at.is_(None),
                )
                .order_by(FlashcardReminder.remind_at.desc())
            )
        ).scalars().all()
    )

    reminder: FlashcardReminder | None = None
    if pending:
        reminder = pending[0]
        reminder.remind_at = remind_at
        reminder.time_zone = tz_label
        reminder.session_id = session.id
        for extra in pending[1:]:
            extra.sent_at = now
    if reminder is None:
        reminder = FlashcardReminder(
            user_id=user_id,
            session_id=session.id,
            time_zone=tz_label,
            remind_at=remind_at,
        )
        db.add(reminder)

    await db.commit()
    await db.refresh(reminder)
    return reminder


async def send_due_flashcard_reminders(
    db: AsyncSession,
    *,
    now: datetime | None = None,
    limit: int = 200,
) -> int:
    now = now or utc_now()
    rows = (
        await db.execute(
            select(FlashcardReminder, User)
            .join(User, User.id == FlashcardReminder.user_id)
            .where(
                FlashcardReminder.sent_at.is_(None),
                FlashcardReminder.remind_at <= now,
                User.is_active.is_(True),
            )
            .order_by(FlashcardReminder.remind_at.asc())
            .limit(limit)
        )
    ).all()

    sent = 0
    for reminder, user in rows:
        try:
            await send_flashcard_reminder_email(
                to_email=user.email,
                locale=user.preferred_locale,
            )
        except Exception:  # noqa: BLE001
            # Skip marking sent so it can be retried on next run.
            continue
        reminder.sent_at = now
        sent += 1

    if sent:
        await db.commit()
    return sent


async def get_flashcard_stats(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    days: int = 7,
) -> FlashcardStats:
    now = utc_now()
    today = now.date()
    start_day = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_day, time.min, tzinfo=UTC)
    end_dt = datetime.combine(today + timedelta(days=1), time.min, tzinfo=UTC)

    review_day_expr = func.date(FlashcardReviewLog.reviewed_at)
    review_stmt = (
        select(
            review_day_expr.label("day"),
            func.count().label("count"),
        )
        .where(
            FlashcardReviewLog.user_id == user_id,
            FlashcardReviewLog.reviewed_at >= start_dt,
            FlashcardReviewLog.reviewed_at < end_dt,
        )
        .group_by(review_day_expr)
    )
    review_rows = (await db.execute(review_stmt)).all()
    reviews_by_day = {_to_date(row.day): int(row.count) for row in review_rows}

    new_day_expr = func.date(FlashcardProgress.created_at)
    new_stmt = (
        select(
            new_day_expr.label("day"),
            func.count(func.distinct(FlashcardProgress.entry_id)).label("count"),
        )
        .where(
            FlashcardProgress.user_id == user_id,
            FlashcardProgress.created_at >= start_dt,
            FlashcardProgress.created_at < end_dt,
        )
        .group_by(new_day_expr)
    )
    new_rows = (await db.execute(new_stmt)).all()
    new_by_day = {_to_date(row.day): int(row.count) for row in new_rows}

    session_stmt = (
        select(FlashcardStudySession)
        .where(
            FlashcardStudySession.user_id == user_id,
            FlashcardStudySession.started_at < end_dt,
            or_(
                FlashcardStudySession.ended_at.is_(None),
                FlashcardStudySession.ended_at >= start_dt,
            ),
        )
        .order_by(FlashcardStudySession.started_at.asc())
    )
    sessions = list((await db.execute(session_stmt)).scalars().all())

    segment_stmt = (
        select(FlashcardSessionSegment)
        .where(
            FlashcardSessionSegment.user_id == user_id,
            FlashcardSessionSegment.started_at < end_dt,
            or_(
                FlashcardSessionSegment.ended_at.is_(None),
                FlashcardSessionSegment.ended_at >= start_dt,
            ),
        )
        .order_by(FlashcardSessionSegment.started_at.asc())
    )
    segments = list((await db.execute(segment_stmt)).scalars().all())

    minutes_by_day: dict[date, int] = {}
    sessions_by_day: dict[date, int] = {}
    for session in sessions:
        session_start = max(session.started_at, start_dt)
        sessions_by_day[session_start.date()] = sessions_by_day.get(session_start.date(), 0) + 1

    for segment in segments:
        segment_start = max(segment.started_at, start_dt)
        segment_end = min(segment.ended_at or now, end_dt)
        if segment_end <= segment_start:
            continue
        cursor = segment_start
        while cursor < segment_end:
            day_end = datetime.combine(cursor.date() + timedelta(days=1), time.min, tzinfo=UTC)
            slice_end = min(segment_end, day_end)
            minutes = int((slice_end - cursor).total_seconds() // 60)
            if minutes > 0:
                minutes_by_day[cursor.date()] = minutes_by_day.get(cursor.date(), 0) + minutes
            cursor = slice_end

    days_out: list[FlashcardDailyStats] = []
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        days_out.append(
            FlashcardDailyStats(
                date=day,
                reviews=reviews_by_day.get(day, 0),
                new_seen=new_by_day.get(day, 0),
                study_minutes=minutes_by_day.get(day, 0),
                sessions=sessions_by_day.get(day, 0),
            )
        )

    today_stats = days_out[-1]
    return FlashcardStats(today=today_stats, last_7_days=days_out)


@dataclass
class FlashcardLeaderboardData:
    rank: int
    display_name: str
    reviews_today: int
    reviews_this_week: int
    total_reviews: int


async def get_flashcard_leaderboard(db: AsyncSession, limit: int = 20) -> list[FlashcardLeaderboardData]:
    now = utc_now()
    today_start, today_end = _day_bounds(now.date())
    week_ago = now - timedelta(days=7)

    reviews_subq = (
        select(
            FlashcardReviewLog.user_id.label("user_id"),
            func.count(FlashcardReviewLog.id).label("total_reviews"),
            func.count(
                case((FlashcardReviewLog.reviewed_at >= week_ago, FlashcardReviewLog.id))
            ).label("reviews_this_week"),
        )
        .group_by(FlashcardReviewLog.user_id)
        .subquery()
    )

    completed_today_subq = (
        select(
            FlashcardProgress.user_id.label("user_id"),
            func.count(FlashcardProgress.id).label("reviews_today"),
        )
        .where(
            FlashcardProgress.last_review_at.isnot(None),
            FlashcardProgress.last_review_at >= today_start,
            FlashcardProgress.last_review_at < today_end,
            FlashcardProgress.due_at.isnot(None),
            FlashcardProgress.due_at >= today_end,
        )
        .group_by(FlashcardProgress.user_id)
        .subquery()
    )

    rows = (
        await db.execute(
            select(
                Profile.display_name,
                reviews_subq.c.total_reviews,
                reviews_subq.c.reviews_this_week,
                func.coalesce(completed_today_subq.c.reviews_today, 0).label("reviews_today"),
            )
            .join(Profile, Profile.user_id == reviews_subq.c.user_id)
            .outerjoin(completed_today_subq, completed_today_subq.c.user_id == reviews_subq.c.user_id)
            .order_by(
                func.coalesce(completed_today_subq.c.reviews_today, 0).desc(),
                reviews_subq.c.reviews_this_week.desc(),
                reviews_subq.c.total_reviews.desc(),
            )
            .limit(limit)
        )
    ).all()

    return [
        FlashcardLeaderboardData(
            rank=i + 1,
            display_name=row.display_name,
            reviews_today=row.reviews_today,
            total_reviews=row.total_reviews,
            reviews_this_week=row.reviews_this_week,
        )
        for i, row in enumerate(rows)
    ]
