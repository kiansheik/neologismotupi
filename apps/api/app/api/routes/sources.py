import uuid
from collections import defaultdict

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, or_, select

from app.core.deps import SessionDep
from app.core.enums import EntryStatus, ExampleStatus
from app.core.errors import raise_api_error
from app.models.entry import Entry, Example
from app.models.source import SourceEdition, SourceLink, SourceWork
from app.schemas.sources import (
    SourceDetailOut,
    SourceEditionStatsOut,
    SourceEntryRefOut,
    SourceExampleRefOut,
    SourceLinkOut,
    SourceSuggestionOut,
)
from app.services.sources import build_source_citation, search_sources

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceSuggestionOut])
async def list_sources(
    db: SessionDep,
    query: str = Query(min_length=1, max_length=255),
    limit: int = Query(default=10, ge=1, le=25),
) -> list[SourceSuggestionOut]:
    rows = await search_sources(db, query=query, limit=limit)
    out: list[SourceSuggestionOut] = []
    for work_id, edition_id, authors, title, publication_year, edition_label in rows:
        citation = build_source_citation(
            authors=authors,
            title=title,
            publication_year=publication_year,
            edition_label=edition_label,
            pages=None,
        )
        if citation is None:
            continue
        out.append(
            SourceSuggestionOut(
                work_id=work_id,
                edition_id=edition_id,
                authors=authors,
                title=title,
                publication_year=publication_year,
                edition_label=edition_label,
                citation=citation,
            )
        )
    return out


@router.get("/{work_id}", response_model=SourceDetailOut)
async def get_source_detail(
    work_id: uuid.UUID,
    db: SessionDep,
    entry_limit: int = Query(default=100, ge=1, le=250),
    example_limit: int = Query(default=100, ge=1, le=250),
) -> SourceDetailOut:
    work = (await db.execute(select(SourceWork).where(SourceWork.id == work_id))).scalar_one_or_none()
    if work is None:
        raise_api_error(status_code=404, code="source_not_found", message="Source not found")

    hidden_example_statuses = [ExampleStatus.hidden, ExampleStatus.rejected]

    entry_count_expr = func.count(func.distinct(Entry.id))
    example_count_expr = func.count(func.distinct(Example.id))

    edition_rows = (
        await db.execute(
            select(
                SourceEdition.id,
                SourceEdition.publication_year,
                SourceEdition.edition_label,
                entry_count_expr.label("entry_count"),
                example_count_expr.label("example_count"),
            )
            .select_from(SourceEdition)
            .outerjoin(
                Entry,
                and_(
                    Entry.source_edition_id == SourceEdition.id,
                    Entry.status != EntryStatus.rejected,
                ),
            )
            .outerjoin(
                Example,
                and_(
                    Example.source_edition_id == SourceEdition.id,
                    Example.status.notin_(hidden_example_statuses),
                ),
            )
            .where(SourceEdition.work_id == work_id)
            .group_by(
                SourceEdition.id,
                SourceEdition.publication_year,
                SourceEdition.edition_label,
            )
            .having(
                or_(
                    entry_count_expr > 0,
                    example_count_expr > 0,
                )
            )
            .order_by(SourceEdition.publication_year.desc().nullslast(), SourceEdition.edition_label.asc().nullsfirst())
        )
    ).all()
    edition_ids = [edition_id for edition_id, *_ in edition_rows]
    links_by_edition: dict[uuid.UUID, list[SourceLink]] = defaultdict(list)
    if edition_ids:
        links = (
            await db.execute(
                select(SourceLink)
                .where(SourceLink.edition_id.in_(edition_ids))
                .order_by(SourceLink.created_at.desc())
            )
        ).scalars().all()
        for link in links:
            links_by_edition[link.edition_id].append(link)

    entries_count = int(
        (
            await db.execute(
                select(func.count(func.distinct(Entry.id)))
                .select_from(Entry)
                .join(SourceEdition, SourceEdition.id == Entry.source_edition_id)
                .where(
                    SourceEdition.work_id == work_id,
                    Entry.status != EntryStatus.rejected,
                )
            )
        ).scalar_one()
    )
    examples_count = int(
        (
            await db.execute(
                select(func.count(func.distinct(Example.id)))
                .select_from(Example)
                .join(SourceEdition, SourceEdition.id == Example.source_edition_id)
                .join(Entry, Entry.id == Example.entry_id)
                .where(
                    SourceEdition.work_id == work_id,
                    Example.status.notin_(hidden_example_statuses),
                    Entry.status != EntryStatus.rejected,
                )
            )
        ).scalar_one()
    )

    if entries_count == 0 and examples_count == 0:
        raise_api_error(status_code=404, code="source_not_found", message="Source not found")

    entry_rows = (
        await db.execute(
            select(
                Entry.id,
                Entry.slug,
                Entry.headword,
                Entry.status,
                Entry.created_at,
            )
            .join(SourceEdition, SourceEdition.id == Entry.source_edition_id)
            .where(
                SourceEdition.work_id == work_id,
                Entry.status != EntryStatus.rejected,
            )
            .order_by(Entry.created_at.desc())
            .limit(entry_limit)
        )
    ).all()

    example_rows = (
        await db.execute(
            select(
                Example.id,
                Example.entry_id,
                Entry.slug,
                Entry.headword,
                Example.sentence_original,
                Example.status,
                Example.created_at,
            )
            .join(SourceEdition, SourceEdition.id == Example.source_edition_id)
            .join(Entry, Entry.id == Example.entry_id)
            .where(
                SourceEdition.work_id == work_id,
                Example.status.notin_(hidden_example_statuses),
                Entry.status != EntryStatus.rejected,
            )
            .order_by(Example.created_at.desc())
            .limit(example_limit)
        )
    ).all()

    return SourceDetailOut(
        work_id=work.id,
        authors=work.authors,
        title=work.title,
        editions=[
            SourceEditionStatsOut(
                edition_id=edition_id,
                publication_year=publication_year,
                edition_label=edition_label,
                entry_count=int(entry_count or 0),
                example_count=int(example_count or 0),
                links=[
                    SourceLinkOut(id=link.id, url=link.url, created_at=link.created_at)
                    for link in links_by_edition.get(edition_id, [])
                ],
            )
            for edition_id, publication_year, edition_label, entry_count, example_count in edition_rows
        ],
        entries_count=entries_count,
        examples_count=examples_count,
        entries=[
            SourceEntryRefOut(
                id=entry_id,
                slug=slug,
                headword=headword,
                status=status,
                created_at=created_at,
            )
            for entry_id, slug, headword, status, created_at in entry_rows
        ],
        examples=[
            SourceExampleRefOut(
                id=example_id,
                entry_id=entry_id,
                entry_slug=entry_slug,
                entry_headword=entry_headword,
                sentence_original=sentence_original,
                status=status,
                created_at=created_at,
            )
            for example_id, entry_id, entry_slug, entry_headword, sentence_original, status, created_at in example_rows
        ],
    )
