from sqlalchemy.ext.asyncio import AsyncSession

from app.models.moderation import ModerationAction


async def record_moderation_action(
    db: AsyncSession,
    *,
    moderator_user_id,
    action_type: str,
    target_type: str,
    target_id,
    notes: str | None = None,
    metadata_json: dict | None = None,
) -> None:
    db.add(
        ModerationAction(
            moderator_user_id=moderator_user_id,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            notes=notes,
            metadata_json=metadata_json,
        )
    )
    await db.flush()
