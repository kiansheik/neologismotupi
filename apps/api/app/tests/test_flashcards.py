import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

import app.db as db_module
from app.core.enums import (
    EntryStatus,
    FlashcardCardType,
    FlashcardDirection,
    FlashcardGrade,
    FlashcardQueue,
)
from app.core.utils import normalize_text, slugify
from app.models.entry import Entry
from app.models.flashcards import (
    FlashcardProgress,
    FlashcardReviewLog,
    FlashcardSettings,
    FlashcardStudySession,
)
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
        session.add(FlashcardSettings(user_id=user_id, new_cards_per_day=3))
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
    await seed_entry(
        user_id=user_id,
        headword="third",
        score_cache=9,
        example_count_cache=5,
        created_at=created_base + timedelta(days=2),
    )

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text
    card = response.json()["current_card"]
    assert card["entry_id"] == str(first.id)

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "grade": "good",
            "response_ms": 500,
        },
    )

    response = await client.get("/api/flashcards/session")
    sibling = response.json()["current_card"]
    assert sibling["entry_id"] == str(first.id)
    assert sibling["direction"] == "gloss_to_headword"

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": sibling["entry_id"],
            "direction": sibling["direction"],
            "grade": "good",
            "response_ms": 500,
        },
    )

    response = await client.get("/api/flashcards/session")
    card = response.json()["current_card"]
    assert card["entry_id"] == str(second.id)


@pytest.mark.asyncio
async def test_settings_default_and_bounds(client):
    await register_user(client, "settings@example.com", "Settings User")

    response = await client.get("/api/flashcards/settings")
    assert response.status_code == 200, response.text
    assert response.json()["new_cards_per_day"] == 3
    assert response.json()["advanced_grading_enabled"] is False

    update = await client.patch(
        "/api/flashcards/settings",
        json={"new_cards_per_day": 12, "advanced_grading_enabled": True},
    )
    assert update.status_code == 200, update.text
    assert update.json()["new_cards_per_day"] == 12
    assert update.json()["advanced_grading_enabled"] is True

    invalid = await client.patch("/api/flashcards/settings", json={"new_cards_per_day": 2})
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_learning_step_reappears_same_day(client):
    await register_user(client, "learning@example.com", "Learning User")
    user_id = await get_user_id("learning@example.com")
    entry = await seed_entry(user_id=user_id, headword="learning-entry")

    session_response = await client.get("/api/flashcards/session")
    card = session_response.json()["current_card"]

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "grade": "again",
            "response_ms": 300,
        },
    )


@pytest.mark.asyncio
async def test_leaderboard_counts_completed_cards_today(client):
    await register_user(client, "leaderboard@example.com", "Leaderboard User")
    user_id = await get_user_id("leaderboard@example.com")
    entry = await seed_entry(user_id=user_id, headword="leaderboard-entry")

    now = datetime.now(UTC)
    async with db_module.AsyncSessionLocal() as session:
        session.add(
            FlashcardProgress(
                user_id=user_id,
                entry_id=entry.id,
                direction=FlashcardDirection.headword_to_gloss,
                card_type=FlashcardCardType.review,
                queue=FlashcardQueue.review,
                due_at=now + timedelta(days=1),
                scheduled_days=1,
                learning_step_index=0,
                remaining_steps=0,
                reps=1,
                lapses=0,
                ease_factor=2.5,
                last_review_at=now,
            )
        )
        session.add(
            FlashcardReviewLog(
                user_id=user_id,
                session_id=None,
                entry_id=entry.id,
                direction=FlashcardDirection.headword_to_gloss,
                grade=FlashcardGrade.good,
                response_ms=500,
                reviewed_at=now,
                card_type_before=FlashcardCardType.review,
                card_type_after=FlashcardCardType.review,
                scheduled_days_before=1,
                scheduled_days_after=1,
                memory_stability_before=1.2,
                memory_stability_after=1.4,
                memory_difficulty_before=5.0,
                memory_difficulty_after=4.8,
            )
        )
        await session.commit()

    response = await client.get("/api/flashcards/leaderboard")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["entries"][0]["reviews_today"] == 1

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
        progress.due_at = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    session_response = await client.get("/api/flashcards/session")
    next_card = session_response.json()["current_card"]
    assert next_card is not None
    assert next_card["entry_id"] == str(entry.id)
    assert next_card["queue"] == "learn"


