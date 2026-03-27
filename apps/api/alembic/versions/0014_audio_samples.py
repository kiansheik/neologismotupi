"""add audio samples and votes

Revision ID: 0014_audio_samples
Revises: 0013_newsletters
Create Date: 2026-03-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0014_audio_samples"
down_revision: str | Sequence[str] | None = "0013_newsletters"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audio_samples",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=True),
        sa.Column("example_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("score_cache", sa.Integer(), server_default="0", nullable=False),
        sa.Column("upvote_count_cache", sa.Integer(), server_default="0", nullable=False),
        sa.Column("downvote_count_cache", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["example_id"], ["examples.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "(entry_id IS NOT NULL) <> (example_id IS NOT NULL)",
            name="audio_samples_target_one",
        ),
    )
    op.create_index(op.f("ix_audio_samples_entry_id"), "audio_samples", ["entry_id"], unique=False)
    op.create_index(op.f("ix_audio_samples_example_id"), "audio_samples", ["example_id"], unique=False)
    op.create_index(op.f("ix_audio_samples_user_id"), "audio_samples", ["user_id"], unique=False)

    op.create_table(
        "audio_votes",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("audio_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["audio_id"], ["audio_samples.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("audio_id", "user_id", name="uq_audio_votes_audio_user"),
        sa.CheckConstraint("value IN (-1, 1)", name="audio_vote_value_in_range"),
    )
    op.create_index(op.f("ix_audio_votes_audio_id"), "audio_votes", ["audio_id"], unique=False)
    op.create_index(op.f("ix_audio_votes_user_id"), "audio_votes", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audio_votes_user_id"), table_name="audio_votes")
    op.drop_index(op.f("ix_audio_votes_audio_id"), table_name="audio_votes")
    op.drop_table("audio_votes")

    op.drop_index(op.f("ix_audio_samples_user_id"), table_name="audio_samples")
    op.drop_index(op.f("ix_audio_samples_example_id"), table_name="audio_samples")
    op.drop_index(op.f("ix_audio_samples_entry_id"), table_name="audio_samples")
    op.drop_table("audio_samples")
