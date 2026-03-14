import uuid
import logging
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.bot_protection import get_bot_verifier
from app.core.deps import SessionDep, get_current_user, get_current_user_optional
from app.core.enums import EntryStatus, ExampleStatus, ReportStatus, ReportTargetType
from app.core.errors import raise_api_error
from app.core.permissions import can_edit_entry, can_edit_example, is_moderator
from app.core.utils import collapse_whitespace, slugify
from app.models.entry import Entry, EntryTag, EntryVersion, Example, ExampleVote, Tag, Vote
from app.models.moderation import ModerationAction, Report
from app.models.user import User
from app.schemas.entries import (
    DuplicateHintOut,
    EntryCreate,
    EntryDetailOut,
    EntryListOut,
    EntryUpdate,
    EntryVersionOut,
    ExampleCreate,
    ExampleOut,
    ExampleVoteOut,
    ExampleUpdate,
    ReportCreate,
    VoteOut,
    VoteRequest,
)
from app.services.entries import (
    build_entry_status_for_submission,
    build_example_status_for_submission,
    can_downvote,
    count_user_entries,
    count_user_examples,
    create_entry_version,
    ensure_unique_slug,
    find_possible_duplicates,
    is_effectively_empty,
    load_entry_for_update,
    normalize_headword,
    refresh_example_vote_caches,
    refresh_vote_and_example_caches,
    set_entry_tags,
)
from app.services.email_delivery import send_entry_moderation_email
from app.services.moderation import record_moderation_action
from app.services.reputation import recompute_user_reputation
from app.services.rate_limit import enforce_rate_limit
from app.services.serializers import serialize_entry_detail, serialize_entry_summary
from app.services.user_badges import get_user_badge_leaders

router = APIRouter(prefix="/entries", tags=["entries"])
logger = logging.getLogger(__name__)

type ModerationContext = tuple[str | None, str | None, datetime | None]


