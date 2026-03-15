import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.entry import Entry, Example
    from app.models.user import User


class SourceWork(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "source_works"
    __table_args__ = (
        CheckConstraint(
            "authors IS NOT NULL OR title IS NOT NULL",
            name="authors_or_title_present",
        ),
    )

    authors: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(String(400), nullable=True)
    normalized_authors: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    normalized_title: Mapped[str | None] = mapped_column(String(400), nullable=True, index=True)

    editions: Mapped[list["SourceEdition"]] = relationship(
        back_populates="work",
        cascade="all, delete-orphan",
    )


class SourceEdition(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "source_editions"
    __table_args__ = (
        UniqueConstraint(
            "work_id",
            "publication_year",
            "normalized_edition_label",
            name="uq_src_editions_work_pub_edition",
        ),
    )

    work_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("source_works.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    publication_year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    edition_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    normalized_edition_label: Mapped[str | None] = mapped_column(String(120), nullable=True)

    work: Mapped[SourceWork] = relationship(back_populates="editions")
    entries: Mapped[list["Entry"]] = relationship(back_populates="source_edition")
    examples: Mapped[list["Example"]] = relationship(back_populates="source_edition")
    links: Mapped[list["SourceLink"]] = relationship(
        back_populates="edition",
        cascade="all, delete-orphan",
    )


class SourceLink(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "source_links"
    __table_args__ = (
        UniqueConstraint("edition_id", "normalized_url", name="uq_source_links_edition_normalized_url"),
    )

    edition_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("source_editions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    normalized_url: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    edition: Mapped[SourceEdition] = relationship(back_populates="links")
    created_by_user: Mapped["User | None"] = relationship(foreign_keys=[created_by_user_id])
