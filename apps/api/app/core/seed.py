import asyncio
import csv
import os
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EntryStatus, ExampleStatus, TagType
from app.core.utils import collapse_whitespace, normalize_text, slugify
from app.db import AsyncSessionLocal
from app.models.entry import Entry, EntryTag, Example, Tag
from app.models.user import Profile, User
from app.security import hash_password
from app.services.entries import create_entry_version

PRIMARY_SEED_CSV_PATH = Path.home() / "nhe-enga" / "neologisms.csv"
LEGACY_SEED_CSV_PATH = Path.home() / "code" / "nhe-enga" / "neologisms.csv"
DEFAULT_ADMIN_EMAIL = "kiansheik3128@gmail.com"


def _clean(value: str | None, *, limit: int | None = None) -> str | None:
    if value is None:
        return None
    cleaned = collapse_whitespace(value)
    if cleaned == "":
        return None
    if limit is not None:
        return cleaned[:limit]
    return cleaned


def _resolve_seed_csv_path() -> Path:
    raw_path = os.environ.get("SEED_CSV_PATH")
    if raw_path:
        return Path(raw_path).expanduser()
    if PRIMARY_SEED_CSV_PATH.exists():
        return PRIMARY_SEED_CSV_PATH
    return LEGACY_SEED_CSV_PATH


def _parse_timestamp(value: str | None) -> datetime | None:
    cleaned = _clean(value)
    if not cleaned:
        return None

    for fmt in ("%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%Y"):
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return parsed.replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _map_part_of_speech(value: str | None) -> str:
    cleaned = normalize_text(_clean(value) or "")
    if "substant" in cleaned:
        return "noun"
    if "verb" in cleaned:
        return "verb"
    if "adjet" in cleaned:
        return "adjective"
    if "adv" in cleaned:
        return "adverb"
    if "pron" in cleaned:
        return "pronoun"
    if "part" in cleaned:
        return "particle"
    if "express" in cleaned:
        return "expression"
    return "other"


def _display_name_from_email(email: str) -> str:
    local_part = email.split("@", maxsplit=1)[0]
    local_part = local_part.replace(".", " ").replace("_", " ").replace("-", " ").strip()
    return local_part.title()[:120] or "Community Member"


async def _get_or_create_user(
    db: AsyncSession,
    *,
    cache: dict[str, User],
    email: str,
    display_name: str,
    is_superuser: bool = False,
    is_verified: bool = False,
) -> User:
    normalized_email = email.lower().strip()
    cached_user = cache.get(normalized_email)
    if cached_user is not None:
        if is_superuser and not cached_user.is_superuser:
            cached_user.is_superuser = True
        if is_verified and not cached_user.is_verified:
            cached_user.is_verified = True
        return cached_user

    user = (
        await db.execute(select(User).where(User.email == normalized_email))
    ).scalar_one_or_none()
    if user is None:
        user = User(
            email=normalized_email,
            hashed_password=hash_password("seed-import-password"),
            is_active=True,
            is_verified=is_verified,
            is_superuser=is_superuser,
        )
        db.add(user)
        await db.flush()
        db.add(Profile(user_id=user.id, display_name=display_name[:120]))
    else:
        if is_superuser and not user.is_superuser:
            user.is_superuser = True
        if is_verified and not user.is_verified:
            user.is_verified = True
        profile = (await db.execute(select(Profile).where(Profile.user_id == user.id))).scalar_one_or_none()
        if profile is None:
            db.add(Profile(user_id=user.id, display_name=display_name[:120]))

    cache[normalized_email] = user
    return user


def _collect_submitter_emails(csv_path: Path) -> list[str]:
    emails: list[str] = []
    seen: set[str] = set()
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            email = _clean(row.get("Email Address"))
            if not email:
                continue
            normalized = email.lower().strip()
            if normalized in seen:
                continue
            seen.add(normalized)
            emails.append(normalized)
    return emails


