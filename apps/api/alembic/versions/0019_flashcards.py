"""add flashcard tables

Revision ID: 0019_flashcards
Revises: 0018_user_orthography_map
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0019_flashcards"
down_revision: str | Sequence[str] | None = "0018_user_orthography_map"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


flashcard_direction_enum = sa.Enum(
    "headword_to_gloss",
    "gloss_to_headword",
    name="flashcarddirection",
    native_enum=False,
)
flashcard_state_enum = sa.Enum(
    "new",
    "learning",
    "review",
    "relearning",
    name="flashcardstate",
    native_enum=False,
)
flashcard_queue_enum = sa.Enum(
    "new",
    "review",
    name="flashcardqueuetype",
    native_enum=False,
)
flashcard_result_enum = sa.Enum(
    "correct",
    "study_more",
    name="flashcardreviewresult",
    native_enum=False,
)


def upgrade() -> None:
    op.create_table(
        "flashcard_settings",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("new_cards_per_day", sa.Integer(), server_default="3", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_flashcard_settings_user_id"),
        sa.CheckConstraint(
            "new_cards_per_day BETWEEN 3 AND 20",
            name="ck_flashcard_settings_new_cards_per_day",
        ),
    )
    op.create_index(op.f("ix_flashcard_settings_user_id"), "flashcard_settings", ["user_id"], unique=True)

    op.create_table(
        "flashcard_progress",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("direction", flashcard_direction_enum, nullable=False),
        sa.Column("state", flashcard_state_enum, server_default="new", nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("interval_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ease_factor", sa.Float(), server_default="2.5", nullable=False),
        sa.Column("step_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("successes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failures", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lapses", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_result", flashcard_result_enum, nullable=True),
        sa.Column("last_response_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "entry_id", "direction", name="uq_flashcard_progress_user_entry_direction"),
    )
    op.create_index(op.f("ix_flashcard_progress_user_id"), "flashcard_progress", ["user_id"], unique=False)
    op.create_index(op.f("ix_flashcard_progress_entry_id"), "flashcard_progress", ["entry_id"], unique=False)

    op.create_table(
        "flashcard_review_log",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("direction", flashcard_direction_enum, nullable=False),
        sa.Column("result", flashcard_result_enum, nullable=False),
        sa.Column("response_ms", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("state_before", flashcard_state_enum, nullable=False),
        sa.Column("state_after", flashcard_state_enum, nullable=False),
        sa.Column("interval_before", sa.Integer(), server_default="0", nullable=False),
        sa.Column("interval_after", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_flashcard_review_log_user_id"), "flashcard_review_log", ["user_id"], unique=False)
    op.create_index(op.f("ix_flashcard_review_log_entry_id"), "flashcard_review_log", ["entry_id"], unique=False)

    op.create_table(
        "flashcard_daily_plan",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("direction", flashcard_direction_enum, nullable=False),
        sa.Column("queue_type", flashcard_queue_enum, nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "plan_date", "position", name="uq_flashcard_plan_user_date_position"),
        sa.UniqueConstraint(
            "user_id",
            "plan_date",
            "entry_id",
            "direction",
            name="uq_flashcard_plan_user_date_card",
        ),
    )
    op.create_index(op.f("ix_flashcard_daily_plan_user_id"), "flashcard_daily_plan", ["user_id"], unique=False)
    op.create_index(op.f("ix_flashcard_daily_plan_entry_id"), "flashcard_daily_plan", ["entry_id"], unique=False)
    op.create_index(op.f("ix_flashcard_daily_plan_plan_date"), "flashcard_daily_plan", ["plan_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_flashcard_daily_plan_plan_date"), table_name="flashcard_daily_plan")
    op.drop_index(op.f("ix_flashcard_daily_plan_entry_id"), table_name="flashcard_daily_plan")
    op.drop_index(op.f("ix_flashcard_daily_plan_user_id"), table_name="flashcard_daily_plan")
    op.drop_table("flashcard_daily_plan")

    op.drop_index(op.f("ix_flashcard_review_log_entry_id"), table_name="flashcard_review_log")
    op.drop_index(op.f("ix_flashcard_review_log_user_id"), table_name="flashcard_review_log")
    op.drop_table("flashcard_review_log")

    op.drop_index(op.f("ix_flashcard_progress_entry_id"), table_name="flashcard_progress")
    op.drop_index(op.f("ix_flashcard_progress_user_id"), table_name="flashcard_progress")
    op.drop_table("flashcard_progress")

    op.drop_index(op.f("ix_flashcard_settings_user_id"), table_name="flashcard_settings")
    op.drop_table("flashcard_settings")

    flashcard_result_enum.drop(op.get_bind(), checkfirst=True)
    flashcard_queue_enum.drop(op.get_bind(), checkfirst=True)
    flashcard_state_enum.drop(op.get_bind(), checkfirst=True)
    flashcard_direction_enum.drop(op.get_bind(), checkfirst=True)
