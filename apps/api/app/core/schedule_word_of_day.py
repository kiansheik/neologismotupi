import asyncio
import os
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.send_word_of_day import _send_word_of_day
from app.db import AsyncSessionLocal


def _parse_time(value: str) -> time:
    parts = value.strip().split(":")
    if len(parts) not in {2, 3}:
        raise ValueError("NEWSLETTER_WORD_OF_DAY_TIME must be HH:MM or HH:MM:SS")
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = int(parts[2]) if len(parts) == 3 else 0
    return time(hour=hours, minute=minutes, second=seconds)


def _resolve_timezone(name: str):
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        print(f"[newsletter] timezone '{name}' not found, falling back to UTC-03:00")
        return timezone(timedelta(hours=-3))


async def _send_for_date(issue_date):
    async with AsyncSessionLocal() as db:
        await _send_word_of_day(db, issue_date=issue_date, dry_run=False, target_email=None)


async def main() -> None:
    enabled_flag = os.getenv("NEWSLETTER_WORD_OF_DAY_ENABLED", "false").strip().lower()
    app_env = os.getenv("APP_ENV", "").strip().lower()
    enabled = enabled_flag in {"1", "true", "yes", "on"}

    if not enabled or app_env != "production":
        print(
            "[newsletter] scheduler disabled "
            f"(NEWSLETTER_WORD_OF_DAY_ENABLED={enabled_flag}, APP_ENV={app_env or 'unset'})"
        )
        # Stay idle so the container doesn't crash-loop.
        while True:
            await asyncio.sleep(3600)

    tz_name = os.getenv("NEWSLETTER_WORD_OF_DAY_TZ", "America/Sao_Paulo")
    time_value = os.getenv("NEWSLETTER_WORD_OF_DAY_TIME", "10:00")
    retry_seconds = int(os.getenv("NEWSLETTER_WORD_OF_DAY_RETRY_SECONDS", "300"))

    run_time = _parse_time(time_value)
    tz = _resolve_timezone(tz_name)
    last_sent_date = None

    print(f"[newsletter] scheduling Palavra do Dia at {time_value} {tz_name}")

    while True:
        now = datetime.now(tz)
        scheduled_today = now.replace(
            hour=run_time.hour,
            minute=run_time.minute,
            second=run_time.second,
            microsecond=0,
        )

        if now >= scheduled_today and last_sent_date != now.date():
            try:
                print(f"[newsletter] sending Palavra do Dia for {now.date().isoformat()}")
                await _send_for_date(now.date())
                last_sent_date = now.date()
                print("[newsletter] send complete")
            except Exception as exc:  # noqa: BLE001
                print(f"[newsletter] send failed: {exc}")
                await asyncio.sleep(max(retry_seconds, 30))
                continue

        if now < scheduled_today:
            next_run = scheduled_today
        else:
            next_run = scheduled_today + timedelta(days=1)

        sleep_seconds = max((next_run - now).total_seconds(), 30)
        print(f"[newsletter] next run at {next_run.isoformat()}")
        await asyncio.sleep(sleep_seconds)


if __name__ == "__main__":
    asyncio.run(main())
