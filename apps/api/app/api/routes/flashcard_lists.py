import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import SessionDep, get_current_user, get_current_user_optional
from app.core.errors import raise_api_error
from app.core.enums import EntryStatus
from app.models.entry import Entry
from app.models.flashcards import (
    FlashcardList,
    FlashcardListComment,
    FlashcardListItem,
    FlashcardListVote,
)
from app.models.user import Profile, User
from app.schemas.entries import EntryAuthorOut, VoteRequest
from app.schemas.flashcard_lists import (
    FlashcardListCommentCreate,
    FlashcardListCommentListOut,
    FlashcardListCommentOut,
    FlashcardListCreate,
    FlashcardListDetailOut,
    FlashcardListItemCreate,
    FlashcardListListOut,
    FlashcardListOut,
    FlashcardListUpdate,
    FlashcardListVoteOut,
)
from app.services.flashcards import _entry_card_exists
from app.services.serializers import serialize_entry_summary
from app.services.user_badges import get_user_badge_leaders, resolve_user_badges

router = APIRouter(prefix="/flashcard-lists", tags=["flashcard-lists"])


def _parse_owner_id(raw: str | None, user: User | None) -> uuid.UUID | None:
    if not raw:
        return None
    if raw == "me":
        if not user:
            raise_api_error(status_code=401, code="unauthenticated", message="Authentication required")
        return user.id
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise_api_error(status_code=422, code="invalid_owner", message="Invalid owner id")


def _serialize_owner(
    owner_user_id: uuid.UUID,
    profile: Profile | None,
    badge_leaders,
) -> EntryAuthorOut:
    fallback = f"user-{str(owner_user_id)[:8]}"
    badges = resolve_user_badges(owner_user_id, badge_leaders)
    if profile:
        return EntryAuthorOut(
            id=owner_user_id,
            display_name=profile.display_name,
            reputation_score=profile.reputation_score,
            badges=badges,
        )
    return EntryAuthorOut(
        id=owner_user_id,
        display_name=fallback,
        reputation_score=0,
        badges=badges,
    )


async def _refresh_list_vote_caches(db: AsyncSession, list_id: uuid.UUID) -> FlashcardList:
    row = (
        await db.execute(
            select(
                func.count().filter(FlashcardListVote.value == 1).label("upvotes"),
                func.count().filter(FlashcardListVote.value == -1).label("downvotes"),
            ).where(FlashcardListVote.list_id == list_id)
        )
    ).one()
    list_row = (await db.execute(select(FlashcardList).where(FlashcardList.id == list_id))).scalar_one()
    list_row.upvote_count_cache = int(row.upvotes or 0)
    list_row.downvote_count_cache = int(row.downvotes or 0)
    list_row.score_cache = list_row.upvote_count_cache - list_row.downvote_count_cache
    return list_row


async def _refresh_list_item_count(db: AsyncSession, list_id: uuid.UUID) -> None:
    total = int(
        (await db.execute(select(func.count()).select_from(FlashcardListItem).where(FlashcardListItem.list_id == list_id))).scalar_one()
    )
    list_row = (await db.execute(select(FlashcardList).where(FlashcardList.id == list_id))).scalar_one()
    list_row.item_count_cache = total


async def _get_list_or_404(
    db: AsyncSession,
    list_id: uuid.UUID,
    user: User | None,
) -> FlashcardList:
    list_row = (await db.execute(select(FlashcardList).where(FlashcardList.id == list_id))).scalar_one_or_none()
    if not list_row:
        raise_api_error(status_code=404, code="flashcard_list_not_found", message="List not found")
    if not list_row.is_public and (not user or list_row.owner_user_id != user.id):
        raise_api_error(status_code=404, code="flashcard_list_not_found", message="List not found")
    return list_row


