from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_api_error
from app.models.moderation import RateLimitEvent


async def enforce_rate_limit(
    db: AsyncSession,
    *,
    action: str,
    scope_key: str,
    limit: int,
    window_seconds: int,
) -> None:
    now = datetime.now(UTC)
    window_start = now - timedelta(seconds=window_seconds)

    stmt = (
        select(func.count())
        .select_from(RateLimitEvent)
        .where(RateLimitEvent.action == action)
        .where(RateLimitEvent.scope_key == scope_key)
        .where(RateLimitEvent.created_at >= window_start)
    )
    count = int((await db.execute(stmt)).scalar_one())
    if count >= limit:
        raise_api_error(
            status_code=429,
            code="rate_limited",
            message="Too many requests for this action",
            details={"action": action, "limit": limit, "window_seconds": window_seconds},
        )

    db.add(RateLimitEvent(action=action, scope_key=scope_key))
    await db.commit()
