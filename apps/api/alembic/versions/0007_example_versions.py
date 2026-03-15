"""add example versions

Revision ID: 0007_example_versions
Revises: 0006_profile_social_fields
Create Date: 2026-03-15 00:00:00.000000

"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_example_versions"
down_revision: str | Sequence[str] | None = "0006_profile_social_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "example_versions",
        sa.Column("example_id", sa.Uuid(), nullable=False),
        sa.Column("edited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("edit_summary", sa.String(length=280), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["edited_by_user_id"],
            ["users.id"],
            name=op.f("fk_example_versions_edited_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["example_id"],
            ["examples.id"],
            name=op.f("fk_example_versions_example_id_examples"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_example_versions")),
        sa.UniqueConstraint(
            "example_id",
            "version_number",
            name="uq_example_versions_example_id_version_number",
        ),
    )
    op.create_index(
        op.f("ix_example_versions_example_id"),
        "example_versions",
        ["example_id"],
        unique=False,
    )

    connection = op.get_bind()
    example_rows = connection.execute(
        sa.text(
            """
            SELECT
                id,
                entry_id,
                user_id,
                sentence_original,
                translation_pt,
                translation_en,
                source_citation,
                usage_note,
                context_tag,
                status,
                created_at,
                updated_at
            FROM examples
            """
        )
    ).mappings()

    bulk_table = sa.table(
        "example_versions",
        sa.column("id", sa.Uuid()),
        sa.column("example_id", sa.Uuid()),
        sa.column("edited_by_user_id", sa.Uuid()),
        sa.column("version_number", sa.Integer()),
        sa.column("snapshot_json", sa.JSON()),
        sa.column("edit_summary", sa.String(length=280)),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    rows_to_insert: list[dict[str, object]] = []
    for row in example_rows:
        rows_to_insert.append(
            {
                "id": uuid.uuid4(),
                "example_id": row["id"],
                "edited_by_user_id": row["user_id"],
                "version_number": 1,
                "snapshot_json": {
                    "entry_id": str(row["entry_id"]),
                    "sentence_original": row["sentence_original"],
                    "translation_pt": row["translation_pt"],
                    "translation_en": row["translation_en"],
                    "source_citation": row["source_citation"],
                    "usage_note": row["usage_note"],
                    "context_tag": row["context_tag"],
                    "status": row["status"],
                    "updated_at": (
                        row["updated_at"].isoformat()
                        if row["updated_at"] is not None
                        else None
                    ),
                },
                "edit_summary": "Initial submission",
                "created_at": row["created_at"],
            }
        )

    if rows_to_insert:
        op.bulk_insert(bulk_table, rows_to_insert)


def downgrade() -> None:
    op.drop_index(op.f("ix_example_versions_example_id"), table_name="example_versions")
    op.drop_table("example_versions")
