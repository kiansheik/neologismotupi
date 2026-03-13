import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.enums import EntryStatus, TagType
from app.core.utils import normalize_text, slugify
from app.db import AsyncSessionLocal
from app.models.entry import Entry, EntryTag, Tag
from app.models.user import Profile, User
from app.security import hash_password
from app.services.entries import create_entry_version

FAKE_USERS = [
    {
        "email": "admin@example.com",
        "password": "dev-admin-password",
        "display_name": "Dev Moderator",
        "is_superuser": True,
    },
    {
        "email": "member@example.com",
        "password": "dev-member-password",
        "display_name": "Dev Member",
        "is_superuser": False,
    },
]

FAKE_TAGS = [
    {"name": "Educação", "type": TagType.domain, "slug": "educacao"},
    {"name": "Tecnologia", "type": TagType.domain, "slug": "tecnologia"},
    {"name": "Aldeia-X", "type": TagType.region, "slug": "aldeia-x"},
]

FAKE_ENTRIES = [
    {
        "headword": "arandu-tek",
        "gloss_pt": "exemplo fictício para laboratório",
        "gloss_en": "fake laboratory sample",
        "part_of_speech": "noun",
        "short_definition": "Placeholder only. Not authoritative Tupi lexical content.",
        "morphology_notes": "Created for local development testing.",
    },
    {
        "headword": "mboe-simulado",
        "gloss_pt": "termo inventado para ambiente de teste",
        "gloss_en": "invented term for test environment",
        "part_of_speech": "verb",
        "short_definition": "Another intentionally fake entry for seed data.",
        "morphology_notes": "Do not treat as linguistic reference.",
    },
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        for user_data in FAKE_USERS:
            user = (await db.execute(select(User).where(User.email == user_data["email"]))).scalar_one_or_none()
            if user is None:
                user = User(
                    email=user_data["email"],
                    hashed_password=hash_password(user_data["password"]),
                    is_active=True,
                    is_verified=True,
                    is_superuser=user_data["is_superuser"],
                )
                db.add(user)
                await db.flush()
                db.add(Profile(user_id=user.id, display_name=user_data["display_name"]))

        await db.flush()

        tags_by_slug: dict[str, Tag] = {}
        for tag_data in FAKE_TAGS:
            tag = (
                await db.execute(
                    select(Tag).where(Tag.type == tag_data["type"], Tag.slug == tag_data["slug"])
                )
            ).scalar_one_or_none()
            if tag is None:
                tag = Tag(name=tag_data["name"], type=tag_data["type"], slug=tag_data["slug"])
                db.add(tag)
                await db.flush()
            tags_by_slug[tag.slug] = tag

        proposer = (await db.execute(select(User).where(User.email == "member@example.com"))).scalar_one()

        for index, entry_data in enumerate(FAKE_ENTRIES, start=1):
            slug = slugify(entry_data["headword"])
            existing = (await db.execute(select(Entry).where(Entry.slug == slug))).scalar_one_or_none()
            if existing:
                continue

            entry = Entry(
                slug=slug,
                headword=entry_data["headword"],
                normalized_headword=normalize_text(entry_data["headword"]),
                gloss_pt=entry_data["gloss_pt"],
                gloss_en=entry_data["gloss_en"],
                part_of_speech=entry_data["part_of_speech"],
                short_definition=entry_data["short_definition"],
                morphology_notes=entry_data["morphology_notes"],
                status=EntryStatus.approved,
                proposer_user_id=proposer.id,
                approved_at=datetime.now(UTC),
            )
            db.add(entry)
            await db.flush()

            if index == 1 and "educacao" in tags_by_slug:
                db.add(EntryTag(entry_id=entry.id, tag_id=tags_by_slug["educacao"].id))
            if index == 2 and "tecnologia" in tags_by_slug:
                db.add(EntryTag(entry_id=entry.id, tag_id=tags_by_slug["tecnologia"].id))

            await create_entry_version(
                db,
                entry=entry,
                edited_by_user_id=proposer.id,
                edit_summary="Seed initial version",
            )

        await db.commit()

    print("Seed complete with fake development content.")


if __name__ == "__main__":
    asyncio.run(seed())
