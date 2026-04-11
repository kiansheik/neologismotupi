"""add navarro dictionary entries

Revision ID: 0029_navarro_entries
Revises: 0028_flashcard_lists
Create Date: 2026-04-11 00:00:00.000000

"""

from __future__ import annotations

import gzip
import json
import uuid
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0029_navarro_entries"
down_revision: str | None = "0028_flashcard_lists"
branch_labels: str | None = None
depends_on: str | None = None

NAMESPACE = uuid.UUID("6dbe4e84-7d2d-46a5-84d1-64b75a4f5c44")


def _collapse_whitespace(value: str) -> str:
    return " ".join(value.split()).strip()


def _normalize_text(value: str) -> str:
    import unicodedata

    collapsed = _collapse_whitespace(value).lower()
    normalized = unicodedata.normalize("NFD", collapsed)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _normalize_search(value: str) -> str:
    normalized = _normalize_text(value).replace("-", " ")
    return _collapse_whitespace(normalized)


def _load_navarro_entries() -> list[dict[str, Any]]:
    migration_dir = Path(__file__).resolve()
    api_root = migration_dir.parents[2]
    candidates = [
        api_root / "app" / "data" / "navarro_dict.json.gz",
        api_root / "app" / "data" / "navarro_dict.json",
        api_root.parent / "web" / "public" / "etymology" / "dict-conjugated.json",
        api_root.parent.parent / "apps" / "web" / "public" / "etymology" / "dict-conjugated.json",
        api_root.parent / "nhe-enga" / "docs" / "tupi_dict_navarro.json",
        api_root.parent.parent / "nhe-enga" / "docs" / "tupi_dict_navarro.json",
        api_root / "docs" / "tupi_dict_navarro.json",
    ]
    data: list[dict[str, Any]] | None = None
    for path in candidates:
        if not path.exists():
            continue
        raw = path.read_bytes()
        if raw[:2] == b"\x1f\x8b":
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                data = json.load(handle)
        else:
            data = json.loads(raw.decode("utf-8"))
        break
    if data is None:
        raise FileNotFoundError("Navarro dictionary source JSON not found.")
    if data and "f" in data[0]:
        return [
            {
                "first_word": entry.get("f", ""),
                "optional_number": entry.get("o", ""),
                "definition": entry.get("d", ""),
            }
            for entry in data
        ]
    return data


def upgrade() -> None:
    op.create_table(
        "navarro_entries",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("first_word", sa.String(length=200), nullable=False),
        sa.Column("optional_number", sa.String(length=32), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("normalized_headword", sa.String(length=200), nullable=False),
        sa.Column("search_text", sa.Text(), nullable=False),
    )
    op.create_index(op.f("ix_navarro_entries_normalized_headword"), "navarro_entries", ["normalized_headword"])
    op.create_index(op.f("ix_navarro_entries_search_text"), "navarro_entries", ["search_text"])

    entries = _load_navarro_entries()
    table = sa.table(
        "navarro_entries",
        sa.Column("id", sa.Uuid()),
        sa.Column("first_word", sa.String()),
        sa.Column("optional_number", sa.String()),
        sa.Column("definition", sa.Text()),
        sa.Column("normalized_headword", sa.String()),
        sa.Column("search_text", sa.Text()),
    )

    connection = op.get_bind()
    batch: list[dict[str, Any]] = []
    seen_keys: dict[str, int] = {}
    for entry in entries:
        first_word = (entry.get("first_word") or "").strip()
        optional_number = (entry.get("optional_number") or "").strip()
        definition = (entry.get("definition") or "").strip()
        base_key = f"{first_word}||{optional_number}||{definition}"
        seen_keys[base_key] = seen_keys.get(base_key, 0) + 1
        unique_key = base_key if seen_keys[base_key] == 1 else f"{base_key}||{seen_keys[base_key]}"
        entry_id = uuid.uuid5(NAMESPACE, unique_key)
        normalized_headword = _normalize_text(first_word)
        search_text = _normalize_search(f"{first_word} {optional_number} {definition}")
        batch.append(
            {
                "id": entry_id,
                "first_word": first_word,
                "optional_number": optional_number,
                "definition": definition,
                "normalized_headword": normalized_headword,
                "search_text": search_text,
            }
        )
        if len(batch) >= 500:
            connection.execute(table.insert(), batch)
            batch.clear()
    if batch:
        connection.execute(table.insert(), batch)


def downgrade() -> None:
    op.drop_index(op.f("ix_navarro_entries_search_text"), table_name="navarro_entries")
    op.drop_index(op.f("ix_navarro_entries_normalized_headword"), table_name="navarro_entries")
    op.drop_table("navarro_entries")
