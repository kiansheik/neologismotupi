import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.core.deps import SessionDep, get_current_user
from app.core.errors import raise_api_error
from app.models.audio import AudioSample, AudioVote
from app.models.user import User
from app.schemas.audio import AudioVoteOut
from app.schemas.entries import VoteRequest
from app.services.audio import refresh_audio_vote_caches
from app.services.entries import can_downvote

router = APIRouter(prefix="/audio", tags=["audio"])


@router.post("/{audio_id}/vote", response_model=AudioVoteOut)
async def vote_audio(
    audio_id: uuid.UUID,
    payload: VoteRequest,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> AudioVoteOut:
    if payload.value not in (-1, 1):
        raise_api_error(status_code=422, code="invalid_vote", message="Vote must be -1 or 1")
    if payload.value == -1 and not can_downvote(user):
        raise_api_error(
            status_code=403,
            code="downvote_blocked",
            message="New users cannot downvote until account age is at least 72 hours",
        )

    audio = (await db.execute(select(AudioSample).where(AudioSample.id == audio_id))).scalar_one_or_none()
    if not audio:
        raise_api_error(status_code=404, code="audio_not_found", message="Audio sample not found")

    if audio.user_id == user.id:
        raise_api_error(
            status_code=403,
            code="self_vote_forbidden",
            message="You cannot vote on your own audio",
        )

    existing_vote = (
        await db.execute(
            select(AudioVote).where(AudioVote.audio_id == audio_id, AudioVote.user_id == user.id)
        )
    ).scalar_one_or_none()
    if existing_vote:
        existing_vote.value = payload.value
        vote = existing_vote
    else:
        vote = AudioVote(audio_id=audio_id, user_id=user.id, value=payload.value)
        db.add(vote)

    await refresh_audio_vote_caches(db, audio)
    await db.commit()

    return AudioVoteOut(
        audio_id=audio_id,
        user_id=user.id,
        value=vote.value,
        score_cache=audio.score_cache,
    )


@router.delete("/{audio_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audio_vote(
    audio_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    audio = (await db.execute(select(AudioSample).where(AudioSample.id == audio_id))).scalar_one_or_none()
    if not audio:
        raise_api_error(status_code=404, code="audio_not_found", message="Audio sample not found")

    existing_vote = (
        await db.execute(
            select(AudioVote).where(AudioVote.audio_id == audio_id, AudioVote.user_id == user.id)
        )
    ).scalar_one_or_none()
    if existing_vote:
        await db.delete(existing_vote)
        await refresh_audio_vote_caches(db, audio)
        await db.commit()


@router.delete("/{audio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audio_sample(
    audio_id: uuid.UUID,
    db: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    audio = (await db.execute(select(AudioSample).where(AudioSample.id == audio_id))).scalar_one_or_none()
    if not audio:
        raise_api_error(status_code=404, code="audio_not_found", message="Audio sample not found")
    if audio.user_id != user.id and not user.is_superuser:
        raise_api_error(status_code=403, code="forbidden", message="You do not own this audio")
    await db.delete(audio)
    await db.commit()
