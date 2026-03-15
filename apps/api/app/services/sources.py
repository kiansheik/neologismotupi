import uuid

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils import collapse_whitespace, normalize_text
from app.models.entry import Entry
from app.models.source import SourceEdition, SourceWork
from app.schemas.entries import SourceInput


def clean_source_text(value: str | None, *, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    cleaned = collapse_whitespace(value)
    if cleaned == "":
        return None
    if max_length is not None:
        return cleaned[:max_length]
    return cleaned


def normalize_source_text(value: str | None) -> str | None:
    cleaned = clean_source_text(value)
    if cleaned is None:
        return None
    normalized = normalize_text(cleaned)
    return normalized or None


def build_source_citation(
    *,
    authors: str | None,
    title: str | None,
    publication_year: int | None,
    edition_label: str | None,
    pages: str | None,
    fallback: str | None = None,
) -> str | None:
    left = []
    if authors:
        left.append(authors)
    if title:
        left.append(title)
    work_part = ", ".join(left) if left else None

    edition_parts: list[str] = []
    if publication_year is not None:
        edition_parts.append(str(publication_year))
    if edition_label:
        edition_parts.append(edition_label)
    edition_part = " · ".join(edition_parts) if edition_parts else None

    citation_parts: list[str] = []
    if work_part:
        citation_parts.append(work_part)
    if edition_part:
        citation_parts.append(edition_part)
    if pages:
        citation_parts.append(f"p. {pages}")

    if citation_parts:
        return " · ".join(citation_parts)
    return clean_source_text(fallback, max_length=500)


def _null_safe_equals(column, value):
    if value is None:
        return column.is_(None)
    return column == value


async def get_or_create_source_edition(
    db: AsyncSession,
    *,
    source: SourceInput,
) -> tuple[SourceEdition, SourceWork]:
    authors = clean_source_text(source.authors, max_length=255)
    title = clean_source_text(source.title, max_length=400)
    publication_year = source.publication_year
    edition_label = clean_source_text(source.edition_label, max_length=120)

    normalized_authors = normalize_source_text(authors)
    normalized_title = normalize_source_text(title)
    normalized_edition_label = normalize_source_text(edition_label)

    work_stmt = select(SourceWork).where(
        _null_safe_equals(SourceWork.normalized_authors, normalized_authors),
        _null_safe_equals(SourceWork.normalized_title, normalized_title),
    )
    work = (await db.execute(work_stmt)).scalar_one_or_none()
    if work is None:
        work = SourceWork(
            authors=authors,
            title=title,
            normalized_authors=normalized_authors,
            normalized_title=normalized_title,
        )
        db.add(work)
        await db.flush()
    else:
        # Backfill canonical text if this row came from old imports with empty surface fields.
        if not work.authors and authors:
            work.authors = authors
        if not work.title and title:
            work.title = title

    edition_stmt = select(SourceEdition).where(
        SourceEdition.work_id == work.id,
        _null_safe_equals(SourceEdition.publication_year, publication_year),
        _null_safe_equals(SourceEdition.normalized_edition_label, normalized_edition_label),
    )
    edition = (await db.execute(edition_stmt)).scalar_one_or_none()
    if edition is None:
        edition = SourceEdition(
            work_id=work.id,
            publication_year=publication_year,
            edition_label=edition_label,
            normalized_edition_label=normalized_edition_label,
        )
        db.add(edition)
        await db.flush()
    elif not edition.edition_label and edition_label:
        edition.edition_label = edition_label

    return edition, work


type SourceSuggestionRow = tuple[
    uuid.UUID,
    uuid.UUID,
    str | None,
    str | None,
    int | None,
    str | None,
]


async def search_sources(
    db: AsyncSession,
    *,
    query: str,
    limit: int = 10,
) -> list[SourceSuggestionRow]:
    cleaned_query = collapse_whitespace(query)
    if cleaned_query == "":
        return []

    normalized_query = normalize_text(cleaned_query)
    like_query = f"%{cleaned_query}%"
    normalized_like_query = f"%{normalized_query}%"

    stmt = (
        select(
            SourceWork.id,
            SourceEdition.id,
            SourceWork.authors,
            SourceWork.title,
            SourceEdition.publication_year,
            SourceEdition.edition_label,
        )
        .select_from(SourceEdition)
        .join(SourceWork, SourceWork.id == SourceEdition.work_id)
        .outerjoin(Entry, Entry.source_edition_id == SourceEdition.id)
        .where(
            or_(
                SourceWork.authors.ilike(like_query),
                SourceWork.title.ilike(like_query),
                SourceEdition.edition_label.ilike(like_query),
                cast(SourceEdition.publication_year, String).ilike(like_query),
                SourceWork.normalized_authors.ilike(normalized_like_query),
                SourceWork.normalized_title.ilike(normalized_like_query),
            )
        )
        .group_by(
            SourceWork.id,
            SourceEdition.id,
            SourceWork.authors,
            SourceWork.title,
            SourceEdition.publication_year,
            SourceEdition.edition_label,
        )
        .order_by(
            func.count(Entry.id).desc(),
            SourceWork.updated_at.desc(),
            SourceEdition.updated_at.desc(),
        )
        .limit(limit)
    )
    return [tuple(row) for row in (await db.execute(stmt)).all()]
