import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AudioSample(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "audio_samples"
    __table_args__ = (
        CheckConstraint(
            "(entry_id IS NOT NULL) <> (example_id IS NOT NULL)",
            name="audio_samples_target_one",
        ),
    )

    entry_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), index=True, nullable=True
    )
    example_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("examples.id", ondelete="CASCADE"), index=True, nullable=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    upvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    entry = relationship("Entry", back_populates="audio_samples")
    example = relationship("Example", back_populates="audio_samples")
    uploader = relationship("User", back_populates="audio_samples")
    votes: Mapped[list["AudioVote"]] = relationship(
        back_populates="audio_sample", cascade="all, delete-orphan"
    )


class AudioVote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "audio_votes"
    __table_args__ = (
        UniqueConstraint("audio_id", "user_id", name="uq_audio_votes_audio_user"),
        CheckConstraint("value IN (-1, 1)", name="audio_vote_value_in_range"),
    )

    audio_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("audio_samples.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    audio_sample = relationship("AudioSample", back_populates="votes")
    voter = relationship("User", back_populates="audio_votes")
