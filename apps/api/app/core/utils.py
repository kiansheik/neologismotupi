import re
import unicodedata


def collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_text(value: str) -> str:
    collapsed = collapse_whitespace(value).lower()
    normalized = unicodedata.normalize("NFD", collapsed)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def normalize_search_query(value: str) -> str:
    normalized = normalize_text(value).replace("-", " ")
    return collapse_whitespace(normalized)


def slugify(value: str) -> str:
    normalized = normalize_text(value)
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug or "entry"
