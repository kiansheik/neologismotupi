"""add durable review participation events

Revision ID: 0030_review_participation_events
Revises: 0029_navarro_entries
Create Date: 2026-04-24 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0030_review_participation_events"
down_revision: str | None = "0029_navarro_entries"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "review_participation_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("source_key", sa.String(length=180), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "source_key",
            name="uq_review_participation_events_user_source_key",
        ),
    )
    op.create_index(
        op.f("ix_review_participation_events_action_type"),
        "review_participation_events",
        ["action_type"],
    )
    op.create_index(
        op.f("ix_review_participation_events_target_id"),
        "review_participation_events",
        ["target_id"],
    )
    op.create_index(
        op.f("ix_review_participation_events_user_id"),
        "review_participation_events",
        ["user_id"],
    )
    op.create_index(
        "ix_review_participation_events_user_created_at",
        "review_participation_events",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_review_participation_events_user_created_at", table_name="review_participation_events")
    op.drop_index(op.f("ix_review_participation_events_user_id"), table_name="review_participation_events")
    op.drop_index(op.f("ix_review_participation_events_target_id"), table_name="review_participation_events")
    op.drop_index(op.f("ix_review_participation_events_action_type"), table_name="review_participation_events")
    op.drop_table("review_participation_events")
