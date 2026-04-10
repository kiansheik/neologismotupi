"""add flashcard lists

Revision ID: 0028_flashcard_lists
Revises: 0027_merge_comment_heads
Create Date: 2026-04-10 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0028_flashcard_lists"
down_revision: str | Sequence[str] | None = "0027_merge_comment_heads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "flashcard_list",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("title_pt", sa.String(length=140), nullable=False),
        sa.Column("title_en", sa.String(length=140), nullable=True),
        sa.Column("description_pt", sa.Text(), nullable=True),
        sa.Column("description_en", sa.Text(), nullable=True),
        sa.Column("theme_label", sa.String(length=120), nullable=True),
        sa.Column("is_public", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("score_cache", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("upvote_count_cache", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("downvote_count_cache", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("item_count_cache", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        op.f("ix_flashcard_list_owner_user_id"),
        "flashcard_list",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_list_is_public"),
        "flashcard_list",
        ["is_public"],
        unique=False,
    )

    op.create_table(
        "flashcard_list_item",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("list_id", sa.Uuid(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["list_id"], ["flashcard_list.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("list_id", "entry_id", name="uq_flashcard_list_item_list_entry"),
    )
    op.create_index(
        op.f("ix_flashcard_list_item_list_id"),
        "flashcard_list_item",
        ["list_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_list_item_entry_id"),
        "flashcard_list_item",
        ["entry_id"],
        unique=False,
    )

    op.create_table(
        "flashcard_list_vote",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("list_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["list_id"], ["flashcard_list.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("list_id", "user_id", name="uq_flashcard_list_vote_user_list"),
    )
    op.create_index(
        op.f("ix_flashcard_list_vote_list_id"),
        "flashcard_list_vote",
        ["list_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_list_vote_user_id"),
        "flashcard_list_vote",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "flashcard_list_comment",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("list_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["list_id"], ["flashcard_list.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        op.f("ix_flashcard_list_comment_list_id"),
        "flashcard_list_comment",
        ["list_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_flashcard_list_comment_user_id"),
        "flashcard_list_comment",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_flashcard_list_comment_user_id"), table_name="flashcard_list_comment")
    op.drop_index(op.f("ix_flashcard_list_comment_list_id"), table_name="flashcard_list_comment")
    op.drop_table("flashcard_list_comment")

    op.drop_index(op.f("ix_flashcard_list_vote_user_id"), table_name="flashcard_list_vote")
    op.drop_index(op.f("ix_flashcard_list_vote_list_id"), table_name="flashcard_list_vote")
    op.drop_table("flashcard_list_vote")

    op.drop_index(op.f("ix_flashcard_list_item_entry_id"), table_name="flashcard_list_item")
    op.drop_index(op.f("ix_flashcard_list_item_list_id"), table_name="flashcard_list_item")
    op.drop_table("flashcard_list_item")

    op.drop_index(op.f("ix_flashcard_list_is_public"), table_name="flashcard_list")
    op.drop_index(op.f("ix_flashcard_list_owner_user_id"), table_name="flashcard_list")
    op.drop_table("flashcard_list")
