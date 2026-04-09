"""flashcards fsrs scheduler

Revision ID: 0020_flashcards_fsrs
Revises: 0019_flashcards
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0020_flashcards_fsrs"
down_revision: str | Sequence[str] | None = "0019_flashcards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "flashcard_settings",
        sa.Column("desired_retention", sa.Float(), server_default="0.9", nullable=False),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column("learning_steps_minutes", sa.JSON(), server_default="[1, 10]", nullable=False),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column("relearning_steps_minutes", sa.JSON(), server_default="[10]", nullable=False),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column("bury_siblings", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column("max_reviews_per_day", sa.Integer(), nullable=True),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column("fsrs_params", sa.JSON(), nullable=True),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column("fsrs_params_version", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column("historical_retention", sa.Float(), server_default="0.9", nullable=False),
    )
    op.add_column(
        "flashcard_settings",
        sa.Column(
            "advanced_grading_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.create_check_constraint(
        "ck_flashcard_settings_desired_retention",
        "flashcard_settings",
        "desired_retention BETWEEN 0.7 AND 0.99",
    )

    op.add_column(
        "flashcard_progress",
        sa.Column("queue", sa.String(length=20), server_default="new", nullable=False),
    )
    op.add_column(
        "flashcard_progress",
        sa.Column("remaining_steps", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "flashcard_progress",
        sa.Column("reps", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "flashcard_progress",
        sa.Column("memory_stability", sa.Float(), nullable=True),
    )
    op.add_column(
        "flashcard_progress",
        sa.Column("memory_difficulty", sa.Float(), nullable=True),
    )

    op.add_column(
        "flashcard_review_log",
        sa.Column("memory_stability_before", sa.Float(), nullable=True),
    )
    op.add_column(
        "flashcard_review_log",
        sa.Column("memory_stability_after", sa.Float(), nullable=True),
    )
    op.add_column(
        "flashcard_review_log",
        sa.Column("memory_difficulty_before", sa.Float(), nullable=True),
    )
    op.add_column(
        "flashcard_review_log",
        sa.Column("memory_difficulty_after", sa.Float(), nullable=True),
    )

    op.create_table(
        "flashcard_daily_intake",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("study_date", sa.Date(), nullable=False),
        sa.Column("base_new_limit", sa.Integer(), nullable=False),
        sa.Column("continue_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "study_date", name="uq_flashcard_daily_intake_user_date"),
    )
    op.create_index(
        op.f("ix_flashcard_daily_intake_user_id"),
        "flashcard_daily_intake",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_daily_intake_study_date"),
        "flashcard_daily_intake",
        ["study_date"],
        unique=False,
    )

    op.execute("UPDATE flashcard_progress SET state = 'learn' WHERE state = 'learning'")
    op.execute("UPDATE flashcard_progress SET state = 'relearn' WHERE state = 'relearning'")
    op.execute(
        "UPDATE flashcard_review_log SET state_before = 'learn' WHERE state_before = 'learning'"
    )
    op.execute(
        "UPDATE flashcard_review_log SET state_before = 'relearn' WHERE state_before = 'relearning'"
    )
    op.execute(
        "UPDATE flashcard_review_log SET state_after = 'learn' WHERE state_after = 'learning'"
    )
    op.execute(
        "UPDATE flashcard_review_log SET state_after = 'relearn' WHERE state_after = 'relearning'"
    )
    op.execute("UPDATE flashcard_review_log SET result = 'good' WHERE result = 'correct'")
    op.execute("UPDATE flashcard_review_log SET result = 'again' WHERE result = 'study_more'")
    op.execute("UPDATE flashcard_progress SET last_result = 'good' WHERE last_result = 'correct'")
    op.execute("UPDATE flashcard_progress SET last_result = 'again' WHERE last_result = 'study_more'")
    op.execute(
        """
        UPDATE flashcard_progress
        SET queue = CASE
            WHEN state IN ('learn', 'learning', 'relearn', 'relearning') THEN 'learn'
            WHEN state = 'review' THEN 'review'
            ELSE 'new'
        END
        """
    )
    op.execute(
        """
        UPDATE flashcard_progress
        SET reps = COALESCE(successes, 0) + COALESCE(failures, 0)
        WHERE reps = 0
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_flashcard_daily_intake_study_date"), table_name="flashcard_daily_intake")
    op.drop_index(op.f("ix_flashcard_daily_intake_user_id"), table_name="flashcard_daily_intake")
    op.drop_table("flashcard_daily_intake")

    op.drop_column("flashcard_review_log", "memory_difficulty_after")
    op.drop_column("flashcard_review_log", "memory_difficulty_before")
    op.drop_column("flashcard_review_log", "memory_stability_after")
    op.drop_column("flashcard_review_log", "memory_stability_before")

    op.drop_column("flashcard_progress", "memory_difficulty")
    op.drop_column("flashcard_progress", "memory_stability")
    op.drop_column("flashcard_progress", "reps")
    op.drop_column("flashcard_progress", "remaining_steps")
    op.drop_column("flashcard_progress", "queue")

    op.drop_constraint(
        "ck_flashcard_settings_desired_retention", "flashcard_settings", type_="check"
    )
    op.drop_column("flashcard_settings", "advanced_grading_enabled")
    op.drop_column("flashcard_settings", "historical_retention")
    op.drop_column("flashcard_settings", "fsrs_params_version")
    op.drop_column("flashcard_settings", "fsrs_params")
    op.drop_column("flashcard_settings", "max_reviews_per_day")
    op.drop_column("flashcard_settings", "bury_siblings")
    op.drop_column("flashcard_settings", "relearning_steps_minutes")
    op.drop_column("flashcard_settings", "learning_steps_minutes")
    op.drop_column("flashcard_settings", "desired_retention")
