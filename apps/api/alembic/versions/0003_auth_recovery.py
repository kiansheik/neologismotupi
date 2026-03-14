"""add email action tokens for verification and password reset

Revision ID: 0003_auth_recovery
Revises: 0002_example_votes
Create Date: 2026-03-14 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003_auth_recovery"
down_revision: Union[str, Sequence[str], None] = "0002_example_votes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_action_tokens",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("purpose", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_email_action_tokens_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_email_action_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_email_action_tokens_token_hash"),
    )
    op.create_index("ix_email_action_tokens_token_hash", "email_action_tokens", ["token_hash"], unique=False)
    op.create_index("ix_email_action_tokens_purpose", "email_action_tokens", ["purpose"], unique=False)
    op.create_index("ix_email_action_tokens_user_id", "email_action_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_email_action_tokens_user_id", table_name="email_action_tokens")
    op.drop_index("ix_email_action_tokens_purpose", table_name="email_action_tokens")
    op.drop_index("ix_email_action_tokens_token_hash", table_name="email_action_tokens")
    op.drop_table("email_action_tokens")
