import uuid
import logging
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status, UploadFile, File
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.bot_protection import get_bot_verifier
from app.core.deps import SessionDep, get_current_user, get_current_user_optional
from app.core.enums import EntryStatus, ExampleStatus, ReportStatus, ReportTargetType
from app.core.errors import raise_api_error
from app.core.permissions import can_edit_entry, can_edit_example, is_moderator
from app.core.utils import collapse_whitespace, normalize_search_query, normalize_text, slugify
from app.models.discussion import CommentVote, EntryComment
from app.models.audio import AudioSample, AudioVote
from app.models.entry import Entry, EntryTag, EntryVersion, Example, ExampleVersion, ExampleVote, Tag, Vote
from app.models.moderation import ModerationAction, Report
from app.models.source import SourceEdition, SourceWork
from app.models.user import Profile, User
from app.schemas.entries import (
    CommentCreate,
    CommentVoteOut,
    DuplicateHintOut,
    EntryCreate,
    EntryCommentOut,
    EntryDetailOut,
    EntryHistoryEventOut,
    EntryConstraintsOut,
    EntrySubmissionGateOut,
    EntryListOut,
    EntryUpdate,
    EntryVersionOut,
    ExampleCreate,
    ExampleOut,
    ExampleVoteOut,
    ExampleUpdate,
    ExampleVersionOut,
    ReportCreate,
    SourceInput,
    VoteOut,
    VoteRequest,
)
from app.schemas.audio import AudioSampleOut
from app.services.entries import (
    build_entry_status_for_submission,
    build_example_status_for_submission,
    can_downvote,
    compute_entry_vote_daily_gate,
    count_user_entries,
    count_user_entry_votes,
    count_user_examples,
    get_entry_vote_daily_window,
    create_entry_version,
    create_example_version,
    ensure_unique_slug,
    find_possible_duplicates,
    is_effectively_empty,
    is_valid_headword,
    load_entry_for_update,
    normalize_headword,
    refresh_comment_vote_caches,
    refresh_example_vote_caches,
    refresh_vote_and_example_caches,
    set_entry_tags,
)
from app.services.audio import save_audio_upload
from app.services.email_delivery import send_comment_notification_email, send_entry_moderation_email
from app.services.moderation import record_moderation_action
from app.services.notifications import (
    create_notification,
    extract_mention_keys,
    get_notification_preferences_map,
    normalize_mention_key,
    truncate_for_notification,
)
from app.services.reputation import recompute_user_reputation
from app.services.rate_limit import enforce_rate_limit
from app.services.serializers import (
    serialize_audio_sample,
    serialize_entry_comment,
    serialize_entry_detail,
    serialize_entry_summary,
    serialize_example,
)
from app.services.sources import (
    build_source_citation,
    clean_source_text,
    get_or_create_source_edition,
)
from app.services.user_badges import get_user_badge_leaders

router = APIRouter(prefix="/entries", tags=["entries"])
logger = logging.getLogger(__name__)

type ModerationContext = tuple[str | None, str | None, datetime | None]

ENTRY_HISTORY_ACTION_TYPES = {
    "entry_approved",
    "entry_rejected",
    "entry_disputed",
    "entry_verified_by_vote",
}


@router.get("/constraints", response_model=EntryConstraintsOut)
async def get_entry_constraints() -> EntryConstraintsOut:
    settings = get_settings()
    return EntryConstraintsOut(
        entry_vote_cost=settings.entry_vote_cost,
        downvote_requires_comment=settings.downvote_requires_comment,
        downvote_comment_min_length=settings.downvote_comment_min_length,
    )


