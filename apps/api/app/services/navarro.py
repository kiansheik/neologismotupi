import asyncio
import hashlib
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils import normalize_search_query, normalize_text
from app.models.navarro import NavarroEntry


@dataclass(frozen=True)
class NavarroCacheEntry:
    id: uuid.UUID
    first_word: str
    optional_number: str
    definition: str
    normalized_headword: str
    search_text: str
    index: int


_cache_lock = asyncio.Lock()
_cache_loaded = False
_cache: list[NavarroCacheEntry] = []
_cache_by_id: dict[uuid.UUID, NavarroCacheEntry] = {}
_cache_payload: list[dict[str, str]] = []
_cache_version: str | None = None


async def load_navarro_cache(db: AsyncSession) -> None:
    global _cache_loaded, _cache, _cache_by_id, _cache_payload, _cache_version
    if _cache_loaded:
        return
    async with _cache_lock:
        if _cache_loaded:
            return
        rows = (await db.execute(select(NavarroEntry))).scalars().all()
        cache: list[NavarroCacheEntry] = []
        cache_by_id: dict[uuid.UUID, NavarroCacheEntry] = {}
        payload: list[dict[str, str]] = []
        hasher = hashlib.sha256()
        for index, row in enumerate(rows):
            normalized_headword = row.normalized_headword or normalize_text(row.first_word)
            search_text = row.search_text or normalize_search_query(
                f"{row.first_word} {row.optional_number} {row.definition}"
            )
            entry = NavarroCacheEntry(
                id=row.id,
                first_word=row.first_word,
                optional_number=row.optional_number or "",
                definition=row.definition or "",
                normalized_headword=normalized_headword,
                search_text=search_text,
                index=index,
            )
            cache.append(entry)
            cache_by_id[entry.id] = entry
            payload_item = {
                "id": str(entry.id),
                "first_word": entry.first_word,
                "optional_number": entry.optional_number,
                "definition": entry.definition,
            }
            payload.append(payload_item)
            hasher.update(entry.id.bytes)
            hasher.update(entry.first_word.encode("utf-8", errors="ignore"))
            hasher.update(entry.optional_number.encode("utf-8", errors="ignore"))
            hasher.update(entry.definition.encode("utf-8", errors="ignore"))
        _cache = cache
        _cache_by_id = cache_by_id
        _cache_payload = payload
        _cache_version = hasher.hexdigest()
        _cache_loaded = True


async def _ensure_cache(db: AsyncSession) -> None:
    if not _cache_loaded:
        await load_navarro_cache(db)


async def search_navarro_entries(
    db: AsyncSession,
    query: str,
    limit: int = 10,
) -> list[NavarroCacheEntry]:
    await _ensure_cache(db)
    normalized_query = normalize_search_query(query)
    if not normalized_query:
        return []
    matches: list[tuple[tuple[int, int, int], NavarroCacheEntry]] = []
    for entry in _cache:
        if normalized_query not in entry.search_text:
            continue
        exact = entry.normalized_headword == normalized_query
        headword_match = normalized_query in entry.normalized_headword
        rank = (
            0 if exact else 1,
            0 if headword_match else 1,
            entry.index,
        )
        matches.append((rank, entry))
    matches.sort(key=lambda item: item[0])
    return [entry for _, entry in matches[:limit]]


async def get_navarro_entry(db: AsyncSession, entry_id: uuid.UUID) -> NavarroCacheEntry | None:
    await _ensure_cache(db)
    return _cache_by_id.get(entry_id)


async def get_navarro_cache_payload(db: AsyncSession) -> tuple[list[dict[str, str]], str]:
    await _ensure_cache(db)
    return _cache_payload, _cache_version or ""
