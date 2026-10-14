from typing import Annotated

from pydantic import BeforeValidator

from app.core.utils import normalize_apostrophes


# Use on human-authored text, leaving credentials, URLs and program data untouched.
def _normalize_input(value: object) -> object:
    return normalize_apostrophes(value) if isinstance(value, str) else value


CanonicalText = Annotated[str, BeforeValidator(_normalize_input)]
