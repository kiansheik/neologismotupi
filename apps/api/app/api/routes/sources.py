from fastapi import APIRouter, Query

from app.core.deps import SessionDep
from app.schemas.sources import SourceSuggestionOut
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
