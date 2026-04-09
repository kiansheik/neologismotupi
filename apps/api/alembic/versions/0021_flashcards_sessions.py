"""flashcards sessions

Revision ID: 0021_flashcards_sessions
Revises: 0020_flashcards_fsrs
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0021_flashcards_sessions"
down_revision: str | Sequence[str] | None = "0020_flashcards_fsrs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "flashcard_study_session",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        op.f("ix_flashcard_study_session_user_id"),
        "flashcard_study_session",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_study_session_started_at"),
        "flashcard_study_session",
        ["started_at"],
        unique=False,
    )

    op.add_column("flashcard_review_log", sa.Column("session_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_flashcard_review_log_session_id"),
        "flashcard_review_log",
        ["session_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_flashcard_review_log_session_id",
        "flashcard_review_log",
        "flashcard_study_session",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_flashcard_review_log_session_id", "flashcard_review_log", type_="foreignkey")
    op.drop_index(op.f("ix_flashcard_review_log_session_id"), table_name="flashcard_review_log")
    op.drop_column("flashcard_review_log", "session_id")

    op.drop_index(op.f("ix_flashcard_study_session_started_at"), table_name="flashcard_study_session")
    op.drop_index(op.f("ix_flashcard_study_session_user_id"), table_name="flashcard_study_session")
    op.drop_table("flashcard_study_session")
