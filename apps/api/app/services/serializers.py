import uuid
from datetime import datetime

from sqlalchemy import inspect

from app.models.audio import AudioSample
from app.models.discussion import EntryComment
from app.models.entry import Entry, EntryTag, EntryVersion, Example, Tag
from app.schemas.entries import (
    EntryCommentOut,
    EntryAuthorOut,
    EntryDetailOut,
    EntryHistoryEventOut,
    EntrySourceOut,
    EntrySummaryOut,
    EntryVersionOut,
    ExampleOut,
    TagOut,
)
from app.schemas.audio import AudioSampleOut
from app.services.audio import build_audio_url
from app.services.sources import build_source_citation
from app.services.user_badges import UserBadgeLeaders, resolve_user_badges

type ModerationContext = tuple[str | None, str | None, datetime | None]


def serialize_tag(tag: Tag) -> TagOut:
    return TagOut.model_validate(tag)


def serialize_entry_tags(entry_tags: list[EntryTag]) -> list[TagOut]:
    serialized: list[TagOut] = []
    for link in entry_tags:
        if link.tag:
            serialized.append(serialize_tag(link.tag))
    return serialized


def serialize_example(
    example: Example,
    moderation_map: dict[uuid.UUID, ModerationContext] | None = None,
) -> ExampleOut:
    serialized = ExampleOut.model_validate(
        {
            "id": example.id,
            "entry_id": example.entry_id,
            "user_id": example.user_id,
            "sentence_original": example.sentence_original,
            "translation_pt": example.translation_pt,
            "translation_en": example.translation_en,
            "source_citation": example.source_citation,
            "source": _serialize_source_fields(
                source_edition=example.source_edition,
                source_pages=example.source_pages,
                source_citation=example.source_citation,
            ),
            "usage_note": example.usage_note,
            "context_tag": example.context_tag,
            "status": example.status,
            "score_cache": example.score_cache,
            "upvote_count_cache": example.upvote_count_cache,
            "downvote_count_cache": example.downvote_count_cache,
            "audio_samples": [serialize_audio_sample(sample) for sample in example.audio_samples],
            "created_at": example.created_at,
            "updated_at": example.updated_at,
        }
    )
    if moderation_map and example.id in moderation_map:
        reason, notes, moderated_at = moderation_map[example.id]
        serialized.moderation_reason = reason
        serialized.moderation_notes = notes
        serialized.moderated_at = moderated_at
    return serialized


def serialize_entry_version(version: EntryVersion) -> EntryVersionOut:
    return EntryVersionOut.model_validate(version)


def serialize_entry_author(
    entry: Entry,
    badge_leaders: UserBadgeLeaders | None = None,
) -> EntryAuthorOut:
    fallback_name = f"user-{str(entry.proposer_user_id)[:8]}"
    badges = resolve_user_badges(entry.proposer_user_id, badge_leaders)
    if entry.proposer and entry.proposer.profile:
        return EntryAuthorOut(
            id=entry.proposer.id,
            display_name=entry.proposer.profile.display_name,
            reputation_score=entry.proposer.profile.reputation_score,
            badges=badges,
        )
    return EntryAuthorOut(
        id=entry.proposer_user_id,
        display_name=fallback_name,
        reputation_score=0,
        badges=badges,
    )


def serialize_comment_author(
    comment: EntryComment,
    badge_leaders: UserBadgeLeaders | None = None,
) -> EntryAuthorOut:
    fallback_name = f"user-{str(comment.user_id)[:8]}"
    badges = resolve_user_badges(comment.user_id, badge_leaders)
    if comment.author and comment.author.profile:
        return EntryAuthorOut(
            id=comment.author.id,
            display_name=comment.author.profile.display_name,
            reputation_score=comment.author.profile.reputation_score,
            badges=badges,
        )
    return EntryAuthorOut(
        id=comment.user_id,
        display_name=fallback_name,
        reputation_score=0,
        badges=badges,
    )


def serialize_entry_comment(
    comment: EntryComment,
    badge_leaders: UserBadgeLeaders | None = None,
) -> EntryCommentOut:
    return EntryCommentOut(
        id=comment.id,
        entry_id=comment.entry_id,
        user_id=comment.user_id,
        parent_comment_id=comment.parent_comment_id,
        body=comment.body,
        score_cache=comment.score_cache,
        upvote_count_cache=comment.upvote_count_cache,
        downvote_count_cache=comment.downvote_count_cache,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author=serialize_comment_author(comment, badge_leaders),
    )


