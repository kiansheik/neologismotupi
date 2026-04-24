import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ReviewParticipationEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "review_participation_events"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "source_key",
            name="uq_review_participation_events_user_source_key",
        ),
        Index("ix_review_participation_events_user_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    action_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    source_key: Mapped[str] = mapped_column(String(180), nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