@router.get("/submit-gate", response_model=EntrySubmissionGateOut)
async def get_entry_submission_gate(
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> EntrySubmissionGateOut:
    settings = get_settings()
    window_start, window_end, gate_active = get_entry_vote_daily_window()
    exempt = user.is_superuser and settings.entry_vote_cost_exempt_staff

    votes_today = 0
    entries_today = 0
    if gate_active and not exempt and settings.entry_vote_daily_step1_votes > 0:
        votes_today = await count_user_entry_votes(
            db,
            user.id,
            created_after=window_start,
            created_before=window_end,
        )
        entries_today = await count_user_entries(
            db,
            user.id,
            created_after=window_start,
            created_before=window_end,
        )

    gate = compute_entry_vote_daily_gate(votes_today, entries_today)

    unlimited = gate.unlimited or not gate_active or exempt
    unlocked_posts = None if unlimited else gate.unlocked_posts
    remaining_posts = None if unlimited else gate.remaining_posts
    next_votes_required = 0 if unlimited else gate.next_votes_required

    return EntrySubmissionGateOut(
        window_start=window_start,
        window_end=window_end,
        votes_today=votes_today,
        entries_today=entries_today,
        unlocked_posts=unlocked_posts,
        remaining_posts=remaining_posts,
        unlimited=unlimited,
        next_votes_required=next_votes_required,
        votes_required_for_unlimited=gate.votes_required_for_unlimited,
        step1_votes=gate.step1_votes,
        step1_posts=gate.step1_posts,
        step2_votes=gate.step2_votes,
        step2_posts=gate.step2_posts,
        step3_votes=gate.step3_votes,
    )


async def _load_entry_with_relations(db: SessionDep, entry_id: uuid.UUID) -> Entry | None:
    stmt = (
        select(Entry)
        .where(Entry.id == entry_id)
        .options(
            selectinload(Entry.tags).selectinload(EntryTag.tag),
            selectinload(Entry.versions),
            selectinload(Entry.audio_samples)
            .selectinload(AudioSample.uploader)
            .selectinload(User.profile),
            selectinload(Entry.examples).selectinload(Example.source_edition).selectinload(SourceEdition.work),
            selectinload(Entry.examples).selectinload(Example.source_edition).selectinload(SourceEdition.links),
            selectinload(Entry.examples)
            .selectinload(Example.audio_samples)
            .selectinload(AudioSample.uploader)
            .selectinload(User.profile),
            selectinload(Entry.comments).selectinload(EntryComment.author).selectinload(User.profile),
            selectinload(Entry.proposer).selectinload(User.profile),
            selectinload(Entry.source_edition).selectinload(SourceEdition.work),
            selectinload(Entry.source_edition).selectinload(SourceEdition.links),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _load_audio_sample_with_uploader(
    db: SessionDep, audio_id: uuid.UUID
) -> AudioSample | None:
    stmt = (
        select(AudioSample)
        .where(AudioSample.id == audio_id)
        .options(selectinload(AudioSample.uploader).selectinload(User.profile))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _apply_entry_source_fields(
    db: SessionDep,
    *,
    entry: Entry,
    source_payload: SourceInput | None,
    source_citation_fallback: str | None,
    actor_user_id: uuid.UUID | None = None,
) -> None:
    if source_payload is None:
        entry.source_edition_id = None
        entry.source_pages = None
        entry.source_citation = clean_source_text(source_citation_fallback, max_length=500)
        return

    source_edition, source_work = await get_or_create_source_edition(
        db,
        source=source_payload,
        created_by_user_id=actor_user_id,
    )
    source_pages = clean_source_text(source_payload.pages, max_length=120)

    entry.source_edition_id = source_edition.id
    entry.source_pages = source_pages
    entry.source_citation = build_source_citation(
        authors=source_work.authors,
        title=source_work.title,
        publication_year=source_edition.publication_year,
        edition_label=source_edition.edition_label,
        pages=source_pages,
        fallback=source_citation_fallback,
    )


async def _apply_example_source_fields(
    db: SessionDep,
    *,
    example: Example,
    source_payload: SourceInput | None,
    source_citation_fallback: str | None,
    actor_user_id: uuid.UUID | None = None,
) -> None:
    if source_payload is None:
        example.source_edition_id = None
        example.source_pages = None
        example.source_citation = clean_source_text(source_citation_fallback, max_length=500)
        return

    source_edition, source_work = await get_or_create_source_edition(
        db,
        source=source_payload,
        created_by_user_id=actor_user_id,
    )
    source_pages = clean_source_text(source_payload.pages, max_length=120)

    example.source_edition_id = source_edition.id
    example.source_pages = source_pages
    example.source_citation = build_source_citation(
        authors=source_work.authors,
        title=source_work.title,
        publication_year=source_edition.publication_year,
        edition_label=source_edition.edition_label,
        pages=source_pages,
        fallback=source_citation_fallback,
    )


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


def _fallback_actor_name(user_id: uuid.UUID) -> str:
    return f"user-{str(user_id)[:8]}"


async def _load_actor_names(
    db: SessionDep,
    *,
    actor_ids: set[uuid.UUID],
) -> dict[uuid.UUID, str]:
    if not actor_ids:
        return {}

    rows = (
        await db.execute(
            select(User.id, Profile.display_name, User.email)
            .outerjoin(Profile, Profile.user_id == User.id)
            .where(User.id.in_(list(actor_ids)))
        )
    ).all()

    names: dict[uuid.UUID, str] = {}
    for user_id, display_name, email in rows:
        if display_name and display_name.strip():
            names[user_id] = display_name.strip()
            continue
        if email and email.strip():
            names[user_id] = email.split("@", 1)[0]
    return names


def _extract_action_reason(action: ModerationAction) -> str | None:
    if not isinstance(action.metadata_json, dict):
        return None
    raw_reason = action.metadata_json.get("reason")
    if not isinstance(raw_reason, str):
        return None
    cleaned = raw_reason.strip()
    return cleaned or None


def _display_name_for_user(user: User) -> str:
    if user.profile and user.profile.display_name and user.profile.display_name.strip():
        return user.profile.display_name.strip()
    if user.email and user.email.strip():
        return user.email.split("@", maxsplit=1)[0]
    return f"user-{str(user.id)[:8]}"


async def _resolve_mentioned_user_ids(
    db: SessionDep,
    *,
    mention_keys: set[str],
) -> set[uuid.UUID]:
    if not mention_keys:
        return set()

    profile_rows = (await db.execute(select(Profile.user_id, Profile.display_name))).all()
    mentioned_user_ids: set[uuid.UUID] = set()
    for user_id, display_name in profile_rows:
        if not display_name:
            continue
        key = normalize_mention_key(display_name)
        if key in mention_keys:
            mentioned_user_ids.add(user_id)
    return mentioned_user_ids


type CommentEmailJob = tuple[str, bool]


async def _create_comment_notifications(
    db: SessionDep,
    *,
    entry: Entry,
    comment: EntryComment,
    actor: User,
    mentioned_user_ids: set[uuid.UUID],
) -> list[CommentEmailJob]:
    watcher_user_ids: set[uuid.UUID] = {entry.proposer_user_id}
    previous_commenter_ids = (
        await db.execute(
            select(EntryComment.user_id).where(EntryComment.entry_id == entry.id).distinct()
        )
    ).scalars().all()
    watcher_user_ids.update(previous_commenter_ids)

    recipient_sources: dict[uuid.UUID, set[str]] = {}
    for user_id in watcher_user_ids:
        recipient_sources.setdefault(user_id, set()).add("watch")
    for user_id in mentioned_user_ids:
        recipient_sources.setdefault(user_id, set()).add("mention")
    recipient_sources.pop(actor.id, None)

    recipient_ids = set(recipient_sources)
    if not recipient_ids:
        return []

    preferences_by_user = await get_notification_preferences_map(db, user_ids=recipient_ids)
    recipient_rows = (
        await db.execute(
            select(User.id, User.email, Profile.display_name)
            .outerjoin(Profile, Profile.user_id == User.id)
            .where(User.id.in_(list(recipient_ids)))
        )
    ).all()

    actor_display_name = _display_name_for_user(actor)
    comment_snippet = truncate_for_notification(comment.body, limit=280)
    email_jobs: list[CommentEmailJob] = []

    for recipient_user_id, recipient_email, _recipient_display_name in recipient_rows:
        sources = recipient_sources.get(recipient_user_id, set())
        prefs = preferences_by_user[recipient_user_id]

        send_as_mention = False
        if "mention" in sources and (prefs.allows_in_app(is_mention=True) or prefs.allows_email(is_mention=True)):
            send_as_mention = True
        elif "watch" in sources and not (
            prefs.allows_in_app(is_mention=False) or prefs.allows_email(is_mention=False)
        ):
            continue
        elif "watch" not in sources:
            continue

        is_mention = send_as_mention
        title = (
            f"{actor_display_name} mencionou você em {entry.headword}"
            if is_mention
            else f"Novo comentário em {entry.headword}"
        )
        notification_kind = "comment_mention" if is_mention else "entry_comment"

        if prefs.allows_in_app(is_mention=is_mention):
            await create_notification(
                db,
                recipient_user_id=recipient_user_id,
                actor_user_id=actor.id,
                entry_id=entry.id,
                comment_id=comment.id,
                kind=notification_kind,
                title=title,
                body=comment_snippet,
                metadata_json={"entry_slug": entry.slug},
            )

        if prefs.allows_email(is_mention=is_mention):
            email_jobs.append((recipient_email, is_mention))

    return email_jobs


async def _load_entry_history_events(
    db: SessionDep,
    *,
    entry: Entry,
) -> list[EntryHistoryEventOut]:
    actions = (
        await db.execute(
            select(ModerationAction)
            .where(ModerationAction.target_type == "entry")
            .where(ModerationAction.target_id == entry.id)
            .where(ModerationAction.action_type.in_(ENTRY_HISTORY_ACTION_TYPES))
            .order_by(ModerationAction.created_at.asc())
        )
    ).scalars().all()

    actor_ids: set[uuid.UUID] = {version.edited_by_user_id for version in entry.versions}
    actor_ids.update(action.moderator_user_id for action in actions)
    actor_names = await _load_actor_names(db, actor_ids=actor_ids)

    events: list[EntryHistoryEventOut] = []
    for version in entry.versions:
        actor_display_name = actor_names.get(version.edited_by_user_id, _fallback_actor_name(version.edited_by_user_id))
        events.append(
            EntryHistoryEventOut(
                id=version.id,
                kind="version",
                version_number=version.version_number,
                action_type=None,
                summary=version.edit_summary,
                actor_user_id=version.edited_by_user_id,
                actor_display_name=actor_display_name,
                created_at=version.created_at,
            )
        )

    for action in actions:
        reason = _extract_action_reason(action)
        notes = action.notes.strip() if action.notes and action.notes.strip() else None
        actor_display_name = actor_names.get(action.moderator_user_id, _fallback_actor_name(action.moderator_user_id))
        events.append(
            EntryHistoryEventOut(
                id=action.id,
                kind="moderation",
                version_number=None,
                action_type=action.action_type,
                summary=reason or notes,
                actor_user_id=action.moderator_user_id,
                actor_display_name=actor_display_name,
                created_at=action.created_at,
            )
        )

    events.sort(key=lambda event: event.created_at, reverse=True)
    return events


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
    source: str | None = None,
    source_work_id: uuid.UUID | None = None,
    proposer_user_id: uuid.UUID | None = None,
    mine: bool = False,
    unseen: bool = False,
    sort: Literal["alphabetical", "recent", "newest", "score", "most_examples", "unseen"] = "recent",
) -> EntryListOut:
    stmt = select(Entry).options(
        selectinload(Entry.tags).selectinload(EntryTag.tag),
        selectinload(Entry.proposer).selectinload(User.profile),
    )
    count_stmt = select(func.count(func.distinct(Entry.id))).select_from(Entry)

    conditions = []

    if search:
        pattern = f"%{collapse_whitespace(search)}%"
        normalized_search = normalize_search_query(search)
        normalized_pattern = f"%{normalized_search}%"
        normalized_headword = func.replace(Entry.normalized_headword, "-", " ")
        conditions.append(
            or_(
                Entry.headword.ilike(pattern),
                Entry.gloss_pt.ilike(pattern),
                Entry.gloss_en.ilike(pattern),
                normalized_headword.ilike(normalized_pattern),
                Entry.normalized_gloss_pt.ilike(normalized_pattern),
                Entry.normalized_gloss_en.ilike(normalized_pattern),
            )
        )

    if sort == "unseen":
        unseen = True

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

    if unseen:
        if not user:
            raise_api_error(
                status_code=401,
                code="unauthenticated",
                message="Authentication required for unseen=true",
            )
        conditions.append(
            ~exists().where(and_(Vote.entry_id == Entry.id, Vote.user_id == user.id))
        )

    if topic or region:
        stmt = stmt.join(EntryTag, EntryTag.entry_id == Entry.id).join(Tag, Tag.id == EntryTag.tag_id)
        count_stmt = count_stmt.join(EntryTag, EntryTag.entry_id == Entry.id).join(
            Tag, Tag.id == EntryTag.tag_id
        )
        if topic:
            conditions.append(Tag.slug == topic)
        if region:
            conditions.append(Tag.slug == region)

    source_query = collapse_whitespace(source) if source else None
    if source_query or source_work_id is not None:
        stmt = stmt.join(SourceEdition, SourceEdition.id == Entry.source_edition_id).join(
            SourceWork,
            SourceWork.id == SourceEdition.work_id,
        )
        count_stmt = count_stmt.join(SourceEdition, SourceEdition.id == Entry.source_edition_id).join(
            SourceWork,
            SourceWork.id == SourceEdition.work_id,
        )

    if source_work_id is not None:
        conditions.append(SourceWork.id == source_work_id)

    if source_query:
        normalized_source = normalize_search_query(source_query)
        source_pattern = f"%{source_query}%"
        normalized_source_pattern = f"%{normalized_source}%"

        conditions.append(
            or_(
                SourceWork.authors.ilike(source_pattern),
                SourceWork.title.ilike(source_pattern),
                SourceEdition.edition_label.ilike(source_pattern),
                func.replace(SourceWork.normalized_authors, "-", " ").ilike(normalized_source_pattern),
                func.replace(SourceWork.normalized_title, "-", " ").ilike(normalized_source_pattern),
                Entry.source_citation.ilike(source_pattern),
            )
        )

    if conditions:
        stmt = stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))

    total_votes_expr = Entry.upvote_count_cache + Entry.downvote_count_cache

    if sort == "unseen":
        stmt = stmt.order_by(total_votes_expr.asc(), Entry.created_at.desc())
    elif sort == "score":
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
    entry_votes: dict[uuid.UUID, int] = {}

    if user and entries:
        entry_ids = [entry.id for entry in entries]
        vote_rows = (
            await db.execute(
                select(Vote.entry_id, Vote.value).where(
                    and_(Vote.user_id == user.id, Vote.entry_id.in_(entry_ids))
                )
            )
        ).all()
        entry_votes = {row[0]: row[1] for row in vote_rows}

    return EntryListOut(
        items=[
            serialize_entry_summary(entry, badge_leaders, entry_votes.get(entry.id))
            for entry in entries
        ],
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
            selectinload(Entry.audio_samples)
            .selectinload(AudioSample.uploader)
            .selectinload(User.profile),
            selectinload(Entry.examples).selectinload(Example.source_edition).selectinload(SourceEdition.work),
            selectinload(Entry.examples).selectinload(Example.source_edition).selectinload(SourceEdition.links),
            selectinload(Entry.examples)
            .selectinload(Example.audio_samples)
            .selectinload(AudioSample.uploader)
            .selectinload(User.profile),
            selectinload(Entry.comments).selectinload(EntryComment.author).selectinload(User.profile),
            selectinload(Entry.proposer).selectinload(User.profile),
            selectinload(Entry.source_edition).selectinload(SourceEdition.work),
            selectinload(Entry.source_edition).selectinload(SourceEdition.links),
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
    visible_comments = sorted(entry.comments, key=lambda comment: comment.created_at)

    badge_leaders = await get_user_badge_leaders(db)
    entry_moderation = await _load_entry_moderation_context(db, entry=entry)
    example_moderation = await _load_example_moderation_context(db, examples=visible_examples)
    history_events = await _load_entry_history_events(db, entry=entry)
    entry_vote_value: int | None = None
    example_votes: dict[uuid.UUID, int] = {}
    comment_votes: dict[uuid.UUID, int] = {}
    audio_votes: dict[uuid.UUID, int] = {}

    if user:
        entry_vote_value = (
            await db.execute(
                select(Vote.value).where(and_(Vote.entry_id == entry.id, Vote.user_id == user.id))
            )
        ).scalar_one_or_none()

        if visible_examples:
            example_ids = [example.id for example in visible_examples]
            example_rows = (
                await db.execute(
                    select(ExampleVote.example_id, ExampleVote.value).where(
                        and_(ExampleVote.user_id == user.id, ExampleVote.example_id.in_(example_ids))
                    )
                )
            ).all()
            example_votes = {row[0]: row[1] for row in example_rows}

        if visible_comments:
            comment_ids = [comment.id for comment in visible_comments]
            comment_rows = (
                await db.execute(
                    select(CommentVote.comment_id, CommentVote.value).where(
                        and_(CommentVote.user_id == user.id, CommentVote.comment_id.in_(comment_ids))
                    )
                )
            ).all()
            comment_votes = {row[0]: row[1] for row in comment_rows}

        audio_ids = [sample.id for sample in entry.audio_samples]
        if visible_examples:
            for example in visible_examples:
                audio_ids.extend(sample.id for sample in example.audio_samples)
        if audio_ids:
            audio_rows = (
                await db.execute(
                    select(AudioVote.audio_id, AudioVote.value).where(
                        and_(AudioVote.user_id == user.id, AudioVote.audio_id.in_(audio_ids))
                    )
                )
            ).all()
            audio_votes = {row[0]: row[1] for row in audio_rows}

    return serialize_entry_detail(
        entry,
        examples=visible_examples,
        comments=visible_comments,
        badge_leaders=badge_leaders,
        entry_moderation=entry_moderation,
        example_moderation=example_moderation,
        history_events=history_events,
        current_user_vote=entry_vote_value,
        example_user_votes=example_votes,
        comment_user_votes=comment_votes,
        audio_user_votes=audio_votes,
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
    if not is_valid_headword(payload.headword):
        raise_api_error(
            status_code=400,
            code="invalid_headword_format",
            message="Headword contains invalid characters",
        )

    short_definition = (
        collapse_whitespace(payload.short_definition)
        if payload.short_definition is not None and not is_effectively_empty(payload.short_definition)
        else collapse_whitespace(payload.gloss_pt)
    )

    user_entry_count = await count_user_entries(db, user.id)
    if settings.entry_vote_daily_step1_votes > 0 and not (
        user.is_superuser and settings.entry_vote_cost_exempt_staff
    ):
        window_start, window_end, gate_active = get_entry_vote_daily_window()
        if gate_active:
            votes_today = await count_user_entry_votes(
                db,
                user.id,
                created_after=window_start,
                created_before=window_end,
            )
            entries_today = await count_user_entries(
                db,
                user.id,
                created_after=window_start,
                created_before=window_end,
            )
            gate = compute_entry_vote_daily_gate(votes_today, entries_today)
            if not gate.unlimited and entries_today >= (gate.unlocked_posts or 0):
                raise_api_error(
                    status_code=403,
                    code="entry_vote_quota",
                    message="Not enough entry votes to submit a new entry",
                    details={
                        "votes_today": votes_today,
                        "entries_today": entries_today,
                        "unlocked_posts": gate.unlocked_posts,
                        "remaining_posts": gate.remaining_posts,
                        "next_votes_required": gate.next_votes_required,
                        "needed": gate.next_votes_required,
                        "votes_required_for_unlimited": gate.votes_required_for_unlimited,
                        "step1_votes": gate.step1_votes,
                        "step1_posts": gate.step1_posts,
                        "step2_votes": gate.step2_votes,
                        "step2_posts": gate.step2_posts,
                        "step3_votes": gate.step3_votes,
                    },
                )

    normalized_headword = normalize_headword(payload.headword)
    normalized_gloss_pt = normalize_search_query(payload.gloss_pt) if payload.gloss_pt else None
    normalized_gloss_en = normalize_search_query(payload.gloss_en) if payload.gloss_en else None
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

    status_value = build_entry_status_for_submission(user, user_entry_count)

    base_slug = slugify(payload.headword)
    slug = await ensure_unique_slug(db, base_slug)

    entry = Entry(
        slug=slug,
        headword=collapse_whitespace(payload.headword),
        normalized_headword=normalized_headword,
        gloss_pt=payload.gloss_pt,
        gloss_en=payload.gloss_en,
        normalized_gloss_pt=normalized_gloss_pt,
        normalized_gloss_en=normalized_gloss_en,
        part_of_speech=payload.part_of_speech,
        short_definition=short_definition,
        source_citation=None,
        source_edition_id=None,
        source_pages=None,
        morphology_notes=payload.morphology_notes,
        pydicate=payload.pydicate.strip() if payload.pydicate and payload.pydicate.strip() else None,
        status=status_value,
        proposer_user_id=user.id,
        approved_at=datetime.now(UTC) if status_value == EntryStatus.approved else None,
        approved_by_user_id=user.id if status_value == EntryStatus.approved and user.is_superuser else None,
    )
    db.add(entry)
    await db.flush()
    await _apply_entry_source_fields(
        db,
        entry=entry,
        source_payload=payload.source,
        source_citation_fallback=payload.source_citation,
        actor_user_id=user.id,
    )

    await set_entry_tags(db, entry, payload.tag_ids)
    await create_entry_version(db, entry=entry, edited_by_user_id=user.id, edit_summary="Initial submission")
    await refresh_vote_and_example_caches(db, entry)

    await db.commit()

    hydrated = await _load_entry_with_relations(db, entry.id)
    if not hydrated:
        raise_api_error(status_code=500, code="entry_create_failed", message="Could not load new entry")
    badge_leaders = await get_user_badge_leaders(db)
    history_events = await _load_entry_history_events(db, entry=hydrated)
    return serialize_entry_detail(
        hydrated,
        examples=[],
        comments=[],
        badge_leaders=badge_leaders,
        history_events=history_events,
    )


@router.post("/{entry_id}/audio", response_model=AudioSampleOut, status_code=status.HTTP_201_CREATED)
async def upload_entry_audio(
    entry_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> AudioSampleOut:
    entry = await load_entry_for_update(db, entry_id)
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    sample = await save_audio_upload(
        db,
        user_id=user.id,
        upload=file,
        entry_id=entry_id,
    )
    await db.commit()
    hydrated = await _load_audio_sample_with_uploader(db, sample.id)
    if not hydrated:
        raise_api_error(status_code=500, code="audio_upload_failed", message="Could not load audio sample")
    return serialize_audio_sample(hydrated)


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
        if not is_valid_headword(payload.headword):
            raise_api_error(
                status_code=400,
                code="invalid_headword_format",
                message="Headword contains invalid characters",
            )
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
        entry.normalized_gloss_pt = normalize_search_query(payload.gloss_pt)
        changed = True

    if payload.gloss_en is not None:
        entry.gloss_en = payload.gloss_en
        entry.normalized_gloss_en = normalize_search_query(payload.gloss_en) if payload.gloss_en else None
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

    if "source" in payload.model_fields_set:
        source_citation_fallback = payload.source_citation if "source_citation" in payload.model_fields_set else None
        await _apply_entry_source_fields(
            db,
            entry=entry,
            source_payload=payload.source,
            source_citation_fallback=source_citation_fallback,
            actor_user_id=user.id,
        )
        changed = True
    elif "source_citation" in payload.model_fields_set:
        entry.source_citation = clean_source_text(payload.source_citation, max_length=500)
        changed = True

    if payload.morphology_notes is not None:
        entry.morphology_notes = payload.morphology_notes
        changed = True

    if payload.tag_ids is not None:
        await set_entry_tags(db, entry, payload.tag_ids)
        changed = True

    if not changed:
        raise_api_error(status_code=400, code="no_changes", message="No changes provided")

    # Any user-driven edit to an approved entry must be reviewed again.
    if entry.status == EntryStatus.approved and not is_moderator(user):
        entry.status = EntryStatus.pending
        entry.approved_at = None
        entry.approved_by_user_id = None

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
    comments = sorted(hydrated.comments, key=lambda comment: comment.created_at)
    badge_leaders = await get_user_badge_leaders(db)
    entry_moderation = await _load_entry_moderation_context(db, entry=hydrated)
    example_moderation = await _load_example_moderation_context(db, examples=examples)
    history_events = await _load_entry_history_events(db, entry=hydrated)
    entry_vote_value: int | None = None
    example_votes: dict[uuid.UUID, int] = {}
    comment_votes: dict[uuid.UUID, int] = {}
    audio_votes: dict[uuid.UUID, int] = {}

    if user:
        entry_vote_value = (
            await db.execute(
                select(Vote.value).where(and_(Vote.entry_id == hydrated.id, Vote.user_id == user.id))
            )
        ).scalar_one_or_none()

        if examples:
            example_ids = [example.id for example in examples]
            example_rows = (
                await db.execute(
                    select(ExampleVote.example_id, ExampleVote.value).where(
                        and_(ExampleVote.user_id == user.id, ExampleVote.example_id.in_(example_ids))
                    )
                )
            ).all()
            example_votes = {row[0]: row[1] for row in example_rows}

        if comments:
            comment_ids = [comment.id for comment in comments]
            comment_rows = (
                await db.execute(
                    select(CommentVote.comment_id, CommentVote.value).where(
                        and_(CommentVote.user_id == user.id, CommentVote.comment_id.in_(comment_ids))
                    )
                )
            ).all()
            comment_votes = {row[0]: row[1] for row in comment_rows}

        audio_ids = [sample.id for sample in hydrated.audio_samples]
        if examples:
            for example in examples:
                audio_ids.extend(sample.id for sample in example.audio_samples)
        if audio_ids:
            audio_rows = (
                await db.execute(
                    select(AudioVote.audio_id, AudioVote.value).where(
                        and_(AudioVote.user_id == user.id, AudioVote.audio_id.in_(audio_ids))
                    )
                )
            ).all()
            audio_votes = {row[0]: row[1] for row in audio_rows}
    return serialize_entry_detail(
        hydrated,
        examples=examples,
        comments=comments,
        badge_leaders=badge_leaders,
        entry_moderation=entry_moderation,
        example_moderation=example_moderation,
        history_events=history_events,
        current_user_vote=entry_vote_value,
        example_user_votes=example_votes,
        comment_user_votes=comment_votes,
        audio_user_votes=audio_votes,
    )


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

    settings = get_settings()
    if (
        payload.value == -1
        and settings.downvote_requires_comment
        and not (user.is_superuser and settings.downvote_comment_exempt_staff)
    ):
        min_length = settings.downvote_comment_min_length
        comment_count = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(EntryComment)
                    .where(
                        and_(
                            EntryComment.entry_id == entry_id,
                            EntryComment.user_id == user.id,
                            func.length(func.trim(EntryComment.body)) >= min_length,
                        )
                    )
                )
            ).scalar_one()
        )
        if comment_count == 0:
            raise_api_error(
                status_code=403,
                code="downvote_comment_required",
                message="Downvote requires a comment on the entry",
                details={"min_length": min_length},
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
        source_citation=None,
        source_edition_id=None,
        source_pages=None,
        usage_note=payload.usage_note,
        context_tag=payload.context_tag,
        status=status_value,
        approved_at=datetime.now(UTC) if status_value == ExampleStatus.approved else None,
        approved_by_user_id=(
            user.id
            if status_value == ExampleStatus.approved and user.is_superuser
            else None
        ),
    )
    db.add(example)
    await db.flush()
    await _apply_example_source_fields(
        db,
        example=example,
        source_payload=payload.source,
        source_citation_fallback=payload.source_citation,
        actor_user_id=user.id,
    )
    await create_example_version(
        db,
        example=example,
        edited_by_user_id=user.id,
        edit_summary="Initial submission",
    )

    await refresh_vote_and_example_caches(db, entry)
    await db.commit()
    created_example = (
        await db.execute(
            select(Example)
            .where(Example.id == example.id)
            .options(
                selectinload(Example.source_edition).selectinload(SourceEdition.work),
                selectinload(Example.source_edition).selectinload(SourceEdition.links),
                selectinload(Example.audio_samples),
            )
        )
    ).scalar_one_or_none()
    if created_example is None:
        raise_api_error(status_code=500, code="example_create_failed", message="Could not load new example")

    return serialize_example(created_example)


@router.post("/{entry_id}/comments", response_model=EntryCommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
    entry_id: uuid.UUID,
    payload: CommentCreate,
    request: Request,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> EntryCommentOut:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"

    await enforce_rate_limit(
        db,
        action="comment_submission",
        scope_key=f"comment_submission:{user.id}:{client_ip}",
        limit=settings.comment_submission_rate_limit_count,
        window_seconds=settings.comment_submission_rate_limit_window_seconds,
    )

    verifier = get_bot_verifier()
    is_human = await verifier.verify(payload.turnstile_token, client_ip)
    if not is_human:
        raise_api_error(status_code=400, code="bot_check_failed", message="Bot verification failed")

    if is_effectively_empty(payload.body):
        raise_api_error(status_code=400, code="empty_submission", message="Comment cannot be empty")

    entry = (await db.execute(select(Entry).where(Entry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    if payload.parent_comment_id:
        parent_comment = (
            await db.execute(select(EntryComment).where(EntryComment.id == payload.parent_comment_id))
        ).scalar_one_or_none()
        if not parent_comment or parent_comment.entry_id != entry_id:
            raise_api_error(status_code=404, code="comment_not_found", message="Parent comment not found")

    comment = EntryComment(
        entry_id=entry_id,
        user_id=user.id,
        parent_comment_id=payload.parent_comment_id,
        body=collapse_whitespace(payload.body),
    )
    db.add(comment)
    await db.flush()

    mention_keys = extract_mention_keys(comment.body)
    mentioned_user_ids = await _resolve_mentioned_user_ids(db, mention_keys=mention_keys)
    email_jobs = await _create_comment_notifications(
        db,
        entry=entry,
        comment=comment,
        actor=user,
        mentioned_user_ids=mentioned_user_ids,
    )

    await db.commit()

    for recipient_email, is_mention in email_jobs:
        try:
            await send_comment_notification_email(
                to_email=recipient_email,
                actor_display_name=_display_name_for_user(user),
                entry_headword=entry.headword,
                entry_slug=entry.slug,
                comment_body=comment.body,
                is_mention=is_mention,
            )
        except Exception:
            logger.exception(
                "Failed to send comment notification entry_id=%s recipient=%s",
                entry.id,
                recipient_email,
            )

    comment_with_author = (
        await db.execute(
            select(EntryComment)
            .where(EntryComment.id == comment.id)
            .options(selectinload(EntryComment.author).selectinload(User.profile))
        )
    ).scalar_one_or_none()
    if comment_with_author is None:
        raise_api_error(status_code=500, code="comment_create_failed", message="Could not load comment")

    badge_leaders = await get_user_badge_leaders(db)
    return serialize_entry_comment(comment_with_author, badge_leaders)


example_router = APIRouter(prefix="/examples", tags=["examples"])
comment_router = APIRouter(prefix="/comments", tags=["comments"])


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

    if "source" in payload.model_fields_set:
        source_citation_fallback = payload.source_citation if "source_citation" in payload.model_fields_set else None
        await _apply_example_source_fields(
            db,
            example=example,
            source_payload=payload.source,
            source_citation_fallback=source_citation_fallback,
            actor_user_id=user.id,
        )
        changed = True
    elif "source_citation" in payload.model_fields_set:
        example.source_citation = clean_source_text(payload.source_citation, max_length=500)
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

    await create_example_version(
        db,
        example=example,
        edited_by_user_id=user.id,
        edit_summary=payload.edit_summary or "Example update",
    )
    await db.commit()
    updated_example = (
        await db.execute(
            select(Example)
            .where(Example.id == example.id)
            .options(
                selectinload(Example.source_edition).selectinload(SourceEdition.work),
                selectinload(Example.source_edition).selectinload(SourceEdition.links),
                selectinload(Example.audio_samples),
            )
        )
    ).scalar_one_or_none()
    if updated_example is None:
        raise_api_error(status_code=500, code="example_update_failed", message="Could not load updated example")
    return serialize_example(updated_example)


@example_router.post("/{example_id}/audio", response_model=AudioSampleOut, status_code=status.HTTP_201_CREATED)
async def upload_example_audio(
    example_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> AudioSampleOut:
    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    sample = await save_audio_upload(
        db,
        user_id=user.id,
        upload=file,
        example_id=example_id,
    )
    await db.commit()
    hydrated = await _load_audio_sample_with_uploader(db, sample.id)
    if not hydrated:
        raise_api_error(status_code=500, code="audio_upload_failed", message="Could not load audio sample")
    return serialize_audio_sample(hydrated)


@example_router.get("/{example_id}/versions", response_model=list[ExampleVersionOut])
async def list_example_versions(example_id: uuid.UUID, db: SessionDep) -> list[ExampleVersionOut]:
    stmt = (
        select(ExampleVersion)
        .where(ExampleVersion.example_id == example_id)
        .order_by(ExampleVersion.version_number.desc())
    )
    versions = (await db.execute(stmt)).scalars().all()
    return [ExampleVersionOut.model_validate(version) for version in versions]


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


@comment_router.post("/{comment_id}/vote", response_model=CommentVoteOut)
async def vote_comment(
    comment_id: uuid.UUID,
    payload: VoteRequest,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> CommentVoteOut:
    if payload.value not in (-1, 1):
        raise_api_error(status_code=422, code="invalid_vote", message="Vote must be -1 or 1")

    if payload.value == -1 and not can_downvote(user):
        raise_api_error(
            status_code=403,
            code="downvote_blocked",
            message="New users cannot downvote until account age is at least 72 hours",
        )

    comment = (await db.execute(select(EntryComment).where(EntryComment.id == comment_id))).scalar_one_or_none()
    if not comment:
        raise_api_error(status_code=404, code="comment_not_found", message="Comment not found")

    if comment.user_id == user.id:
        raise_api_error(
            status_code=403,
            code="self_vote_forbidden",
            message="You cannot vote on your own comment",
        )

    existing_vote = (
        await db.execute(
            select(CommentVote).where(
                and_(CommentVote.comment_id == comment_id, CommentVote.user_id == user.id)
            )
        )
    ).scalar_one_or_none()

    if existing_vote:
        existing_vote.value = payload.value
        vote = existing_vote
    else:
        vote = CommentVote(comment_id=comment_id, user_id=user.id, value=payload.value)
        db.add(vote)

    await db.flush()
    await refresh_comment_vote_caches(db, comment)
    await recompute_user_reputation(db, comment.user_id)
    await db.commit()

    return CommentVoteOut(comment_id=comment_id, user_id=user.id, value=vote.value, score_cache=comment.score_cache)


@comment_router.delete("/{comment_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment_vote(
    comment_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    comment = (await db.execute(select(EntryComment).where(EntryComment.id == comment_id))).scalar_one_or_none()
    if not comment:
        raise_api_error(status_code=404, code="comment_not_found", message="Comment not found")

    existing_vote = (
        await db.execute(
            select(CommentVote).where(
                and_(CommentVote.comment_id == comment_id, CommentVote.user_id == user.id)
            )
        )
    ).scalar_one_or_none()
    if existing_vote:
        await db.delete(existing_vote)
        await db.flush()
        await refresh_comment_vote_caches(db, comment)
        await recompute_user_reputation(db, comment.user_id)

    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
