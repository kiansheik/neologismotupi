"""add user orthography map

Revision ID: 0018_user_orthography_map
Revises: 0017_entry_pydicate
Create Date: 2026-04-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0018_user_orthography_map"
down_revision: str | Sequence[str] | None = "0017_entry_pydicate"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("orthography_map", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "orthography_map")
