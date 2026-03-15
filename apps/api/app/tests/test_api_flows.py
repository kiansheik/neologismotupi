import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

import app.api.routes.auth as auth_routes
import app.api.routes.moderation as moderation_routes
import app.db as db_module
from app.config import get_settings
from app.core.enums import TagType
from app.models.discussion import CommentVote, Notification, NotificationPreference
from app.models.entry import Entry, Example, ExampleVote, Tag, Vote
from app.models.moderation import Report
from app.models.user import Profile, User
from app.security import hash_password


async def register_user(client, email: str, display_name: str, password: str = "password123"):
    response = await client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": display_name,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_healthz(client):
    response = await client.get("/healthz")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ok"] is True
    assert payload["database"] == "ok"
    assert "release" in payload


async def login_user(client, email: str, password: str = "password123"):
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


async def create_entry(client, headword: str = "test-word"):
    response = await client.post(
        "/api/entries",
        json={
            "headword": headword,
            "gloss_pt": "teste",
            "gloss_en": "test",
            "part_of_speech": "noun",
            "short_definition": "A testing placeholder entry.",
            "morphology_notes": "seed note",
            "force_submit": True,
            "tag_ids": [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_registration_and_login_smoke(client):
    await register_user(client, "a@example.com", "User A")

    me_response = await client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "a@example.com"

    logout_response = await client.post("/api/auth/logout")
    assert logout_response.status_code == 200

    await login_user(client, "a@example.com")


@pytest.mark.asyncio
async def test_create_entry(client):
    await register_user(client, "creator@example.com", "Creator")
    entry = await create_entry(client, "my-new-entry")

    assert entry["headword"] == "my-new-entry"
    assert entry["status"] == "pending"


@pytest.mark.asyncio
async def test_create_entry_uses_gloss_when_definition_is_blank(client):
    await register_user(client, "creator-blank@example.com", "Creator Blank")

    response = await client.post(
        "/api/entries",
        json={
            "headword": "mbaeekokuaba",
            "gloss_pt": "Física",
            "part_of_speech": "noun",
            "short_definition": "",
            "morphology_notes": "",
            "force_submit": True,
            "tag_ids": [],
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["gloss_pt"] == "Física"
    assert payload["short_definition"] == "Física"


@pytest.mark.asyncio
async def test_rejected_entries_only_show_with_rejected_filter(client):
    owner = await register_user(client, "hidden-owner@example.com", "Hidden Owner")
    entry = await create_entry(client, "hidden-rejected-entry")

    await client.post("/api/auth/logout")
    await register_user(client, "hidden-mod@example.com", "Hidden Mod")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "hidden-mod@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    report_response = await client.post(
        f"/api/entries/{entry['id']}/reports",
        json={"reason_code": "incorrect", "free_text": "Entrada de teste para rejeição"},
    )
    assert report_response.status_code == 201, report_response.text

    reject_response = await client.post(
        f"/api/mod/entries/{entry['id']}/reject",
        json={"notes": "hidden from default", "reason": "rejected for test"},
    )
    assert reject_response.status_code == 200, reject_response.text

    default_response = await client.get("/api/entries")
    assert default_response.status_code == 200, default_response.text
    default_ids = {item["id"] for item in default_response.json()["items"]}
    assert entry["id"] not in default_ids

    proposer_default_response = await client.get("/api/entries", params={"proposer_user_id": owner["id"]})
    assert proposer_default_response.status_code == 200, proposer_default_response.text
    proposer_default_ids = {item["id"] for item in proposer_default_response.json()["items"]}
    assert entry["id"] not in proposer_default_ids

    rejected_response = await client.get("/api/entries", params={"status": "rejected"})
    assert rejected_response.status_code == 200, rejected_response.text
    rejected_ids = {item["id"] for item in rejected_response.json()["items"]}
    assert entry["id"] in rejected_ids

    proposer_rejected_response = await client.get(
        "/api/entries",
        params={"status": "rejected", "proposer_user_id": owner["id"]},
    )
    assert proposer_rejected_response.status_code == 200, proposer_rejected_response.text
    proposer_rejected_ids = {item["id"] for item in proposer_rejected_response.json()["items"]}
    assert entry["id"] in proposer_rejected_ids


@pytest.mark.asyncio
async def test_create_entry_with_tags(client):
    await register_user(client, "tagger@example.com", "Tagger")

    async with db_module.AsyncSessionLocal() as session:
        tag = Tag(name="Educação", type=TagType.domain, slug="educacao")
        session.add(tag)
        await session.commit()
        await session.refresh(tag)
        tag_id = str(tag.id)

    response = await client.post(
        "/api/entries",
        json={
            "headword": "tagged-entry",
            "gloss_pt": "teste",
            "gloss_en": "test",
            "part_of_speech": "noun",
            "short_definition": "Entry with tags.",
            "morphology_notes": "tag note",
            "force_submit": True,
            "tag_ids": [tag_id],
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert len(payload["tags"]) == 1
    assert payload["tags"][0]["slug"] == "educacao"


@pytest.mark.asyncio
async def test_edit_own_entry(client):
    await register_user(client, "owner@example.com", "Owner")
    entry = await create_entry(client, "edit-target")

    patch_response = await client.patch(
        f"/api/entries/{entry['id']}",
        json={"short_definition": "Updated definition", "edit_summary": "clarify"},
    )
    assert patch_response.status_code == 200, patch_response.text
    payload = patch_response.json()
    assert payload["short_definition"] == "Updated definition"
    assert len(payload["versions"]) >= 2


@pytest.mark.asyncio
async def test_cannot_edit_others_entry(client):
    await register_user(client, "user1@example.com", "User1")
    entry = await create_entry(client, "shared-entry")

    await client.post("/api/auth/logout")
    await register_user(client, "user2@example.com", "User2")

    patch_response = await client.patch(
        f"/api/entries/{entry['id']}",
        json={"short_definition": "malicious edit"},
    )
    assert patch_response.status_code == 403


@pytest.mark.asyncio
async def test_superuser_can_edit_others_entry_with_version_log(client):
    await register_user(client, "owner-super-edit@example.com", "Owner Super Edit")
    entry = await create_entry(client, "super-edit-target")

    await client.post("/api/auth/logout")
    await register_user(client, "super-editor@example.com", "Super Editor")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "super-editor@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    patch_response = await client.patch(
        f"/api/entries/{entry['id']}",
        json={
            "headword": "super-edit-target-revised",
            "short_definition": "Updated by moderator",
            "edit_summary": "moderator cleanup",
        },
    )
    assert patch_response.status_code == 200, patch_response.text
    payload = patch_response.json()
    assert payload["headword"] == "super-edit-target-revised"
    assert payload["short_definition"] == "Updated by moderator"
    assert any(version["edit_summary"] == "moderator cleanup" for version in payload["versions"])


@pytest.mark.asyncio
async def test_add_example(client):
    await register_user(client, "example-owner@example.com", "Example Owner")
    entry = await create_entry(client, "example-entry")

    response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={
            "sentence_original": "A fake sentence for tests.",
            "translation_pt": "Uma frase falsa de teste.",
            "translation_en": "A fake test sentence.",
            "source_citation": "Wikipédia · artigo teste",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending"
    assert response.json()["source_citation"] == "Wikipédia · artigo teste"


@pytest.mark.asyncio
async def test_edit_example_creates_version_history(client):
    await register_user(client, "example-editor@example.com", "Example Editor")
    entry = await create_entry(client, "example-edit-entry")

    create_response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={
            "sentence_original": "Frase inicial de exemplo.",
            "translation_pt": "Tradução inicial.",
            "source_citation": "Fonte inicial",
        },
    )
    assert create_response.status_code == 201, create_response.text
    example_id = create_response.json()["id"]

    edit_response = await client.patch(
        f"/api/examples/{example_id}",
        json={
            "sentence_original": "Frase revisada de exemplo.",
            "translation_pt": "Tradução revisada.",
            "source_citation": "Fonte revisada",
            "edit_summary": "ajuste de clareza",
        },
    )
    assert edit_response.status_code == 200, edit_response.text
    edited = edit_response.json()
    assert edited["sentence_original"] == "Frase revisada de exemplo."
    assert edited["translation_pt"] == "Tradução revisada."
    assert edited["source_citation"] == "Fonte revisada"

    versions_response = await client.get(f"/api/examples/{example_id}/versions")
    assert versions_response.status_code == 200, versions_response.text
    versions = versions_response.json()
    assert len(versions) >= 2
    assert versions[0]["version_number"] > versions[1]["version_number"]
    assert versions[0]["edit_summary"] == "ajuste de clareza"
    assert versions[1]["edit_summary"] == "Initial submission"


@pytest.mark.asyncio
async def test_vote_once_and_change_updates_row(client):
    await register_user(client, "proposer@example.com", "Proposer")
    entry = await create_entry(client, "vote-entry")

    await client.post("/api/auth/logout")
    await register_user(client, "voter@example.com", "Voter")

    async with db_module.AsyncSessionLocal() as session:
        voter = (await session.execute(select(User).where(User.email == "voter@example.com"))).scalar_one()
        voter.created_at = datetime.now(UTC) - timedelta(days=4)
        await session.commit()

    upvote = await client.post(f"/api/entries/{entry['id']}/vote", json={"value": 1})
    assert upvote.status_code == 200, upvote.text

    downvote = await client.post(f"/api/entries/{entry['id']}/vote", json={"value": -1})
    assert downvote.status_code == 200, downvote.text

    async with db_module.AsyncSessionLocal() as session:
        count_stmt = select(func.count()).select_from(Vote)
        total_votes = int((await session.execute(count_stmt)).scalar_one())
        assert total_votes == 1

        vote = (await session.execute(select(Vote))).scalar_one()
        assert vote.value == -1

        proposer = (await session.execute(select(User).where(User.email == "proposer@example.com"))).scalar_one()
        proposer_profile = (
            await session.execute(select(Profile).where(Profile.user_id == proposer.id))
        ).scalar_one()
        assert proposer_profile.reputation_score == -1


@pytest.mark.asyncio
async def test_example_vote_updates_reputation(client):
    await register_user(client, "example-author@example.com", "Example Author")

    async with db_module.AsyncSessionLocal() as session:
        author = (await session.execute(select(User).where(User.email == "example-author@example.com"))).scalar_one()
        author.is_superuser = True
        await session.commit()

    entry = await create_entry(client, "example-vote-entry")
    example_response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={
            "sentence_original": "Example sentence to vote on.",
            "translation_pt": "Frase de exemplo para voto.",
        },
    )
    assert example_response.status_code == 201, example_response.text
    example_id = example_response.json()["id"]
    assert example_response.json()["status"] == "approved"

    await client.post("/api/auth/logout")
    await register_user(client, "example-voter@example.com", "Example Voter")

    async with db_module.AsyncSessionLocal() as session:
        voter = (await session.execute(select(User).where(User.email == "example-voter@example.com"))).scalar_one()
        voter.created_at = datetime.now(UTC) - timedelta(days=4)
        await session.commit()

    upvote = await client.post(f"/api/examples/{example_id}/vote", json={"value": 1})
    assert upvote.status_code == 200, upvote.text

    downvote = await client.post(f"/api/examples/{example_id}/vote", json={"value": -1})
    assert downvote.status_code == 200, downvote.text

    async with db_module.AsyncSessionLocal() as session:
        total_example_votes = int((await session.execute(select(func.count()).select_from(ExampleVote))).scalar_one())
        assert total_example_votes == 1

        example_vote = (await session.execute(select(ExampleVote))).scalar_one()
        assert example_vote.value == -1

        author = (await session.execute(select(User).where(User.email == "example-author@example.com"))).scalar_one()
        author_profile = (
            await session.execute(select(Profile).where(Profile.user_id == author.id))
        ).scalar_one()
        assert author_profile.reputation_score == -1


@pytest.mark.asyncio
async def test_new_user_cannot_downvote_before_threshold(client):
    await register_user(client, "entry-owner@example.com", "Entry Owner")
    entry = await create_entry(client, "downvote-target")

    await client.post("/api/auth/logout")
    await register_user(client, "newbie@example.com", "Newbie")

    response = await client.post(f"/api/entries/{entry['id']}/vote", json={"value": -1})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_new_user_can_downvote_when_account_age_gate_is_disabled(client, monkeypatch):
    monkeypatch.setenv("ENFORCE_DOWNVOTE_ACCOUNT_AGE", "false")
    get_settings.cache_clear()

    await register_user(client, "entry-owner-beta@example.com", "Entry Owner Beta")
    entry = await create_entry(client, "downvote-beta-target")

    await client.post("/api/auth/logout")
    await register_user(client, "beta-newbie@example.com", "Beta Newbie")

    response = await client.post(f"/api/entries/{entry['id']}/vote", json={"value": -1})
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_cannot_vote_own_content(client):
    await register_user(client, "self-voter@example.com", "Self Voter")
    entry = await create_entry(client, "self-vote-entry")

    own_entry_vote = await client.post(f"/api/entries/{entry['id']}/vote", json={"value": 1})
    assert own_entry_vote.status_code == 403, own_entry_vote.text

    example_response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={"sentence_original": "My own example to test self-vote blocking."},
    )
    assert example_response.status_code == 201, example_response.text
    example_id = example_response.json()["id"]

    own_example_vote = await client.post(f"/api/examples/{example_id}/vote", json={"value": 1})
    assert own_example_vote.status_code == 403, own_example_vote.text


@pytest.mark.asyncio
async def test_moderator_can_approve_pending_entry(client):
    await register_user(client, "normal@example.com", "Normal")
    entry = await create_entry(client, "pending-for-review")

    await client.post("/api/auth/logout")
    await register_user(client, "mod@example.com", "Moderator")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "mod@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    response = await client.post(
        f"/api/mod/entries/{entry['id']}/approve",
        json={"notes": "looks fine", "reason": "good-faith"},
    )
    assert response.status_code == 200, response.text

    detail = await client.get(f"/api/entries/{entry['slug']}")
    assert detail.status_code == 200, detail.text
    history_events = detail.json()["history_events"]
    assert any(event["kind"] == "version" for event in history_events)
    approval_event = next((event for event in history_events if event["action_type"] == "entry_approved"), None)
    assert approval_event is not None
    assert approval_event["actor_display_name"] == "Moderator"
    assert approval_event["created_at"]
    assert response.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_moderator_upvote_auto_verifies_entry(client):
    await register_user(client, "entry-auto-owner@example.com", "Entry Auto Owner")
    entry = await create_entry(client, "entry-auto-verify")

    await client.post("/api/auth/logout")
    await register_user(client, "entry-auto-mod@example.com", "Entry Auto Mod")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "entry-auto-mod@example.com"))).scalar_one()
        moderator.is_superuser = True
        moderator.created_at = datetime.now(UTC) - timedelta(days=7)
        await session.commit()

    vote_response = await client.post(f"/api/entries/{entry['id']}/vote", json={"value": 1})
    assert vote_response.status_code == 200, vote_response.text

    entry_response = await client.get(f"/api/entries/{entry['slug']}")
    assert entry_response.status_code == 200, entry_response.text
    assert entry_response.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_moderator_upvote_auto_verifies_example(client):
    await register_user(client, "example-auto-owner@example.com", "Example Auto Owner")
    entry = await create_entry(client, "example-auto-verify-entry")

    example_response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={"sentence_original": "Exemplo para verificação automática."},
    )
    assert example_response.status_code == 201, example_response.text
    example_id = example_response.json()["id"]

    await client.post("/api/auth/logout")
    await register_user(client, "example-auto-mod@example.com", "Example Auto Mod")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (
            await session.execute(select(User).where(User.email == "example-auto-mod@example.com"))
        ).scalar_one()
        moderator.is_superuser = True
        moderator.created_at = datetime.now(UTC) - timedelta(days=7)
        await session.commit()

    vote_response = await client.post(f"/api/examples/{example_id}/vote", json={"value": 1})
    assert vote_response.status_code == 200, vote_response.text

    entry_response = await client.get(f"/api/entries/{entry['slug']}")
    assert entry_response.status_code == 200, entry_response.text
    payload = entry_response.json()
    approved_example = next(example for example in payload["examples"] if example["id"] == example_id)
    assert approved_example["status"] == "approved"


