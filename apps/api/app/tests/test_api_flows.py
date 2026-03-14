from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

import app.api.routes.auth as auth_routes
import app.db as db_module
from app.core.enums import TagType
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
async def test_rejected_entries_only_show_with_rejected_filter(client):
    owner = await register_user(client, "hidden-owner@example.com", "Hidden Owner")
    entry = await create_entry(client, "hidden-rejected-entry")

    await client.post("/api/auth/logout")
    await register_user(client, "hidden-mod@example.com", "Hidden Mod")

    async with db_module.AsyncSessionLocal() as session:
        moderator = (await session.execute(select(User).where(User.email == "hidden-mod@example.com"))).scalar_one()
        moderator.is_superuser = True
        await session.commit()

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
async def test_add_example(client):
    await register_user(client, "example-owner@example.com", "Example Owner")
    entry = await create_entry(client, "example-entry")

    response = await client.post(
        f"/api/entries/{entry['id']}/examples",
        json={
            "sentence_original": "A fake sentence for tests.",
            "translation_pt": "Uma frase falsa de teste.",
            "translation_en": "A fake test sentence.",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending"


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
    assert response.json()["status"] == "approved"


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


@pytest.mark.asyncio
async def test_public_user_profile_endpoint(client):
    created = await register_user(client, "profile-user@example.com", "Profile User")
    user_id = created["id"]

    response = await client.get(f"/api/users/{user_id}")
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["id"] == user_id
    assert payload["profile"]["display_name"] == "Profile User"


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
