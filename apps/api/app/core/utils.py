import re
import unicodedata

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

# Keep in sync with apps/web/src/lib/text.ts.
APOSTROPHE_VARIANTS = "\u2018\u2019\u201a\u201b\u02bb\u02bc\u2032\u2035\uff07"
_APOSTROPHE_TRANSLATION = str.maketrans(dict.fromkeys(APOSTROPHE_VARIANTS, "'"))


def normalize_apostrophes(value: str) -> str:
    return value.translate(_APOSTROPHE_TRANSLATION)


def normalize_apostrophes_sql(value: ColumnElement[str]) -> ColumnElement[str]:
    """Match legacy text without rewriting stored content (PostgreSQL and SQLite)."""
    for variant in APOSTROPHE_VARIANTS:
        value = func.replace(value, variant, "'")
    return value


def collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_text(value: str) -> str:
    collapsed = collapse_whitespace(normalize_apostrophes(value)).lower()
    normalized = unicodedata.normalize("NFD", collapsed)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def normalize_search_query(value: str) -> str:
    normalized = normalize_text(value).replace("-", " ")
    return collapse_whitespace(normalized)


def slugify(value: str) -> str:
    normalized = normalize_text(value)
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug or "entry"