@pytest.mark.asyncio
async def test_reject_entry_does_not_require_existing_report(client):
    await register_user(client, "entry-reject-owner@example.com", "Entry Reject Owner")
    entry = await create_entry(client, "entry-reject-needs-report")

    await client.post("/api/auth/logout")
    await register_user(client, "entry-reject-mod@example.com", "Entry Reject Mod")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "entry-reject-mod@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    reject_response = await client.post(
        f"/api/mod/entries/{entry['id']}/reject",
        json={"reason": "Sem fontes atestadas."},
    )
    assert reject_response.status_code == 200, reject_response.text


@pytest.mark.asyncio
async def test_entry_rejection_reason_is_visible_and_triggers_email(client, monkeypatch):
    sent: dict[str, str | bool | None] = {}

    async def fake_send_entry_moderation_email(
        *,
        to_email: str,
        headword: str,
        slug: str,
        approved: bool,
        reason: str | None = None,
    ) -> None:
        sent["to_email"] = to_email
        sent["headword"] = headword
        sent["slug"] = slug
        sent["approved"] = approved
        sent["reason"] = reason

    monkeypatch.setattr(moderation_routes, "send_entry_moderation_email", fake_send_entry_moderation_email)

    await register_user(client, "entry-owner-email@example.com", "Entry Owner Email")
    entry = await create_entry(client, "moderation-reason-target")

    await client.post("/api/auth/logout")
    await register_user(client, "entry-mod-email@example.com", "Entry Mod Email")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "entry-mod-email@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    report_response = await client.post(
        f"/api/entries/{entry['id']}/reports",
        json={"reason_code": "incorrect", "free_text": "Termo sem atestação suficiente"},
    )
    assert report_response.status_code == 201, report_response.text

    reason = "Duplicado de outro verbete já aprovado."
    reject_response = await client.post(
        f"/api/mod/entries/{entry['id']}/reject",
        json={"reason": reason, "notes": "Revisado pela moderação"},
    )
    assert reject_response.status_code == 200, reject_response.text

    entry_response = await client.get(f"/api/entries/{entry['slug']}")
    assert entry_response.status_code == 200, entry_response.text
    payload = entry_response.json()
    assert payload["status"] == "rejected"
    assert payload["moderation_reason"] == reason

    assert sent["to_email"] == "entry-owner-email@example.com"
    assert sent["headword"] == "moderation-reason-target"
    assert sent["slug"] == entry["slug"]
    assert sent["approved"] is False
    assert sent["reason"] == reason


