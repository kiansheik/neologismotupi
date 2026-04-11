import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, Response

from app.core.deps import SessionDep
from app.core.errors import raise_api_error
from app.schemas.navarro import NavarroEntryOut
from app.services.navarro import (
    get_navarro_cache_payload,
    get_navarro_entry,
    search_navarro_entries,
)


router = APIRouter(prefix="/navarro", tags=["navarro"])


@router.get("/search", response_model=list[NavarroEntryOut])
async def search_navarro(
    db: SessionDep,
    q: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
) -> list[NavarroEntryOut]:
    results = await search_navarro_entries(db, q, limit=limit)
    return [
        NavarroEntryOut(
            id=result.id,
            first_word=result.first_word,
            optional_number=result.optional_number,
            definition=result.definition,
        )
        for result in results
    ]


@router.get("/cache")
async def get_navarro_cache(db: SessionDep, request: Request):
    payload, version = await get_navarro_cache_payload(db)
    etag = f'W/"{version}"' if version else None
    if etag and request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "public, max-age=86400"})
    headers = {"Cache-Control": "public, max-age=86400"}
    if etag:
        headers["ETag"] = etag
    return JSONResponse(content=payload, headers=headers)


@router.get("/{entry_id}", response_model=NavarroEntryOut)
async def get_navarro(entry_id: uuid.UUID, db: SessionDep) -> NavarroEntryOut:
    entry = await get_navarro_entry(db, entry_id)
    if not entry:
        raise_api_error(status_code=404, code="navarro_not_found", message="Navarro entry not found")
    return NavarroEntryOut(
        id=entry.id,
        first_word=entry.first_word,
        optional_number=entry.optional_number,
        definition=entry.definition,
    )
