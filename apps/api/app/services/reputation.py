import uuid
from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discussion import EntryComment
from app.models.entry import Entry, Example
from app.models.user import Profile


async def recompute_user_reputation(db: AsyncSession, user_id: uuid.UUID) -> None:
    profile = (await db.execute(select(Profile).where(Profile.user_id == user_id))).scalar_one_or_none()
    if profile is None:
        return

    entry_score_stmt = select(func.coalesce(func.sum(Entry.score_cache), 0)).where(
        Entry.proposer_user_id == user_id
    )
    example_score_stmt = select(func.coalesce(func.sum(Example.score_cache), 0)).where(
        Example.user_id == user_id
    )
    comment_score_stmt = select(func.coalesce(func.sum(EntryComment.score_cache), 0)).where(
        EntryComment.user_id == user_id
    )

    entry_score = int((await db.execute(entry_score_stmt)).scalar_one())
    example_score = int((await db.execute(example_score_stmt)).scalar_one())
    comment_score = int((await db.execute(comment_score_stmt)).scalar_one())
    profile.reputation_score = entry_score + example_score + comment_score


async def recompute_user_reputations(db: AsyncSession, user_ids: Iterable[uuid.UUID]) -> None:
    unique_user_ids = list(dict.fromkeys(user_ids))
    for user_id in unique_user_ids:
        await recompute_user_reputation(db, user_id)