def serialize_entry_summary(
    entry: Entry,
    badge_leaders: UserBadgeLeaders | None = None,
) -> EntrySummaryOut:
    payload = {
        "id": entry.id,
        "slug": entry.slug,
        "headword": entry.headword,
        "normalized_headword": entry.normalized_headword,
        "gloss_pt": entry.gloss_pt,
        "gloss_en": entry.gloss_en,
        "part_of_speech": entry.part_of_speech,
        "short_definition": entry.short_definition,
        "status": entry.status,
        "score_cache": entry.score_cache,
        "upvote_count_cache": entry.upvote_count_cache,
        "downvote_count_cache": entry.downvote_count_cache,
        "example_count_cache": entry.example_count_cache,
        "proposer_user_id": entry.proposer_user_id,
        "proposer": serialize_entry_author(entry, badge_leaders),
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "tags": serialize_entry_tags(entry.tags),
    }
    return EntrySummaryOut.model_validate(payload)


def serialize_entry_detail(
    entry: Entry,
    *,
    examples: list[Example],
    comments: list[EntryComment] | None = None,
    badge_leaders: UserBadgeLeaders | None = None,
    entry_moderation: ModerationContext | None = None,
    example_moderation: dict[uuid.UUID, ModerationContext] | None = None,
    history_events: list[EntryHistoryEventOut] | None = None,
) -> EntryDetailOut:
    moderation_reason: str | None = None
    moderation_notes: str | None = None
    moderated_at: datetime | None = None
    if entry_moderation:
        moderation_reason, moderation_notes, moderated_at = entry_moderation

    payload = {
        **serialize_entry_summary(entry, badge_leaders).model_dump(),
        "source_citation": entry.source_citation,
        "source": _serialize_entry_source(entry),
        "morphology_notes": entry.morphology_notes,
        "approved_at": entry.approved_at,
        "approved_by_user_id": entry.approved_by_user_id,
        "moderation_reason": moderation_reason,
        "moderation_notes": moderation_notes,
        "moderated_at": moderated_at,
        "versions": [serialize_entry_version(version) for version in entry.versions],
        "history_events": history_events or [],
        "examples": [serialize_example(example, example_moderation) for example in examples],
        "comments": [serialize_entry_comment(comment, badge_leaders) for comment in comments or []],
        "audio_samples": [serialize_audio_sample(sample) for sample in entry.audio_samples],
    }
    return EntryDetailOut.model_validate(payload)


def serialize_audio_sample(sample: AudioSample) -> AudioSampleOut:
    uploader_display_name = None
    uploader_profile_url = None
    sample_state = inspect(sample)
    if "uploader" not in sample_state.unloaded:
        uploader = sample.uploader
        if uploader:
            uploader_profile_url = f"/profiles/{uploader.id}"
            uploader_state = inspect(uploader)
            if "profile" not in uploader_state.unloaded and uploader.profile:
                uploader_display_name = uploader.profile.display_name

    return AudioSampleOut.model_validate(
        {
            "id": sample.id,
            "entry_id": sample.entry_id,
            "example_id": sample.example_id,
            "user_id": sample.user_id,
            "uploader_display_name": uploader_display_name,
            "uploader_profile_url": uploader_profile_url,
            "url": build_audio_url(sample.file_path),
            "mime_type": sample.mime_type,
            "duration_seconds": sample.duration_seconds,
            "score_cache": sample.score_cache,
            "upvote_count_cache": sample.upvote_count_cache,
            "downvote_count_cache": sample.downvote_count_cache,
            "created_at": sample.created_at,
        }
    )


def _serialize_entry_source(entry: Entry) -> EntrySourceOut | None:
    return _serialize_source_fields(
        source_edition=entry.source_edition,
        source_pages=entry.source_pages,
        source_citation=entry.source_citation,
    )


def _serialize_source_fields(
    *,
    source_edition,
    source_pages: str | None,
    source_citation: str | None,
) -> EntrySourceOut | None:
    if source_edition is None or source_edition.work is None:
        return None

    work = source_edition.work
    citation = build_source_citation(
        authors=work.authors,
        title=work.title,
        publication_year=source_edition.publication_year,
        edition_label=source_edition.edition_label,
        pages=source_pages,
        fallback=source_citation,
    )
    if citation is None:
        return None

    return EntrySourceOut(
        work_id=work.id,
        edition_id=source_edition.id,
        authors=work.authors,
        title=work.title,
        publication_year=source_edition.publication_year,
        edition_label=source_edition.edition_label,
        pages=source_pages,
        urls=[link.url for link in sorted(source_edition.links, key=lambda item: item.created_at, reverse=True)],
        citation=citation,
    )
