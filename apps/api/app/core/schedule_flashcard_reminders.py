import asyncio
import os
from datetime import datetime, timezone

from app.db import AsyncSessionLocal
from app.services.flashcards import send_due_flashcard_reminders


async def _send_due() -> int:
    async with AsyncSessionLocal() as db:
        return await send_due_flashcard_reminders(db)


async def main() -> None:
    enabled_flag = os.getenv("FLASHCARD_REMINDER_ENABLED", "false").strip().lower()
    app_env = os.getenv("APP_ENV", "").strip().lower()
    enabled = enabled_flag in {"1", "true", "yes", "on"}

    if not enabled or app_env != "production":
        print(
            "[flashcards] reminder scheduler disabled "
            f"(FLASHCARD_REMINDER_ENABLED={enabled_flag}, APP_ENV={app_env or 'unset'})"
        )
        while True:
            await asyncio.sleep(3600)

    poll_seconds = int(os.getenv("FLASHCARD_REMINDER_POLL_SECONDS", "60"))
    print("[flashcards] reminder scheduler started")

    while True:
        now = datetime.now(timezone.utc)
        try:
            sent = await _send_due()
            if sent:
                print(f"[flashcards] sent {sent} reminder(s) at {now.isoformat()}")
        except Exception as exc:  # noqa: BLE001
            print(f"[flashcards] reminder send failed: {exc}")
        await asyncio.sleep(max(poll_seconds, 30))


if __name__ == "__main__":
    asyncio.run(main())
