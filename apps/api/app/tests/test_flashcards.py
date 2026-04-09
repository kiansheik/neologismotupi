import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

import app.db as db_module
from app.core.enums import (
    EntryStatus,
    FlashcardDirection,
    FlashcardQueueType,
    FlashcardState,
)
from app.core.utils import normalize_text, slugify
from app.models.entry import Entry
from app.models.flashcards import FlashcardDailyPlan, FlashcardProgress, FlashcardReviewLog, FlashcardSettings
from app.models.user import User


async def register_user(client, email: str, display_name: str, password: str = "password123"):
    response = await client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def login_user(client, email: str, password: str = "password123"):
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


async def get_user_id(email: str) -> uuid.UUID:
    async with db_module.AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        return user.id


async def seed_entry(
    *,
    user_id: uuid.UUID,
    headword: str,
    gloss_pt: str = "glosa",
    short_definition: str = "Definição curta.",
    status: EntryStatus = EntryStatus.approved,
    score_cache: int = 0,
    example_count_cache: int = 0,
    created_at: datetime | None = None,
) -> Entry:
    created_at = created_at or datetime.now(UTC)
    entry = Entry(
        id=uuid.uuid4(),
        slug=slugify(headword),
        headword=headword,
        normalized_headword=normalize_text(headword),
        gloss_pt=gloss_pt,
        normalized_gloss_pt=normalize_text(gloss_pt),
        gloss_en=None,
        normalized_gloss_en=None,
        part_of_speech="noun",
        short_definition=short_definition,
        status=status,
        proposer_user_id=user_id,
        score_cache=score_cache,
        example_count_cache=example_count_cache,
        upvote_count_cache=0,
        downvote_count_cache=0,
        created_at=created_at,
        updated_at=created_at,
    )
    async with db_module.AsyncSessionLocal() as session:
        session.add(entry)
        await session.commit()
    return entry


@pytest.mark.asyncio
async def test_only_approved_entries_become_cards(client):
    await register_user(client, "cards-approved@example.com", "Cards Approved")
    user_id = await get_user_id("cards-approved@example.com")

    approved_entry = await seed_entry(user_id=user_id, headword="ara", status=EntryStatus.approved)
    await seed_entry(user_id=user_id, headword="beta", status=EntryStatus.pending)

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text
    card = response.json()["current_card"]
    assert card["entry_id"] == str(approved_entry.id)


@pytest.mark.asyncio
async def test_ranking_order_uses_score_examples_created_at(client):
    await register_user(client, "ranking@example.com", "Ranking User")
    user_id = await get_user_id("ranking@example.com")

    async with db_module.AsyncSessionLocal() as session:
        session.add(FlashcardSettings(user_id=user_id, new_cards_per_day=4))
        await session.commit()

    created_base = datetime(2024, 1, 1, tzinfo=UTC)
    first = await seed_entry(
        user_id=user_id,
        headword="first",
        score_cache=10,
        example_count_cache=2,
        created_at=created_base,
    )
    second = await seed_entry(
        user_id=user_id,
        headword="second",
        score_cache=10,
        example_count_cache=2,
        created_at=created_base + timedelta(days=1),
    )
    third = await seed_entry(
        user_id=user_id,
        headword="third",
        score_cache=9,
        example_count_cache=5,
        created_at=created_base + timedelta(days=2),
    )

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text

    today = datetime.now(UTC).date()
    async with db_module.AsyncSessionLocal() as session:
        plan_items = (
            await session.execute(
                select(FlashcardDailyPlan)
                .where(FlashcardDailyPlan.user_id == user_id, FlashcardDailyPlan.plan_date == today)
                .order_by(FlashcardDailyPlan.position)
            )
        ).scalars().all()

    assert [item.entry_id for item in plan_items[:4]] == [first.id, first.id, second.id, second.id]
    assert plan_items[0].direction == FlashcardDirection.headword_to_gloss
    assert plan_items[1].direction == FlashcardDirection.gloss_to_headword


