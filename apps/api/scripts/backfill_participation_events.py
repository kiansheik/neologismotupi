"""Backfill review_participation_events from existing entry_votes and example_votes.

Usage:
    cd apps/api
    uv run python scripts/backfill_participation_events.py [--window-days 7] [--apply]

Without --apply the script runs in dry-run mode and prints what it would insert.
Self-votes (voter == content author) are excluded, matching live recording behaviour.
Page engagement events are never backfilled.
"""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select

from app.db import AsyncSessionLocal
from app.models.entry import Entry, Example, ExampleVote, Vote
from app.services.participation import (
    ENTRY_VOTE_ACTION,
    EXAMPLE_VOTE_ACTION,
    record_review_participation_event,
)


async def backfill(*, window_days: int, apply_changes: bool) -> None:
    window_end = datetime.now(UTC)
    window_start = window_end - timedelta(days=max(1, window_days))

    async with AsyncSessionLocal() as db:
        # --- entry votes ---
        entry_vote_rows = (
            await db.execute(
                select(Vote, Entry.proposer_user_id)
                .join(Entry, Vote.entry_id == Entry.id)
                .where(
                    and_(
                        Vote.created_at >= window_start,
                        Vote.created_at <= window_end,
                        Vote.user_id != Entry.proposer_user_id,
                    )
                )
                .order_by(Vote.created_at.asc())
            )
        ).all()

        # --- example votes ---
        example_vote_rows = (
            await db.execute(
                select(ExampleVote, Example.user_id.label("author_id"), Example.entry_id)
                .join(Example, ExampleVote.example_id == Example.id)
                .where(
                    and_(
                        ExampleVote.created_at >= window_start,
                        ExampleVote.created_at <= window_end,
                        ExampleVote.user_id != Example.user_id,
                    )
                )
                .order_by(ExampleVote.created_at.asc())
            )
        ).all()

        print(
            f"Window: {window_start.date().isoformat()} → {window_end.date().isoformat()} "
            f"({window_days} days)"
            + (" [dry-run]" if not apply_changes else "")
        )
        print(f"Entry votes found (non-self): {len(entry_vote_rows)}")
        print(f"Example votes found (non-self): {len(example_vote_rows)}")

        inserted = 0
        skipped = 0

        for vote, _proposer_id in entry_vote_rows:
            if apply_changes:
                event = await record_review_participation_event(
                    db,
                    user_id=vote.user_id,
                    action_type=ENTRY_VOTE_ACTION,
                    target_type="entry",
                    target_id=vote.entry_id,
                    occurred_at=vote.created_at,
                )
                if event is not None:
                    inserted += 1
                else:
                    skipped += 1
            else:
                inserted += 1

        for ev, _author_id, _entry_id in example_vote_rows:
            if apply_changes:
                event = await record_review_participation_event(
                    db,
                    user_id=ev.user_id,
                    action_type=EXAMPLE_VOTE_ACTION,
                    target_type="example",
                    target_id=ev.example_id,
                    occurred_at=ev.created_at,
                )
                if event is not None:
                    inserted += 1
                else:
                    skipped += 1
            else:
                inserted += 1

        if apply_changes:
            await db.commit()

        label = "would insert" if not apply_changes else "inserted"
        print(f"Summary: {label}={inserted}, already_existed={skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill review_participation_events from existing entry_votes and example_votes. "
            "Page engagement is never backfilled. Comments and audio votes are never backfilled. "
            "Self-votes are excluded."
        )
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=7,
        help="How many days back to scan for votes (default: 7).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes. Without this flag, runs in dry-run mode.",
    )
    args = parser.parse_args()
    asyncio.run(backfill(window_days=args.window_days, apply_changes=args.apply))


if __name__ == "__main__":
    main()
