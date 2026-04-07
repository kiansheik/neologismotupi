"""add entry pydicate

Revision ID: 0017_entry_pydicate
Revises: 0016_user_preferred_theme
Create Date: 2026-04-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0017_entry_pydicate"
down_revision: str | Sequence[str] | None = "0016_user_preferred_theme"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("entries", sa.Column("pydicate", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("entries", "pydicate")
