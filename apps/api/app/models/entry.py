import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
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

from app.core.enums import EntryStatus, ExampleStatus, TagType
from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.audio import AudioSample
    from app.models.discussion import EntryComment
    from app.models.source import SourceEdition
    from app.models.user import User


class Entry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "entries"

    slug: Mapped[str] = mapped_column(String(180), unique=True, nullable=False, index=True)
    headword: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_headword: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    gloss_pt: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gloss_en: Mapped[str | None] = mapped_column(String(255), nullable=True)
    part_of_speech: Mapped[str | None] = mapped_column(String(64), nullable=True)
    short_definition: Mapped[str] = mapped_column(Text, nullable=False)
    source_citation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_edition_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("source_editions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_pages: Mapped[str | None] = mapped_column(String(120), nullable=True)
    morphology_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[EntryStatus] = mapped_column(
        Enum(EntryStatus, native_enum=False), default=EntryStatus.pending, index=True, nullable=False
    )

    proposer_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("entry_versions.id", use_alter=True, name="fk_entries_current_version_id"),
        nullable=True,
    )

    score_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    upvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    example_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True)

    versions: Mapped[list["EntryVersion"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        foreign_keys="EntryVersion.entry_id",
        order_by="EntryVersion.version_number",
    )
    proposer: Mapped["User"] = relationship(foreign_keys=[proposer_user_id])
    approved_by_user: Mapped["User | None"] = relationship(foreign_keys=[approved_by_user_id])
    current_version: Mapped["EntryVersion | None"] = relationship(
        foreign_keys=[current_version_id], post_update=True
    )
    examples: Mapped[list["Example"]] = relationship(back_populates="entry", cascade="all, delete-orphan")
    votes: Mapped[list["Vote"]] = relationship(back_populates="entry", cascade="all, delete-orphan")
    audio_samples: Mapped[list["AudioSample"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="AudioSample.created_at",
    )
    comments: Mapped[list["EntryComment"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
    )
    tags: Mapped[list["EntryTag"]] = relationship(back_populates="entry", cascade="all, delete-orphan")
    source_edition: Mapped["SourceEdition | None"] = relationship(back_populates="entries")


class EntryVersion(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "entry_versions"
    __table_args__ = (UniqueConstraint("entry_id", "version_number", name="uq_entry_versions_entry_id_version_number"),)

    entry_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("entries.id", ondelete="CASCADE"), nullable=False)
    edited_by_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    edit_summary: Mapped[str | None] = mapped_column(String(280), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entry: Mapped[Entry] = relationship(back_populates="versions", foreign_keys=[entry_id])


class Example(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "examples"

    entry_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("entries.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    sentence_original: Mapped[str] = mapped_column(Text, nullable=False)
    translation_pt: Mapped[str | None] = mapped_column(Text, nullable=True)
    translation_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_citation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_edition_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("source_editions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_pages: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usage_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_tag: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[ExampleStatus] = mapped_column(
        Enum(ExampleStatus, native_enum=False), default=ExampleStatus.pending, nullable=False
    )
    score_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    upvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downvote_count_cache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True)

    entry: Mapped[Entry] = relationship(back_populates="examples")
    votes: Mapped[list["ExampleVote"]] = relationship(
        back_populates="example", cascade="all, delete-orphan"
    )
    audio_samples: Mapped[list["AudioSample"]] = relationship(
        back_populates="example",
        cascade="all, delete-orphan",
        order_by="AudioSample.created_at",
    )
    source_edition: Mapped["SourceEdition | None"] = relationship(back_populates="examples")
    versions: Mapped[list["ExampleVersion"]] = relationship(
        back_populates="example",
        cascade="all, delete-orphan",
        order_by="ExampleVersion.version_number",
    )


class ExampleVersion(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "example_versions"
    __table_args__ = (
        UniqueConstraint(
            "example_id",
            "version_number",
            name="uq_example_versions_example_id_version_number",
        ),
    )

    example_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("examples.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    edited_by_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    edit_summary: Mapped[str | None] = mapped_column(String(280), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    example: Mapped[Example] = relationship(back_populates="versions", foreign_keys=[example_id])


class Vote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "votes"
    __table_args__ = (
        UniqueConstraint("entry_id", "user_id", name="uq_votes_entry_id_user_id"),
        CheckConstraint("value IN (-1, 1)", name="value_in_range"),
    )

    entry_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("entries.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    entry: Mapped[Entry] = relationship(back_populates="votes")


class ExampleVote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "example_votes"
    __table_args__ = (
        UniqueConstraint("example_id", "user_id", name="uq_example_votes_example_id_user_id"),
        CheckConstraint("value IN (-1, 1)", name="value_in_range"),
    )

    example_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("examples.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    example: Mapped[Example] = relationship(back_populates="votes")


class Tag(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("type", "slug", name="uq_tags_type_slug"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[TagType] = mapped_column(Enum(TagType, native_enum=False), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), nullable=False)

    entries: Mapped[list["EntryTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class EntryTag(Base):
    __tablename__ = "entry_tags"

    entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("entries.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

    entry: Mapped[Entry] = relationship(back_populates="tags")
    tag: Mapped[Tag] = relationship(back_populates="entries")
