import asyncio
import json
from typing import Protocol
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import get_settings


class BotVerificationAdapter(Protocol):
    async def verify(self, token: str | None, remote_ip: str | None = None) -> bool:
        ...


class NoOpBotVerifier:
    async def verify(self, token: str | None, remote_ip: str | None = None) -> bool:
        del token, remote_ip
        return True


class TurnstileVerifier:
    verify_url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

    async def verify(self, token: str | None, remote_ip: str | None = None) -> bool:
        settings = get_settings()
        secret_key = settings.turnstile_secret_key
        if not token or not secret_key:
            return False

        payload: dict[str, str] = {"secret": secret_key, "response": token}
        if remote_ip:
            payload["remoteip"] = remote_ip

        encoded = urlencode(payload).encode("utf-8")
        request = Request(
            self.verify_url,
            data=encoded,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        def _verify_sync() -> bool:
            try:
                with urlopen(request, timeout=10) as response:  # noqa: S310
                    data = json.loads(response.read().decode("utf-8"))
                return bool(data.get("success"))
            except Exception:
                return False

        return await asyncio.to_thread(_verify_sync)


def get_bot_verifier() -> BotVerificationAdapter:
    settings = get_settings()
    if settings.turnstile_enabled:
        return TurnstileVerifier()
    return NoOpBotVerifier()
