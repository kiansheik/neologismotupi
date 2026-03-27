import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.discussion import EntryComment, Notification, NotificationPreference
    from app.models.newsletter import NewsletterDelivery, NewsletterSubscription


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preferred_locale: Mapped[str] = mapped_column(String(16), default="pt-BR", nullable=False)

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)
    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    email_action_tokens: Mapped[list["EmailActionToken"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    comments: Mapped[list["EntryComment"]] = relationship(
        back_populates="author",
        cascade="all, delete-orphan",
    )
    notification_preferences: Mapped["NotificationPreference | None"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    received_notifications: Mapped[list["Notification"]] = relationship(
        back_populates="recipient",
        foreign_keys="Notification.recipient_user_id",
        cascade="all, delete-orphan",
    )
    newsletter_subscriptions: Mapped[list["NewsletterSubscription"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    newsletter_deliveries: Mapped[list["NewsletterDelivery"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Profile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    bio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    affiliation_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    instagram_handle: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tiktok_handle: Mapped[str | None] = mapped_column(String(120), nullable=True)
    youtube_handle: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bluesky_handle: Mapped[str | None] = mapped_column(String(253), nullable=True)
    reputation_score: Mapped[int] = mapped_column(default=0, nullable=False)

    user: Mapped[User] = relationship(back_populates="profile")


class Session(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")


class EmailActionToken(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "email_action_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    purpose: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship(back_populates="email_action_tokens")
