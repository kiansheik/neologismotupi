"""add user_response to flashcard_review_log

Revision ID: 0025_flashcard_user_response
Revises: 0024_flashcard_session_segments
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0025_flashcard_user_response"
down_revision: str | Sequence[str] | None = "0024_flashcard_session_segments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "flashcard_review_log",
        sa.Column("user_response", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("flashcard_review_log", "user_response")
