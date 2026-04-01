import uuid
import logging
import shutil
from datetime import UTC, datetime
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, union_all

from app.config import get_settings
from app.core.deps import SessionDep, require_moderator
from app.core.enums import EntryStatus, ExampleStatus, ReportStatus, ReportTargetType
from app.core.errors import raise_api_error
from app.models.entry import Entry, Example, ExampleVote, Vote
from app.models.moderation import Report
from app.models.user import Profile, User
from app.schemas.moderation import (
    HostDiskUsageOut,
    ModerationActionRequest,
    ModerationDashboardOut,
    ModerationEntryOut,
    ModerationExampleOut,
    ModerationQueueOut,
    PeriodCountOut,
    ReportOut,
    ReportReviewRequest,
)
from app.services.email_delivery import send_entry_moderation_email
from app.services.moderation import record_moderation_action

router = APIRouter(prefix="/mod", tags=["moderation"])
logger = logging.getLogger(__name__)


def _truncate_text(value: str, limit: int = 120) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: limit - 3].rstrip()}..."


def _clean_reason(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def _count_rows(db: SessionDep, stmt) -> int:
    return int((await db.execute(stmt)).scalar_one())


def _period_starts(now: datetime) -> tuple[datetime, datetime, datetime]:
    start_today = datetime(now.year, now.month, now.day, tzinfo=UTC)
    start_week = start_today - timedelta(days=start_today.weekday())
    start_month = datetime(now.year, now.month, 1, tzinfo=UTC)
    return start_today, start_week, start_month


@router.get("/dashboard", response_model=ModerationDashboardOut)
async def moderation_dashboard(
    db: SessionDep,
    _: Annotated[User, Depends(require_moderator)],
) -> ModerationDashboardOut:
    now = datetime.now(UTC)
    start_today, start_week, start_month = _period_starts(now)

    async def count_period(model, timestamp_column) -> PeriodCountOut:
        return PeriodCountOut(
            today=await _count_rows(
                db, select(func.count()).select_from(model).where(timestamp_column >= start_today)
            ),
            week=await _count_rows(
                db, select(func.count()).select_from(model).where(timestamp_column >= start_week)
            ),
            month=await _count_rows(
                db, select(func.count()).select_from(model).where(timestamp_column >= start_month)
            ),
        )

    async def count_active_contributors(since: datetime) -> int:
        contributors_subquery = union_all(
            select(Entry.proposer_user_id.label("user_id")).where(Entry.created_at >= since),
            select(Example.user_id.label("user_id")).where(Example.created_at >= since),
        ).subquery()
        return await _count_rows(
            db,
            select(func.count(func.distinct(contributors_subquery.c.user_id))),
        )

    async def count_votes(since: datetime) -> int:
        entry_votes = await _count_rows(
            db, select(func.count()).select_from(Vote).where(Vote.created_at >= since)
        )
        example_votes = await _count_rows(
            db, select(func.count()).select_from(ExampleVote).where(ExampleVote.created_at >= since)
        )
        return entry_votes + example_votes

    users_total = await _count_rows(db, select(func.count()).select_from(User))
    entries_total = await _count_rows(db, select(func.count()).select_from(Entry))
    examples_total = await _count_rows(db, select(func.count()).select_from(Example))
    pending_entries_total = await _count_rows(
        db, select(func.count()).select_from(Entry).where(Entry.status == EntryStatus.pending)
    )
    pending_examples_total = await _count_rows(
        db, select(func.count()).select_from(Example).where(Example.status == ExampleStatus.pending)
    )
    open_reports_total = await _count_rows(
        db, select(func.count()).select_from(Report).where(Report.status == ReportStatus.open)
    )

    new_users = await count_period(User, User.created_at)
    new_entries = await count_period(Entry, Entry.created_at)
    new_examples = await count_period(Example, Example.created_at)
    reports = await count_period(Report, Report.created_at)
    approved_entries = PeriodCountOut(
        today=await _count_rows(
            db, select(func.count()).select_from(Entry).where(Entry.approved_at >= start_today)
        ),
        week=await _count_rows(
            db, select(func.count()).select_from(Entry).where(Entry.approved_at >= start_week)
        ),
        month=await _count_rows(
            db, select(func.count()).select_from(Entry).where(Entry.approved_at >= start_month)
        ),
    )

    active_contributors = PeriodCountOut(
        today=await count_active_contributors(start_today),
        week=await count_active_contributors(start_week),
        month=await count_active_contributors(start_month),
    )
    votes = PeriodCountOut(
        today=await count_votes(start_today),
        week=await count_votes(start_week),
        month=await count_votes(start_month),
    )
    settings = get_settings()
    host_disk: HostDiskUsageOut | None = None
    try:
        disk = shutil.disk_usage(settings.host_disk_usage_path)
        used_percent = (disk.used / disk.total * 100.0) if disk.total else 0.0
        host_disk = HostDiskUsageOut(
            path=settings.host_disk_usage_path,
            total_bytes=disk.total,
            used_bytes=disk.used,
            free_bytes=disk.free,
            used_percent=round(used_percent, 1),
        )
    except OSError:
        logger.warning("Could not collect host disk usage for path=%s", settings.host_disk_usage_path)

    return ModerationDashboardOut(
        users_total=users_total,
        entries_total=entries_total,
        examples_total=examples_total,
        pending_entries_total=pending_entries_total,
        pending_examples_total=pending_examples_total,
        open_reports_total=open_reports_total,
        new_users=new_users,
        new_entries=new_entries,
        new_examples=new_examples,
        active_contributors=active_contributors,
        votes=votes,
        reports=reports,
        approved_entries=approved_entries,
        host_disk=host_disk,
    )


@router.get("/queue", response_model=ModerationQueueOut)
async def moderation_queue(
    db: SessionDep,
    _: Annotated[User, Depends(require_moderator)],
    limit: int = Query(default=50, ge=1, le=200),
) -> ModerationQueueOut:
    entries = (
        await db.execute(
            select(Entry).where(Entry.status == EntryStatus.pending).order_by(Entry.created_at.asc()).limit(limit)
        )
    ).scalars().all()

    examples = (
        await db.execute(
            select(Example, Entry.slug, Entry.headword)
            .join(Entry, Example.entry_id == Entry.id)
            .where(Example.status == ExampleStatus.pending)
            .order_by(Example.created_at.asc())
            .limit(limit)
        )
    ).all()

    return ModerationQueueOut(
        entries=[
            ModerationEntryOut(
                id=entry.id,
                slug=entry.slug,
                headword=entry.headword,
                status=entry.status,
                proposer_user_id=entry.proposer_user_id,
                created_at=entry.created_at,
            )
            for entry in entries
        ],
        examples=[
            ModerationExampleOut(
                id=example.id,
                entry_id=example.entry_id,
                entry_slug=entry_slug,
                entry_headword=entry_headword,
                user_id=example.user_id,
                sentence_original=example.sentence_original,
                status=example.status,
                created_at=example.created_at,
            )
            for example, entry_slug, entry_headword in examples
        ],
    )


@router.get("/reports", response_model=list[ReportOut])
async def list_reports(
    db: SessionDep,
    _: Annotated[User, Depends(require_moderator)],
    status_filter: ReportStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[ReportOut]:
    stmt = select(Report).order_by(Report.created_at.desc()).limit(limit)
    if status_filter:
        stmt = stmt.where(Report.status == status_filter)
    reports = (await db.execute(stmt)).scalars().all()
    reporter_ids = {report.reporter_user_id for report in reports}

    entry_ids = {
        report.target_id for report in reports if report.target_type == ReportTargetType.entry
    }
    example_ids = {
        report.target_id for report in reports if report.target_type == ReportTargetType.example
    }
    profile_ids = {
        report.target_id for report in reports if report.target_type == ReportTargetType.profile
    }

    reporter_profiles: dict[uuid.UUID, str] = {}
    if reporter_ids:
        reporter_rows = (
            await db.execute(
                select(User.id, Profile.display_name)
                .join(Profile, Profile.user_id == User.id)
                .where(User.id.in_(reporter_ids))
            )
        ).all()
        reporter_profiles = {
            reporter_user_id: display_name
            for reporter_user_id, display_name in reporter_rows
        }

    entry_targets: dict[uuid.UUID, tuple[str, str]] = {}
    if entry_ids:
        entry_rows = (
            await db.execute(select(Entry.id, Entry.slug, Entry.headword).where(Entry.id.in_(entry_ids)))
        ).all()
        entry_targets = {
            entry_id: (headword, f"/entries/{slug}") for entry_id, slug, headword in entry_rows
        }

    example_targets: dict[uuid.UUID, tuple[str, str]] = {}
    if example_ids:
        example_rows = (
            await db.execute(
                select(Example.id, Example.sentence_original, Entry.slug)
                .join(Entry, Example.entry_id == Entry.id)
                .where(Example.id.in_(example_ids))
            )
        ).all()
        example_targets = {
            example_id: (_truncate_text(sentence_original), f"/entries/{entry_slug}")
            for example_id, sentence_original, entry_slug in example_rows
        }

    profile_targets: dict[uuid.UUID, tuple[str, str]] = {}
    if profile_ids:
        user_rows = (
            await db.execute(
                select(User.id, Profile.display_name)
                .join(Profile, Profile.user_id == User.id)
                .where(User.id.in_(profile_ids))
            )
        ).all()
        for user_id, display_name in user_rows:
            profile_targets[user_id] = (display_name, f"/profiles/{user_id}")

        unresolved_profile_ids = [profile_id for profile_id in profile_ids if profile_id not in profile_targets]
        if unresolved_profile_ids:
            profile_rows = (
                await db.execute(
                    select(Profile.id, Profile.user_id, Profile.display_name).where(
                        Profile.id.in_(unresolved_profile_ids)
                    )
                )
            ).all()
            for profile_id, user_id, display_name in profile_rows:
                profile_targets[profile_id] = (display_name, f"/profiles/{user_id}")

    response: list[ReportOut] = []
    for report in reports:
        target_label: str | None = None
        target_url: str | None = None
        reporter_display_name = reporter_profiles.get(report.reporter_user_id)
        reporter_profile_url = f"/profiles/{report.reporter_user_id}"

        if report.target_type == ReportTargetType.entry:
            target = entry_targets.get(report.target_id)
        elif report.target_type == ReportTargetType.example:
            target = example_targets.get(report.target_id)
        else:
            target = profile_targets.get(report.target_id)
            if target is None:
                target = (f"user-{str(report.target_id)[:8]}", f"/profiles/{report.target_id}")

        if target:
            target_label, target_url = target

        response.append(
            ReportOut(
                id=report.id,
                reporter_user_id=report.reporter_user_id,
                reporter_display_name=reporter_display_name,
                reporter_profile_url=reporter_profile_url,
                target_type=report.target_type,
                target_id=report.target_id,
                target_label=target_label,
                target_url=target_url,
                reason_code=report.reason_code,
                free_text=report.free_text,
                status=report.status,
                created_at=report.created_at,
                reviewed_at=report.reviewed_at,
                reviewed_by_user_id=report.reviewed_by_user_id,
            )
        )

    return response


async def _set_entry_status(
    db: SessionDep,
    moderator: User,
    entry_id: uuid.UUID,
    new_status: EntryStatus,
    action: str,
    notes: str | None,
    reason: str | None,
) -> dict:
    entry = (await db.execute(select(Entry).where(Entry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise_api_error(status_code=404, code="entry_not_found", message="Entry not found")

    if new_status == EntryStatus.approved and entry.proposer_user_id == moderator.id:
        raise_api_error(
            status_code=403,
            code="self_approval_forbidden",
            message="You cannot approve your own entry",
        )

    cleaned_reason = _clean_reason(reason)
    if new_status == EntryStatus.rejected:
        if not cleaned_reason:
            raise_api_error(
                status_code=422,
                code="moderation_reason_required",
                message="Rejection reason is required",
            )

    entry.status = new_status
    if new_status == EntryStatus.approved:
        entry.approved_at = datetime.now(UTC)
        entry.approved_by_user_id = moderator.id
    else:
        entry.approved_at = None
        entry.approved_by_user_id = None

    await record_moderation_action(
        db,
        moderator_user_id=moderator.id,
        action_type=action,
        target_type="entry",
        target_id=entry.id,
        notes=notes,
        metadata_json={"reason": cleaned_reason, "status": new_status.value},
    )
    await db.commit()

    proposer = (await db.execute(select(User).where(User.id == entry.proposer_user_id))).scalar_one_or_none()
    should_notify_user = new_status in {EntryStatus.approved, EntryStatus.rejected}
    if proposer and should_notify_user:
        try:
            await send_entry_moderation_email(
                to_email=proposer.email,
                headword=entry.headword,
                slug=entry.slug,
                approved=new_status == EntryStatus.approved,
                reason=cleaned_reason or notes,
            )
        except Exception:
            logger.exception("Failed to send entry moderation email entry_id=%s", entry.id)

    return {"ok": True, "entry_id": str(entry.id), "status": entry.status.value}


@router.post("/entries/{entry_id}/approve")
async def approve_entry(
    entry_id: uuid.UUID,
    payload: ModerationActionRequest,
    db: SessionDep,
    moderator: Annotated[User, Depends(require_moderator)],
) -> dict:
    return await _set_entry_status(
        db,
        moderator,
        entry_id,
        EntryStatus.approved,
        "entry_approved",
        payload.notes,
        payload.reason,
    )


@router.post("/entries/{entry_id}/reject")
async def reject_entry(
    entry_id: uuid.UUID,
    payload: ModerationActionRequest,
    db: SessionDep,
    moderator: Annotated[User, Depends(require_moderator)],
) -> dict:
    return await _set_entry_status(
        db,
        moderator,
        entry_id,
        EntryStatus.rejected,
        "entry_rejected",
        payload.notes,
        payload.reason,
    )


@router.post("/entries/{entry_id}/dispute")
async def dispute_entry(
    entry_id: uuid.UUID,
    payload: ModerationActionRequest,
    db: SessionDep,
    moderator: Annotated[User, Depends(require_moderator)],
) -> dict:
    return await _set_entry_status(
        db,
        moderator,
        entry_id,
        EntryStatus.disputed,
        "entry_disputed",
        payload.notes,
        payload.reason,
    )


@router.post("/examples/{example_id}/approve")
async def approve_example(
    example_id: uuid.UUID,
    payload: ModerationActionRequest,
    db: SessionDep,
    moderator: Annotated[User, Depends(require_moderator)],
) -> dict:
    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    example.status = ExampleStatus.approved
    example.approved_at = datetime.now(UTC)
    example.approved_by_user_id = moderator.id

    await record_moderation_action(
        db,
        moderator_user_id=moderator.id,
        action_type="example_approved",
        target_type="example",
        target_id=example.id,
        notes=payload.notes,
        metadata_json={"reason": payload.reason, "status": example.status.value},
    )
    await db.commit()
    return {"ok": True, "example_id": str(example.id), "status": example.status.value}


@router.post("/examples/{example_id}/reject")
async def reject_example(
    example_id: uuid.UUID,
    payload: ModerationActionRequest,
    db: SessionDep,
    moderator: Annotated[User, Depends(require_moderator)],
) -> dict:
    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    example.status = ExampleStatus.rejected
    example.approved_at = None
    example.approved_by_user_id = None

    await record_moderation_action(
        db,
        moderator_user_id=moderator.id,
        action_type="example_rejected",
        target_type="example",
        target_id=example.id,
        notes=payload.notes,
        metadata_json={"reason": payload.reason, "status": example.status.value},
    )
    await db.commit()
    return {"ok": True, "example_id": str(example.id), "status": example.status.value}


@router.post("/examples/{example_id}/hide")
async def hide_example(
    example_id: uuid.UUID,
    payload: ModerationActionRequest,
    db: SessionDep,
    moderator: Annotated[User, Depends(require_moderator)],
) -> dict:
    example = (await db.execute(select(Example).where(Example.id == example_id))).scalar_one_or_none()
    if not example:
        raise_api_error(status_code=404, code="example_not_found", message="Example not found")

    example.status = ExampleStatus.hidden

    await record_moderation_action(
        db,
        moderator_user_id=moderator.id,
        action_type="example_hidden",
        target_type="example",
        target_id=example.id,
        notes=payload.notes,
        metadata_json={"reason": payload.reason, "status": example.status.value},
    )
    await db.commit()
    return {"ok": True, "example_id": str(example.id), "status": example.status.value}


@router.post("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: uuid.UUID,
    payload: ReportReviewRequest,
    db: SessionDep,
    moderator: Annotated[User, Depends(require_moderator)],
) -> dict:
    report = (await db.execute(select(Report).where(Report.id == report_id))).scalar_one_or_none()
    if not report:
        raise_api_error(status_code=404, code="report_not_found", message="Report not found")

    report.status = payload.status
    report.reviewed_at = datetime.now(UTC)
    report.reviewed_by_user_id = moderator.id

    await record_moderation_action(
        db,
        moderator_user_id=moderator.id,
        action_type="report_reviewed",
        target_type="report",
        target_id=report.id,
        notes=payload.notes,
        metadata_json={"status": payload.status.value},
    )
    await db.commit()

    return {"ok": True, "report_id": str(report.id), "status": report.status.value}
