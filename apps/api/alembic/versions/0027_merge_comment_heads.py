"""merge comment and flashcard heads

Revision ID: 0027_merge_comment_heads
Revises: 0025_flashcard_user_response, 0026_comment_edit_marker
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence


# revision identifiers, used by Alembic.
revision: str = "0027_merge_comment_heads"
down_revision: str | Sequence[str] | None = (
    "0025_flashcard_user_response",
    "0026_comment_edit_marker",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