@pytest.mark.asyncio
async def test_example_rejection_reason_is_visible_on_entry_page(client):
    await register_user(client, "example-owner-reason@example.com", "Example Owner Reason")
    entry = await create_entry(client, "example-reason-entry")

    example_response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={
            "sentence_original": "Exemplo para rejeição.",
            "translation_pt": "Exemplo de teste.",
        },
    )
    assert example_response.status_code == 201, example_response.text
    example_id = example_response.json()["id"]

    await client.post("/api/auth/logout")
    await register_user(client, "example-mod-reason@example.com", "Example Mod Reason")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (
            await session.execute(select(User).where(User.email == "example-mod-reason@example.com"))
        ).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    reason = "Exemplo sem contexto suficiente."
    reject_response = await client.post(
        f"/api/mod/examples/{example_id}/reject",
        json={"reason": reason, "notes": "Favor enviar com contexto cultural"},
    )
    assert reject_response.status_code == 200, reject_response.text

    await client.post("/api/auth/logout")
    await login_user(client, "example-owner-reason@example.com")

    entry_response = await client.get(f"/api/entries/{entry['slug']}")
    assert entry_response.status_code == 200, entry_response.text
    payload = entry_response.json()
    rejected_example = next(example for example in payload["examples"] if example["id"] == example_id)
    assert rejected_example["status"] == "rejected"
    assert rejected_example["moderation_reason"] == reason