async def _load_entry_with_relations(db: SessionDep, entry_id: uuid.UUID) -> Entry | None:
    stmt = (
        select(Entry)
        .where(Entry.id == entry_id)
        .options(
            selectinload(Entry.tags).selectinload(EntryTag.tag),
            selectinload(Entry.versions),
            selectinload(Entry.examples),
            selectinload(Entry.proposer).selectinload(User.profile),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _extract_moderation_context(action: ModerationAction | None) -> ModerationContext | None:
    if action is None:
        return None

    reason: str | None = None
    if isinstance(action.metadata_json, dict):
        raw_reason = action.metadata_json.get("reason")
        if isinstance(raw_reason, str):
            cleaned_reason = raw_reason.strip()
            reason = cleaned_reason or None

    notes = action.notes.strip() if action.notes and action.notes.strip() else None
    return (reason, notes, action.created_at)


async def _load_entry_moderation_context(
    db: SessionDep,
    *,
    entry: Entry,
) -> ModerationContext | None:
    action_types: list[str] = []
    if entry.status == EntryStatus.rejected:
        action_types = ["entry_rejected"]
    elif entry.status == EntryStatus.disputed:
        action_types = ["entry_disputed"]
    elif entry.status == EntryStatus.approved:
        action_types = ["entry_approved", "entry_verified_by_vote"]

    if not action_types:
        return None

    action = (
        await db.execute(
            select(ModerationAction)
            .where(ModerationAction.target_type == "entry")
            .where(ModerationAction.target_id == entry.id)
            .where(ModerationAction.action_type.in_(action_types))
            .order_by(ModerationAction.created_at.desc())
            .limit(1)
        )
    ).scalars().first()
    return _extract_moderation_context(action)


async def _load_example_moderation_context(
    db: SessionDep,
    *,
    examples: list[Example],
) -> dict[uuid.UUID, ModerationContext]:
    target_examples = [example for example in examples if example.status in {ExampleStatus.rejected, ExampleStatus.hidden}]
    if not target_examples:
        return {}

    target_ids = [example.id for example in target_examples]
    actions = (
        await db.execute(
            select(ModerationAction)
            .where(ModerationAction.target_type == "example")
            .where(ModerationAction.target_id.in_(target_ids))
            .where(ModerationAction.action_type.in_(["example_rejected", "example_hidden"]))
            .order_by(ModerationAction.created_at.desc())
        )
    ).scalars().all()

    expected_action_by_status = {
        ExampleStatus.rejected: {"example_rejected", "example_hidden"},
        ExampleStatus.hidden: {"example_hidden", "example_rejected"},
    }
    status_by_id = {example.id: example.status for example in target_examples}

    moderation_by_example: dict[uuid.UUID, ModerationContext] = {}
    for action in actions:
        if action.target_id in moderation_by_example:
            continue
        expected_actions = expected_action_by_status.get(status_by_id.get(action.target_id, ExampleStatus.hidden), set())
        if action.action_type not in expected_actions:
            continue
        context = _extract_moderation_context(action)
        if context is not None:
            moderation_by_example[action.target_id] = context

    return moderation_by_example


@router.get("", response_model=EntryListOut)
async def list_entries(
    db: SessionDep,
    user: Annotated[User | None, Depends(get_current_user_optional)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    status_filter: EntryStatus | None = Query(default=None, alias="status"),
    topic: str | None = None,
    part_of_speech: str | None = None,
    region: str | None = None,
    proposer_user_id: uuid.UUID | None = None,
    mine: bool = False,
    sort: Literal["alphabetical", "recent", "newest", "score", "most_examples"] = "recent",
) -> EntryListOut:
    stmt = select(Entry).options(
        selectinload(Entry.tags).selectinload(EntryTag.tag),
        selectinload(Entry.proposer).selectinload(User.profile),
    )
    count_stmt = select(func.count(func.distinct(Entry.id))).select_from(Entry)

    conditions = []

    if search:
        pattern = f"%{collapse_whitespace(search)}%"
        conditions.append(
            or_(
                Entry.headword.ilike(pattern),
                Entry.gloss_pt.ilike(pattern),
                Entry.gloss_en.ilike(pattern),
            )
        )

    if status_filter:
        conditions.append(Entry.status == status_filter)
    else:
        conditions.append(Entry.status != EntryStatus.rejected)

    if part_of_speech:
        conditions.append(Entry.part_of_speech == part_of_speech)

    if mine:
        if not user:
            raise_api_error(
                status_code=401,
                code="unauthenticated",
                message="Authentication required for mine=true",
            )
        conditions.append(Entry.proposer_user_id == user.id)
    elif proposer_user_id is not None:
        conditions.append(Entry.proposer_user_id == proposer_user_id)

    if topic or region:
        stmt = stmt.join(EntryTag, EntryTag.entry_id == Entry.id).join(Tag, Tag.id == EntryTag.tag_id)
        count_stmt = count_stmt.join(EntryTag, EntryTag.entry_id == Entry.id).join(
            Tag, Tag.id == EntryTag.tag_id
        )
        if topic:
            conditions.append(Tag.slug == topic)
        if region:
            conditions.append(Tag.slug == region)

    if conditions:
        stmt = stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))

    if sort == "score":
        stmt = stmt.order_by(Entry.score_cache.desc(), Entry.created_at.desc())
    elif sort == "most_examples":
        stmt = stmt.order_by(Entry.example_count_cache.desc(), Entry.created_at.desc())
    elif sort in ("newest", "recent"):
        stmt = stmt.order_by(Entry.created_at.desc())
    else:
        stmt = stmt.order_by(Entry.normalized_headword.asc(), Entry.created_at.desc())

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    total = int((await db.execute(count_stmt)).scalar_one())
    entries = (await db.execute(stmt)).scalars().unique().all()
    badge_leaders = await get_user_badge_leaders(db)

    return EntryListOut(
        items=[serialize_entry_summary(entry, badge_leaders) for entry in entries],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/{slug}", response_model=EntryDetailOut)
async def get_entry(
    slug: str,
    db: SessionDep,
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> EntryDetailOut:
    stmt = (
        select(Entry)
        .where(Entry.slug == slug)
        .options(
            selectinload(Entry.tags).selectinload(EntryTag.tag),
            selectinload(Entry.versions),
            selectinload(Entry.examples),
            selectinload(Entry.proposer).selectinload(User.profile),
        )
    )
    entry = (await db.execute(stmt)).scalar_one_or_none()
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    can_view_all_examples = bool(user and (is_moderator(user) or entry.proposer_user_id == user.id))
    if can_view_all_examples:
        visible_examples = entry.examples
    else:
        visible_examples = [
            example for example in entry.examples if example.status == ExampleStatus.approved
        ]

    badge_leaders = await get_user_badge_leaders(db)
    entry_moderation = await _load_entry_moderation_context(db, entry=entry)
    example_moderation = await _load_example_moderation_context(db, examples=visible_examples)

    return serialize_entry_detail(
        entry,
        examples=visible_examples,
        badge_leaders=badge_leaders,
        entry_moderation=entry_moderation,
        example_moderation=example_moderation,
    )


@router.post("", response_model=EntryDetailOut, status_code=status.HTTP_201_CREATED)
async def create_entry(
    payload: EntryCreate,
    request: Request,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> EntryDetailOut:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="entry_submission",
        scope_key=f"entry_submission:{user.id}:{client_ip}",
        limit=settings.entry_submission_rate_limit_count,
        window_seconds=settings.entry_submission_rate_limit_window_seconds,
    )

    verifier = get_bot_verifier()
    is_human = await verifier.verify(payload.turnstile_token, client_ip)
    if not is_human:
        raise_api_error(status_code=400, code="bot_check_failed", message="Bot verification failed")

    if is_effectively_empty(payload.headword) or is_effectively_empty(payload.gloss_pt):
        raise_api_error(status_code=400, code="empty_submission", message="Entry content cannot be empty")

    short_definition = (
        collapse_whitespace(payload.short_definition)
        if payload.short_definition is not None and not is_effectively_empty(payload.short_definition)
        else collapse_whitespace(payload.gloss_pt)
    )

    normalized_headword = normalize_headword(payload.headword)
    duplicates = await find_possible_duplicates(
        db,
        headword=payload.headword,
        normalized_headword=normalized_headword,
    )
    if duplicates and not payload.force_submit:
        duplicate_payload = [
            DuplicateHintOut(
                id=duplicate.id,
                slug=duplicate.slug,
                headword=duplicate.headword,
                gloss_pt=duplicate.gloss_pt,
                gloss_en=duplicate.gloss_en,
            ).model_dump(mode="json")
            for duplicate in duplicates
        ]
        raise_api_error(
            status_code=409,
            code="possible_duplicates",
            message="Possible duplicates detected",
            details={"duplicates": duplicate_payload},
        )

    user_entry_count = await count_user_entries(db, user.id)
    status_value = build_entry_status_for_submission(user, user_entry_count)

    base_slug = slugify(payload.headword)
    slug = await ensure_unique_slug(db, base_slug)

    entry = Entry(
        slug=slug,
        headword=collapse_whitespace(payload.headword),
        normalized_headword=normalized_headword,
        gloss_pt=payload.gloss_pt,
        gloss_en=payload.gloss_en,
        part_of_speech=payload.part_of_speech,
        short_definition=short_definition,
        morphology_notes=payload.morphology_notes,
        status=status_value,
        proposer_user_id=user.id,
        approved_at=datetime.now(UTC) if status_value == EntryStatus.approved else None,
        approved_by_user_id=user.id if status_value == EntryStatus.approved and user.is_superuser else None,
    )
    db.add(entry)
    await db.flush()

    await set_entry_tags(db, entry, payload.tag_ids)
    await create_entry_version(db, entry=entry, edited_by_user_id=user.id, edit_summary="Initial submission")
    await refresh_vote_and_example_caches(db, entry)

    await db.commit()

    hydrated = await _load_entry_with_relations(db, entry.id)
    if not hydrated:
        raise_api_error(status_code=500, code="entry_create_failed", message="Could not load new entry")
    badge_leaders = await get_user_badge_leaders(db)
    return serialize_entry_detail(hydrated, examples=[], badge_leaders=badge_leaders)


@router.patch("/{entry_id}", response_model=EntryDetailOut)
async def update_entry(
    entry_id: uuid.UUID,
    payload: EntryUpdate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> EntryDetailOut:
    entry = await load_entry_for_update(db, entry_id)
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    if not can_edit_entry(user, entry):
        raise_api_error(status_code=403, code="forbidden", message="Cannot edit another user's entry")

    changed = False

    if payload.headword is not None:
        if is_effectively_empty(payload.headword):
            raise_api_error(status_code=400, code="empty_submission", message="Headword cannot be empty")
        entry.headword = collapse_whitespace(payload.headword)
        entry.normalized_headword = normalize_headword(payload.headword)
        entry.slug = await ensure_unique_slug(db, slugify(payload.headword), entry.id)
        changed = True

    if payload.gloss_pt is not None:
        if is_effectively_empty(payload.gloss_pt):
            raise_api_error(
                status_code=400,
                code="empty_submission",
                message="Gloss cannot be empty",
            )
        entry.gloss_pt = payload.gloss_pt
        changed = True

    if payload.gloss_en is not None:
        entry.gloss_en = payload.gloss_en
        changed = True

    if payload.part_of_speech is not None:
        entry.part_of_speech = payload.part_of_speech
        changed = True

    if payload.short_definition is not None:
        if is_effectively_empty(payload.short_definition):
            if is_effectively_empty(entry.gloss_pt):
                raise_api_error(
                    status_code=400,
                    code="empty_submission",
                    message="Definition cannot be empty without a gloss",
                )
            entry.short_definition = collapse_whitespace(entry.gloss_pt)
        else:
            entry.short_definition = collapse_whitespace(payload.short_definition)
        changed = True

    if payload.morphology_notes is not None:
        entry.morphology_notes = payload.morphology_notes
        changed = True

    if payload.tag_ids is not None:
        await set_entry_tags(db, entry, payload.tag_ids)
        changed = True

    if not changed:
        raise_api_error(status_code=400, code="no_changes", message="No changes provided")

    await create_entry_version(
        db,
        entry=entry,
        edited_by_user_id=user.id,
        edit_summary=payload.edit_summary or "Entry update",
    )

    await db.commit()

    hydrated = await _load_entry_with_relations(db, entry.id)
    if not hydrated:
        raise_api_error(status_code=500, code="entry_update_failed", message="Could not load updated entry")

    can_view_all_examples = is_moderator(user) or hydrated.proposer_user_id == user.id
    examples = (
        hydrated.examples
        if can_view_all_examples
        else [ex for ex in hydrated.examples if ex.status == ExampleStatus.approved]
    )
    badge_leaders = await get_user_badge_leaders(db)
    return serialize_entry_detail(hydrated, examples=examples, badge_leaders=badge_leaders)


@router.get("/{entry_id}/versions", response_model=list[EntryVersionOut])
async def list_entry_versions(entry_id: uuid.UUID, db: SessionDep) -> list[EntryVersionOut]:
    stmt = (
        select(EntryVersion)
        .where(EntryVersion.entry_id == entry_id)
        .order_by(EntryVersion.version_number.desc())
    )
    versions = (await db.execute(stmt)).scalars().all()
    return [EntryVersionOut.model_validate(version) for version in versions]


@router.post("/{entry_id}/vote", response_model=VoteOut)
async def vote_entry(
    entry_id: uuid.UUID,
    payload: VoteRequest,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> VoteOut:
    if payload.value not in (-1, 1):
        raise_api_error(status_code=422, code="invalid_vote", message="Vote must be -1 or 1")

    if payload.value == -1 and not can_downvote(user):
        raise_api_error(
            status_code=403,
            code="downvote_blocked",
            message="New users cannot downvote until account age is at least 72 hours",
        )

    entry = (await db.execute(select(Entry).where(Entry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    if entry.proposer_user_id == user.id:
        raise_api_error(
            status_code=403,
            code="self_vote_forbidden",
            message="You cannot vote on your own entry",
        )

    existing_vote = (
        await db.execute(select(Vote).where(and_(Vote.entry_id == entry_id, Vote.user_id == user.id)))
    ).scalar_one_or_none()

    if existing_vote:
        existing_vote.value = payload.value
        vote = existing_vote
    else:
        vote = Vote(entry_id=entry_id, user_id=user.id, value=payload.value)
        db.add(vote)

    was_verified_by_vote = False

    await db.flush()
    await refresh_vote_and_example_caches(db, entry)
    if user.is_superuser and payload.value == 1 and entry.status != EntryStatus.approved:
        entry.status = EntryStatus.approved
        entry.approved_at = datetime.now(UTC)
        entry.approved_by_user_id = user.id
        was_verified_by_vote = True
        await record_moderation_action(
            db,
            moderator_user_id=user.id,
            action_type="entry_verified_by_vote",
            target_type="entry",
            target_id=entry.id,
            notes="Verified via moderator upvote",
            metadata_json={"status": entry.status.value, "reason": "moderator_upvote"},
        )

    await recompute_user_reputation(db, entry.proposer_user_id)
    await db.commit()

    if was_verified_by_vote:
        proposer = (
            await db.execute(select(User).where(User.id == entry.proposer_user_id))
        ).scalar_one_or_none()
        if proposer:
            try:
                await send_entry_moderation_email(
                    to_email=proposer.email,
                    headword=entry.headword,
                    slug=entry.slug,
                    approved=True,
                )
            except Exception:
                logger.exception(
                    "Failed to send vote-based approval email for entry_id=%s",
                    entry.id,
                )

    return VoteOut(entry_id=entry_id, user_id=user.id, value=vote.value, score_cache=entry.score_cache)


@router.delete("/{entry_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vote(
    entry_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    entry = (await db.execute(select(Entry).where(Entry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    existing_vote = (
        await db.execute(select(Vote).where(and_(Vote.entry_id == entry_id, Vote.user_id == user.id)))
    ).scalar_one_or_none()
    if existing_vote:
        await db.delete(existing_vote)
        await db.flush()
        await refresh_vote_and_example_caches(db, entry)
        await recompute_user_reputation(db, entry.proposer_user_id)

    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{entry_id}/reports", status_code=status.HTTP_201_CREATED)
async def report_entry(
    entry_id: uuid.UUID,
    payload: ReportCreate,
    request: Request,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="report_submission",
        scope_key=f"report_submission:{user.id}:{client_ip}",
        limit=settings.report_rate_limit_count,
        window_seconds=settings.report_rate_limit_window_seconds,
    )

    verifier = get_bot_verifier()
    is_human = await verifier.verify(payload.turnstile_token, client_ip)
    if not is_human:
        raise_api_error(status_code=400, code="bot_check_failed", message="Bot verification failed")

    entry = (await db.execute(select(Entry).where(Entry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    report = Report(
        reporter_user_id=user.id,
        target_type=ReportTargetType.entry,
        target_id=entry.id,
        reason_code=payload.reason_code,
        free_text=payload.free_text,
        status=ReportStatus.open,
    )
    db.add(report)
    await db.commit()

    return {"ok": True, "report_id": str(report.id)}


@router.post("/{entry_id}/examples", response_model=ExampleOut, status_code=status.HTTP_201_CREATED)
async def create_example(
    entry_id: uuid.UUID,
    payload: ExampleCreate,
    request: Request,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> ExampleOut:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="example_submission",
        scope_key=f"example_submission:{user.id}:{client_ip}",
        limit=settings.example_submission_rate_limit_count,
        window_seconds=settings.example_submission_rate_limit_window_seconds,
    )

    verifier = get_bot_verifier()
    is_human = await verifier.verify(payload.turnstile_token, client_ip)
    if not is_human:
        raise_api_error(status_code=400, code="bot_check_failed", message="Bot verification failed")

    if is_effectively_empty(payload.sentence_original):
        raise_api_error(status_code=400, code="empty_submission", message="Sentence cannot be empty")

    entry = (await db.execute(select(Entry).where(Entry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    duplicate_stmt = select(Example).where(
        and_(
            Example.entry_id == entry_id,
            func.lower(Example.sentence_original) == collapse_whitespace(payload.sentence_original).lower(),
        )
    )
    duplicate_example = (await db.execute(duplicate_stmt)).scalar_one_or_none()
    if duplicate_example:
        raise_api_error(
            status_code=409,
            code="duplicate_example",
            message="A very similar example already exists for this entry",
        )

    user_example_count = await count_user_examples(db, user.id)
    status_value = build_example_status_for_submission(user, user_example_count)

    example = Example(
        entry_id=entry_id,
        user_id=user.id,
        sentence_original=collapse_whitespace(payload.sentence_original),
        translation_pt=payload.translation_pt,
        translation_en=payload.translation_en,
        usage_note=payload.usage_note,
        context_tag=payload.context_tag,
        status=status_value,
        approved_at=datetime.now(UTC) if status_value == ExampleStatus.approved else None,
        approved_by_user_id=user.id if status_value == ExampleStatus.approved and user.is_superuser else None,
    )
    db.add(example)
    await db.flush()

    await refresh_vote_and_example_caches(db, entry)
    await db.commit()

    return ExampleOut.model_validate(example)


example_router = APIRouter(prefix="/examples", tags=["examples"])


@example_router.patch("/{example_id}", response_model=ExampleOut)
async def update_example(
    example_id: uuid.UUID,
    payload: ExampleUpdate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> ExampleOut:
    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    if not can_edit_example(user, example):
        raise_api_error(status_code=403, code="forbidden", message="Cannot edit another user's example")

    changed = False

    if payload.sentence_original is not None:
        if is_effectively_empty(payload.sentence_original):
            raise_api_error(status_code=400, code="empty_submission", message="Sentence cannot be empty")
        example.sentence_original = collapse_whitespace(payload.sentence_original)
        changed = True

    if payload.translation_pt is not None:
        example.translation_pt = payload.translation_pt
        changed = True

    if payload.translation_en is not None:
        example.translation_en = payload.translation_en
        changed = True

    if payload.usage_note is not None:
        example.usage_note = payload.usage_note
        changed = True

    if payload.context_tag is not None:
        example.context_tag = payload.context_tag
        changed = True

    if not changed:
        raise_api_error(status_code=400, code="no_changes", message="No changes provided")

    if not is_moderator(user):
        example.status = ExampleStatus.pending

    await db.commit()
    return ExampleOut.model_validate(example)


@example_router.post("/{example_id}/vote", response_model=ExampleVoteOut)
async def vote_example(
    example_id: uuid.UUID,
    payload: VoteRequest,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> ExampleVoteOut:
    if payload.value not in (-1, 1):
        raise_api_error(status_code=422, code="invalid_vote", message="Vote must be -1 or 1")

    if payload.value == -1 and not can_downvote(user):
        raise_api_error(
            status_code=403,
            code="downvote_blocked",
            message="New users cannot downvote until account age is at least 72 hours",
        )

    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    if example.user_id == user.id:
        raise_api_error(
            status_code=403,
            code="self_vote_forbidden",
            message="You cannot vote on your own example",
        )

    existing_vote = (
        await db.execute(
            select(ExampleVote).where(
                and_(ExampleVote.example_id == example_id, ExampleVote.user_id == user.id)
            )
        )
    ).scalar_one_or_none()

    if existing_vote:
        existing_vote.value = payload.value
        vote = existing_vote
    else:
        vote = ExampleVote(example_id=example_id, user_id=user.id, value=payload.value)
        db.add(vote)

    await db.flush()
    await refresh_example_vote_caches(db, example)
    if user.is_superuser and payload.value == 1 and example.status != ExampleStatus.approved:
        example.status = ExampleStatus.approved
        example.approved_at = datetime.now(UTC)
        example.approved_by_user_id = user.id
        await record_moderation_action(
            db,
            moderator_user_id=user.id,
            action_type="example_verified_by_vote",
            target_type="example",
            target_id=example.id,
            notes="Verified via moderator upvote",
            metadata_json={"status": example.status.value, "reason": "moderator_upvote"},
        )
        parent_entry = (
            await db.execute(select(Entry).where(Entry.id == example.entry_id))
        ).scalar_one_or_none()
        if parent_entry:
            await refresh_vote_and_example_caches(db, parent_entry)

    await recompute_user_reputation(db, example.user_id)
    await db.commit()

    return ExampleVoteOut(
        example_id=example_id,
        user_id=user.id,
        value=vote.value,
        score_cache=example.score_cache,
    )


@example_router.delete("/{example_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def delete_example_vote(
    example_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    existing_vote = (
        await db.execute(
            select(ExampleVote).where(
                and_(ExampleVote.example_id == example_id, ExampleVote.user_id == user.id)
            )
        )
    ).scalar_one_or_none()
    if existing_vote:
        await db.delete(existing_vote)
        await db.flush()
        await refresh_example_vote_caches(db, example)
        await recompute_user_reputation(db, example.user_id)

    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@example_router.post("/{example_id}/reports", status_code=status.HTTP_201_CREATED)
async def report_example(
    example_id: uuid.UUID,
    payload: ReportCreate,
    request: Request,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="report_submission",
        scope_key=f"report_submission:{user.id}:{client_ip}",
        limit=settings.report_rate_limit_count,
        window_seconds=settings.report_rate_limit_window_seconds,
    )

    verifier = get_bot_verifier()
    is_human = await verifier.verify(payload.turnstile_token, client_ip)
    if not is_human:
        raise_api_error(status_code=400, code="bot_check_failed", message="Bot verification failed")

    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    report = Report(
        reporter_user_id=user.id,
        target_type=ReportTargetType.example,
        target_id=example.id,
        reason_code=payload.reason_code,
        free_text=payload.free_text,
        status=ReportStatus.open,
    )
    db.add(report)
    await db.commit()

    return {"ok": True, "report_id": str(report.id)}