async def _get_or_create_tag(
    db: AsyncSession,
    *,
    cache: dict[tuple[str, str], Tag],
    type_: TagType,
    name: str,
) -> Tag | None:
    normalized_name = _clean(name, limit=120)
    if not normalized_name:
        return None

    slug = slugify(normalized_name)[:140]
    if not slug:
        return None

    key = (type_.value, slug)
    if key in cache:
        return cache[key]

    tag = (
        await db.execute(select(Tag).where(and_(Tag.type == type_, Tag.slug == slug)))
    ).scalar_one_or_none()
    if tag is None:
        tag = Tag(name=normalized_name, type=type_, slug=slug)
        db.add(tag)
        await db.flush()

    cache[key] = tag
    return tag


async def _ensure_unique_slug(db: AsyncSession, base_slug: str) -> str:
    slug = base_slug or "entry"
    counter = 2
    while True:
        exists = (await db.execute(select(Entry.id).where(Entry.slug == slug))).scalar_one_or_none()
        if exists is None:
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1


async def _seed_from_csv(
    db: AsyncSession,
    *,
    csv_path: Path,
    admin_user: User,
    default_submitter_user: User,
    user_cache: dict[str, User],
) -> tuple[int, int, int]:
    created_entries = 0
    created_examples = 0
    skipped_rows = 0

    tag_cache: dict[tuple[str, str], Tag] = {}

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    for row in rows:
        headword = _clean(row.get("Verbete"), limit=180)
        if not headword:
            skipped_rows += 1
            continue

        gloss_pt = _clean(row.get("Definição Portuguesa"), limit=255)
        gloss_en = _clean(row.get("English Definition"), limit=255)
        normalized_headword = normalize_text(headword)

        # Keep idempotence by using semantic identity for imported rows.
        existing_entry = (
            await db.execute(
                select(Entry).where(
                    and_(
                        Entry.normalized_headword == normalized_headword,
                        Entry.gloss_pt == gloss_pt,
                        Entry.gloss_en == gloss_en,
                    )
                )
            )
        ).scalar_one_or_none()
        if existing_entry is not None:
            skipped_rows += 1
            continue

        source = _clean(row.get("Fonte"))
        source_date = _clean(row.get("Data da Fonte"))
        source_page = _clean(row.get("Pagina(s) na Fonte"))
        source_evidence = _clean(row.get("Evidência"))
        source_evidence_url = _clean(row.get("Evidência (URL)"))
        source_citation_parts: list[str] = []
        if source:
            source_citation_parts.append(source)
        if source_page:
            source_citation_parts.append(f"p. {source_page}")
        if source_date:
            source_citation_parts.append(source_date)
        source_citation = " · ".join(source_citation_parts) if source_citation_parts else None

        morphology_parts: list[str] = []
        bases = _clean(row.get("Verbete(s) Base(s)"))
        if bases:
            morphology_parts.append(f"Bases: {bases}")
        pluriforme = _clean(row.get("Pluriforme"))
        if pluriforme:
            morphology_parts.append(f"Pluriforme: {pluriforme}")
        transitividade = _clean(row.get("Transitividade"))
        if transitividade:
            morphology_parts.append(f"Transitividade: {transitividade}")
        if source:
            morphology_parts.append(f"Fonte: {source}")
        if source_date:
            morphology_parts.append(f"Data da fonte: {source_date}")
        if source_page:
            morphology_parts.append(f"Página(s): {source_page}")
        if source_evidence:
            morphology_parts.append(f"Evidência: {source_evidence}")
        if source_evidence_url:
            morphology_parts.append(f"URL: {source_evidence_url}")

        morphology_notes = "\n".join(morphology_parts) if morphology_parts else None
        short_definition = (
            _clean(row.get("Definição Portuguesa"))
            or _clean(row.get("English Definition"))
            or "Imported from community CSV."
        )

        email = _clean(row.get("Email Address"))
        if email:
            proposer = await _get_or_create_user(
                db,
                cache=user_cache,
                email=email,
                display_name=_display_name_from_email(email),
            )
        else:
            proposer = default_submitter_user

        entry_timestamp = _parse_timestamp(row.get("Timestamp"))
        unique_slug = await _ensure_unique_slug(db, slugify(headword))

        entry = Entry(
            slug=unique_slug,
            headword=headword,
            normalized_headword=normalized_headword,
            gloss_pt=gloss_pt,
            gloss_en=gloss_en,
            part_of_speech=_map_part_of_speech(row.get("Categoria Gramatical")),
            short_definition=short_definition,
            source_citation=source_citation,
            morphology_notes=morphology_notes,
            status=EntryStatus.approved,
            proposer_user_id=proposer.id,
            approved_at=datetime.now(UTC),
            approved_by_user_id=admin_user.id,
            created_at=entry_timestamp or datetime.now(UTC),
            updated_at=entry_timestamp or datetime.now(UTC),
        )
        db.add(entry)
        await db.flush()

        grammar_tag = await _get_or_create_tag(
            db,
            cache=tag_cache,
            type_=TagType.grammar,
            name=_clean(row.get("Categoria Gramatical"), limit=120) or "other",
        )
        if grammar_tag:
            db.add(EntryTag(entry_id=entry.id, tag_id=grammar_tag.id))

        if source:
            source_tag = await _get_or_create_tag(
                db,
                cache=tag_cache,
                type_=TagType.community,
                name=source,
            )
            if source_tag:
                db.add(EntryTag(entry_id=entry.id, tag_id=source_tag.id))

        await create_entry_version(
            db,
            entry=entry,
            edited_by_user_id=proposer.id,
            edit_summary="Imported from neologisms.csv",
        )

        attestation = _clean(row.get("Atestação"))
        if attestation:
            existing_example = (
                await db.execute(
                    select(Example.id).where(
                        and_(Example.entry_id == entry.id, Example.sentence_original == attestation)
                    )
                )
            ).scalar_one_or_none()

            if existing_example is None:
                usage_note_parts: list[str] = []
                if source_evidence and source_evidence != attestation:
                    usage_note_parts.append(f"Evidência: {source_evidence}")
                if source_evidence_url:
                    usage_note_parts.append(f"URL: {source_evidence_url}")

                db.add(
                    Example(
                        entry_id=entry.id,
                        user_id=proposer.id,
                        sentence_original=attestation,
                        translation_pt=_clean(row.get("Tradução Portuguesa")),
                        translation_en=_clean(row.get("Tradução Inglesa")),
                        source_citation=source_citation,
                        usage_note=" | ".join(usage_note_parts) if usage_note_parts else None,
                        context_tag=_clean(source, limit=120),
                        status=ExampleStatus.approved,
                        approved_at=datetime.now(UTC),
                        approved_by_user_id=admin_user.id,
                        created_at=entry_timestamp or datetime.now(UTC),
                        updated_at=entry_timestamp or datetime.now(UTC),
                    )
                )
                created_examples += 1

        created_entries += 1

    return created_entries, created_examples, skipped_rows


