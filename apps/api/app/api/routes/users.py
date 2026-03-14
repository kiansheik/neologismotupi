import uuid

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import SessionDep
from app.core.errors import raise_api_error
from app.models.user import User
from app.schemas.users import PublicProfileOut, PublicUserOut
from app.services.user_badges import get_user_badge_leaders, resolve_user_badges

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=PublicUserOut)
async def get_user_profile(user_id: uuid.UUID, db: SessionDep) -> PublicUserOut:
    user = (
        await db.execute(
            select(User).where(User.id == user_id).options(selectinload(User.profile))
        )
    ).scalar_one_or_none()
    if not user or not user.profile:
        raise_api_error(status_code=404, code="user_not_found", message="User not found")

    badge_leaders = await get_user_badge_leaders(db)
    profile_out = PublicProfileOut.model_validate(user.profile)
    profile_out.badges = resolve_user_badges(user.id, badge_leaders)
    return PublicUserOut(id=user.id, created_at=user.created_at, profile=profile_out)