@pytest.mark.asyncio
async def test_report_flow(client):
    await register_user(client, "entry-maker@example.com", "Entry Maker")
    entry = await create_entry(client, "report-target")

    example_response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={"sentence_original": "Report me please", "translation_pt": "Me reporte"},
    )
    assert example_response.status_code == 201
    example_id = example_response.json()["id"]

    await client.post("/api/auth/logout")
    await register_user(client, "reporter@example.com", "Reporter")

    report_entry = await client.post(
        f"/api/entries/{entry['id']}/reports",
        json={"reason_code": "spam", "free_text": "Looks like spam"},
    )
    assert report_entry.status_code == 201, report_entry.text

    report_example = await client.post(
        f"/api/examples/{example_id}/reports",
        json={"reason_code": "incorrect", "free_text": "Suspicious usage"},
    )
    assert report_example.status_code == 201, report_example.text

    await client.post("/api/auth/logout")
    await register_user(client, "mod2@example.com", "Moderator Two")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "mod2@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    reports_response = await client.get("/api/mod/reports")
    assert reports_response.status_code == 200, reports_response.text
    reports = reports_response.json()
    assert len(reports) >= 2
    entry_report = next(report for report in reports if report["target_type"] == "entry")
    example_report_payload = next(report for report in reports if report["target_type"] == "example")

    assert entry_report["target_label"] == entry["headword"]
    assert entry_report["target_url"] == f"/entries/{entry['slug']}"
    assert entry_report["reason_code"] == "spam"
    assert entry_report["free_text"] == "Looks like spam"
    assert entry_report["reporter_display_name"] == "Reporter"
    assert entry_report["reporter_profile_url"] == f"/profiles/{entry_report['reporter_user_id']}"
    assert entry_report["created_at"]

    assert example_report_payload["target_url"] == f"/entries/{entry['slug']}"
    assert "Report me please" in example_report_payload["target_label"]
    assert example_report_payload["reason_code"] == "incorrect"
    assert example_report_payload["free_text"] == "Suspicious usage"
    assert example_report_payload["reporter_display_name"] == "Reporter"
    assert example_report_payload["reporter_profile_url"] == f"/profiles/{example_report_payload['reporter_user_id']}"
    assert example_report_payload["created_at"]

    report_id = reports[0]["id"]
    resolve_response = await client.post(
        f"/api/mod/reports/{report_id}/resolve",
        json={"status": "resolved", "notes": "Reviewed"},
    )
    assert resolve_response.status_code == 200, resolve_response.text

    async with db_module.AsyncSessionLocal() as session:
        total_reports = int((await session.execute(select(func.count()).select_from(Report))).scalar_one())
        total_entries = int((await session.execute(select(func.count()).select_from(Entry))).scalar_one())
        total_examples = int((await session.execute(select(func.count()).select_from(Example))).scalar_one())

    assert total_reports >= 2
    assert total_entries >= 1
    assert total_examples >= 1


