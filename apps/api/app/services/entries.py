import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discussion import CommentVote, EntryComment
from app.config import get_settings
from app.core.enums import EntryStatus, ExampleStatus
from app.core.utils import collapse_whitespace, normalize_text
from app.models.entry import Entry, EntryTag, EntryVersion, Example, ExampleVersion, ExampleVote, Tag, Vote
from app.models.user import User


async def ensure_unique_slug(db: AsyncSession, base_slug: str, entry_id: uuid.UUID | None = None) -> str:
    slug = base_slug
    counter = 2
    while True:
        stmt = select(Entry).where(Entry.slug == slug)
        if entry_id:
            stmt = stmt.where(Entry.id != entry_id)
        exists = (await db.execute(stmt)).scalar_one_or_none()
        if exists is None:
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1


def snapshot_entry(entry: Entry) -> dict:
    return {
        "headword": entry.headword,
        "normalized_headword": entry.normalized_headword,
        "gloss_pt": entry.gloss_pt,
        "gloss_en": entry.gloss_en,
        "part_of_speech": entry.part_of_speech,
        "short_definition": entry.short_definition,
        "source_citation": entry.source_citation,
        "morphology_notes": entry.morphology_notes,
        "status": entry.status.value,
        "updated_at": datetime.now(UTC).isoformat(),
    }


def snapshot_example(example: Example) -> dict:
    return {
        "entry_id": str(example.entry_id),
        "sentence_original": example.sentence_original,
        "translation_pt": example.translation_pt,
        "translation_en": example.translation_en,
        "source_citation": example.source_citation,
        "usage_note": example.usage_note,
        "context_tag": example.context_tag,
        "status": example.status.value,
        "updated_at": datetime.now(UTC).isoformat(),
    }


