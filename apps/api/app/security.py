import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from passlib.context import CryptContext
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.user import Session, User

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    secret_key = get_settings().secret_key
    return hashlib.sha256(f"{token}:{secret_key}".encode("utf-8")).hexdigest()


async def create_session(db: AsyncSession, user_id) -> str:
    now = datetime.now(UTC)
    expires_at = now + timedelta(hours=get_settings().session_ttl_hours)
    token = generate_session_token()
    token_hash = hash_session_token(token)
    session = Session(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        created_at=now,
        last_seen_at=now,
    )
    db.add(session)
    await db.flush()
    return token


async def destroy_session(db: AsyncSession, raw_token: str) -> None:
    token_hash = hash_session_token(raw_token)
    await db.execute(delete(Session).where(Session.token_hash == token_hash))


async def get_user_by_session_token(db: AsyncSession, raw_token: str) -> User | None:
    token_hash = hash_session_token(raw_token)
    now = datetime.now(UTC)

    stmt = (
        select(User, Session)
        .options(selectinload(User.profile))
        .join(Session, Session.user_id == User.id)
        .where(Session.token_hash == token_hash)
        .where(Session.expires_at > now)
        .where(User.is_active.is_(True))
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None

    user, session = row
    session.last_seen_at = now
    await db.flush()
    return user


def set_auth_cookie(response, token: str) -> None:
    settings = get_settings()
    secure = settings.app_env == "production"
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.session_ttl_hours * 60 * 60,
        path="/",
    )


def clear_auth_cookie(response) -> None:
    response.delete_cookie(key=get_settings().session_cookie_name, path="/")
