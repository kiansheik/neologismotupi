"""add entry comment versions

Revision ID: 0025_comment_versions
Revises: 0024_flashcard_session_segments
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0025_comment_versions"
down_revision: str | Sequence[str] | None = "0024_flashcard_session_segments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "entry_comment_versions",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("comment_id", sa.Uuid(), nullable=False),
        sa.Column("edited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["entry_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["edited_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "comment_id",
            "version_number",
            name="uq_entry_comment_versions_comment_id_version_number",
        ),
    )
    op.create_index(
        op.f("ix_entry_comment_versions_comment_id"),
        "entry_comment_versions",
        ["comment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_entry_comment_versions_comment_id"), table_name="entry_comment_versions")
    op.drop_table("entry_comment_versions")
