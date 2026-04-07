"""add normalized gloss fields

Revision ID: 0015_entry_normalized_gloss
Revises: 0014_audio_samples
Create Date: 2026-04-07 00:00:00.000000

"""

from collections.abc import Sequence
import re
import unicodedata

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0015_entry_normalized_gloss"
down_revision: str | Sequence[str] | None = "0014_audio_samples"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _normalize_text(value: str) -> str:
    collapsed = _collapse_whitespace(value).lower()
    normalized = unicodedata.normalize("NFD", collapsed)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _normalize_search_query(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = _normalize_text(value).replace("-", " ")
    return _collapse_whitespace(normalized)


def upgrade() -> None:
    op.add_column("entries", sa.Column("normalized_gloss_pt", sa.String(length=255), nullable=True))
    op.add_column("entries", sa.Column("normalized_gloss_en", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_entries_normalized_gloss_pt"), "entries", ["normalized_gloss_pt"], unique=False)
    op.create_index(op.f("ix_entries_normalized_gloss_en"), "entries", ["normalized_gloss_en"], unique=False)

    connection = op.get_bind()
    entries = sa.table(
        "entries",
        sa.column("id", sa.Uuid()),
        sa.column("gloss_pt", sa.String()),
        sa.column("gloss_en", sa.String()),
        sa.column("normalized_gloss_pt", sa.String()),
        sa.column("normalized_gloss_en", sa.String()),
    )

    rows = connection.execute(sa.select(entries.c.id, entries.c.gloss_pt, entries.c.gloss_en)).all()
    for entry_id, gloss_pt, gloss_en in rows:
        normalized_pt = _normalize_search_query(gloss_pt)
        normalized_en = _normalize_search_query(gloss_en)
        connection.execute(
            entries.update()
            .where(entries.c.id == entry_id)
            .values(normalized_gloss_pt=normalized_pt, normalized_gloss_en=normalized_en)
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_entries_normalized_gloss_en"), table_name="entries")
    op.drop_index(op.f("ix_entries_normalized_gloss_pt"), table_name="entries")
    op.drop_column("entries", "normalized_gloss_en")
    op.drop_column("entries", "normalized_gloss_pt")
