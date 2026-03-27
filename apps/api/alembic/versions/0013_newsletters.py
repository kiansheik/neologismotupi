"""add newsletters and user locale preference

Revision ID: 0013_newsletters
Revises: 0012_source_links_per_edition
Create Date: 2026-03-26 00:00:00.000000

"""

from collections.abc import Sequence
import secrets
import uuid

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0013_newsletters"
down_revision: str | Sequence[str] | None = "0012_source_links_per_edition"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("preferred_locale", sa.String(length=16), server_default="pt-BR", nullable=False),
    )

    op.create_table(
        "newsletter_subscriptions",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("newsletter_key", sa.String(length=64), nullable=False),
        sa.Column("preferred_locale", sa.String(length=16), server_default="pt-BR", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("unsubscribe_token", sa.String(length=128), nullable=False),
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "user_id", "newsletter_key", name="uq_newsletter_subscriptions_user_key"
        ),
    )
    op.create_index(
        op.f("ix_newsletter_subscriptions_user_id"),
        "newsletter_subscriptions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_newsletter_subscriptions_newsletter_key"),
        "newsletter_subscriptions",
        ["newsletter_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_newsletter_subscriptions_unsubscribe_token"),
        "newsletter_subscriptions",
        ["unsubscribe_token"],
        unique=True,
    )

    op.create_table(
        "newsletter_issues",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("newsletter_key", sa.String(length=64), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("newsletter_key", "issue_date", name="uq_newsletter_issues_key_date"),
    )
    op.create_index(
        op.f("ix_newsletter_issues_newsletter_key"),
        "newsletter_issues",
        ["newsletter_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_newsletter_issues_entry_id"),
        "newsletter_issues",
        ["entry_id"],
        unique=False,
    )

    op.create_table(
        "newsletter_deliveries",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("issue_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="sent", nullable=False),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["issue_id"], ["newsletter_issues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("issue_id", "user_id", name="uq_newsletter_deliveries_issue_user"),
    )
    op.create_index(
        op.f("ix_newsletter_deliveries_issue_id"),
        "newsletter_deliveries",
        ["issue_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_newsletter_deliveries_user_id"),
        "newsletter_deliveries",
        ["user_id"],
        unique=False,
    )

    conn = op.get_bind()
    user_rows = conn.execute(sa.text("SELECT id, preferred_locale FROM users")).mappings().all()
    if user_rows:
        newsletter_subscriptions = sa.table(
            "newsletter_subscriptions",
            sa.column("id", sa.Uuid()),
            sa.column("user_id", sa.Uuid()),
            sa.column("newsletter_key", sa.String()),
            sa.column("preferred_locale", sa.String()),
            sa.column("is_active", sa.Boolean()),
            sa.column("unsubscribe_token", sa.String()),
        )

        rows = [
            {
                "id": uuid.uuid4(),
                "user_id": row["id"],
                "newsletter_key": "palavra_do_dia",
                "preferred_locale": row["preferred_locale"] or "pt-BR",
                "is_active": True,
                "unsubscribe_token": secrets.token_urlsafe(32),
            }
            for row in user_rows
        ]
        op.bulk_insert(newsletter_subscriptions, rows)


def downgrade() -> None:
    op.drop_index(op.f("ix_newsletter_deliveries_user_id"), table_name="newsletter_deliveries")
    op.drop_index(op.f("ix_newsletter_deliveries_issue_id"), table_name="newsletter_deliveries")
    op.drop_table("newsletter_deliveries")

    op.drop_index(op.f("ix_newsletter_issues_entry_id"), table_name="newsletter_issues")
    op.drop_index(op.f("ix_newsletter_issues_newsletter_key"), table_name="newsletter_issues")
    op.drop_table("newsletter_issues")

    op.drop_index(op.f("ix_newsletter_subscriptions_unsubscribe_token"), table_name="newsletter_subscriptions")
    op.drop_index(op.f("ix_newsletter_subscriptions_newsletter_key"), table_name="newsletter_subscriptions")
    op.drop_index(op.f("ix_newsletter_subscriptions_user_id"), table_name="newsletter_subscriptions")
    op.drop_table("newsletter_subscriptions")

    op.drop_column("users", "preferred_locale")
