import argparse
import asyncio
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.enums import EntryStatus, ExampleStatus
from app.db import AsyncSessionLocal
from app.models.entry import Entry, Example
from app.models.newsletter import NewsletterDelivery, NewsletterIssue, NewsletterSubscription
from app.models.user import Profile, User
from app.services.email_delivery import send_email
from app.services.newsletters import (
    NEWSLETTER_WORD_OF_DAY,
    build_entry_url,
    build_home_url,
    build_submit_url,
    build_unsubscribe_url,
    build_word_of_day_email,
    generate_unsubscribe_token,
    normalize_locale,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send Word of the Day newsletter")
    parser.add_argument("--date", dest="issue_date", help="Issue date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="target_email", help="Send only to this email")
    parser.add_argument("--dry-run", action="store_true", help="Do not send emails")
    return parser.parse_args()


async def _get_or_create_issue(db, *, issue_date: date) -> NewsletterIssue:
    issue = (
        await db.execute(
            select(NewsletterIssue).where(
                NewsletterIssue.newsletter_key == NEWSLETTER_WORD_OF_DAY,
                NewsletterIssue.issue_date == issue_date,
            )
        )
    ).scalar_one_or_none()
    if issue:
        return issue

    entry = (
        await db.execute(
            select(Entry)
            .where(Entry.status == EntryStatus.approved)
            .order_by(func.random())
            .limit(1)
        )
    ).scalar_one_or_none()
    if entry is None:
        raise SystemExit("No approved entries available for Palavra do Dia.")

    issue = NewsletterIssue(
        newsletter_key=NEWSLETTER_WORD_OF_DAY,
        issue_date=issue_date,
        entry_id=entry.id,
    )
    db.add(issue)
    await db.flush()
    return issue


async def _get_example(db, *, entry_id) -> Example | None:
    return (
        await db.execute(
            select(Example)
            .where(Example.entry_id == entry_id, Example.status == ExampleStatus.approved)
            .order_by(Example.score_cache.desc(), Example.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _send_word_of_day(
    db, *, issue_date: date, dry_run: bool, target_email: str | None
) -> None:
    issue = await _get_or_create_issue(db, issue_date=issue_date)

    entry = (
        await db.execute(select(Entry).where(Entry.id == issue.entry_id))
    ).scalar_one()
    example = await _get_example(db, entry_id=entry.id)

    query = (
        select(NewsletterSubscription, User, Profile)
        .join(User, NewsletterSubscription.user_id == User.id)
        .join(Profile, Profile.user_id == User.id, isouter=True)
        .where(
            NewsletterSubscription.newsletter_key == NEWSLETTER_WORD_OF_DAY,
            NewsletterSubscription.is_active.is_(True),
        )
    )
    if target_email:
        query = query.where(User.email == target_email)
    subscriptions = (await db.execute(query)).all()
    if target_email and not subscriptions:
        raise SystemExit(f"No active Palavra do Dia subscription found for {target_email}.")

    for subscription, user, profile in subscriptions:
        if not user.is_active or not user.is_verified or not user.email:
            continue

        existing_delivery = (
            await db.execute(
                select(NewsletterDelivery).where(
                    NewsletterDelivery.issue_id == issue.id,
                    NewsletterDelivery.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if existing_delivery:
            continue

        if not subscription.unsubscribe_token:
            subscription.unsubscribe_token = generate_unsubscribe_token()

        locale = normalize_locale(subscription.preferred_locale or user.preferred_locale)
        entry_url = build_entry_url(entry.slug, content="entry")
        home_url = build_home_url(content="share")
        submit_url = build_submit_url(content="submit")
        unsubscribe_url = build_unsubscribe_url(subscription.unsubscribe_token)

        subject, text_body, html_body = build_word_of_day_email(
            locale=locale,
            headword=entry.headword,
            gloss_pt=entry.gloss_pt,
            gloss_en=entry.gloss_en,
            part_of_speech=entry.part_of_speech,
            short_definition=entry.short_definition,
            morphology_notes=entry.morphology_notes,
            example_sentence=example.sentence_original if example else None,
            example_translation=(
                example.translation_en if locale == "en-US" else example.translation_pt
            )
            if example
            else None,
            entry_url=entry_url,
            submit_url=submit_url,
            home_url=home_url,
            unsubscribe_url=unsubscribe_url,
            display_name=profile.display_name if profile else None,
        )

        if dry_run:
            print(f"[dry-run] {user.email} -> {subject}")
            continue

        status = "sent"
        error_message = None
        try:
            await send_email(
                to_email=user.email, subject=subject, body=text_body, html_body=html_body
            )
        except Exception as exc:  # noqa: BLE001
            status = "failed"
            error_message = str(exc)[:500]

        db.add(
            NewsletterDelivery(
                issue_id=issue.id,
                user_id=user.id,
                status=status,
                error_message=error_message,
            )
        )

    await db.commit()


async def main() -> None:
    args = _parse_args()
    issue_date = None
    if args.issue_date:
        issue_date = date.fromisoformat(args.issue_date)

    async with AsyncSessionLocal() as db:
        if issue_date:
            issue = await _get_or_create_issue(db, issue_date=issue_date)
            await db.commit()
            print(f"Issue ready for {issue.issue_date} (entry_id={issue.entry_id})")
            if args.dry_run:
                return
        if issue_date is None:
            issue_date = datetime.now(UTC).date()
        await _send_word_of_day(
            db,
            issue_date=issue_date,
            dry_run=args.dry_run,
            target_email=args.target_email,
        )


if __name__ == "__main__":
    asyncio.run(main())