@pytest.mark.asyncio
async def test_settings_default_and_bounds(client):
    await register_user(client, "settings@example.com", "Settings User")

    response = await client.get("/api/flashcards/settings")
    assert response.status_code == 200, response.text
    assert response.json()["new_cards_per_day"] == 3

    update = await client.patch("/api/flashcards/settings", json={"new_cards_per_day": 12})
    assert update.status_code == 200, update.text
    assert update.json()["new_cards_per_day"] == 12

    invalid = await client.patch("/api/flashcards/settings", json={"new_cards_per_day": 2})
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_session_builds_daily_plan(client):
    await register_user(client, "plan@example.com", "Plan User")
    user_id = await get_user_id("plan@example.com")
    await seed_entry(user_id=user_id, headword="plan-entry", status=EntryStatus.approved)

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text

    today = datetime.now(UTC).date()
    async with db_module.AsyncSessionLocal() as session:
        total = (
            await session.execute(
                select(func.count())
                .select_from(FlashcardDailyPlan)
                .where(FlashcardDailyPlan.user_id == user_id, FlashcardDailyPlan.plan_date == today)
            )
        ).scalar_one()
    assert total > 0


@pytest.mark.asyncio
async def test_new_cards_do_not_require_progress(client):
    await register_user(client, "progress-free@example.com", "Progress Free")
    user_id = await get_user_id("progress-free@example.com")
    await seed_entry(user_id=user_id, headword="progress-free", status=EntryStatus.approved)

    async with db_module.AsyncSessionLocal() as session:
        progress_total = (
            await session.execute(select(func.count()).select_from(FlashcardProgress))
        ).scalar_one()
        assert progress_total == 0

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text
    assert response.json()["current_card"] is not None

    async with db_module.AsyncSessionLocal() as session:
        progress_total = (
            await session.execute(select(func.count()).select_from(FlashcardProgress))
        ).scalar_one()
        assert progress_total == 0


@pytest.mark.asyncio
async def test_review_logs_update_progress(client):
    await register_user(client, "review-log@example.com", "Review Log")
    user_id = await get_user_id("review-log@example.com")
    entry = await seed_entry(user_id=user_id, headword="log-entry", status=EntryStatus.approved)

    session_response = await client.get("/api/flashcards/session")
    assert session_response.status_code == 200, session_response.text
    card = session_response.json()["current_card"]

    review_response = await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "result": "correct",
            "response_ms": 1200,
        },
    )
    assert review_response.status_code == 200, review_response.text

    async with db_module.AsyncSessionLocal() as session:
        log_count = (
            await session.execute(select(func.count()).select_from(FlashcardReviewLog))
        ).scalar_one()
        progress = (
            await session.execute(
                select(FlashcardProgress).where(
                    FlashcardProgress.user_id == user_id,
                    FlashcardProgress.entry_id == entry.id,
                )
            )
        ).scalar_one()

    assert log_count == 1
    assert progress.state == FlashcardState.learning


@pytest.mark.asyncio
async def test_correct_transitions_to_review(client):
    await register_user(client, "correct@example.com", "Correct User")
    user_id = await get_user_id("correct@example.com")
    entry = await seed_entry(user_id=user_id, headword="correct-entry", status=EntryStatus.approved)

    session_response = await client.get("/api/flashcards/session")
    card = session_response.json()["current_card"]

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "result": "correct",
            "response_ms": 500,
        },
    )

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "result": "correct",
            "response_ms": 400,
        },
    )

    async with db_module.AsyncSessionLocal() as session:
        progress = (
            await session.execute(
                select(FlashcardProgress).where(
                    FlashcardProgress.user_id == user_id,
                    FlashcardProgress.entry_id == entry.id,
                )
            )
        ).scalar_one()

    assert progress.state == FlashcardState.review
    assert progress.interval_days == 1


@pytest.mark.asyncio
async def test_study_more_transitions_to_relearning(client):
    await register_user(client, "study-more@example.com", "Study More")
    user_id = await get_user_id("study-more@example.com")
    entry = await seed_entry(user_id=user_id, headword="study-entry", status=EntryStatus.approved)

    async with db_module.AsyncSessionLocal() as session:
        session.add(
            FlashcardProgress(
                user_id=user_id,
                entry_id=entry.id,
                direction=FlashcardDirection.headword_to_gloss,
                state=FlashcardState.review,
                interval_days=8,
                ease_factor=2.5,
                due_at=datetime.now(UTC),
            )
        )
        await session.commit()

    response = await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": str(entry.id),
            "direction": "headword_to_gloss",
            "result": "study_more",
            "response_ms": 800,
        },
    )
    assert response.status_code == 200, response.text

    async with db_module.AsyncSessionLocal() as session:
        progress = (
            await session.execute(
                select(FlashcardProgress).where(
                    FlashcardProgress.user_id == user_id,
                    FlashcardProgress.entry_id == entry.id,
                    FlashcardProgress.direction == FlashcardDirection.headword_to_gloss,
                )
            )
        ).scalar_one()

    assert progress.state == FlashcardState.relearning
    assert progress.ease_factor < 2.5
    assert progress.interval_days == 4


