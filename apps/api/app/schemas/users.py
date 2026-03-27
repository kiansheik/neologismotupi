import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.badges import UserBadgeKind


class PublicProfileStatsOut(BaseModel):
    total_entries: int = 0
    total_comments: int = 0
    total_audio: int = 0
    last_seen_at: datetime | None = None
    last_active_at: datetime | None = None
    submitting_since_at: datetime | None = None


class PublicProfileOut(BaseModel):
    id: uuid.UUID
    display_name: str
    bio: str | None
    affiliation_label: str | None
    role_label: str | None
    website_url: str | None
    instagram_handle: str | None
    tiktok_handle: str | None
    youtube_handle: str | None
    bluesky_handle: str | None
    reputation_score: int
    badges: list[UserBadgeKind] = Field(default_factory=list)
    stats: PublicProfileStatsOut = Field(default_factory=PublicProfileStatsOut)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicUserOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    profile: PublicProfileOut

    model_config = {"from_attributes": True}


class MentionUserOut(BaseModel):
    id: uuid.UUID
    display_name: str
    mention_handle: str
    profile_url: str


class MentionResolveRequest(BaseModel):
    handles: list[str] = Field(default_factory=list, max_length=50)


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = Field(default=None, max_length=500)
    affiliation_label: str | None = Field(default=None, max_length=120)
    role_label: str | None = Field(default=None, max_length=120)
    website_url: str | None = Field(default=None, max_length=500)
    instagram_handle: str | None = Field(default=None, max_length=120)
    tiktok_handle: str | None = Field(default=None, max_length=120)
    youtube_handle: str | None = Field(default=None, max_length=120)
    bluesky_handle: str | None = Field(default=None, max_length=253)


class UserPreferencesOut(BaseModel):
    preferred_locale: str

    model_config = {"from_attributes": True}


class UserPreferencesUpdate(BaseModel):
    preferred_locale: str | None = Field(default=None, max_length=16)
