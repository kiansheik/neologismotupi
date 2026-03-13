from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.enums import EntryStatus, ExampleStatus, PARTS_OF_SPEECH, TagType
from app.core.deps import SessionDep
from app.models.entry import Tag
from app.schemas.entries import TagOut

router = APIRouter(tags=["meta"])


@router.get("/tags", response_model=list[TagOut])
async def list_tags(db: SessionDep, type_filter: TagType | None = Query(default=None, alias="type")):
    stmt = select(Tag).order_by(Tag.type.asc(), Tag.name.asc())
    if type_filter:
        stmt = stmt.where(Tag.type == type_filter)
    tags = (await db.execute(stmt)).scalars().all()
    return [TagOut.model_validate(tag) for tag in tags]


@router.get("/meta/parts-of-speech")
async def parts_of_speech() -> dict:
    return {"values": PARTS_OF_SPEECH}


@router.get("/meta/statuses")
async def statuses() -> dict:
    return {
        "entry_statuses": [status.value for status in EntryStatus],
        "example_statuses": [status.value for status in ExampleStatus],
    }
