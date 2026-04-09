"""add edited_at to entry comments

Revision ID: 0026_comment_edit_marker
Revises: 0025_comment_versions
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0026_comment_edit_marker"
down_revision: str | Sequence[str] | None = "0025_comment_versions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("entry_comments", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("entry_comments", "edited_at")
