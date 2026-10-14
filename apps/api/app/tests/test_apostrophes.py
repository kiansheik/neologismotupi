# ruff: noqa: RUF001 -- Unicode apostrophes are intentional regression fixtures.
import uuid

import pytest
from pydantic import ValidationError

import app.db as db_module
import app.services.navarro as navarro_service
from app.core.enums import EntryStatus, ExampleStatus
from app.core.utils import normalize_apostrophes, normalize_search_query
from app.models.entry import Entry, Example
from app.models.navarro import NavarroEntry
from app.models.source import SourceEdition, SourceWork
from app.schemas.auth import RegisterRequest
from app.schemas.entries import EntryCreate, ExampleUpdate, SourceInput
from app.schemas.flashcards import FlashcardReviewRequest


async def register_user(client):
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "apostrophes@example.com",
            "password": "password123",
            "display_name": "Reader",
        },
    )
    assert response.status_code == 201, response.text


async def create_entry(client, headword="tembi’u"):
    response = await client.post(
        "/api/entries",
        json={"headword": headword, "gloss_pt": "comida", "force_submit": True},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize("apostrophe", ["‘", "’", "‚", "‛", "ʻ", "ʼ", "′", "‵", "＇"])
def test_normalize_glottal_apostrophes(apostrophe):
    assert normalize_apostrophes(f"e{apostrophe}õ{apostrophe}ar") == "e'õ'ar"
    assert normalize_search_query(f"E{apostrophe}Õ{apostrophe}AR") == "e'o'ar"
    assert normalize_apostrophes("'ara, ã î û: “tupi”") == "'ara, ã î û: “tupi”"


def test_request_text_preserves_opaque_values_and_validation():
    source = SourceInput(title="a’e", url="https://example.com/a’e")
    payload = EntryCreate(
        headword="tembi’u",
        gloss_pt="a‘e",
        source=source,
        pydicate="Noun('a’e')",
        turnstile_token="a’b",
    )
    assert payload.headword == "tembi'u"
    assert payload.gloss_pt == "a'e"
    assert payload.source.title == "a'e"
    assert payload.source.url == "https://example.com/a’e"
    assert payload.pydicate == "Noun('a’e')"
    assert payload.turnstile_token == "a’b"
    assert ExampleUpdate(sentence_original="e‘õ’ar").sentence_original == "e'õ'ar"
    assert ExampleUpdate(translation_pt=None).translation_pt is None
    assert (
        FlashcardReviewRequest(
            entry_id=uuid.uuid4(), direction="gloss_to_headword", grade="good", user_response="a’e"
        ).user_response
        == "a'e"
    )
    register = RegisterRequest(email="user@example.com", password="secret‘’123", display_name="a’e")
    assert register.password == "secret‘’123"
    assert register.display_name == "a'e"
    with pytest.raises(ValidationError):
        EntryCreate(headword=123, gloss_pt="invalid")


async def test_entry_and_example_search_create_edit_and_duplicates(client):
    await register_user(client)
    entry = await create_entry(client)
    assert entry["headword"] == "tembi'u"
    for query in ("tembi'u", "tembi‘u", "tembi’u", "tembiʼu"):
        response = await client.get("/api/entries", params={"search": query})
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 1

    duplicate = await client.post(
        "/api/entries", json={"headword": "tembi‘u", "gloss_pt": "comida"}
    )
    assert duplicate.status_code == 409, duplicate.text

    response = await client.patch(
        f"/api/entries/{entry['id']}", json={"headword": "a’e", "edit_summary": "e‘õ’ar"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["headword"] == "a'e"
    response = await client.get("/api/entries", params=[("search_terms", "a‘e")])
    assert response.json()["total"] == 1

    response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={"sentence_original": "e’õ’ar", "translation_pt": "a‘e"},
    )
    assert response.status_code == 201, response.text
    example = response.json()
    assert example["sentence_original"] == "e'õ'ar"
    assert example["translation_pt"] == "a'e"
    async with db_module.AsyncSessionLocal() as db:
        entry_row = await db.get(Entry, uuid.UUID(entry["id"]))
        entry_row.status = EntryStatus.approved
        example_row = await db.get(Example, uuid.UUID(example["id"]))
        example_row.status = ExampleStatus.approved
        await db.commit()
    response = await client.get("/api/examples", params={"search": "e‘õ’ar"})
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    response = await client.post(
        f"/api/entries/{entry['id']}/examples", json={"sentence_original": "e‘õ’ar"}
    )
    assert response.status_code == 409, response.text

    response = await client.post(
        f"/api/entries/{entry['id']}/comments", json={"body": "tembi’u a‘e"}
    )
    assert response.status_code == 201, response.text
    assert response.json()["body"] == "tembi'u a'e"

    # Emulate pre-fix stored text, including normalized fields from the old normalizer.
    async with db_module.AsyncSessionLocal() as db:
        row = await db.get(Entry, uuid.UUID(entry["id"]))
        row.headword = "a’e"
        row.normalized_headword = "a’e"
        row = await db.get(Example, uuid.UUID(example["id"]))
        row.sentence_original = "e‘õ’ar"
        row.normalized_sentence_original = "e‘o’ar"
        await db.commit()
    for path, query in (("/api/entries", "a'e"), ("/api/examples", "e'o'ar")):
        response = await client.get(path, params={"search": query})
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 1
    response = await client.post(
        f"/api/entries/{entry['id']}/examples", json={"sentence_original": "e’õ’ar"}
    )
    assert response.status_code == 409, response.text


async def test_navarro_search_normalizes_mobile_queries_and_legacy_cache(client, monkeypatch):
    monkeypatch.setattr(navarro_service, "_cache_loaded", False)
    for name, value in (
        ("_cache", []),
        ("_cache_by_id", {}),
        ("_cache_payload", []),
        ("_cache_version", None),
    ):
        monkeypatch.setattr(navarro_service, name, value)
    async with db_module.AsyncSessionLocal() as db:
        for word, normalized in (("tembi'u", "tembi'u"), ("a’e", "a’e"), ("e‘õ’ar", "e‘o’ar")):
            db.add(
                NavarroEntry(
                    id=uuid.uuid4(),
                    first_word=word,
                    definition="meaning",
                    normalized_headword=normalized,
                    search_text=normalized,
                )
            )
        await db.commit()
    for query in ("tembi’u", "a'e", "eʼõʼar"):
        response = await client.get("/api/navarro/search", params={"q": query})
        assert response.status_code == 200, response.text
        assert len(response.json()) == 1


async def test_list_text_and_search_accept_mobile_apostrophes(client):
    await register_user(client)
    response = await client.post(
        "/api/flashcard-lists", json={"title_pt": "tembi’u", "description_pt": "a‘e e’õ’ar"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["title_pt"] == "tembi'u"
    list_id = response.json()["id"]
    response = await client.get("/api/flashcard-lists", params={"q": "a’e"})
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    response = await client.post(
        f"/api/flashcard-lists/{list_id}/comments", json={"body": "e‘õ’ar"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["body"] == "e'õ'ar"


async def test_source_lookup_reuses_legacy_apostrophe_variants(client):
    await register_user(client)
    response = await client.post(
        "/api/entries",
        json={
            "headword": "tembi’u",
            "gloss_pt": "comida",
            "source": {"title": "a’e", "edition_label": "e‘õ’ar"},
            "force_submit": True,
        },
    )
    assert response.status_code == 201, response.text
    source = response.json()["source"]
    assert source["title"] == "a'e"
    async with db_module.AsyncSessionLocal() as db:
        work = await db.get(SourceWork, uuid.UUID(source["work_id"]))
        work.title = "a’e"
        work.normalized_title = "a’e"
        edition = await db.get(SourceEdition, uuid.UUID(source["edition_id"]))
        edition.edition_label = "e‘õ’ar"
        edition.normalized_edition_label = "e‘o’ar"
        await db.commit()
    response = await client.get("/api/sources", params={"query": "a'e"})
    assert response.status_code == 200, response.text
    assert response.json()[0]["work_id"] == source["work_id"]
    response = await client.post(
        "/api/entries",
        json={
            "headword": "other",
            "gloss_pt": "outro",
            "source": {"title": "a‘e", "edition_label": "e’õ’ar"},
            "force_submit": True,
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["source"]["edition_id"] == source["edition_id"]