async def find_possible_duplicates(
    db: AsyncSession,
    *,
    headword: str,
    normalized_headword: str,
    limit: int = 5,
) -> list[Entry]:
    pattern = f"%{collapse_whitespace(headword)}%"
    stmt = (
        select(Entry)
        .where(
            or_(
                Entry.normalized_headword == normalized_headword,
                Entry.headword.ilike(pattern),
                Entry.gloss_pt.ilike(pattern),
                Entry.gloss_en.ilike(pattern),
            )
        )
        .where(Entry.status != EntryStatus.rejected)
        .order_by(Entry.created_at.desc())
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def set_entry_tags(db: AsyncSession, entry: Entry, tag_ids: list[uuid.UUID]) -> None:
    await db.execute(delete(EntryTag).where(EntryTag.entry_id == entry.id))

    if not tag_ids:
        return

    # Preserve input order while removing duplicates.
    unique_tag_ids = list(dict.fromkeys(tag_ids))
    stmt = select(Tag.id).where(Tag.id.in_(unique_tag_ids))
    existing_tag_ids = {(row[0]) for row in (await db.execute(stmt)).all()}

    for tag_id in unique_tag_ids:
        if tag_id in existing_tag_ids:
            db.add(EntryTag(entry_id=entry.id, tag_id=tag_id))

    await db.flush()


async def create_entry_version(
    db: AsyncSession,
    *,
    entry: Entry,
    edited_by_user_id: uuid.UUID,
    edit_summary: str | None,
) -> EntryVersion:
    next_version_stmt = select(func.coalesce(func.max(EntryVersion.version_number), 0)).where(
        EntryVersion.entry_id == entry.id
    )
    next_version_number = int((await db.execute(next_version_stmt)).scalar_one()) + 1

    version = EntryVersion(
        entry_id=entry.id,
        edited_by_user_id=edited_by_user_id,
        version_number=next_version_number,
        snapshot_json=snapshot_entry(entry),
        edit_summary=edit_summary,
    )
    db.add(version)
    await db.flush()

    entry.current_version_id = version.id
    return version


async def create_example_version(
    db: AsyncSession,
    *,
    example: Example,
    edited_by_user_id: uuid.UUID,
    edit_summary: str | None,
) -> ExampleVersion:
    next_version_stmt = select(func.coalesce(func.max(ExampleVersion.version_number), 0)).where(
        ExampleVersion.example_id == example.id
    )
    next_version_number = int((await db.execute(next_version_stmt)).scalar_one()) + 1

    version = ExampleVersion(
        example_id=example.id,
        edited_by_user_id=edited_by_user_id,
        version_number=next_version_number,
        snapshot_json=snapshot_example(example),
        edit_summary=edit_summary,
    )
    db.add(version)
    await db.flush()
    return version


async def refresh_vote_and_example_caches(db: AsyncSession, entry: Entry) -> None:
    upvote_stmt = select(func.count()).where(and_(Vote.entry_id == entry.id, Vote.value == 1))
    downvote_stmt = select(func.count()).where(and_(Vote.entry_id == entry.id, Vote.value == -1))
    example_count_stmt = select(func.count()).where(
        and_(
            Example.entry_id == entry.id,
            Example.status.in_([ExampleStatus.pending, ExampleStatus.approved]),
        )
    )

    upvotes = int((await db.execute(upvote_stmt)).scalar_one())
    downvotes = int((await db.execute(downvote_stmt)).scalar_one())
    examples = int((await db.execute(example_count_stmt)).scalar_one())

    entry.upvote_count_cache = upvotes
    entry.downvote_count_cache = downvotes
    entry.score_cache = upvotes - downvotes
    entry.example_count_cache = examples


async def refresh_example_vote_caches(db: AsyncSession, example: Example) -> None:
    upvote_stmt = select(func.count()).where(
        and_(ExampleVote.example_id == example.id, ExampleVote.value == 1)
    )
    downvote_stmt = select(func.count()).where(
        and_(ExampleVote.example_id == example.id, ExampleVote.value == -1)
    )

    upvotes = int((await db.execute(upvote_stmt)).scalar_one())
    downvotes = int((await db.execute(downvote_stmt)).scalar_one())

    example.upvote_count_cache = upvotes
    example.downvote_count_cache = downvotes
    example.score_cache = upvotes - downvotes


async def refresh_comment_vote_caches(db: AsyncSession, comment: EntryComment) -> None:
    upvote_stmt = select(func.count()).where(
        and_(CommentVote.comment_id == comment.id, CommentVote.value == 1)
    )
    downvote_stmt = select(func.count()).where(
        and_(CommentVote.comment_id == comment.id, CommentVote.value == -1)
    )

    upvotes = int((await db.execute(upvote_stmt)).scalar_one())
    downvotes = int((await db.execute(downvote_stmt)).scalar_one())

    comment.upvote_count_cache = upvotes
    comment.downvote_count_cache = downvotes
    comment.score_cache = upvotes - downvotes


def should_new_entry_be_pending(user_entry_count: int, is_superuser: bool) -> bool:
    if is_superuser:
        return False
    return user_entry_count < get_settings().pending_entry_threshold


def should_new_example_be_pending(user_example_count: int, is_superuser: bool) -> bool:
    if is_superuser:
        return False
    return user_example_count < get_settings().pending_example_threshold


def can_downvote(user: User) -> bool:
    settings = get_settings()
    if not settings.enforce_downvote_account_age:
        return True

    min_age = timedelta(hours=settings.downvote_min_account_age_hours)
    created_at = user.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - created_at >= min_age


def normalize_headword(headword: str) -> str:
    return normalize_text(headword)


async def load_entry_for_update(db: AsyncSession, entry_id: uuid.UUID) -> Entry | None:
    stmt = select(Entry).where(Entry.id == entry_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def count_user_entries(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count()).where(Entry.proposer_user_id == user_id)
    return int((await db.execute(stmt)).scalar_one())


async def count_user_examples(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count()).where(Example.user_id == user_id)
    return int((await db.execute(stmt)).scalar_one())


def build_entry_status_for_submission(user: User, user_entry_count: int) -> EntryStatus:
    if should_new_entry_be_pending(user_entry_count, user.is_superuser):
        return EntryStatus.pending
    return EntryStatus.approved


def build_example_status_for_submission(user: User, user_example_count: int) -> ExampleStatus:
    if should_new_example_be_pending(user_example_count, user.is_superuser):
        return ExampleStatus.pending
    return ExampleStatus.approved


def cleaned_text(value: str) -> str:
    return collapse_whitespace(value)


def is_effectively_empty(value: str | None) -> bool:
    if value is None:
        return True
    return cleaned_text(value) == ""
