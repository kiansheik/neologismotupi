from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update

from app.core.deps import SessionDep, get_current_user
from app.models.newsletter import NewsletterSubscription
from app.models.user import User
from app.schemas.auth import ActionAcceptedResponse
from app.schemas.newsletters import (
    NewsletterSubscriptionOut,
    NewsletterSubscriptionUpdate,
    NewsletterUnsubscribeRequest,
)
from app.services.newsletters import NEWSLETTER_WORD_OF_DAY, get_or_create_subscription, normalize_locale

router = APIRouter(prefix="/newsletters", tags=["newsletters"])


@router.get("/me", response_model=list[NewsletterSubscriptionOut])
async def list_my_newsletters(
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> list[NewsletterSubscriptionOut]:
    # Ensure default subscription exists for current user.
    await get_or_create_subscription(
        db,
        user_id=user.id,
        newsletter_key=NEWSLETTER_WORD_OF_DAY,
        preferred_locale=user.preferred_locale,
    )
    await db.commit()

    rows = (
        await db.execute(
            select(NewsletterSubscription).where(NewsletterSubscription.user_id == user.id)
        )
    ).scalars().all()
    return [NewsletterSubscriptionOut.model_validate(row) for row in rows]


@router.patch("/me/{newsletter_key}", response_model=NewsletterSubscriptionOut)
async def update_my_newsletter(
    newsletter_key: str,
    payload: NewsletterSubscriptionUpdate,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> NewsletterSubscriptionOut:
    subscription = await get_or_create_subscription(
        db,
        user_id=user.id,
        newsletter_key=newsletter_key,
        preferred_locale=user.preferred_locale,
    )

    updates = payload.model_dump(exclude_unset=True)
    if "preferred_locale" in updates and updates["preferred_locale"] is not None:
        updates["preferred_locale"] = normalize_locale(updates["preferred_locale"])
    if updates:
        for key, value in updates.items():
            setattr(subscription, key, value)
    await db.commit()
    await db.refresh(subscription)
    return NewsletterSubscriptionOut.model_validate(subscription)


@router.post("/unsubscribe", response_model=ActionAcceptedResponse)
async def unsubscribe(
    payload: NewsletterUnsubscribeRequest,
    db: SessionDep,
) -> ActionAcceptedResponse:
    result = await db.execute(
        select(NewsletterSubscription).where(
            NewsletterSubscription.unsubscribe_token == payload.token
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription is None:
        # Avoid token enumeration.
        return ActionAcceptedResponse(ok=True)

    if subscription.is_active:
        await db.execute(
            update(NewsletterSubscription)
            .where(NewsletterSubscription.id == subscription.id)
            .values(is_active=False, unsubscribed_at=func.now())
        )
        await db.commit()

    return ActionAcceptedResponse(ok=True)
