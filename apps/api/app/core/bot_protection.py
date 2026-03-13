from typing import Protocol

from app.config import get_settings


class BotVerificationAdapter(Protocol):
    async def verify(self, token: str | None, remote_ip: str | None = None) -> bool:
        ...


class NoOpBotVerifier:
    async def verify(self, token: str | None, remote_ip: str | None = None) -> bool:
        del token, remote_ip
        return True


class TurnstileVerifier:
    """
    Placeholder implementation.

    For MVP we keep this interface so production Turnstile verification can be plugged in
    without changing route code.
    """

    async def verify(self, token: str | None, remote_ip: str | None = None) -> bool:
        del token, remote_ip
        return False


def get_bot_verifier() -> BotVerificationAdapter:
    settings = get_settings()
    if settings.turnstile_enabled:
        return TurnstileVerifier()
    return NoOpBotVerifier()
