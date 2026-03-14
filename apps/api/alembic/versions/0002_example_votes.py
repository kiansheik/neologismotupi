"""add example votes and example score cache columns

Revision ID: 0002_example_votes
Revises: 0001_initial
Create Date: 2026-03-14 11:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_example_votes"
down_revision: Union[str, Sequence[str], None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("examples", sa.Column("score_cache", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(
        "examples", sa.Column("upvote_count_cache", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "examples", sa.Column("downvote_count_cache", sa.Integer(), nullable=False, server_default="0")
    )

    op.create_table(
        "example_votes",
        sa.Column("example_id", sa.Uuid(), nullable=False),
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
        sa.CheckConstraint("value IN (-1, 1)", name="ck_example_votes_value_in_range"),
        sa.ForeignKeyConstraint(
            ["example_id"], ["examples.id"], ondelete="CASCADE", name="fk_example_votes_example_id_examples"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_example_votes_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_example_votes"),
        sa.UniqueConstraint("example_id", "user_id", name="uq_example_votes_example_id_user_id"),
    )
    op.create_index("ix_example_votes_example_id", "example_votes", ["example_id"], unique=False)
    op.create_index("ix_example_votes_user_id", "example_votes", ["user_id"], unique=False)

    op.execute(
        sa.text(
            "UPDATE profiles "
            "SET reputation_score = "
            "COALESCE((SELECT SUM(entries.score_cache) FROM entries WHERE entries.proposer_user_id = profiles.user_id), 0) "
            "+ COALESCE((SELECT SUM(examples.score_cache) FROM examples WHERE examples.user_id = profiles.user_id), 0)"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_example_votes_user_id", table_name="example_votes")
    op.drop_index("ix_example_votes_example_id", table_name="example_votes")
    op.drop_table("example_votes")

    op.drop_column("examples", "downvote_count_cache")
    op.drop_column("examples", "upvote_count_cache")
    op.drop_column("examples", "score_cache")
