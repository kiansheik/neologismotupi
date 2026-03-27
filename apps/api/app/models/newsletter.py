import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class NewsletterSubscription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "newsletter_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "newsletter_key", name="uq_newsletter_subscriptions_user_key"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    newsletter_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    preferred_locale: Mapped[str] = mapped_column(String(16), default="pt-BR", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    unsubscribe_token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="newsletter_subscriptions")


class NewsletterIssue(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "newsletter_issues"
    __table_args__ = (
        UniqueConstraint("newsletter_key", "issue_date", name="uq_newsletter_issues_key_date"),
    )

    newsletter_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entry = relationship("Entry")


class NewsletterDelivery(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "newsletter_deliveries"
    __table_args__ = (
        UniqueConstraint("issue_id", "user_id", name="uq_newsletter_deliveries_issue_user"),
    )

    issue_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("newsletter_issues.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), default="sent", nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="newsletter_deliveries")
    issue = relationship("NewsletterIssue")
