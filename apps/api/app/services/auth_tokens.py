from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import EmailActionToken, User
from app.security import generate_email_action_token, hash_email_action_token

TOKEN_PURPOSE_EMAIL_VERIFICATION = "email_verification"
TOKEN_PURPOSE_EMAIL_VERIFICATION_FOR_RESET = "email_verification_for_reset"
TOKEN_PURPOSE_PASSWORD_RESET = "password_reset"


@dataclass
class ConsumedTokenResult:
    user: User
    purpose: str


async def create_email_action_token(
    db: AsyncSession,
    *,
    user_id,
    purpose: str,
    ttl_minutes: int,
) -> str:
    now = datetime.now(UTC)
    token = generate_email_action_token()
    token_hash = hash_email_action_token(token)

    await db.execute(
        update(EmailActionToken)
        .where(
            and_(
                EmailActionToken.user_id == user_id,
                EmailActionToken.purpose == purpose,
                EmailActionToken.consumed_at.is_(None),
            )
        )
        .values(consumed_at=now)
    )

    db.add(
        EmailActionToken(
            user_id=user_id,
            token_hash=token_hash,
            purpose=purpose,
            expires_at=now + timedelta(minutes=ttl_minutes),
            consumed_at=None,
            created_at=now,
        )
    )
    await db.flush()
    return token


async def consume_email_action_token(
    db: AsyncSession,
    *,
    token: str,
    allowed_purposes: set[str],
) -> ConsumedTokenResult | None:
    now = datetime.now(UTC)
    token_hash = hash_email_action_token(token)

    stmt = (
        select(EmailActionToken, User)
        .join(User, User.id == EmailActionToken.user_id)
        .where(EmailActionToken.token_hash == token_hash)
        .where(EmailActionToken.purpose.in_(allowed_purposes))
        .where(EmailActionToken.consumed_at.is_(None))
        .where(EmailActionToken.expires_at > now)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None

    token_row, user = row
    token_row.consumed_at = now
    await db.flush()

    return ConsumedTokenResult(user=user, purpose=token_row.purpose)
