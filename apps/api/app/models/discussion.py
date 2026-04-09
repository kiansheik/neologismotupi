import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class EntryComment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "entry_comments"

    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    parent_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("entry_comments.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    upvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    entry = relationship("Entry", back_populates="comments")
    author = relationship("User", back_populates="comments")
    parent_comment = relationship("EntryComment", remote_side="EntryComment.id")
    votes: Mapped[list["CommentVote"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan"
    )
    versions: Mapped[list["EntryCommentVersion"]] = relationship(
        back_populates="comment",
        cascade="all, delete-orphan",
        order_by="EntryCommentVersion.version_number",
    )


class CommentVote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "comment_votes"
    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", name="uq_comment_votes_comment_id_user_id"),
        CheckConstraint("value IN (-1, 1)", name="value_in_range"),
    )

    comment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entry_comments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True, nullable=False)
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    comment: Mapped[EntryComment] = relationship(back_populates="votes")


class EntryCommentVersion(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "entry_comment_versions"
    __table_args__ = (
        UniqueConstraint(
            "comment_id",
            "version_number",
            name="uq_entry_comment_versions_comment_id_version_number",
        ),
    )

    comment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entry_comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    edited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    comment: Mapped[EntryComment] = relationship(back_populates="versions")


class NotificationPreference(Base, TimestampMixin):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notify_on_entry_comments: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notify_on_mentions: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user = relationship("User", back_populates="notification_preferences")


class Notification(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "notifications"

    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True)
    entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), index=True, nullable=True
    )
    comment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("entry_comments.id", ondelete="CASCADE"), index=True, nullable=True
    )
    kind: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    recipient = relationship(
        "User", foreign_keys=[recipient_user_id], back_populates="received_notifications"
    )
    actor = relationship("User", foreign_keys=[actor_user_id])
    entry = relationship("Entry")
    comment = relationship("EntryComment")