@pytest.mark.asyncio
async def test_relearning_step_reappears_same_day(client):
    await register_user(client, "relearning@example.com", "Relearning User")
    user_id = await get_user_id("relearning@example.com")
    entry = await seed_entry(user_id=user_id, headword="relearn-entry")

    async with db_module.AsyncSessionLocal() as session:
        session.add(
            FlashcardProgress(
                user_id=user_id,
                entry_id=entry.id,
                direction=FlashcardDirection.headword_to_gloss,
                card_type=FlashcardCardType.review,
                queue=FlashcardQueue.review,
                scheduled_days=5,
                due_at=datetime.now(UTC) - timedelta(minutes=1),
                memory_stability=5.0,
                memory_difficulty=5.0,
                reps=3,
            )
        )
        await session.commit()

    response = await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": str(entry.id),
            "direction": "headword_to_gloss",
            "grade": "again",
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
        progress.due_at = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    session_response = await client.get("/api/flashcards/session")
    next_card = session_response.json()["current_card"]
    assert next_card is not None
    assert next_card["entry_id"] == str(entry.id)
    assert next_card["queue"] == "learn"


@pytest.mark.asyncio
async def test_review_schedules_long_term_interval(client):
    await register_user(client, "review@example.com", "Review User")
    user_id = await get_user_id("review@example.com")
    entry = await seed_entry(user_id=user_id, headword="review-entry")

    async with db_module.AsyncSessionLocal() as session:
        session.add(
            FlashcardProgress(
                user_id=user_id,
                entry_id=entry.id,
                direction=FlashcardDirection.headword_to_gloss,
                card_type=FlashcardCardType.review,
                queue=FlashcardQueue.review,
                scheduled_days=3,
                due_at=datetime.now(UTC) - timedelta(minutes=1),
                memory_stability=3.0,
                memory_difficulty=4.0,
                reps=4,
            )
        )
        await session.commit()

    response = await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": str(entry.id),
            "direction": "headword_to_gloss",
            "grade": "good",
            "response_ms": 500,
        },
    )
    assert response.status_code == 200, response.text

    async with db_module.AsyncSessionLocal() as session:
        progress = (
            await session.execute(
                select(FlashcardProgress).where(
                    FlashcardProgress.user_id == user_id,
                    FlashcardProgress.entry_id == entry.id,
                )
            )
        ).scalar_one()

    assert progress.card_type == FlashcardCardType.review
    assert progress.scheduled_days >= 1
    assert progress.due_at is not None


@pytest.mark.asyncio
async def test_new_pair_shows_back_to_back(client):
    await register_user(client, "siblings@example.com", "Sibling User")
    user_id = await get_user_id("siblings@example.com")

    await seed_entry(user_id=user_id, headword="alpha", score_cache=10)
    await seed_entry(user_id=user_id, headword="beta", score_cache=9)

    async with db_module.AsyncSessionLocal() as session:
        session.add(FlashcardSettings(user_id=user_id, new_cards_per_day=3))
        await session.commit()

    response = await client.get("/api/flashcards/session")
    card = response.json()["current_card"]
    assert card["direction"] == "headword_to_gloss"

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "grade": "good",
            "response_ms": 400,
        },
    )

    response = await client.get("/api/flashcards/session")
    next_card = response.json()["current_card"]
    assert next_card is not None
    assert next_card["entry_id"] == card["entry_id"]
    assert next_card["direction"] == "gloss_to_headword"


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
            "grade": "good",
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

    assert progress_count == 2


