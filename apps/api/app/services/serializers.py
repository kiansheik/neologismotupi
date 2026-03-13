from app.models.entry import Entry, EntryTag, EntryVersion, Example, Tag
from app.schemas.entries import EntryDetailOut, EntrySummaryOut, EntryVersionOut, ExampleOut, TagOut


def serialize_tag(tag: Tag) -> TagOut:
    return TagOut.model_validate(tag)


def serialize_entry_tags(entry_tags: list[EntryTag]) -> list[TagOut]:
    serialized: list[TagOut] = []
    for link in entry_tags:
        if link.tag:
            serialized.append(serialize_tag(link.tag))
    return serialized


def serialize_example(example: Example) -> ExampleOut:
    return ExampleOut.model_validate(example)


def serialize_entry_version(version: EntryVersion) -> EntryVersionOut:
    return EntryVersionOut.model_validate(version)


def serialize_entry_summary(entry: Entry) -> EntrySummaryOut:
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
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "tags": serialize_entry_tags(entry.tags),
    }
    return EntrySummaryOut.model_validate(payload)


def serialize_entry_detail(entry: Entry, *, examples: list[Example]) -> EntryDetailOut:
    payload = {
        **serialize_entry_summary(entry).model_dump(),
        "morphology_notes": entry.morphology_notes,
        "approved_at": entry.approved_at,
        "approved_by_user_id": entry.approved_by_user_id,
        "versions": [serialize_entry_version(version) for version in entry.versions],
        "examples": [serialize_example(example) for example in examples],
    }
    return EntryDetailOut.model_validate(payload)
