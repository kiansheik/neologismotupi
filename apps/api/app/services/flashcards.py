import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    EntryStatus,
    FlashcardDirection,
    FlashcardQueueType,
    FlashcardReviewResult,
    FlashcardState,
)
from app.models.audio import AudioSample
from app.models.entry import Entry
from app.models.flashcards import (
    FlashcardDailyPlan,
    FlashcardProgress,
    FlashcardReviewLog,
    FlashcardSettings,
)
from app.services.audio import build_audio_url

NEW_CARD_MIN = 3
REVIEW_LIMIT_MIN = 10
REVIEW_LIMIT_MAX = 80
REVIEW_LIMIT_MULTIPLIER = 4
NEW_CARD_SCAN_LIMIT = 300

EASE_FACTOR_DEFAULT = 2.5
EASE_FACTOR_MIN = 1.3
EASE_FACTOR_DECAY = 0.2
LEARNING_STEP_MINUTES = 10
LEARNING_FAIL_MINUTES = 5
RELEARNING_STEP_MINUTES = 10


@dataclass(frozen=True)
class PlannedCard:
    entry_id: uuid.UUID
    direction: FlashcardDirection
    queue_type: FlashcardQueueType


@dataclass(frozen=True)
class FlashcardSummary:
    new_remaining: int
    review_remaining: int
    completed_today: int
    due_now: int


@dataclass(frozen=True)
class FlashcardCardPayload:
    entry_id: uuid.UUID
    direction: FlashcardDirection
    queue_type: FlashcardQueueType
    slug: str
    headword: str
    gloss_pt: str
    short_definition: str
    part_of_speech: str | None
    audio_url: str | None
    audio_duration_seconds: int | None


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))


def _entry_card_filters():
    return and_(
        Entry.status == EntryStatus.approved,
        func.length(func.trim(Entry.headword)) > 0,
        Entry.gloss_pt.isnot(None),
        func.length(func.trim(Entry.gloss_pt)) > 0,
        func.length(func.trim(Entry.short_definition)) > 0,
    )


def _plan_date_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=UTC)
    end = start + timedelta(days=1)
    return start, end


def _compute_review_limit(new_cards_per_day: int) -> int:
    return clamp(new_cards_per_day * REVIEW_LIMIT_MULTIPLIER, REVIEW_LIMIT_MIN, REVIEW_LIMIT_MAX)


def _avoid_adjacent_siblings(items: list[PlannedCard]) -> list[PlannedCard]:
    if len(items) < 2:
        return items
    remaining = items[:]
    arranged: list[PlannedCard] = []
    while remaining:
        if not arranged:
            arranged.append(remaining.pop(0))
            continue
        last_entry_id = arranged[-1].entry_id
        swap_index = None
        for index, item in enumerate(remaining):
            if item.entry_id != last_entry_id:
                swap_index = index
                break
        if swap_index is None:
            arranged.append(remaining.pop(0))
        else:
            arranged.append(remaining.pop(swap_index))
    return arranged


async def get_or_create_flashcard_settings(
    db: AsyncSession, user_id: uuid.UUID
) -> FlashcardSettings:
    settings = (
        await db.execute(select(FlashcardSettings).where(FlashcardSettings.user_id == user_id))
    ).scalar_one_or_none()
    if settings:
        return settings
    settings = FlashcardSettings(user_id=user_id, new_cards_per_day=NEW_CARD_MIN)
    db.add(settings)
    await db.commit()
    await db.refresh(settings)
    return settings


async def build_flashcard_summary(
    plan_items: list[FlashcardDailyPlan],
) -> FlashcardSummary:
    new_remaining = 0
    review_remaining = 0
    completed_today = 0
    for item in plan_items:
        if item.completed_at is not None:
            completed_today += 1
        else:
            if item.queue_type == FlashcardQueueType.new:
                new_remaining += 1
            else:
                review_remaining += 1
    due_now = new_remaining + review_remaining
    return FlashcardSummary(
        new_remaining=new_remaining,
        review_remaining=review_remaining,
        completed_today=completed_today,
        due_now=due_now,
    )


async def load_daily_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
) -> list[FlashcardDailyPlan]:
    stmt = (
        select(FlashcardDailyPlan)
        .where(
            FlashcardDailyPlan.user_id == user_id,
            FlashcardDailyPlan.plan_date == plan_date,
        )
        .order_by(FlashcardDailyPlan.position)
    )
    return list((await db.execute(stmt)).scalars().all())


