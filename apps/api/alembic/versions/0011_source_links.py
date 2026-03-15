"""add source links for mirrors and canonical URLs

Revision ID: 0011_source_links
Revises: 0010_example_source_links
Create Date: 2026-03-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011_source_links"
down_revision: str | Sequence[str] | None = "0010_example_source_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "source_links",
        sa.Column("work_id", sa.Uuid(), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("normalized_url", sa.String(length=2048), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["work_id"],
            ["source_works.id"],
            ondelete="CASCADE",
            name=op.f("fk_source_links_work_id_source_works"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name=op.f("fk_source_links_created_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_source_links")),
        sa.UniqueConstraint("work_id", "normalized_url", name="uq_source_links_work_normalized_url"),
    )
    op.create_index(op.f("ix_source_links_work_id"), "source_links", ["work_id"], unique=False)
    op.create_index(op.f("ix_source_links_normalized_url"), "source_links", ["normalized_url"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_source_links_normalized_url"), table_name="source_links")
    op.drop_index(op.f("ix_source_links_work_id"), table_name="source_links")
    op.drop_table("source_links")
