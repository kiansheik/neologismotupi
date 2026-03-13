"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-03-13 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


entry_status_enum = sa.Enum(
    "pending", "approved", "disputed", "rejected", "archived", name="entrystatus", native_enum=False
)
example_status_enum = sa.Enum(
    "pending", "approved", "hidden", "rejected", name="examplestatus", native_enum=False
)
report_target_enum = sa.Enum("entry", "example", "profile", name="reporttargettype", native_enum=False)
report_reason_enum = sa.Enum(
    "spam", "harassment", "bad_faith", "duplicate", "offensive", "incorrect", "other", name="reportreasoncode", native_enum=False
)
report_status_enum = sa.Enum(
    "open", "reviewed", "resolved", "dismissed", name="reportstatus", native_enum=False
)
tag_type_enum = sa.Enum("domain", "region", "community", "grammar", name="tagtype", native_enum=False)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.create_table(
        "profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("bio", sa.String(length=500), nullable=True),
        sa.Column("affiliation_label", sa.String(length=120), nullable=True),
        sa.Column("role_label", sa.String(length=120), nullable=True),
        sa.Column("reputation_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_profiles_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_profiles"),
        sa.UniqueConstraint("user_id", name="uq_profiles_user_id"),
    )

    op.create_table(
        "sessions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_sessions_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
        sa.UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
    )
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"], unique=False)

    op.create_table(
        "entries",
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("headword", sa.String(length=180), nullable=False),
        sa.Column("normalized_headword", sa.String(length=180), nullable=False),
        sa.Column("gloss_pt", sa.String(length=255), nullable=True),
        sa.Column("gloss_en", sa.String(length=255), nullable=True),
        sa.Column("part_of_speech", sa.String(length=64), nullable=True),
        sa.Column("short_definition", sa.Text(), nullable=False),
        sa.Column("morphology_notes", sa.Text(), nullable=True),
        sa.Column("status", entry_status_enum, nullable=False, server_default="pending"),
        sa.Column("proposer_user_id", sa.Uuid(), nullable=False),
        sa.Column("current_version_id", sa.Uuid(), nullable=True),
        sa.Column("score_cache", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("upvote_count_cache", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("downvote_count_cache", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("example_count_cache", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], name="fk_entries_approved_by_user_id_users"),
        sa.ForeignKeyConstraint(["proposer_user_id"], ["users.id"], name="fk_entries_proposer_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_entries"),
        sa.UniqueConstraint("slug", name="uq_entries_slug"),
    )
    op.create_index("ix_entries_slug", "entries", ["slug"], unique=False)
    op.create_index("ix_entries_normalized_headword", "entries", ["normalized_headword"], unique=False)
    op.create_index("ix_entries_status", "entries", ["status"], unique=False)

    op.create_table(
        "entry_versions",
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("edited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("edit_summary", sa.String(length=280), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["edited_by_user_id"], ["users.id"], name="fk_entry_versions_edited_by_user_id_users"),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE", name="fk_entry_versions_entry_id_entries"),
        sa.PrimaryKeyConstraint("id", name="pk_entry_versions"),
        sa.UniqueConstraint("entry_id", "version_number", name="uq_entry_versions_entry_id_version_number"),
    )

    op.create_foreign_key(
        "fk_entries_current_version_id",
        "entries",
        "entry_versions",
        ["current_version_id"],
        ["id"],
    )

    op.create_table(
        "examples",
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("sentence_original", sa.Text(), nullable=False),
        sa.Column("translation_pt", sa.Text(), nullable=True),
        sa.Column("translation_en", sa.Text(), nullable=True),
        sa.Column("usage_note", sa.Text(), nullable=True),
        sa.Column("context_tag", sa.String(length=120), nullable=True),
        sa.Column("status", example_status_enum, nullable=False, server_default="pending"),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], name="fk_examples_approved_by_user_id_users"),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE", name="fk_examples_entry_id_entries"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_examples_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_examples"),
    )
    op.create_index("ix_examples_entry_id", "examples", ["entry_id"], unique=False)

    op.create_table(
        "votes",
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("value IN (-1, 1)", name="ck_votes_value_in_range"),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE", name="fk_votes_entry_id_entries"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_votes_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_votes"),
        sa.UniqueConstraint("entry_id", "user_id", name="uq_votes_entry_id_user_id"),
    )
    op.create_index("ix_votes_entry_id", "votes", ["entry_id"], unique=False)
    op.create_index("ix_votes_user_id", "votes", ["user_id"], unique=False)

    op.create_table(
        "tags",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("type", tag_type_enum, nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_tags"),
        sa.UniqueConstraint("type", "slug", name="uq_tags_type_slug"),
    )

    op.create_table(
        "entry_tags",
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE", name="fk_entry_tags_entry_id_entries"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE", name="fk_entry_tags_tag_id_tags"),
        sa.PrimaryKeyConstraint("entry_id", "tag_id", name="pk_entry_tags"),
    )

    op.create_table(
        "reports",
        sa.Column("reporter_user_id", sa.Uuid(), nullable=False),
        sa.Column("target_type", report_target_enum, nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("reason_code", report_reason_enum, nullable=False),
        sa.Column("free_text", sa.Text(), nullable=True),
        sa.Column("status", report_status_enum, nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["reporter_user_id"], ["users.id"], name="fk_reports_reporter_user_id_users"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], name="fk_reports_reviewed_by_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_reports"),
    )
    op.create_index("ix_reports_status", "reports", ["status"], unique=False)

    op.create_table(
        "moderation_actions",
        sa.Column("moderator_user_id", sa.Uuid(), nullable=False),
        sa.Column("action_type", sa.String(length=120), nullable=False),
        sa.Column("target_type", sa.String(length=50), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["moderator_user_id"],
            ["users.id"],
            name="fk_moderation_actions_moderator_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_moderation_actions"),
    )

    op.create_table(
        "rate_limit_events",
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("scope_key", sa.String(length=180), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_rate_limit_events"),
    )
    op.create_index("ix_rate_limit_events_action", "rate_limit_events", ["action"], unique=False)
    op.create_index("ix_rate_limit_events_scope_key", "rate_limit_events", ["scope_key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_rate_limit_events_scope_key", table_name="rate_limit_events")
    op.drop_index("ix_rate_limit_events_action", table_name="rate_limit_events")
    op.drop_table("rate_limit_events")
    op.drop_table("moderation_actions")

    op.drop_index("ix_reports_status", table_name="reports")
    op.drop_table("reports")

    op.drop_table("entry_tags")
    op.drop_table("tags")

    op.drop_index("ix_votes_user_id", table_name="votes")
    op.drop_index("ix_votes_entry_id", table_name="votes")
    op.drop_table("votes")

    op.drop_index("ix_examples_entry_id", table_name="examples")
    op.drop_table("examples")

    op.drop_constraint("fk_entries_current_version_id", "entries", type_="foreignkey")
    op.drop_table("entry_versions")

    op.drop_index("ix_entries_status", table_name="entries")
    op.drop_index("ix_entries_normalized_headword", table_name="entries")
    op.drop_index("ix_entries_slug", table_name="entries")
    op.drop_table("entries")

    op.drop_index("ix_sessions_token_hash", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("profiles")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