@router.get("", response_model=FlashcardListListOut)
async def list_flashcard_lists(
    db: SessionDep,
    user: Annotated[User | None, Depends(get_current_user_optional)],
    q: str | None = None,
    owner_id: str | None = None,
    entry_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> FlashcardListListOut:
    owner_uuid = _parse_owner_id(owner_id, user)
    filters = []
    if owner_uuid:
        filters.append(FlashcardList.owner_user_id == owner_uuid)
        if not user or user.id != owner_uuid:
            filters.append(FlashcardList.is_public.is_(True))
    else:
        filters.append(FlashcardList.is_public.is_(True))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                FlashcardList.title_pt.ilike(pattern),
                FlashcardList.title_en.ilike(pattern),
                FlashcardList.description_pt.ilike(pattern),
                FlashcardList.description_en.ilike(pattern),
                FlashcardList.theme_label.ilike(pattern),
            )
        )

    total = int(
        (
            await db.execute(
                select(func.count()).select_from(FlashcardList).where(and_(*filters))
            )
        ).scalar_one()
    )

    vote_alias = FlashcardListVote
    current_user_vote = (
        vote_alias.value.label("current_user_vote")
        if user
        else literal(None).label("current_user_vote")
    )
    contains_list_id = (
        FlashcardListItem.list_id.label("contains_list_id")
        if entry_id
        else literal(None).label("contains_list_id")
    )
    stmt = (
        select(
            FlashcardList,
            Profile,
            current_user_vote,
            contains_list_id,
        )
        .outerjoin(Profile, Profile.user_id == FlashcardList.owner_user_id)
        .where(and_(*filters))
        .order_by(
            FlashcardList.score_cache.desc(),
            FlashcardList.item_count_cache.desc(),
            FlashcardList.created_at.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    if user:
        stmt = stmt.outerjoin(
            vote_alias,
            and_(vote_alias.list_id == FlashcardList.id, vote_alias.user_id == user.id),
        )
    if entry_id:
        stmt = stmt.outerjoin(
            FlashcardListItem,
            and_(
                FlashcardListItem.list_id == FlashcardList.id,
                FlashcardListItem.entry_id == entry_id,
            ),
        )

    rows = (await db.execute(stmt)).all()
    badge_leaders = await get_user_badge_leaders(db)

    items: list[FlashcardListOut] = []
    for list_row, profile_row, current_user_vote, contains_list_id in rows:
        owner = _serialize_owner(list_row.owner_user_id, profile_row, badge_leaders)
        items.append(
            FlashcardListOut(
                id=list_row.id,
                owner=owner,
                title_pt=list_row.title_pt,
                title_en=list_row.title_en,
                description_pt=list_row.description_pt,
                description_en=list_row.description_en,
                theme_label=list_row.theme_label,
                is_public=list_row.is_public,
                score_cache=list_row.score_cache,
                upvote_count_cache=list_row.upvote_count_cache,
                downvote_count_cache=list_row.downvote_count_cache,
                item_count_cache=list_row.item_count_cache,
                current_user_vote=current_user_vote,
                contains_entry=bool(contains_list_id) if entry_id else None,
                created_at=list_row.created_at,
                updated_at=list_row.updated_at,
            )
        )

    return FlashcardListListOut(items=items, page=page, page_size=page_size, total=total)


@router.get("/{list_id}", response_model=FlashcardListDetailOut)
async def get_flashcard_list(
    list_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User | None, Depends(get_current_user_optional)],
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=100),
) -> FlashcardListDetailOut:
    list_row = await _get_list_or_404(db, list_id, user)
    badge_leaders = await get_user_badge_leaders(db)

    profile = (
        await db.execute(select(Profile).where(Profile.user_id == list_row.owner_user_id))
    ).scalar_one_or_none()
    owner = _serialize_owner(list_row.owner_user_id, profile, badge_leaders)
    current_user_vote = None
    if user:
        current_user_vote = (
            await db.execute(
                select(FlashcardListVote.value).where(
                    and_(FlashcardListVote.list_id == list_row.id, FlashcardListVote.user_id == user.id)
                )
            )
        ).scalar_one_or_none()

    total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(FlashcardListItem)
                .where(FlashcardListItem.list_id == list_id)
            )
        ).scalar_one()
    )

    entries_stmt = (
        select(Entry)
        .join(FlashcardListItem, FlashcardListItem.entry_id == Entry.id)
        .where(FlashcardListItem.list_id == list_id)
        .order_by(FlashcardListItem.position.asc(), FlashcardListItem.created_at.asc(), Entry.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    entries = list((await db.execute(entries_stmt)).scalars().all())
    entry_payloads = [serialize_entry_summary(entry, badge_leaders, None) for entry in entries]

    list_out = FlashcardListOut(
        id=list_row.id,
        owner=owner,
        title_pt=list_row.title_pt,
        title_en=list_row.title_en,
        description_pt=list_row.description_pt,
        description_en=list_row.description_en,
        theme_label=list_row.theme_label,
        is_public=list_row.is_public,
        score_cache=list_row.score_cache,
        upvote_count_cache=list_row.upvote_count_cache,
        downvote_count_cache=list_row.downvote_count_cache,
        item_count_cache=list_row.item_count_cache,
        current_user_vote=current_user_vote,
        contains_entry=None,
        created_at=list_row.created_at,
        updated_at=list_row.updated_at,
    )

    return FlashcardListDetailOut(
        list=list_out,
        items=entry_payloads,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=FlashcardListOut)
async def create_flashcard_list(
    payload: FlashcardListCreate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardListOut:
    list_row = FlashcardList(
        owner_user_id=user.id,
        title_pt=payload.title_pt.strip(),
        title_en=payload.title_en.strip() if payload.title_en else None,
        description_pt=payload.description_pt.strip() if payload.description_pt else None,
        description_en=payload.description_en.strip() if payload.description_en else None,
        theme_label=payload.theme_label.strip() if payload.theme_label else None,
        is_public=payload.is_public,
    )
    db.add(list_row)
    await db.flush()
    await db.commit()
    await db.refresh(list_row)
    badge_leaders = await get_user_badge_leaders(db)
    profile = (await db.execute(select(Profile).where(Profile.user_id == user.id))).scalar_one_or_none()
    owner = _serialize_owner(list_row.owner_user_id, profile, badge_leaders)
    return FlashcardListOut(
        id=list_row.id,
        owner=owner,
        title_pt=list_row.title_pt,
        title_en=list_row.title_en,
        description_pt=list_row.description_pt,
        description_en=list_row.description_en,
        theme_label=list_row.theme_label,
        is_public=list_row.is_public,
        score_cache=list_row.score_cache,
        upvote_count_cache=list_row.upvote_count_cache,
        downvote_count_cache=list_row.downvote_count_cache,
        item_count_cache=list_row.item_count_cache,
        current_user_vote=None,
        contains_entry=None,
        created_at=list_row.created_at,
        updated_at=list_row.updated_at,
    )


@router.patch("/{list_id}", response_model=FlashcardListOut)
async def update_flashcard_list(
    list_id: uuid.UUID,
    payload: FlashcardListUpdate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardListOut:
    list_row = await _get_list_or_404(db, list_id, user)
    if list_row.owner_user_id != user.id:
        raise_api_error(status_code=403, code="forbidden", message="List owner required")

    if payload.title_pt is not None:
        list_row.title_pt = payload.title_pt.strip()
    if payload.title_en is not None:
        list_row.title_en = payload.title_en.strip() if payload.title_en else None
    if payload.description_pt is not None:
        list_row.description_pt = payload.description_pt.strip() if payload.description_pt else None
    if payload.description_en is not None:
        list_row.description_en = payload.description_en.strip() if payload.description_en else None
    if payload.theme_label is not None:
        list_row.theme_label = payload.theme_label.strip() if payload.theme_label else None
    if payload.is_public is not None:
        list_row.is_public = payload.is_public

    await db.commit()
    await db.refresh(list_row)
    badge_leaders = await get_user_badge_leaders(db)
    profile = (await db.execute(select(Profile).where(Profile.user_id == user.id))).scalar_one_or_none()
    owner = _serialize_owner(list_row.owner_user_id, profile, badge_leaders)
    return FlashcardListOut(
        id=list_row.id,
        owner=owner,
        title_pt=list_row.title_pt,
        title_en=list_row.title_en,
        description_pt=list_row.description_pt,
        description_en=list_row.description_en,
        theme_label=list_row.theme_label,
        is_public=list_row.is_public,
        score_cache=list_row.score_cache,
        upvote_count_cache=list_row.upvote_count_cache,
        downvote_count_cache=list_row.downvote_count_cache,
        item_count_cache=list_row.item_count_cache,
        current_user_vote=None,
        contains_entry=None,
        created_at=list_row.created_at,
        updated_at=list_row.updated_at,
    )


@router.post("/{list_id}/items", response_model=FlashcardListOut)
async def add_flashcard_list_item(
    list_id: uuid.UUID,
    payload: FlashcardListItemCreate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardListOut:
    list_row = await _get_list_or_404(db, list_id, user)
    if list_row.owner_user_id != user.id:
        raise_api_error(status_code=403, code="forbidden", message="List owner required")

    entry = (await db.execute(select(Entry).where(Entry.id == payload.entry_id))).scalar_one_or_none()
    if not entry or entry.status != EntryStatus.approved or not _entry_card_exists(entry):
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    existing = (
        await db.execute(
            select(FlashcardListItem).where(
                and_(FlashcardListItem.list_id == list_id, FlashcardListItem.entry_id == payload.entry_id)
            )
        )
    ).scalar_one_or_none()
    if not existing:
        max_position = (
            await db.execute(
                select(func.max(FlashcardListItem.position)).where(FlashcardListItem.list_id == list_id)
            )
        ).scalar_one()
        next_position = int(max_position or 0) + 1
        db.add(
            FlashcardListItem(
                list_id=list_id,
                entry_id=payload.entry_id,
                position=next_position,
            )
        )
        await db.flush()
        await _refresh_list_item_count(db, list_id)

    await db.commit()
    await db.refresh(list_row)
    badge_leaders = await get_user_badge_leaders(db)
    profile = (await db.execute(select(Profile).where(Profile.user_id == list_row.owner_user_id))).scalar_one_or_none()
    owner = _serialize_owner(list_row.owner_user_id, profile, badge_leaders)
    return FlashcardListOut(
        id=list_row.id,
        owner=owner,
        title_pt=list_row.title_pt,
        title_en=list_row.title_en,
        description_pt=list_row.description_pt,
        description_en=list_row.description_en,
        theme_label=list_row.theme_label,
        is_public=list_row.is_public,
        score_cache=list_row.score_cache,
        upvote_count_cache=list_row.upvote_count_cache,
        downvote_count_cache=list_row.downvote_count_cache,
        item_count_cache=list_row.item_count_cache,
        current_user_vote=None,
        contains_entry=True,
        created_at=list_row.created_at,
        updated_at=list_row.updated_at,
    )


@router.delete("/{list_id}/items/{entry_id}", response_model=FlashcardListOut)
async def remove_flashcard_list_item(
    list_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardListOut:
    list_row = await _get_list_or_404(db, list_id, user)
    if list_row.owner_user_id != user.id:
        raise_api_error(status_code=403, code="forbidden", message="List owner required")

    item = (
        await db.execute(
            select(FlashcardListItem).where(
                and_(FlashcardListItem.list_id == list_id, FlashcardListItem.entry_id == entry_id)
            )
        )
    ).scalar_one_or_none()
    if item:
        await db.delete(item)
        await db.flush()
        await _refresh_list_item_count(db, list_id)

    await db.commit()
    await db.refresh(list_row)
    badge_leaders = await get_user_badge_leaders(db)
    profile = (await db.execute(select(Profile).where(Profile.user_id == list_row.owner_user_id))).scalar_one_or_none()
    owner = _serialize_owner(list_row.owner_user_id, profile, badge_leaders)
    return FlashcardListOut(
        id=list_row.id,
        owner=owner,
        title_pt=list_row.title_pt,
        title_en=list_row.title_en,
        description_pt=list_row.description_pt,
        description_en=list_row.description_en,
        theme_label=list_row.theme_label,
        is_public=list_row.is_public,
        score_cache=list_row.score_cache,
        upvote_count_cache=list_row.upvote_count_cache,
        downvote_count_cache=list_row.downvote_count_cache,
        item_count_cache=list_row.item_count_cache,
        current_user_vote=None,
        contains_entry=False,
        created_at=list_row.created_at,
        updated_at=list_row.updated_at,
    )


@router.post("/{list_id}/vote", response_model=FlashcardListVoteOut)
async def vote_flashcard_list(
    list_id: uuid.UUID,
    payload: VoteRequest,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardListVoteOut:
    if payload.value not in (-1, 1):
        raise_api_error(status_code=422, code="invalid_vote", message="Vote must be -1 or 1")

    list_row = await _get_list_or_404(db, list_id, user)
    if list_row.owner_user_id == user.id:
        raise_api_error(status_code=403, code="self_vote_forbidden", message="Cannot vote on own list")

    existing = (
        await db.execute(
            select(FlashcardListVote).where(
                and_(FlashcardListVote.list_id == list_id, FlashcardListVote.user_id == user.id)
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.value = payload.value
        vote = existing
    else:
        vote = FlashcardListVote(list_id=list_id, user_id=user.id, value=payload.value)
        db.add(vote)

    await db.flush()
    list_row = await _refresh_list_vote_caches(db, list_id)
    await db.commit()
    await db.refresh(list_row)

    return FlashcardListVoteOut(
        list_id=list_id,
        user_id=user.id,
        value=payload.value,
        score_cache=list_row.score_cache,
    )


@router.get("/{list_id}/comments", response_model=FlashcardListCommentListOut)
async def list_flashcard_list_comments(
    list_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User | None, Depends(get_current_user_optional)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> FlashcardListCommentListOut:
    list_row = await _get_list_or_404(db, list_id, user)

    total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(FlashcardListComment)
                .where(FlashcardListComment.list_id == list_row.id)
            )
        ).scalar_one()
    )

    stmt = (
        select(FlashcardListComment, Profile)
        .outerjoin(Profile, Profile.user_id == FlashcardListComment.user_id)
        .where(FlashcardListComment.list_id == list_row.id)
        .order_by(FlashcardListComment.created_at.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()
    badge_leaders = await get_user_badge_leaders(db)

    items: list[FlashcardListCommentOut] = []
    for comment, profile in rows:
        owner = _serialize_owner(comment.user_id, profile, badge_leaders)
        items.append(
            FlashcardListCommentOut(
                id=comment.id,
                list_id=comment.list_id,
                user_id=comment.user_id,
                body=comment.body,
                created_at=comment.created_at,
                updated_at=comment.updated_at,
                author=owner,
            )
        )

    return FlashcardListCommentListOut(items=items, page=page, page_size=page_size, total=total)


@router.post("/{list_id}/comments", response_model=FlashcardListCommentOut)
async def create_flashcard_list_comment(
    list_id: uuid.UUID,
    payload: FlashcardListCommentCreate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardListCommentOut:
    list_row = await _get_list_or_404(db, list_id, user)
    comment = FlashcardListComment(
        list_id=list_row.id,
        user_id=user.id,
        body=payload.body.strip(),
    )
    db.add(comment)
    await db.flush()
    await db.commit()
    await db.refresh(comment)
    badge_leaders = await get_user_badge_leaders(db)
    profile = (await db.execute(select(Profile).where(Profile.user_id == user.id))).scalar_one_or_none()
    author = _serialize_owner(user.id, profile, badge_leaders)
    return FlashcardListCommentOut(
        id=comment.id,
        list_id=comment.list_id,
        user_id=comment.user_id,
        body=comment.body,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author=author,
    )
