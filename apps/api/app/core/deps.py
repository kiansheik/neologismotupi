from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_api_error
from app.core.permissions import is_moderator
from app.db import get_db
from app.models.user import User
from app.security import get_user_by_session_token

SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user_optional(request: Request, db: SessionDep) -> User | None:
    cookie_name = get_settings().session_cookie_name
    raw_token = request.cookies.get(cookie_name)
    if not raw_token:
        return None
    user = await get_user_by_session_token(db, raw_token)
    if user:
        request.state.auth_user_email = user.email
        request.state.auth_user_id = str(user.id)
    return user


async def get_current_user(request: Request, db: SessionDep) -> User:
    user = await get_current_user_optional(request, db)
    if not user:
        raise_api_error(status_code=401, code="unauthenticated", message="Authentication required")
    return user


async def require_moderator(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not is_moderator(user):
        raise_api_error(status_code=403, code="forbidden", message="Moderator permissions required")
    return user
