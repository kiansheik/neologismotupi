from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.bot_protection import get_bot_verifier
from app.core.deps import SessionDep, get_current_user
from app.core.errors import raise_api_error
from app.models.user import Profile, Session, User
from app.schemas.auth import (
    ActionAcceptedResponse,
    EmailVerificationConfirmRequest,
    LoginRequest,
    LogoutResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RegisterRequest,
    UserOut,
)
from app.security import (
    clear_auth_cookie,
    create_session,
    destroy_session,
    get_user_by_session_token,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.services.auth_tokens import (
    TOKEN_PURPOSE_EMAIL_VERIFICATION,
    TOKEN_PURPOSE_EMAIL_VERIFICATION_FOR_RESET,
    TOKEN_PURPOSE_PASSWORD_RESET,
    consume_email_action_token,
    create_email_action_token,
)
from app.services.email_delivery import send_email_verification_email, send_password_reset_email
from app.services.rate_limit import enforce_rate_limit
from app.services.user_badges import get_user_badge_leaders, resolve_user_badges

router = APIRouter(prefix="/auth", tags=["auth"])


def _serialize_user(user: User, *, badge_leaders) -> UserOut:
    payload = UserOut.model_validate(user)
    if payload.profile:
        payload.profile.badges = resolve_user_badges(user.id, badge_leaders)
    return payload


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

    if settings.require_verified_email and not user.is_verified:
        verification_token = await create_email_action_token(
            db,
            user_id=user.id,
            purpose=TOKEN_PURPOSE_EMAIL_VERIFICATION,
            ttl_minutes=settings.verification_token_ttl_minutes,
        )
        await send_email_verification_email(to_email=user.email, token=verification_token)
    else:
        raw_token = await create_session(db, user.id)
        set_auth_cookie(response, raw_token)
        request.state.auth_user_email = user.email
        request.state.auth_user_id = str(user.id)

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

    badge_leaders = await get_user_badge_leaders(db)
    return _serialize_user(hydrated_user, badge_leaders=badge_leaders)


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
    request.state.auth_user_email = user.email
    request.state.auth_user_id = str(user.id)
    badge_leaders = await get_user_badge_leaders(db)
    return _serialize_user(user, badge_leaders=badge_leaders)


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request, response: Response, db: SessionDep) -> LogoutResponse:
    cookie_name = get_settings().session_cookie_name
    raw_token = request.cookies.get(cookie_name)
    if raw_token:
        user = await get_user_by_session_token(db, raw_token)
        if user:
            request.state.auth_user_email = user.email
            request.state.auth_user_id = str(user.id)
        await destroy_session(db, raw_token)
        await db.commit()

    clear_auth_cookie(response)
    return LogoutResponse(ok=True)


@router.get("/me", response_model=UserOut)
async def me(
    user: Annotated[User, Depends(get_current_user)],
    db: SessionDep,
) -> UserOut:
    badge_leaders = await get_user_badge_leaders(db)
    return _serialize_user(user, badge_leaders=badge_leaders)


@router.post("/request-password-reset", response_model=ActionAcceptedResponse)
async def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: SessionDep,
) -> ActionAcceptedResponse:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="password_reset_request",
        scope_key=f"password_reset_request:{client_ip}:{payload.email.lower()}",
        limit=settings.password_reset_request_rate_limit_count,
        window_seconds=settings.password_reset_request_rate_limit_window_seconds,
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
    if user and user.is_active:
        if user.is_verified:
            token = await create_email_action_token(
                db,
                user_id=user.id,
                purpose=TOKEN_PURPOSE_PASSWORD_RESET,
                ttl_minutes=settings.password_reset_token_ttl_minutes,
            )
            await send_password_reset_email(to_email=user.email, token=token)
        else:
            token = await create_email_action_token(
                db,
                user_id=user.id,
                purpose=TOKEN_PURPOSE_EMAIL_VERIFICATION_FOR_RESET,
                ttl_minutes=settings.verification_token_ttl_minutes,
            )
            await send_email_verification_email(to_email=user.email, token=token)

        await db.commit()

    return ActionAcceptedResponse(ok=True)


@router.post("/verify-email", response_model=ActionAcceptedResponse)
async def verify_email(
    payload: EmailVerificationConfirmRequest,
    db: SessionDep,
) -> ActionAcceptedResponse:
    settings = get_settings()
    consumed = await consume_email_action_token(
        db,
        token=payload.token,
        allowed_purposes={
            TOKEN_PURPOSE_EMAIL_VERIFICATION,
            TOKEN_PURPOSE_EMAIL_VERIFICATION_FOR_RESET,
        },
    )
    if consumed is None:
        raise_api_error(
            status_code=400,
            code="invalid_or_expired_token",
            message="Verification token is invalid or expired",
        )

    user = consumed.user
    if not user.is_verified:
        user.is_verified = True

    if consumed.purpose == TOKEN_PURPOSE_EMAIL_VERIFICATION_FOR_RESET:
        reset_token = await create_email_action_token(
            db,
            user_id=user.id,
            purpose=TOKEN_PURPOSE_PASSWORD_RESET,
            ttl_minutes=settings.password_reset_token_ttl_minutes,
        )
        await send_password_reset_email(to_email=user.email, token=reset_token)

    await db.commit()
    return ActionAcceptedResponse(ok=True)


@router.post("/reset-password", response_model=ActionAcceptedResponse)
async def reset_password(
    payload: PasswordResetConfirmRequest,
    db: SessionDep,
) -> ActionAcceptedResponse:
    consumed = await consume_email_action_token(
        db,
        token=payload.token,
        allowed_purposes={TOKEN_PURPOSE_PASSWORD_RESET},
    )
    if consumed is None:
        raise_api_error(
            status_code=400,
            code="invalid_or_expired_token",
            message="Reset token is invalid or expired",
        )

    user = consumed.user
    if not user.is_verified:
        raise_api_error(
            status_code=403,
            code="email_not_verified",
            message="Email verification is required",
        )

    user.hashed_password = hash_password(payload.new_password)
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    return ActionAcceptedResponse(ok=True)
