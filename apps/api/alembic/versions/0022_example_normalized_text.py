"""add normalized example text

Revision ID: 0022_example_normalized_text
Revises: 0021_flashcards_sessions
Create Date: 2026-04-09 00:00:00.000000

"""

from collections.abc import Sequence
import re
import unicodedata

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0022_example_normalized_text"
down_revision: str | Sequence[str] | None = "0021_flashcards_sessions"
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
    op.add_column(
        "examples",
        sa.Column("normalized_sentence_original", sa.Text(), nullable=True),
    )
    op.add_column(
        "examples",
        sa.Column("normalized_translation_pt", sa.Text(), nullable=True),
    )
    op.add_column(
        "examples",
        sa.Column("normalized_translation_en", sa.Text(), nullable=True),
    )
    op.create_index(
        op.f("ix_examples_normalized_sentence_original"),
        "examples",
        ["normalized_sentence_original"],
        unique=False,
    )
    op.create_index(
        op.f("ix_examples_normalized_translation_pt"),
        "examples",
        ["normalized_translation_pt"],
        unique=False,
    )
    op.create_index(
        op.f("ix_examples_normalized_translation_en"),
        "examples",
        ["normalized_translation_en"],
        unique=False,
    )

    connection = op.get_bind()
    examples = sa.table(
        "examples",
        sa.column("id", sa.Uuid()),
        sa.column("sentence_original", sa.Text()),
        sa.column("translation_pt", sa.Text()),
        sa.column("translation_en", sa.Text()),
        sa.column("normalized_sentence_original", sa.Text()),
        sa.column("normalized_translation_pt", sa.Text()),
        sa.column("normalized_translation_en", sa.Text()),
    )

    rows = connection.execute(
        sa.select(
            examples.c.id,
            examples.c.sentence_original,
            examples.c.translation_pt,
            examples.c.translation_en,
        )
    ).all()
    for example_id, sentence_original, translation_pt, translation_en in rows:
        normalized_sentence = _normalize_search_query(sentence_original) or ""
        normalized_pt = _normalize_search_query(translation_pt)
        normalized_en = _normalize_search_query(translation_en)
        connection.execute(
            examples.update()
            .where(examples.c.id == example_id)
            .values(
                normalized_sentence_original=normalized_sentence,
                normalized_translation_pt=normalized_pt,
                normalized_translation_en=normalized_en,
            )
        )

    op.alter_column("examples", "normalized_sentence_original", nullable=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_examples_normalized_translation_en"), table_name="examples")
    op.drop_index(op.f("ix_examples_normalized_translation_pt"), table_name="examples")
    op.drop_index(op.f("ix_examples_normalized_sentence_original"), table_name="examples")
    op.drop_column("examples", "normalized_translation_en")
    op.drop_column("examples", "normalized_translation_pt")
    op.drop_column("examples", "normalized_sentence_original")