async def select_due_reviews(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
    review_limit: int,
) -> list[PlannedCard]:
    _, plan_end = _plan_date_bounds(plan_date)
    stmt = (
        select(FlashcardProgress)
        .join(Entry, Entry.id == FlashcardProgress.entry_id)
        .where(
            FlashcardProgress.user_id == user_id,
            FlashcardProgress.state.in_(
                [FlashcardState.learning, FlashcardState.review, FlashcardState.relearning]
            ),
            FlashcardProgress.due_at.isnot(None),
            FlashcardProgress.due_at < plan_end,
            _entry_card_filters(),
        )
        .order_by(FlashcardProgress.due_at.asc(), FlashcardProgress.updated_at.asc())
        .limit(review_limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        PlannedCard(entry_id=row.entry_id, direction=row.direction, queue_type=FlashcardQueueType.review)
        for row in rows
    ]


async def _load_progress_map(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, set[FlashcardDirection]]:
    stmt = select(FlashcardProgress.entry_id, FlashcardProgress.direction).where(
        FlashcardProgress.user_id == user_id
    )
    rows = (await db.execute(stmt)).all()
    progress_map: dict[uuid.UUID, set[FlashcardDirection]] = {}
    for entry_id, direction in rows:
        progress_map.setdefault(entry_id, set()).add(direction)
    return progress_map


async def select_new_cards(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int,
) -> list[PlannedCard]:
    if limit <= 0:
        return []
    progress_map = await _load_progress_map(db, user_id)

    stmt = (
        select(Entry)
        .where(_entry_card_filters())
        .order_by(
            Entry.score_cache.desc(),
            Entry.example_count_cache.desc(),
            Entry.created_at.asc(),
            Entry.id.asc(),
        )
        .limit(max(NEW_CARD_SCAN_LIMIT, limit * 50))
    )
    entries = list((await db.execute(stmt)).scalars().all())

    planned: list[PlannedCard] = []
    used_entries: set[uuid.UUID] = set()
    remaining = limit

    for entry in entries:
        if remaining < 2:
            break
        if entry.id in used_entries:
            continue
        if entry.id in progress_map:
            continue
        planned.append(
            PlannedCard(
                entry_id=entry.id,
                direction=FlashcardDirection.headword_to_gloss,
                queue_type=FlashcardQueueType.new,
            )
        )
        planned.append(
            PlannedCard(
                entry_id=entry.id,
                direction=FlashcardDirection.gloss_to_headword,
                queue_type=FlashcardQueueType.new,
            )
        )
        used_entries.add(entry.id)
        remaining -= 2

    if remaining > 0:
        for entry in entries:
            if remaining <= 0:
                break
            if entry.id in used_entries:
                continue
            seen_directions = progress_map.get(entry.id)
            if not seen_directions or len(seen_directions) != 1:
                continue
            if FlashcardDirection.headword_to_gloss in seen_directions:
                direction = FlashcardDirection.gloss_to_headword
            else:
                direction = FlashcardDirection.headword_to_gloss
            planned.append(
                PlannedCard(
                    entry_id=entry.id,
                    direction=direction,
                    queue_type=FlashcardQueueType.new,
                )
            )
            used_entries.add(entry.id)
            remaining -= 1

    return planned


async def get_or_create_daily_plan(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_date: date,
) -> list[FlashcardDailyPlan]:
    existing = await load_daily_plan(db, user_id, plan_date)
    if existing:
        return existing

    settings = await get_or_create_flashcard_settings(db, user_id)
    review_limit = _compute_review_limit(settings.new_cards_per_day)

    review_cards = await select_due_reviews(db, user_id, plan_date, review_limit)
    new_cards = await select_new_cards(db, user_id, settings.new_cards_per_day)

    planned_cards = _avoid_adjacent_siblings(review_cards) + new_cards

    for index, card in enumerate(planned_cards, start=1):
        db.add(
            FlashcardDailyPlan(
                user_id=user_id,
                plan_date=plan_date,
                entry_id=card.entry_id,
                direction=card.direction,
                queue_type=card.queue_type,
                position=index,
            )
        )

    await db.commit()

    return await load_daily_plan(db, user_id, plan_date)


async def build_flashcard_card_payload(
    db: AsyncSession,
    plan_item: FlashcardDailyPlan,
) -> FlashcardCardPayload | None:
    entry = (
        await db.execute(
            select(Entry).where(Entry.id == plan_item.entry_id)
        )
    ).scalar_one_or_none()
    if not entry:
        return None
    audio_url: str | None = None
    audio_duration: int | None = None
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
    if sample:
        audio_url = build_audio_url(sample.file_path)
        audio_duration = sample.duration_seconds

    return FlashcardCardPayload(
        entry_id=entry.id,
        direction=plan_item.direction,
        queue_type=plan_item.queue_type,
        slug=entry.slug,
        headword=entry.headword,
        gloss_pt=entry.gloss_pt or "",
        short_definition=entry.short_definition,
        part_of_speech=entry.part_of_speech,
        audio_url=audio_url,
        audio_duration_seconds=audio_duration,
    )


async def build_flashcard_session(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> tuple[FlashcardSettings, FlashcardSummary, FlashcardCardPayload | None]:
    today = datetime.now(UTC).date()
    plan_items = await get_or_create_daily_plan(db, user_id, today)
    summary = await build_flashcard_summary(plan_items)

    next_item = next((item for item in plan_items if item.completed_at is None), None)
    if not next_item:
        return await get_or_create_flashcard_settings(db, user_id), summary, None

    card = await build_flashcard_card_payload(db, next_item)
    return await get_or_create_flashcard_settings(db, user_id), summary, card


async def apply_flashcard_review(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
    direction: FlashcardDirection,
    result: FlashcardReviewResult,
    response_ms: int | None,
) -> FlashcardProgress:
    now = datetime.now(UTC)
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
            state=FlashcardState.new,
            due_at=now,
            interval_days=0,
            ease_factor=EASE_FACTOR_DEFAULT,
            step_index=0,
            successes=0,
            failures=0,
            lapses=0,
        )
        db.add(progress)
    else:
        if progress.successes is None:
            progress.successes = 0
        if progress.failures is None:
            progress.failures = 0
        if progress.lapses is None:
            progress.lapses = 0

    state_before = progress.state
    interval_before = progress.interval_days

    if result == FlashcardReviewResult.correct:
        progress.successes += 1
        if progress.state == FlashcardState.new:
            progress.state = FlashcardState.learning
            progress.step_index = 0
            progress.interval_days = 0
            progress.due_at = now + timedelta(minutes=LEARNING_STEP_MINUTES)
        elif progress.state == FlashcardState.learning:
            progress.state = FlashcardState.review
            progress.step_index = 0
            progress.interval_days = 1
            progress.due_at = now + timedelta(days=1)
        elif progress.state == FlashcardState.relearning:
            progress.state = FlashcardState.review
            progress.step_index = 0
            progress.interval_days = max(1, progress.interval_days)
            progress.due_at = now + timedelta(days=progress.interval_days)
        else:
            if progress.interval_days <= 1:
                next_interval = 3
            elif progress.interval_days == 3:
                next_interval = 7
            else:
                next_interval = max(1, int(round(progress.interval_days * progress.ease_factor)))
            progress.interval_days = next_interval
            progress.due_at = now + timedelta(days=next_interval)
    else:
        progress.failures += 1
        if progress.state in [FlashcardState.new, FlashcardState.learning]:
            progress.state = FlashcardState.learning
            progress.step_index = 0
            progress.interval_days = 0
            progress.due_at = now + timedelta(minutes=LEARNING_FAIL_MINUTES)
        else:
            progress.state = FlashcardState.relearning
            progress.step_index = 0
            progress.ease_factor = max(EASE_FACTOR_MIN, progress.ease_factor - EASE_FACTOR_DECAY)
            progress.interval_days = max(1, int(round(interval_before * 0.5)))
            progress.due_at = now + timedelta(minutes=RELEARNING_STEP_MINUTES)
            progress.lapses += 1

    progress.last_seen_at = now
    progress.last_result = result
    progress.last_response_ms = response_ms

    db.add(
        FlashcardReviewLog(
            user_id=user_id,
            entry_id=entry_id,
            direction=direction,
            result=result,
            response_ms=response_ms,
            reviewed_at=now,
            state_before=state_before,
            state_after=progress.state,
            interval_before=interval_before,
            interval_after=progress.interval_days,
        )
    )

    return progress
