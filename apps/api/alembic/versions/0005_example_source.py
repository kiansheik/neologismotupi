"""add optional source citation for examples

Revision ID: 0005_example_source
Revises: 0004_comments_notifications
Create Date: 2026-03-14 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_example_source"
down_revision: str | Sequence[str] | None = "0004_comments_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "examples",
        sa.Column("source_citation", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("examples", "source_citation")
