"""add optional source citation for entries

Revision ID: 0008_entry_source
Revises: 0007_example_versions
Create Date: 2026-03-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_entry_source"
down_revision: str | Sequence[str] | None = "0007_example_versions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "entries",
        sa.Column("source_citation", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("entries", "source_citation")