@pytest.mark.asyncio
async def test_new_popular_entries_show_in_future_sessions(client):
    await register_user(client, "future@example.com", "Future User")
    user_id = await get_user_id("future@example.com")

    await seed_entry(user_id=user_id, headword="old", score_cache=10)
    mid = await seed_entry(user_id=user_id, headword="mid", score_cache=2)

    response = await client.get("/api/flashcards/session")
    card = response.json()["current_card"]

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "grade": "good",
            "response_ms": 300,
        },
    )

    new_entry = await seed_entry(user_id=user_id, headword="new", score_cache=99)

    response = await client.get("/api/flashcards/session")
    sibling_card = response.json()["current_card"]
    assert sibling_card is not None
    assert sibling_card["entry_id"] == card["entry_id"]
    assert sibling_card["direction"] == "gloss_to_headword"

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": sibling_card["entry_id"],
            "direction": sibling_card["direction"],
            "grade": "good",
            "response_ms": 300,
        },
    )

    response = await client.get("/api/flashcards/session")
    assert response.status_code == 200, response.text
    next_card = response.json()["current_card"]
    assert next_card is not None
    assert next_card["entry_id"] == str(new_entry.id)

    async with db_module.AsyncSessionLocal() as session:
        progress_exists = (
            await session.execute(
                select(func.count()).select_from(FlashcardProgress).where(FlashcardProgress.entry_id == mid.id)
            )
        ).scalar_one()

    assert progress_exists == 0


@pytest.mark.asyncio
async def test_review_logs_capture_grade(client):
    await register_user(client, "log@example.com", "Review Log")
    user_id = await get_user_id("log@example.com")
    entry = await seed_entry(user_id=user_id, headword="log-entry", status=EntryStatus.approved)

    session_response = await client.get("/api/flashcards/session")
    card = session_response.json()["current_card"]

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "grade": "hard",
            "response_ms": 1200,
        },
    )

    async with db_module.AsyncSessionLocal() as session:
        log = (
            await session.execute(select(FlashcardReviewLog).where(FlashcardReviewLog.entry_id == entry.id))
        ).scalar_one()

    assert log.grade == FlashcardGrade.hard


@pytest.mark.asyncio
async def test_finish_session_records_and_links_reviews(client):
    await register_user(client, "session@example.com", "Session User")
    user_id = await get_user_id("session@example.com")
    entry = await seed_entry(user_id=user_id, headword="session-entry", status=EntryStatus.approved)

    session_response = await client.get("/api/flashcards/session")
    card = session_response.json()["current_card"]

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "grade": "good",
            "response_ms": 400,
        },
    )

    async with db_module.AsyncSessionLocal() as session:
        log = (
            await session.execute(select(FlashcardReviewLog).where(FlashcardReviewLog.entry_id == entry.id))
        ).scalar_one()
        assert log.session_id is not None

    finish_response = await client.post("/api/flashcards/finish-session")
    assert finish_response.status_code == 200, finish_response.text

    async with db_module.AsyncSessionLocal() as session:
        study_session = (
            await session.execute(
                select(FlashcardStudySession).where(
                    FlashcardStudySession.user_id == user_id,
                    FlashcardStudySession.ended_at.isnot(None),
                )
            )
        ).scalar_one()
        assert study_session.ended_at is not None


@pytest.mark.asyncio
async def test_stats_endpoint_returns_today_summary(client):
    await register_user(client, "stats@example.com", "Stats User")
    user_id = await get_user_id("stats@example.com")
    entry = await seed_entry(user_id=user_id, headword="stats-entry", status=EntryStatus.approved)

    session_response = await client.get("/api/flashcards/session")
    card = session_response.json()["current_card"]

    await client.post(
        "/api/flashcards/review",
        json={
            "entry_id": card["entry_id"],
            "direction": card["direction"],
            "grade": "good",
            "response_ms": 300,
        },
    )

    await client.post("/api/flashcards/finish-session")

    stats_response = await client.get("/api/flashcards/stats")
    assert stats_response.status_code == 200, stats_response.text
    stats = stats_response.json()
    assert stats["today"]["reviews"] >= 1
    assert stats["today"]["new_seen"] >= 1
    assert stats["today"]["sessions"] >= 1
    assert len(stats["last_7_days"]) == 7