@pytest.mark.asyncio
async def test_moderation_dashboard(client):
    await register_user(client, "dash-author@example.com", "Dash Author")
    entry = await create_entry(client, "dashboard-entry")
    example_response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={"sentence_original": "Dashboard example"},
    )
    assert example_response.status_code == 201, example_response.text

    await client.post("/api/auth/logout")
    await register_user(client, "dash-mod@example.com", "Dash Moderator")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "dash-mod@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

    response = await client.get("/api/mod/dashboard")
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["users_total"] >= 2
    assert payload["entries_total"] >= 1
    assert payload["examples_total"] >= 1
    assert payload["pending_entries_total"] >= 1
    assert payload["pending_examples_total"] >= 1

    for key in [
        "new_users",
        "new_entries",
        "new_examples",
        "active_contributors",
        "votes",
        "reports",
        "approved_entries",
    ]:
        assert isinstance(payload[key]["today"], int)
        assert isinstance(payload[key]["week"], int)
        assert isinstance(payload[key]["month"], int)

    assert "host_disk" in payload
    if payload["host_disk"] is not None:
        assert isinstance(payload["host_disk"]["path"], str)
        assert payload["host_disk"]["total_bytes"] >= 0
        assert payload["host_disk"]["used_bytes"] >= 0
        assert payload["host_disk"]["free_bytes"] >= 0
        assert 0 <= payload["host_disk"]["used_percent"] <= 100


