import uuid

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import SessionDep
from app.core.errors import raise_api_error
from app.models.user import User
from app.schemas.users import PublicUserOut

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

    return PublicUserOut.model_validate(user)