async def seed() -> None:
    csv_path = _resolve_seed_csv_path()
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Seed CSV not found at {csv_path}. Set SEED_CSV_PATH to the neologisms.csv file."
        )

    submitter_emails = _collect_submitter_emails(csv_path)
    fallback_submitter_email = (
        DEFAULT_ADMIN_EMAIL
        if DEFAULT_ADMIN_EMAIL in submitter_emails
        else (submitter_emails[0] if submitter_emails else DEFAULT_ADMIN_EMAIL)
    )

    async with AsyncSessionLocal() as db:
        user_cache: dict[str, User] = {}
        admin_user = await _get_or_create_user(
            db,
            cache=user_cache,
            email=DEFAULT_ADMIN_EMAIL,
            display_name=_display_name_from_email(DEFAULT_ADMIN_EMAIL),
            is_superuser=True,
            is_verified=True,
        )
        default_submitter_user = await _get_or_create_user(
            db,
            cache=user_cache,
            email=fallback_submitter_email,
            display_name=_display_name_from_email(fallback_submitter_email),
        )
        entries, examples, skipped = await _seed_from_csv(
            db,
            csv_path=csv_path,
            admin_user=admin_user,
            default_submitter_user=default_submitter_user,
            user_cache=user_cache,
        )
        await db.commit()
        print(
            f"Seed complete from CSV: {csv_path} "
            f"(entries created={entries}, examples created={examples}, rows skipped={skipped})."
        )


if __name__ == "__main__":
    asyncio.run(seed())
