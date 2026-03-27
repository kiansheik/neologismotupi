from __future__ import annotations

import uuid
from pathlib import Path
import asyncio
import subprocess
import tempfile

import logging

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_api_error
from app.models.audio import AudioSample, AudioVote

logger = logging.getLogger("uvicorn.error")

ALLOWED_AUDIO_TYPES: dict[str, str] = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
}


def _resolve_media_root() -> Path:
    settings = get_settings()
    root = Path(settings.media_root)
    if not root.is_absolute():
        root = (Path.cwd() / root).resolve()
    return root


def build_audio_url(file_path: str) -> str:
    base = get_settings().api_public_url.rstrip("/")
    return f"{base}/media/{file_path.lstrip('/')}"


def _codec_for_extension(extension: str) -> tuple[str, list[str]]:
    ext = extension.lstrip(".").lower()
    if ext == "mp3":
        return "libmp3lame", ["-b:a", "128k"]
    if ext in ("mp4", "m4a"):
        return "aac", ["-b:a", "128k", "-movflags", "+faststart"]
    if ext == "aac":
        return "aac", ["-b:a", "128k"]
    if ext == "ogg":
        return "libvorbis", ["-b:a", "128k"]
    if ext == "webm":
        return "libopus", ["-b:a", "128k"]
    if ext == "wav":
        return "pcm_s16le", []
    return "aac", ["-b:a", "128k", "-movflags", "+faststart"]


def _process_audio_file(path: Path) -> None:
    settings = get_settings()
    if not settings.audio_processing_enabled:
        return

    pad_seconds = max(settings.audio_trim_padding_seconds, 0)
    silence_keep = (
        f":start_silence={pad_seconds}:stop_silence={pad_seconds}" if pad_seconds > 0 else ""
    )
    filter_chain = ",".join(
        [
            "highpass=f=80",
            "lowpass=f=12000",
            (
                "silenceremove=start_periods=1:start_duration=0.15:start_threshold=-45dB"
                f"{silence_keep}:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB"
            ),
            "loudnorm=I=-16:TP=-1.5:LRA=11",
        ]
    )

    with tempfile.NamedTemporaryFile(suffix=path.suffix, delete=False) as temp_file:
        temp_path = Path(temp_file.name)

    try:
        codec, codec_args = _codec_for_extension(path.suffix)
        subprocess.run(
            [
                settings.ffmpeg_path,
                "-y",
                "-i",
                str(path),
                "-af",
                filter_chain,
                "-c:a",
                codec,
                *codec_args,
                str(temp_path),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=settings.audio_processing_timeout_seconds,
        )
        temp_path.replace(path)
    finally:
        if temp_path.exists() and temp_path != path:
            temp_path.unlink(missing_ok=True)

async def save_audio_upload(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    upload: UploadFile,
    entry_id: uuid.UUID | None = None,
    example_id: uuid.UUID | None = None,
) -> AudioSample:
    content_type = (upload.content_type or "").lower().split(";")[0].strip()
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise_api_error(
            status_code=415,
            code="unsupported_audio_type",
            message="Unsupported audio format",
        )

    payload = await upload.read()
    if not payload:
        raise_api_error(status_code=400, code="empty_audio", message="Audio file is empty")

    max_bytes = get_settings().max_audio_bytes
    if max_bytes and len(payload) > max_bytes:
        raise_api_error(
            status_code=413,
            code="audio_too_large",
            message="Audio file is too large",
        )

    audio_id = uuid.uuid4()
    extension = ALLOWED_AUDIO_TYPES[content_type]
    relative_path = f"audio/{audio_id}.{extension}"
    media_root = _resolve_media_root()
    target_path = media_root / relative_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(payload)
    try:
        await asyncio.to_thread(_process_audio_file, target_path)
    except Exception as exc:  # noqa: BLE001
        details = None
        if isinstance(exc, subprocess.CalledProcessError):
            details = exc.stderr or exc.stdout
        logger.exception("Audio processing failed; keeping original file. %s", details or "")

    sample = AudioSample(
        id=audio_id,
        entry_id=entry_id,
        example_id=example_id,
        user_id=user_id,
        file_path=relative_path,
        mime_type=content_type,
    )
    db.add(sample)
    await db.flush()
    return sample


async def refresh_audio_vote_caches(db: AsyncSession, sample: AudioSample) -> None:
    upvote_stmt = (
        select(func.count())
        .select_from(AudioVote)
        .where(AudioVote.audio_id == sample.id, AudioVote.value == 1)
    )
    downvote_stmt = (
        select(func.count())
        .select_from(AudioVote)
        .where(AudioVote.audio_id == sample.id, AudioVote.value == -1)
    )
    upvotes = int((await db.execute(upvote_stmt)).scalar_one())
    downvotes = int((await db.execute(downvote_stmt)).scalar_one())

    sample.upvote_count_cache = upvotes
    sample.downvote_count_cache = downvotes
    sample.score_cache = upvotes - downvotes
