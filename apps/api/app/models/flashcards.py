import uuid
from datetime import datetime, date

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    FlashcardDirection,
    FlashcardQueueType,
    FlashcardReviewResult,
    FlashcardState,
)
from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class FlashcardSettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_settings"
    __table_args__ = (
        CheckConstraint(
            "new_cards_per_day BETWEEN 3 AND 20",
            name="ck_flashcard_settings_new_cards_per_day",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    new_cards_per_day: Mapped[int] = mapped_column(Integer, default=3, nullable=False)


class FlashcardProgress(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_progress"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "entry_id", "direction", name="uq_flashcard_progress_user_entry_direction"
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[FlashcardDirection] = mapped_column(
        Enum(FlashcardDirection, native_enum=False), nullable=False
    )
    state: Mapped[FlashcardState] = mapped_column(
        Enum(FlashcardState, native_enum=False), default=FlashcardState.new, nullable=False
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    interval_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    step_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lapses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_result: Mapped[FlashcardReviewResult | None] = mapped_column(
        Enum(FlashcardReviewResult, native_enum=False), nullable=True
    )
    last_response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class FlashcardReviewLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "flashcard_review_log"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[FlashcardDirection] = mapped_column(
        Enum(FlashcardDirection, native_enum=False), nullable=False
    )
    result: Mapped[FlashcardReviewResult] = mapped_column(
        Enum(FlashcardReviewResult, native_enum=False), nullable=False
    )
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    state_before: Mapped[FlashcardState] = mapped_column(
        Enum(FlashcardState, native_enum=False), nullable=False
    )
    state_after: Mapped[FlashcardState] = mapped_column(
        Enum(FlashcardState, native_enum=False), nullable=False
    )
    interval_before: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    interval_after: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class FlashcardDailyPlan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_daily_plan"
    __table_args__ = (
        UniqueConstraint("user_id", "plan_date", "position", name="uq_flashcard_plan_user_date_position"),
        UniqueConstraint(
            "user_id",
            "plan_date",
            "entry_id",
            "direction",
            name="uq_flashcard_plan_user_date_card",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[FlashcardDirection] = mapped_column(
        Enum(FlashcardDirection, native_enum=False), nullable=False
    )
    queue_type: Mapped[FlashcardQueueType] = mapped_column(
        Enum(FlashcardQueueType, native_enum=False), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
