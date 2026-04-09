"""add flashcard session segments

Revision ID: 0024_flashcard_session_segments
Revises: 0023_flashcard_reminders
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0024_flashcard_session_segments"
down_revision: str | Sequence[str] | None = "0023_flashcard_reminders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "flashcard_session_segments",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["flashcard_study_session.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_id", "started_at", name="uq_flashcard_segment_session_start"),
    )
    op.create_index(
        op.f("ix_flashcard_session_segments_session_id"),
        "flashcard_session_segments",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_session_segments_user_id"),
        "flashcard_session_segments",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_session_segments_started_at"),
        "flashcard_session_segments",
        ["started_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_session_segments_ended_at"),
        "flashcard_session_segments",
        ["ended_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_flashcard_session_segments_ended_at"), table_name="flashcard_session_segments")
    op.drop_index(op.f("ix_flashcard_session_segments_started_at"), table_name="flashcard_session_segments")
    op.drop_index(op.f("ix_flashcard_session_segments_user_id"), table_name="flashcard_session_segments")
    op.drop_index(op.f("ix_flashcard_session_segments_session_id"), table_name="flashcard_session_segments")
    op.drop_table("flashcard_session_segments")
