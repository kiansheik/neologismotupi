"""add flashcard reminders

Revision ID: 0023_flashcard_reminders
Revises: 0022_example_normalized_text
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0023_flashcard_reminders"
down_revision: str | Sequence[str] | None = "0022_example_normalized_text"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "flashcard_reminders",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column("time_zone", sa.String(length=64), nullable=True),
        sa.Column("remind_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["flashcard_study_session.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("user_id", "remind_at", name="uq_flashcard_reminder_user_time"),
    )
    op.create_index(op.f("ix_flashcard_reminders_user_id"), "flashcard_reminders", ["user_id"], unique=False)
    op.create_index(op.f("ix_flashcard_reminders_remind_at"), "flashcard_reminders", ["remind_at"], unique=False)
    op.create_index(op.f("ix_flashcard_reminders_sent_at"), "flashcard_reminders", ["sent_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_flashcard_reminders_sent_at"), table_name="flashcard_reminders")
    op.drop_index(op.f("ix_flashcard_reminders_remind_at"), table_name="flashcard_reminders")
    op.drop_index(op.f("ix_flashcard_reminders_user_id"), table_name="flashcard_reminders")
    op.drop_table("flashcard_reminders")
