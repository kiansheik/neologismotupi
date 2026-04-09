from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.deps import SessionDep, get_current_user
from app.core.enums import EntryStatus
from app.core.errors import raise_api_error
from app.models.entry import Entry
from app.models.flashcards import FlashcardDailyPlan
from app.models.user import User
from app.schemas.flashcards import (
    FlashcardCardOut,
    FlashcardReviewRequest,
    FlashcardReviewResponse,
    FlashcardSessionOut,
    FlashcardSessionSummary,
    FlashcardSettingsOut,
    FlashcardSettingsUpdate,
)
from app.services.flashcards import (
    apply_flashcard_review,
    build_flashcard_session,
    get_or_create_flashcard_settings,
)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


def _entry_has_card_fields(entry: Entry) -> bool:
    if entry.status != EntryStatus.approved:
        return False
    if not entry.headword or not entry.headword.strip():
        return False
    if not entry.gloss_pt or not entry.gloss_pt.strip():
        return False
    if not entry.short_definition or not entry.short_definition.strip():
        return False
    return True


@router.get("/settings", response_model=FlashcardSettingsOut)
async def get_flashcard_settings(
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardSettingsOut:
    settings = await get_or_create_flashcard_settings(db, user.id)
    return FlashcardSettingsOut.model_validate(settings)


@router.patch("/settings", response_model=FlashcardSettingsOut)
async def update_flashcard_settings(
    db: SessionDep,
    payload: FlashcardSettingsUpdate,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardSettingsOut:
    settings = await get_or_create_flashcard_settings(db, user.id)
    if payload.new_cards_per_day is not None:
        settings.new_cards_per_day = payload.new_cards_per_day
    await db.commit()
    await db.refresh(settings)
    return FlashcardSettingsOut.model_validate(settings)


@router.get("/session", response_model=FlashcardSessionOut)
async def get_flashcard_session(
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardSessionOut:
    settings, summary, card = await build_flashcard_session(db, user.id)
    return FlashcardSessionOut(
        settings=FlashcardSettingsOut.model_validate(settings),
        summary=FlashcardSessionSummary(
            new_remaining=summary.new_remaining,
            review_remaining=summary.review_remaining,
            completed_today=summary.completed_today,
            due_now=summary.due_now,
        ),
        current_card=FlashcardCardOut(**card.__dict__) if card else None,
    )


@router.post("/review", response_model=FlashcardReviewResponse)
async def review_flashcard(
    db: SessionDep,
    payload: FlashcardReviewRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> FlashcardReviewResponse:
    entry = (
        await db.execute(select(Entry).where(Entry.id == payload.entry_id))
    ).scalar_one_or_none()
    if not entry or not _entry_has_card_fields(entry):
        raise_api_error(status_code=404, code="flashcard_not_found", message="Card not available")

    progress = await apply_flashcard_review(
        db,
        user_id=user.id,
        entry_id=payload.entry_id,
        direction=payload.direction,
        result=payload.result,
        response_ms=payload.response_ms,
    )

    today = datetime.now(UTC).date()
    plan_item = (
        await db.execute(
            select(FlashcardDailyPlan).where(
                FlashcardDailyPlan.user_id == user.id,
                FlashcardDailyPlan.plan_date == today,
                FlashcardDailyPlan.entry_id == payload.entry_id,
                FlashcardDailyPlan.direction == payload.direction,
            )
        )
    ).scalar_one_or_none()
    if plan_item and plan_item.completed_at is None:
        plan_item.completed_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(progress)

    settings, summary, card = await build_flashcard_session(db, user.id)
    return FlashcardReviewResponse(
        summary=FlashcardSessionSummary(
            new_remaining=summary.new_remaining,
            review_remaining=summary.review_remaining,
            completed_today=summary.completed_today,
            due_now=summary.due_now,
        ),
        next_card=FlashcardCardOut(**card.__dict__) if card else None,
    )
