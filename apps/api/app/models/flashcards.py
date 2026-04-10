import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    FlashcardCardType,
    FlashcardDirection,
    FlashcardGrade,
    FlashcardQueue,
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
        CheckConstraint(
            "desired_retention BETWEEN 0.7 AND 0.99",
            name="ck_flashcard_settings_desired_retention",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    new_cards_per_day: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    desired_retention: Mapped[float] = mapped_column(Float, default=0.9, nullable=False)
    learning_steps_minutes: Mapped[list[int]] = mapped_column(
        JSON, default=lambda: [1, 10], nullable=False
    )
    relearning_steps_minutes: Mapped[list[int]] = mapped_column(
        JSON, default=lambda: [10], nullable=False
    )
    bury_siblings: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_reviews_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fsrs_params: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    fsrs_params_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    historical_retention: Mapped[float] = mapped_column(Float, default=0.9, nullable=False)
    advanced_grading_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


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
    card_type: Mapped[FlashcardCardType] = mapped_column(
        "state",
        Enum(FlashcardCardType, native_enum=False),
        default=FlashcardCardType.new,
        nullable=False,
    )
    queue: Mapped[FlashcardQueue] = mapped_column(
        Enum(FlashcardQueue, native_enum=False), default=FlashcardQueue.new, nullable=False
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scheduled_days: Mapped[int] = mapped_column("interval_days", Integer, default=0, nullable=False)
    learning_step_index: Mapped[int] = mapped_column("step_index", Integer, default=0, nullable=False)
    remaining_steps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lapses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    last_review_at: Mapped[datetime | None] = mapped_column(
        "last_seen_at", DateTime(timezone=True), nullable=True
    )
    memory_stability: Mapped[float | None] = mapped_column(Float, nullable=True)
    memory_difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_result: Mapped[FlashcardGrade | None] = mapped_column(
        Enum(FlashcardGrade, native_enum=False), nullable=True
    )
    last_response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class FlashcardReviewLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "flashcard_review_log"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("flashcard_study_session.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[FlashcardDirection] = mapped_column(
        Enum(FlashcardDirection, native_enum=False), nullable=False
    )
    grade: Mapped[FlashcardGrade] = mapped_column(
        "result", Enum(FlashcardGrade, native_enum=False), nullable=False
    )
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    card_type_before: Mapped[FlashcardCardType] = mapped_column(
        "state_before", Enum(FlashcardCardType, native_enum=False), nullable=False
    )
    card_type_after: Mapped[FlashcardCardType] = mapped_column(
        "state_after", Enum(FlashcardCardType, native_enum=False), nullable=False
    )
    scheduled_days_before: Mapped[int] = mapped_column(
        "interval_before", Integer, default=0, nullable=False
    )
    scheduled_days_after: Mapped[int] = mapped_column(
        "interval_after", Integer, default=0, nullable=False
    )
    memory_stability_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    memory_stability_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    memory_difficulty_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    memory_difficulty_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    user_response: Mapped[str | None] = mapped_column(Text, nullable=True)


class FlashcardStudySession(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_study_session"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FlashcardDailyIntake(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_daily_intake"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "study_date",
            name="uq_flashcard_daily_intake_user_date",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    study_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    base_new_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    continue_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


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
    queue_type: Mapped[FlashcardQueue] = mapped_column(
        Enum(FlashcardQueue, native_enum=False), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FlashcardList(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_list"

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title_pt: Mapped[str] = mapped_column(String(140), nullable=False)
    title_en: Mapped[str | None] = mapped_column(String(140), nullable=True)
    description_pt: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    theme_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    score_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    upvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    item_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class FlashcardListItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_list_item"
    __table_args__ = (
        UniqueConstraint("list_id", "entry_id", name="uq_flashcard_list_item_list_entry"),
    )

    list_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("flashcard_list.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class FlashcardListVote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_list_vote"
    __table_args__ = (
        UniqueConstraint("list_id", "user_id", name="uq_flashcard_list_vote_user_list"),
    )

    list_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("flashcard_list.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False)


class FlashcardListComment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_list_comment"

    list_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("flashcard_list.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)


class FlashcardReminder(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_reminders"
    __table_args__ = (
        UniqueConstraint("user_id", "remind_at", name="uq_flashcard_reminder_user_time"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("flashcard_study_session.id", ondelete="SET NULL"), nullable=True
    )
    time_zone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    remind_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class FlashcardSessionSegment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "flashcard_session_segments"
    __table_args__ = (
        UniqueConstraint("session_id", "started_at", name="uq_flashcard_segment_session_start"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("flashcard_study_session.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
