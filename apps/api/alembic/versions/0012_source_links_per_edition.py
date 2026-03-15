"""move source links to source edition scope

Revision ID: 0012_source_links_per_edition
Revises: 0011_source_links
Create Date: 2026-03-15 00:00:00.000000

"""

from collections.abc import Sequence
import uuid

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012_source_links_per_edition"
down_revision: str | Sequence[str] | None = "0011_source_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("source_links", sa.Column("edition_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_source_links_edition_id"), "source_links", ["edition_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_source_links_edition_id_source_editions"),
        "source_links",
        "source_editions",
        ["edition_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint("uq_source_links_work_normalized_url", "source_links", type_="unique")

    conn = op.get_bind()

    edition_rows = conn.execute(
        sa.text(
            """
            SELECT id, work_id
            FROM source_editions
            ORDER BY created_at ASC, id ASC
            """
        )
    ).mappings().all()
    editions_by_work: dict[uuid.UUID, list[uuid.UUID]] = {}
    for row in edition_rows:
        work_id = row["work_id"]
        edition_id = row["id"]
        editions_by_work.setdefault(work_id, []).append(edition_id)

    link_rows = conn.execute(
        sa.text(
            """
            SELECT id, work_id, url, normalized_url, created_by_user_id, created_at, updated_at
            FROM source_links
            """
        )
    ).mappings().all()

    for row in link_rows:
        link_id = row["id"]
        work_id = row["work_id"]
        edition_ids = editions_by_work.get(work_id, [])
        if not edition_ids:
            continue

        primary_edition_id = edition_ids[0]
        conn.execute(
            sa.text("UPDATE source_links SET edition_id = :edition_id WHERE id = :link_id"),
            {"edition_id": primary_edition_id, "link_id": link_id},
        )

        for extra_edition_id in edition_ids[1:]:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO source_links (
                        id,
                        edition_id,
                        url,
                        normalized_url,
                        created_by_user_id,
                        created_at,
                        updated_at
                    ) VALUES (
                        :id,
                        :edition_id,
                        :url,
                        :normalized_url,
                        :created_by_user_id,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "edition_id": extra_edition_id,
                    "url": row["url"],
                    "normalized_url": row["normalized_url"],
                    "created_by_user_id": row["created_by_user_id"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            )

    conn.execute(sa.text("DELETE FROM source_links WHERE edition_id IS NULL"))

    op.alter_column("source_links", "edition_id", nullable=False)
    op.create_unique_constraint(
        "uq_source_links_edition_normalized_url",
        "source_links",
        ["edition_id", "normalized_url"],
    )
    op.drop_constraint(op.f("fk_source_links_work_id_source_works"), "source_links", type_="foreignkey")
    op.drop_index(op.f("ix_source_links_work_id"), table_name="source_links")
    op.drop_column("source_links", "work_id")


def downgrade() -> None:
    op.add_column("source_links", sa.Column("work_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_source_links_work_id"), "source_links", ["work_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_source_links_work_id_source_works"),
        "source_links",
        "source_works",
        ["work_id"],
        ["id"],
        ondelete="CASCADE",
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE source_links AS sl
            SET work_id = se.work_id
            FROM source_editions AS se
            WHERE sl.edition_id = se.id
            """
        )
    )
    conn.execute(sa.text("DELETE FROM source_links WHERE work_id IS NULL"))

    op.drop_constraint("uq_source_links_edition_normalized_url", "source_links", type_="unique")

    conn.execute(
        sa.text(
            """
            DELETE FROM source_links a
            USING source_links b
            WHERE a.work_id = b.work_id
              AND a.normalized_url = b.normalized_url
              AND a.id > b.id
            """
        )
    )

    op.alter_column("source_links", "work_id", nullable=False)
    op.create_unique_constraint(
        "uq_source_links_work_normalized_url",
        "source_links",
        ["work_id", "normalized_url"],
    )

    op.drop_constraint(op.f("fk_source_links_edition_id_source_editions"), "source_links", type_="foreignkey")
    op.drop_index(op.f("ix_source_links_edition_id"), table_name="source_links")
    op.drop_column("source_links", "edition_id")
