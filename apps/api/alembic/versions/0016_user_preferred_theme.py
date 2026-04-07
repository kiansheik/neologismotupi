"""add preferred theme to users

Revision ID: 0016_user_preferred_theme
Revises: 0015_entry_normalized_gloss
Create Date: 2026-04-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0016_user_preferred_theme"
down_revision: str | Sequence[str] | None = "0015_entry_normalized_gloss"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("preferred_theme", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferred_theme")
