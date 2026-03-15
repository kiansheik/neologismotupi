"""add structured sources and link entries

Revision ID: 0009_sources
Revises: 0008_entry_source
Create Date: 2026-03-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_sources"
down_revision: str | Sequence[str] | None = "0008_entry_source"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "source_works",
        sa.Column("authors", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=400), nullable=True),
        sa.Column("normalized_authors", sa.String(length=255), nullable=True),
        sa.Column("normalized_title", sa.String(length=400), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "authors IS NOT NULL OR title IS NOT NULL",
            name=op.f("ck_source_works_authors_or_title_present"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_source_works")),
    )
    op.create_index(op.f("ix_source_works_normalized_authors"), "source_works", ["normalized_authors"], unique=False)
    op.create_index(op.f("ix_source_works_normalized_title"), "source_works", ["normalized_title"], unique=False)

    op.create_table(
        "source_editions",
        sa.Column("work_id", sa.Uuid(), nullable=False),
        sa.Column("publication_year", sa.Integer(), nullable=True),
        sa.Column("edition_label", sa.String(length=120), nullable=True),
        sa.Column("normalized_edition_label", sa.String(length=120), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["work_id"], ["source_works.id"], ondelete="CASCADE", name=op.f("fk_source_editions_work_id_source_works")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_source_editions")),
        sa.UniqueConstraint(
            "work_id",
            "publication_year",
            "normalized_edition_label",
            name="uq_src_editions_work_pub_edition",
        ),
    )
    op.create_index(op.f("ix_source_editions_work_id"), "source_editions", ["work_id"], unique=False)
    op.create_index(op.f("ix_source_editions_publication_year"), "source_editions", ["publication_year"], unique=False)

    op.add_column("entries", sa.Column("source_edition_id", sa.Uuid(), nullable=True))
    op.add_column("entries", sa.Column("source_pages", sa.String(length=120), nullable=True))
    op.create_index(op.f("ix_entries_source_edition_id"), "entries", ["source_edition_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_entries_source_edition_id_source_editions"),
        "entries",
        "source_editions",
        ["source_edition_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_entries_source_edition_id_source_editions"), "entries", type_="foreignkey")
    op.drop_index(op.f("ix_entries_source_edition_id"), table_name="entries")
    op.drop_column("entries", "source_pages")
    op.drop_column("entries", "source_edition_id")

    op.drop_index(op.f("ix_source_editions_publication_year"), table_name="source_editions")
    op.drop_index(op.f("ix_source_editions_work_id"), table_name="source_editions")
    op.drop_table("source_editions")

    op.drop_index(op.f("ix_source_works_normalized_title"), table_name="source_works")
    op.drop_index(op.f("ix_source_works_normalized_authors"), table_name="source_works")
    op.drop_table("source_works")