@pytest.mark.asyncio
async def test_first_time_pair_is_adjacent(client):
    await register_user(client, "siblings@example.com", "Sibling User")
    user_id = await get_user_id("siblings@example.com")

    entry = await seed_entry(user_id=user_id, headword="alpha", score_cache=10)

    async with db_module.AsyncSessionLocal() as session:
        session.add(FlashcardSettings(user_id=user_id, new_cards_per_day=2))
        await session.commit()

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text

    today = datetime.now(UTC).date()
    async with db_module.AsyncSessionLocal() as session:
        plan_items = (
            await session.execute(
                select(FlashcardDailyPlan)
                .where(FlashcardDailyPlan.user_id == user_id, FlashcardDailyPlan.plan_date == today)
                .order_by(FlashcardDailyPlan.position)
            )
        ).scalars().all()

    assert len(plan_items) >= 2
    assert plan_items[0].entry_id == entry.id
    assert plan_items[1].entry_id == entry.id
    assert plan_items[0].direction == FlashcardDirection.headword_to_gloss
    assert plan_items[1].direction == FlashcardDirection.gloss_to_headword


@pytest.mark.asyncio
async def test_progress_persists_across_sessions(client):
    await register_user(client, "persist@example.com", "Persist User")
    user_id = await get_user_id("persist@example.com")
    entry = await seed_entry(user_id=user_id, headword="persist-entry")

    session_response = await client.get("/api/flashcards/session")
    card = session_response.json()["current_card"]

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "result": "correct",
            "response_ms": 300,
        },
    )

    await client.post("/api/auth/logout")
    await login_user(client, "persist@example.com")

    await client.get("/api/flashcards/session")

    async with db_module.AsyncSessionLocal() as session:
        progress_count = (
            await session.execute(
                select(func.count()).select_from(FlashcardProgress).where(FlashcardProgress.entry_id == entry.id)
            )
        ).scalar_one()

    assert progress_count == 1


@pytest.mark.asyncio
async def test_new_popular_entries_show_in_future_plans(client):
    await register_user(client, "future@example.com", "Future User")
    user_id = await get_user_id("future@example.com")

    entry_old = await seed_entry(user_id=user_id, headword="old", score_cache=1)
    await seed_entry(user_id=user_id, headword="mid", score_cache=2)

    yesterday = datetime.now(UTC).date() - timedelta(days=1)
    async with db_module.AsyncSessionLocal() as session:
        session.add(
            FlashcardDailyPlan(
                user_id=user_id,
                plan_date=yesterday,
                entry_id=entry_old.id,
                direction=FlashcardDirection.headword_to_gloss,
                queue_type=FlashcardQueueType.new,
                position=1,
            )
        )
        session.add(
            FlashcardProgress(
                user_id=user_id,
                entry_id=entry_old.id,
                direction=FlashcardDirection.headword_to_gloss,
                state=FlashcardState.review,
                interval_days=3,
                due_at=datetime.now(UTC) - timedelta(days=1),
            )
        )
        await session.commit()

    entry_new = await seed_entry(user_id=user_id, headword="new", score_cache=99)

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text

    today = datetime.now(UTC).date()
    async with db_module.AsyncSessionLocal() as session:
        todays_plan = (
            await session.execute(
                select(FlashcardDailyPlan)
                .where(FlashcardDailyPlan.user_id == user_id, FlashcardDailyPlan.plan_date == today)
            )
        ).scalars().all()
        progress_exists = (
            await session.execute(
                select(func.count()).select_from(FlashcardProgress).where(FlashcardProgress.entry_id == entry_old.id)
            )
        ).scalar_one()

    assert any(item.entry_id == entry_new.id for item in todays_plan)
    assert progress_exists == 1