@pytest.mark.asyncio
async def test_public_user_profile_endpoint(client):
    created = await register_user(client, "profile-user@example.com", "Profile User")
    user_id = created["id"]

    response = await client.get(f"/api/users/{user_id}")
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["id"] == user_id
    assert payload["profile"]["display_name"] == "Profile User"
    stats = payload["profile"]["stats"]
    assert stats["total_entries"] == 0
    assert stats["total_comments"] == 0
    assert stats["last_seen_at"] is not None
    assert stats["last_active_at"] is None
    assert stats["submitting_since_at"] is None


@pytest.mark.asyncio
async def test_public_user_profile_stats_include_contribution_counts(client):
    created = await register_user(client, "profile-stats@example.com", "Profile Stats")
    user_id = created["id"]
    entry = await create_entry(client, "profile-stats-entry")

    comment_response = await client.post(
        f"/api/entries/{entry['id']}/comments",
        json={"body": "Comentário para validar estatísticas do perfil."},
    )
    assert comment_response.status_code == 201, comment_response.text

    response = await client.get(f"/api/users/{user_id}")
    assert response.status_code == 200, response.text
    stats = response.json()["profile"]["stats"]
    assert stats["total_entries"] >= 1
    assert stats["total_comments"] >= 1
    assert stats["last_active_at"] is not None
    assert stats["submitting_since_at"] is not None


