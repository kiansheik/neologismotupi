import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.badges import UserBadgeKind


class PublicProfileOut(BaseModel):
    id: uuid.UUID
    display_name: str
    bio: str | None
    affiliation_label: str | None
    role_label: str | None
    reputation_score: int
    badges: list[UserBadgeKind] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicUserOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    profile: PublicProfileOut

    model_config = {"from_attributes": True}
