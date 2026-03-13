from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.bot_protection import get_bot_verifier
from app.core.deps import SessionDep, get_current_user
from app.core.errors import raise_api_error
from app.models.user import Profile, User
from app.schemas.auth import LoginRequest, LogoutResponse, RegisterRequest, UserOut
from app.security import (
    clear_auth_cookie,
    create_session,
    destroy_session,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.services.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: SessionDep,
) -> UserOut:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="signup",
        scope_key=f"signup:{client_ip}",
        limit=settings.signup_rate_limit_count,
        window_seconds=settings.signup_rate_limit_window_seconds,
    )

    verifier = get_bot_verifier()
    is_human = await verifier.verify(payload.turnstile_token, client_ip)
    if not is_human:
        raise_api_error(status_code=400, code="bot_check_failed", message="Bot verification failed")

    existing = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if existing:
        raise_api_error(status_code=409, code="email_in_use", message="Email already registered")

    user_count = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
    is_admin = settings.first_user_is_admin and user_count == 0

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_verified=not settings.require_verified_email,
        is_superuser=is_admin,
    )
    db.add(user)
    await db.flush()

    profile = Profile(user_id=user.id, display_name=payload.display_name)
    db.add(profile)

    raw_token = await create_session(db, user.id)
    await db.commit()

    hydrated_user = (
        await db.execute(
            select(User)
            .where(User.id == user.id)
            .join(Profile, isouter=True)
            .options(selectinload(User.profile))
        )
    ).scalars().first()
    if not hydrated_user:
        raise_api_error(status_code=500, code="registration_failed", message="Unable to load user")

    set_auth_cookie(response, raw_token)
    return UserOut.model_validate(hydrated_user)


@router.post("/login", response_model=UserOut)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: SessionDep,
) -> UserOut:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="login",
        scope_key=f"login:{client_ip}:{payload.email.lower()}",
        limit=settings.login_rate_limit_count,
        window_seconds=settings.login_rate_limit_window_seconds,
    )

    verifier = get_bot_verifier()
    is_human = await verifier.verify(payload.turnstile_token, client_ip)
    if not is_human:
        raise_api_error(status_code=400, code="bot_check_failed", message="Bot verification failed")

    user = (
        await db.execute(
            select(User).where(User.email == payload.email).options(selectinload(User.profile))
        )
    ).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise_api_error(
            status_code=401,
            code="invalid_credentials",
            message="Invalid email or password",
        )

    if settings.require_verified_email and not user.is_verified:
        raise_api_error(
            status_code=403,
            code="email_not_verified",
            message="Email verification is required",
        )

    raw_token = await create_session(db, user.id)
    await db.commit()

    set_auth_cookie(response, raw_token)
    return UserOut.model_validate(user)


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request, response: Response, db: SessionDep) -> LogoutResponse:
    cookie_name = get_settings().session_cookie_name
    raw_token = request.cookies.get(cookie_name)
    if raw_token:
        await destroy_session(db, raw_token)
        await db.commit()

    clear_auth_cookie(response)
    return LogoutResponse(ok=True)


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return UserOut.model_validate(user)
