"""add comments, comment votes, notifications, and notification preferences

Revision ID: 0004_comments_notifications
Revises: 0003_auth_recovery
Create Date: 2026-03-14 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004_comments_notifications"
down_revision: Union[str, Sequence[str], None] = "0003_auth_recovery"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "entry_comments",
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("parent_comment_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("score_cache", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("upvote_count_cache", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("downvote_count_cache", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["entry_id"],
            ["entries.id"],
            ondelete="CASCADE",
            name="fk_entry_comments_entry_id_entries",
        ),
        sa.ForeignKeyConstraint(
            ["parent_comment_id"],
            ["entry_comments.id"],
            ondelete="SET NULL",
            name="fk_entry_comments_parent_comment_id_entry_comments",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_entry_comments_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_entry_comments"),
    )
    op.create_index("ix_entry_comments_entry_id", "entry_comments", ["entry_id"], unique=False)
    op.create_index("ix_entry_comments_parent_comment_id", "entry_comments", ["parent_comment_id"], unique=False)
    op.create_index("ix_entry_comments_user_id", "entry_comments", ["user_id"], unique=False)

    op.create_table(
        "comment_votes",
        sa.Column("comment_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("value IN (-1, 1)", name="ck_comment_votes_value_in_range"),
        sa.ForeignKeyConstraint(
            ["comment_id"],
            ["entry_comments.id"],
            ondelete="CASCADE",
            name="fk_comment_votes_comment_id_entry_comments",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_comment_votes_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_comment_votes"),
        sa.UniqueConstraint("comment_id", "user_id", name="uq_comment_votes_comment_id_user_id"),
    )
    op.create_index("ix_comment_votes_comment_id", "comment_votes", ["comment_id"], unique=False)
    op.create_index("ix_comment_votes_user_id", "comment_votes", ["user_id"], unique=False)

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("in_app_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("push_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "notify_on_entry_comments",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("notify_on_mentions", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_notification_preferences_user_id_users",
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_notification_preferences"),
    )

    op.create_table(
        "notifications",
        sa.Column("recipient_user_id", sa.Uuid(), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("entry_id", sa.Uuid(), nullable=True),
        sa.Column("comment_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_notifications_actor_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["comment_id"],
            ["entry_comments.id"],
            ondelete="CASCADE",
            name="fk_notifications_comment_id_entry_comments",
        ),
        sa.ForeignKeyConstraint(
            ["entry_id"],
            ["entries.id"],
            ondelete="CASCADE",
            name="fk_notifications_entry_id_entries",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_notifications_recipient_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_notifications"),
    )
    op.create_index("ix_notifications_comment_id", "notifications", ["comment_id"], unique=False)
    op.create_index("ix_notifications_entry_id", "notifications", ["entry_id"], unique=False)
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"], unique=False)
    op.create_index("ix_notifications_kind", "notifications", ["kind"], unique=False)
    op.create_index("ix_notifications_recipient_user_id", "notifications", ["recipient_user_id"], unique=False)

    op.execute(
        sa.text(
            "UPDATE profiles "
            "SET reputation_score = "
            "COALESCE((SELECT SUM(entries.score_cache) FROM entries WHERE entries.proposer_user_id = profiles.user_id), 0) "
            "+ COALESCE((SELECT SUM(examples.score_cache) FROM examples WHERE examples.user_id = profiles.user_id), 0) "
            "+ COALESCE((SELECT SUM(entry_comments.score_cache) FROM entry_comments WHERE entry_comments.user_id = profiles.user_id), 0)"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_user_id", table_name="notifications")
    op.drop_index("ix_notifications_kind", table_name="notifications")
    op.drop_index("ix_notifications_is_read", table_name="notifications")
    op.drop_index("ix_notifications_entry_id", table_name="notifications")
    op.drop_index("ix_notifications_comment_id", table_name="notifications")
    op.drop_table("notifications")

    op.drop_table("notification_preferences")

    op.drop_index("ix_comment_votes_user_id", table_name="comment_votes")
    op.drop_index("ix_comment_votes_comment_id", table_name="comment_votes")
    op.drop_table("comment_votes")

    op.drop_index("ix_entry_comments_user_id", table_name="entry_comments")
    op.drop_index("ix_entry_comments_parent_comment_id", table_name="entry_comments")
    op.drop_index("ix_entry_comments_entry_id", table_name="entry_comments")
    op.drop_table("entry_comments")
