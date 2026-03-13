import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=120)
    turnstile_token: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    turnstile_token: str | None = None


class ProfileOut(BaseModel):
    id: uuid.UUID
    display_name: str
    bio: str | None
    affiliation_label: str | None
    role_label: str | None
    reputation_score: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    is_active: bool
    is_verified: bool
    is_superuser: bool
    created_at: datetime
    updated_at: datetime
    profile: ProfileOut | None

    model_config = {"from_attributes": True}


class LogoutResponse(BaseModel):
    ok: bool
