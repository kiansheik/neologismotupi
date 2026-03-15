"""link examples to structured source editions

Revision ID: 0010_example_source_links
Revises: 0009_sources
Create Date: 2026-03-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_example_source_links"
down_revision: str | Sequence[str] | None = "0009_sources"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("examples", sa.Column("source_edition_id", sa.Uuid(), nullable=True))
    op.add_column("examples", sa.Column("source_pages", sa.String(length=120), nullable=True))
    op.create_index(op.f("ix_examples_source_edition_id"), "examples", ["source_edition_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_examples_source_edition_id_source_editions"),
        "examples",
        "source_editions",
        ["source_edition_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_examples_source_edition_id_source_editions"), "examples", type_="foreignkey")
    op.drop_index(op.f("ix_examples_source_edition_id"), table_name="examples")
    op.drop_column("examples", "source_pages")
    op.drop_column("examples", "source_edition_id")
