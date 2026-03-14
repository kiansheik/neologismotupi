import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.entry import Entry
from app.models.user import Profile, User
from app.schemas.badges import UserBadgeKind


@dataclass(slots=True)
class UserBadgeLeaders:
    founder_user_id: uuid.UUID | None
    top_contributor_user_id: uuid.UUID | None
    karma_leader_user_id: uuid.UUID | None


async def get_user_badge_leaders(db: AsyncSession) -> UserBadgeLeaders:
    founder_user_id: uuid.UUID | None = None
    founder_email = (get_settings().founder_email or "").strip().lower()
    if founder_email:
        founder_stmt = (
            select(User.id)
            .where(func.lower(User.email) == founder_email)
            .order_by(User.created_at.asc())
            .limit(1)
        )
        founder_user_id = (await db.execute(founder_stmt)).scalar_one_or_none()

    top_contributor_stmt = (
        select(Entry.proposer_user_id)
        .group_by(Entry.proposer_user_id)
        .order_by(
            func.count(Entry.id).desc(),
            func.max(Entry.created_at).desc(),
            Entry.proposer_user_id.asc(),
        )
        .limit(1)
    )
    top_contributor_user_id = (await db.execute(top_contributor_stmt)).scalar_one_or_none()

    karma_leader_stmt = (
        select(Profile.user_id)
        .order_by(
            Profile.reputation_score.desc(),
            Profile.updated_at.desc(),
            Profile.user_id.asc(),
        )
        .limit(1)
    )
    karma_leader_user_id = (await db.execute(karma_leader_stmt)).scalar_one_or_none()

    return UserBadgeLeaders(
        founder_user_id=founder_user_id,
        top_contributor_user_id=top_contributor_user_id,
        karma_leader_user_id=karma_leader_user_id,
    )


def resolve_user_badges(
    user_id: uuid.UUID | None,
    leaders: UserBadgeLeaders | None,
) -> list[UserBadgeKind]:
    if user_id is None or leaders is None:
        return []

    badges: list[UserBadgeKind] = []
    if user_id == leaders.founder_user_id:
        badges.append("founder")
    if user_id == leaders.top_contributor_user_id:
        badges.append("top_contributor")
    if user_id == leaders.karma_leader_user_id:
        badges.append("karma_leader")
    return badges
