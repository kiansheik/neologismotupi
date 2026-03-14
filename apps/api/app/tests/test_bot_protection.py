import json
from urllib.parse import parse_qs

import pytest

from app.core import bot_protection


class _Settings:
    def __init__(
        self,
        turnstile_enabled: bool,
        turnstile_secret_key: str | None,
        turnstile_include_remote_ip: bool = False,
    ):
        self.turnstile_enabled = turnstile_enabled
        self.turnstile_secret_key = turnstile_secret_key
        self.turnstile_include_remote_ip = turnstile_include_remote_ip


@pytest.mark.asyncio
async def test_get_bot_verifier_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(
        bot_protection,
        "get_settings",
        lambda: _Settings(turnstile_enabled=False, turnstile_secret_key=None),
    )

    verifier = bot_protection.get_bot_verifier()
    assert isinstance(verifier, bot_protection.NoOpBotVerifier)
    assert await verifier.verify(None, "127.0.0.1") is True


@pytest.mark.asyncio
async def test_turnstile_verifier_true_on_success_response(monkeypatch):
    monkeypatch.setattr(
        bot_protection,
        "get_settings",
        lambda: _Settings(turnstile_enabled=True, turnstile_secret_key="secret"),
    )

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps({"success": True}).encode("utf-8")

    monkeypatch.setattr(bot_protection, "urlopen", lambda *args, **kwargs: FakeResponse())

    verifier = bot_protection.TurnstileVerifier()
    assert await verifier.verify("token-123", "127.0.0.1") is True


@pytest.mark.asyncio
async def test_turnstile_verifier_false_without_token(monkeypatch):
    monkeypatch.setattr(
        bot_protection,
        "get_settings",
        lambda: _Settings(turnstile_enabled=True, turnstile_secret_key="secret"),
    )

    verifier = bot_protection.TurnstileVerifier()
    assert await verifier.verify(None, "127.0.0.1") is False


@pytest.mark.asyncio
async def test_turnstile_verifier_omits_remote_ip_by_default(monkeypatch):
    monkeypatch.setattr(
        bot_protection,
        "get_settings",
        lambda: _Settings(turnstile_enabled=True, turnstile_secret_key="secret"),
    )

    seen_payload: dict[str, list[str]] = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps({"success": True}).encode("utf-8")

    def fake_urlopen(request, *args, **kwargs):
        nonlocal seen_payload
        raw = request.data.decode("utf-8") if request.data else ""
        seen_payload = parse_qs(raw)
        return FakeResponse()

    monkeypatch.setattr(bot_protection, "urlopen", fake_urlopen)

    verifier = bot_protection.TurnstileVerifier()
    assert await verifier.verify("token-123", "127.0.0.1") is True
    assert "remoteip" not in seen_payload


@pytest.mark.asyncio
async def test_turnstile_verifier_includes_remote_ip_when_enabled(monkeypatch):
    monkeypatch.setattr(
        bot_protection,
        "get_settings",
        lambda: _Settings(
            turnstile_enabled=True,
            turnstile_secret_key="secret",
            turnstile_include_remote_ip=True,
        ),
    )

    seen_payload: dict[str, list[str]] = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps({"success": True}).encode("utf-8")

    def fake_urlopen(request, *args, **kwargs):
        nonlocal seen_payload
        raw = request.data.decode("utf-8") if request.data else ""
        seen_payload = parse_qs(raw)
        return FakeResponse()

    monkeypatch.setattr(bot_protection, "urlopen", fake_urlopen)

    verifier = bot_protection.TurnstileVerifier()
    assert await verifier.verify("token-123", "127.0.0.1") is True
    assert seen_payload.get("remoteip") == ["127.0.0.1"]
