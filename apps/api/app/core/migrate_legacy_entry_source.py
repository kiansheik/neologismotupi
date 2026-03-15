import argparse
import asyncio
import re
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import or_, select

from app.core.utils import collapse_whitespace
from app.db import AsyncSessionLocal
from app.models.entry import Entry
from app.models.user import User
from app.services.entries import create_entry_version

LEGACY_SOURCE_MARKERS = (
    "Fonte:",
    "Data da fonte:",
    "Página(s):",
    "Pagina(s):",
    "Evidência:",
    "Evidencia:",
    "URL:",
)

EMPTY_PLURIFORM_VALUES = {
    "nenhuma",
    "nenhum",
    "none",
    "na",
    "n/a",
    "-",
    "",
}


@dataclass
class ParsedLegacyFields:
    morphology_notes: str | None
    source_citation: str | None
    extracted_any_source: bool


def _parse_line_value(line: str, prefix: str) -> str | None:
    if not line.lower().startswith(prefix.lower()):
        return None
    value = collapse_whitespace(line[len(prefix) :])
    return value or None


def _format_page_reference(page_value: str) -> str:
    compact = page_value.strip()
    lower = compact.lower()
    if re.match(r"^(p\\.?|pg\\.?|minuto|cap\\.?|sec\\.?|se[cç][aã]o)", lower):
        return compact
    return f"pg. {compact}"


def parse_legacy_morphology(raw_notes: str | None) -> ParsedLegacyFields:
    if not raw_notes:
        return ParsedLegacyFields(
            morphology_notes=None,
            source_citation=None,
            extracted_any_source=False,
        )

    lines = [collapse_whitespace(part) for part in raw_notes.splitlines()]
    lines = [line for line in lines if line]

    source: str | None = None
    source_date: str | None = None
    source_page: str | None = None
    source_evidence: str | None = None
    source_url: str | None = None
    kept_lines: list[str] = []

    for line in lines:
        value = _parse_line_value(line, "Fonte:")
        if value is not None:
            source = value
            continue

        value = _parse_line_value(line, "Data da fonte:")
        if value is not None:
            source_date = value
            continue

        value = _parse_line_value(line, "Página(s):")
        if value is None:
            value = _parse_line_value(line, "Pagina(s):")
        if value is not None:
            source_page = value
            continue

        value = _parse_line_value(line, "Evidência:")
        if value is None:
            value = _parse_line_value(line, "Evidencia:")
        if value is not None:
            source_evidence = value
            continue

        value = _parse_line_value(line, "URL:")
        if value is not None:
            source_url = value
            continue

        pluriform_value = _parse_line_value(line, "Pluriforme:")
        if pluriform_value is not None and pluriform_value.lower() in EMPTY_PLURIFORM_VALUES:
            continue

        kept_lines.append(line)

    source_parts: list[str] = []
    if source:
        source_parts.append(source)
    if source_date:
        source_parts.append(source_date)
    if source_page:
        source_parts.append(_format_page_reference(source_page))
    if source_evidence:
        source_parts.append(source_evidence)
    if source_url:
        source_parts.append(source_url)

    normalized_source = ", ".join(source_parts) if source_parts else None
    normalized_morphology = "\n".join(kept_lines).strip() or None

    extracted_any = any([source, source_date, source_page, source_evidence, source_url])
    return ParsedLegacyFields(
        morphology_notes=normalized_morphology,
        source_citation=normalized_source,
        extracted_any_source=extracted_any,
    )


async def migrate_legacy_sources(
    *,
    apply_changes: bool,
    actor_email: str,
    before_slug: str | None,
    before_date: str | None,
    limit: int | None,
) -> None:
    async with AsyncSessionLocal() as db:
        actor = (
            await db.execute(select(User).where(User.email == actor_email.strip().lower()))
        ).scalar_one_or_none()
        if actor is None:
            raise SystemExit(f"Actor user not found: {actor_email}")

        cutoff_dt: datetime | None = None
        if before_slug:
            marker_entry = (
                await db.execute(select(Entry).where(Entry.slug == before_slug.strip()))
            ).scalar_one_or_none()
            if marker_entry is None:
                raise SystemExit(f"Marker slug not found: {before_slug}")
            cutoff_dt = marker_entry.created_at
        elif before_date:
            try:
                parsed = datetime.fromisoformat(before_date.strip())
            except ValueError as exc:
                raise SystemExit(
                    "Invalid --before-date. Use ISO format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS"
                ) from exc
            cutoff_dt = parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)

        legacy_filters = [Entry.morphology_notes.ilike(f"%{marker}%") for marker in LEGACY_SOURCE_MARKERS]
        stmt = select(Entry).where(or_(*legacy_filters)).order_by(Entry.created_at.asc())
        if cutoff_dt is not None:
            stmt = stmt.where(Entry.created_at <= cutoff_dt)
        if limit is not None and limit > 0:
            stmt = stmt.limit(limit)

        entries = list((await db.execute(stmt)).scalars().all())
        inspected = len(entries)
        candidates = 0
        updated = 0

        print(
            f"Found {inspected} legacy candidates"
            + (f" (cutoff <= {cutoff_dt.isoformat()})" if cutoff_dt else "")
            + (" [dry-run]" if not apply_changes else "")
        )

        for entry in entries:
            parsed = parse_legacy_morphology(entry.morphology_notes)
            if not parsed.extracted_any_source:
                continue

            next_morphology = parsed.morphology_notes
            next_source = parsed.source_citation
            current_source = collapse_whitespace(entry.source_citation or "") or None

            should_update_source = current_source is None and next_source is not None
            should_update_morphology = (entry.morphology_notes or None) != next_morphology

            if not should_update_source and not should_update_morphology:
                continue

            candidates += 1
            print(
                f"- {entry.slug}:"
                f" source {current_source!r} -> {next_source!r};"
                f" morphology {'changed' if should_update_morphology else 'unchanged'}"
            )

            if not apply_changes:
                continue

            if should_update_source:
                entry.source_citation = next_source
            if should_update_morphology:
                entry.morphology_notes = next_morphology

            await create_entry_version(
                db,
                entry=entry,
                edited_by_user_id=actor.id,
                edit_summary="Normalize legacy fonte/data/pagina fields",
            )
            updated += 1

        if apply_changes and updated:
            await db.commit()

        print(f"Summary: inspected={inspected}, matched={candidates}, updated={updated}")
        if apply_changes and updated == 0:
            print("No rows needed updates.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="One-time migration: move legacy Fonte/Data/Página details from morphology_notes to source_citation."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes. Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--actor-email",
        default="kiansheik3128@gmail.com",
        help="User email to attribute entry version history edits.",
    )
    parser.add_argument(
        "--before-slug",
        default=None,
        help="Only process entries with created_at <= marker entry created_at.",
    )
    parser.add_argument(
        "--before-date",
        default=None,
        help="Only process entries with created_at <= this ISO date/time.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional cap of entries to inspect.",
    )

    args = parser.parse_args()
    if args.before_slug and args.before_date:
        raise SystemExit("Use only one of --before-slug or --before-date.")

    asyncio.run(
        migrate_legacy_sources(
            apply_changes=args.apply,
            actor_email=args.actor_email,
            before_slug=args.before_slug,
            before_date=args.before_date,
            limit=args.limit,
        )
    )


if __name__ == "__main__":
    main()
