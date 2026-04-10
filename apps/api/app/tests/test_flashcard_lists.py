import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

import app.db as db_module
from app.core.enums import EntryStatus
from app.core.utils import normalize_text, slugify
from app.models.entry import Entry
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
        score_cache=0,
        example_count_cache=0,
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
async def test_list_session_filters_entries(client):
    await register_user(client, "lists@example.com", "List User")
    await login_user(client, "lists@example.com")
    user_id = await get_user_id("lists@example.com")

    entry_one = await seed_entry(user_id=user_id, headword="first")
    await seed_entry(user_id=user_id, headword="second")

    create_resp = await client.post(
        "/api/flashcard-lists",
        json={"title_pt": "Minha lista"},
    )
    assert create_resp.status_code == 200, create_resp.text
    list_id = create_resp.json()["id"]

    add_resp = await client.post(
        f"/api/flashcard-lists/{list_id}/items",
        json={"entry_id": str(entry_one.id)},
    )
    assert add_resp.status_code == 200, add_resp.text

    session_resp = await client.get("/api/flashcards/session", params={"list_id": list_id})
    assert session_resp.status_code == 200, session_resp.text
    card = session_resp.json()["current_card"]
    assert card["entry_id"] == str(entry_one.id)


@pytest.mark.asyncio
async def test_list_search_uses_description(client):
    await register_user(client, "search@example.com", "Search User")
    await login_user(client, "search@example.com")

    create_resp = await client.post(
        "/api/flashcard-lists",
        json={
            "title_pt": "Lista de fauna",
            "description_pt": "Palavras sobre animais amazônicos",
        },
    )
    assert create_resp.status_code == 200, create_resp.text

    response = await client.get("/api/flashcard-lists", params={"q": "amazônicos"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] >= 1
    assert any(item["id"] == create_resp.json()["id"] for item in payload["items"])