@pytest.mark.asyncio
async def test_update_my_profile_social_fields(client):
    created = await register_user(client, "profile-edit@example.com", "Profile Edit")
    user_id = created["id"]

    response = await client.patch(
        "/api/users/me/profile",
        json={
            "display_name": "  Profile Editado  ",
            "bio": "  Bio curta para teste.  ",
            "website_url": "  academiatupi.com  ",
            "instagram_handle": "  @academiatupi  ",
            "tiktok_handle": "  @academiatupi  ",
            "youtube_handle": "  @academiatupi  ",
            "bluesky_handle": "  academiatupi.com.br  ",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["display_name"] == "Profile Editado"
    assert payload["bio"] == "Bio curta para teste."
    assert payload["website_url"] == "academiatupi.com"
    assert payload["instagram_handle"] == "@academiatupi"
    assert payload["tiktok_handle"] == "@academiatupi"
    assert payload["youtube_handle"] == "@academiatupi"
    assert payload["bluesky_handle"] == "academiatupi.com.br"

    public_response = await client.get(f"/api/users/{user_id}")
    assert public_response.status_code == 200, public_response.text
    public_profile = public_response.json()["profile"]
    assert public_profile["website_url"] == "academiatupi.com"
    assert public_profile["instagram_handle"] == "@academiatupi"


@pytest.mark.asyncio
async def test_user_badges_include_founder_top_contributor_and_karma_leader(client):
    founder = await register_user(client, "kiansheik3128@gmail.com", "Kian Founder")
    founder_id = founder["id"]
    founder_uuid = uuid.UUID(founder_id)
    await create_entry(client, "badge-entry-one")
    await create_entry(client, "badge-entry-two")

    await client.post("/api/auth/logout")
    await register_user(client, "badge-other@example.com", "Badge Other")
    await create_entry(client, "badge-entry-three")

    async with db_module.AsyncSessionLocal() as session:
        founder_user = (await session.execute(select(User).where(User.id == founder_uuid))).scalar_one()
        founder_profile = (
            await session.execute(select(Profile).where(Profile.user_id == founder_user.id))
        ).scalar_one()
        founder_profile.reputation_score = 42
        await session.commit()

    profile_response = await client.get(f"/api/users/{founder_id}")
    assert profile_response.status_code == 200, profile_response.text
    profile_badges = profile_response.json()["profile"]["badges"]
    assert "founder" in profile_badges
    assert "top_contributor" in profile_badges
    assert "karma_leader" in profile_badges

    entries_response = await client.get("/api/entries", params={"proposer_user_id": founder_id})
    assert entries_response.status_code == 200, entries_response.text
    items = entries_response.json()["items"]
    assert len(items) >= 1
    assert "founder" in items[0]["proposer"]["badges"]


@pytest.mark.asyncio
async def test_comment_creation_notifies_entry_author_and_mentions(client):
    await register_user(client, "entry-owner@example.com", "Entry Owner")
    entry = await create_entry(client, "comment-thread-entry")

    await client.post("/api/auth/logout")
    mention_user = await register_user(client, "mention-user@example.com", "Mention Me")

    await client.post("/api/auth/logout")
    await register_user(client, "commenter@example.com", "Commenter")

    response = await client.post(
        f"/api/entries/{entry['id']}/comments",
        json={"body": "Comentando e chamando @mentionme para revisar."},
    )
    assert response.status_code == 201, response.text

    async with db_module.AsyncSessionLocal() as session:
        owner = (await session.execute(select(User).where(User.email == "entry-owner@example.com"))).scalar_one()
        mention_target = (
            await session.execute(select(User).where(User.id == uuid.UUID(mention_user["id"])))
        ).scalar_one()

        owner_notifications = (
            await session.execute(select(Notification).where(Notification.recipient_user_id == owner.id))
        ).scalars().all()
        mention_notifications = (
            await session.execute(select(Notification).where(Notification.recipient_user_id == mention_target.id))
        ).scalars().all()

    assert len(owner_notifications) == 1
    assert owner_notifications[0].kind == "entry_comment"
    assert len(mention_notifications) == 1
    assert mention_notifications[0].kind == "comment_mention"


@pytest.mark.asyncio
async def test_user_mentions_search_and_resolve(client):
    await register_user(client, "mosco@example.com", "Mosco Monteiro")
    await client.post("/api/auth/logout")
    await register_user(client, "marina@example.com", "Marina")

    suggestions_response = await client.get("/api/users/mentions", params={"q": "mosco"})
    assert suggestions_response.status_code == 200, suggestions_response.text
    suggestions = suggestions_response.json()
    assert len(suggestions) >= 1
    assert suggestions[0]["display_name"] == "Mosco Monteiro"
    assert suggestions[0]["mention_handle"] == "moscomonteiro"
    assert suggestions[0]["profile_url"].startswith("/profiles/")

    await client.post("/api/auth/logout")
    resolve_response = await client.post(
        "/api/users/mentions/resolve",
        json={"handles": ["@moscomonteiro", "missing_handle"]},
    )
    assert resolve_response.status_code == 200, resolve_response.text
    resolved = resolve_response.json()
    assert len(resolved) == 1
    assert resolved[0]["display_name"] == "Mosco Monteiro"
    assert resolved[0]["mention_handle"] == "moscomonteiro"


@pytest.mark.asyncio
async def test_comment_vote_updates_reputation(client):
    await register_user(client, "comment-author@example.com", "Comment Author")
    entry = await create_entry(client, "comment-vote-entry")

    comment_response = await client.post(
        f"/api/entries/{entry['id']}/comments",
        json={"body": "Comentário para votação."},
    )
    assert comment_response.status_code == 201, comment_response.text
    comment_id = comment_response.json()["id"]

    await client.post("/api/auth/logout")
    await register_user(client, "comment-voter@example.com", "Comment Voter")

    async with db_module.AsyncSessionLocal() as session:
        voter = (await session.execute(select(User).where(User.email == "comment-voter@example.com"))).scalar_one()
        voter.created_at = datetime.now(UTC) - timedelta(days=4)
        await session.commit()

    upvote = await client.post(f"/api/comments/{comment_id}/vote", json={"value": 1})
    assert upvote.status_code == 200, upvote.text

    downvote = await client.post(f"/api/comments/{comment_id}/vote", json={"value": -1})
    assert downvote.status_code == 200, downvote.text

    async with db_module.AsyncSessionLocal() as session:
        total_comment_votes = int(
            (
                await session.execute(select(func.count()).select_from(CommentVote))
            ).scalar_one()
        )
        assert total_comment_votes == 1

        vote = (await session.execute(select(CommentVote))).scalar_one()
        assert vote.value == -1

        author = (await session.execute(select(User).where(User.email == "comment-author@example.com"))).scalar_one()
        author_profile = (
            await session.execute(select(Profile).where(Profile.user_id == author.id))
        ).scalar_one()
        assert author_profile.reputation_score == -1


@pytest.mark.asyncio
async def test_notification_preferences_and_read_flow(client):
    created = await register_user(client, "notify-user@example.com", "Notify User")
    user_id = uuid.UUID(created["id"])

    initial_pref = await client.get("/api/users/me/notification-preferences")
    assert initial_pref.status_code == 200, initial_pref.text
    initial_payload = initial_pref.json()
    assert initial_payload["in_app_enabled"] is True
    assert initial_payload["email_enabled"] is True
    assert initial_payload["push_enabled"] is True
    assert initial_payload["notify_on_entry_comments"] is True
    assert initial_payload["notify_on_mentions"] is True

    update_pref = await client.patch(
        "/api/users/me/notification-preferences",
        json={
            "in_app_enabled": False,
            "email_enabled": False,
            "push_enabled": False,
            "notify_on_entry_comments": False,
            "notify_on_mentions": False,
        },
    )
    assert update_pref.status_code == 200, update_pref.text
    updated_payload = update_pref.json()
    assert updated_payload["in_app_enabled"] is False
    assert updated_payload["email_enabled"] is False
    assert updated_payload["push_enabled"] is False
    assert updated_payload["notify_on_entry_comments"] is False
    assert updated_payload["notify_on_mentions"] is False

    async with db_module.AsyncSessionLocal() as session:
        pref = (
            await session.execute(select(NotificationPreference).where(NotificationPreference.user_id == user_id))
        ).scalar_one()
        assert pref.in_app_enabled is False

        first_notification = Notification(
            recipient_user_id=user_id,
            actor_user_id=None,
            entry_id=None,
            comment_id=None,
            kind="entry_comment",
            title="Teste de notificação",
            body="Corpo de teste",
        )
        second_notification = Notification(
            recipient_user_id=user_id,
            actor_user_id=None,
            entry_id=None,
            comment_id=None,
            kind="entry_comment",
            title="Teste de notificação 2",
            body="Corpo de teste 2",
        )
        session.add(first_notification)
        session.add(second_notification)
        await session.commit()
        first_id = str(first_notification.id)

    list_response = await client.get("/api/users/me/notifications")
    assert list_response.status_code == 200, list_response.text
    list_payload = list_response.json()
    assert list_payload["total"] >= 2
    assert list_payload["unread_count"] >= 2

    read_one = await client.post(f"/api/users/me/notifications/{first_id}/read")
    assert read_one.status_code == 200, read_one.text
    assert read_one.json()["ok"] is True

    read_all = await client.post("/api/users/me/notifications/read-all")
    assert read_all.status_code == 200, read_all.text
    assert read_all.json()["ok"] is True

    async with db_module.AsyncSessionLocal() as session:
        unread_total = int(
            (
                await session.execute(
                    select(func.count())
                    .select_from(Notification)
                    .where(Notification.recipient_user_id == user_id)
                    .where(Notification.is_read.is_(False))
                )
            ).scalar_one()
        )
    assert unread_total == 0


@pytest.mark.asyncio
async def test_password_reset_for_verified_user(client, monkeypatch):
    sent_reset: dict[str, str] = {}

    async def fake_send_password_reset_email(*, to_email: str, token: str) -> None:
        sent_reset["email"] = to_email
        sent_reset["token"] = token

    async def fake_send_verification_email(*, to_email: str, token: str) -> None:
        del to_email, token
        raise AssertionError("Verification email should not be sent for verified users")

    monkeypatch.setattr(auth_routes, "send_password_reset_email", fake_send_password_reset_email)
    monkeypatch.setattr(auth_routes, "send_email_verification_email", fake_send_verification_email)

    await register_user(client, "recover-verified@example.com", "Recover Verified", password="oldpassword123")
    await client.post("/api/auth/logout")

    request_reset = await client.post(
        "/api/auth/request-password-reset",
        json={"email": "recover-verified@example.com"},
    )
    assert request_reset.status_code == 200, request_reset.text
    assert request_reset.json()["ok"] is True
    assert sent_reset["email"] == "recover-verified@example.com"
    assert sent_reset["token"]

    do_reset = await client.post(
        "/api/auth/reset-password",
        json={"token": sent_reset["token"], "new_password": "newpassword123"},
    )
    assert do_reset.status_code == 200, do_reset.text

    old_login = await client.post(
        "/api/auth/login",
        json={"email": "recover-verified@example.com", "password": "oldpassword123"},
    )
    assert old_login.status_code == 401, old_login.text

    new_login = await client.post(
        "/api/auth/login",
        json={"email": "recover-verified@example.com", "password": "newpassword123"},
    )
    assert new_login.status_code == 200, new_login.text


@pytest.mark.asyncio
async def test_unverified_user_gets_email_verification_before_reset(client, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_send_password_reset_email(*, to_email: str, token: str) -> None:
        captured["reset_email"] = to_email
        captured["reset_token"] = token

    async def fake_send_verification_email(*, to_email: str, token: str) -> None:
        captured["verify_email"] = to_email
        captured["verify_token"] = token

    monkeypatch.setattr(auth_routes, "send_password_reset_email", fake_send_password_reset_email)
    monkeypatch.setattr(auth_routes, "send_email_verification_email", fake_send_verification_email)

    async with db_module.AsyncSessionLocal() as session:
        user = User(
            email="recover-unverified@example.com",
            hashed_password=hash_password("temporary-password"),
            is_active=True,
            is_verified=False,
            is_superuser=False,
        )
        session.add(user)
        await session.flush()
        session.add(Profile(user_id=user.id, display_name="Recover Unverified"))
        await session.commit()

    request_reset = await client.post(
        "/api/auth/request-password-reset",
        json={"email": "recover-unverified@example.com"},
    )
    assert request_reset.status_code == 200, request_reset.text
    assert request_reset.json()["ok"] is True
    assert captured["verify_email"] == "recover-unverified@example.com"
    assert "verify_token" in captured
    assert "reset_token" not in captured

    invalid_direct_reset = await client.post(
        "/api/auth/reset-password",
        json={"token": captured["verify_token"], "new_password": "newpassword123"},
    )
    assert invalid_direct_reset.status_code == 400, invalid_direct_reset.text
    assert invalid_direct_reset.json()["error"]["code"] == "invalid_or_expired_token"

    verify_email = await client.post("/api/auth/verify-email", json={"token": captured["verify_token"]})
    assert verify_email.status_code == 200, verify_email.text
    assert verify_email.json()["ok"] is True
    assert captured["reset_email"] == "recover-unverified@example.com"
    assert captured["reset_token"]

    finish_reset = await client.post(
        "/api/auth/reset-password",
        json={"token": captured["reset_token"], "new_password": "newpassword123"},
    )
    assert finish_reset.status_code == 200, finish_reset.text

    login = await client.post(
        "/api/auth/login",
        json={"email": "recover-unverified@example.com", "password": "newpassword123"},
    )
    assert login.status_code == 200, login.text
