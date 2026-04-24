# Entry Participation Gate

Votes are quality signals. They are never spent, consumed, or reduced when a user
submits an entry.

Entry submission is gated on a participation score derived from recent review actions
(votes on other users' content) over a rolling window (default: 7 days).

## Qualifying events

| Event | Weight | Notes |
|---|---|---|
| Vote on another user's entry | 1.0 | |
| Vote on another user's example | 1.0 | |

Votes on a user's own content do not count. Repeated changes to the same vote target
do not create an additional participation event (deduplicated by `source_key`).
Deleting then re-voting the same target does not produce a second event.

**Page engagement** events (poor / fair / excellent) are recorded for analytics but
carry **zero weight** by default and do not affect the gate score or posting allowance.
All page engagement weights are configurable and can be enabled later once validated.

## Scoring model

```
participation_score = sum(weight × event) for each qualifying event in the window
```

With default weights (1.0 / 1.0), `participation_score == review_actions` (the raw
count of qualifying events). The score is floored at zero.

The window defaults to 7 days. Inactivity causes the score to fall as old events
leave the window.

## Posting allowance

| Score threshold | Allowed posts per UTC day |
|---|---|
| ≥ 0 (all verified users) | 1 |
| ≥ 3 | 2 |
| ≥ 12 | 20 (daily cap) |

Every authenticated, verified user can post at least 1 entry per day without any
review activity. The gate is an accountability system, not a barrier to entry.

## API response fields

`GET /api/entries/submit-gate` returns both:

- `participation_score` — the canonical weighted float score
- `review_actions` — the integer count of distinct qualifying review events in the window
- `next_score_required` / `score_required_for_unlimited` — canonical score thresholds
- `next_review_actions_required` / `actions_required_for_unlimited` — whole-action
  hints, present only when enabled action weights are all `1.0` and page engagement
  weights are `0.0`

When all enabled action-type weights are 1.0 (the default), these are equal.
If weights become fractional or page engagement starts affecting score, UI should
describe thresholds as participation points, not review-action counts.

## Page engagement tracking

When a logged-in user visits an entry detail page, the client tracks which votable
items are new (not previously voted). On navigation away, the engagement rate
(votes cast / opportunities) is bucketed into a tier. Entry-card votes report the
tier through `POST /api/entries/{entry_id}/engagement?tier={tier}`. Detail-page
navigation can also piggyback the previous page id and tier onto the next
`GET /api/entries/{slug}` or `GET /api/entries/submit-gate` request.

Tiers:
- **excellent**: ≥ 67% of available items voted
- **fair**: 33–67%
- **poor**: < 33%

Page engagement events are stored in `review_participation_events` for analytics.
They do not contribute to the gate score unless the page engagement weights are
explicitly set to non-zero values via env vars.

## Configuration

All weights and thresholds are configurable via environment variables:

```
ENTRY_PARTICIPATION_GATE_ENABLED=true
ENTRY_PARTICIPATION_WINDOW_DAYS=7

ENTRY_PARTICIPATION_COUNT_ENTRY_VOTES=true
ENTRY_PARTICIPATION_COUNT_EXAMPLE_VOTES=true
ENTRY_PARTICIPATION_COUNT_AUDIO_VOTES=false
ENTRY_PARTICIPATION_COUNT_COMMENT_VOTES=false
ENTRY_PARTICIPATION_COUNT_COMMENTS=false

ENTRY_PARTICIPATION_ENTRY_VOTE_WEIGHT=1.0
ENTRY_PARTICIPATION_EXAMPLE_VOTE_WEIGHT=1.0
ENTRY_PARTICIPATION_COMMENT_VOTE_WEIGHT=0.0

# Page engagement weights — zero by default (analytics-only)
ENTRY_PARTICIPATION_PAGE_EXCELLENT_WEIGHT=0.0
ENTRY_PARTICIPATION_PAGE_FAIR_WEIGHT=0.0
ENTRY_PARTICIPATION_PAGE_POOR_WEIGHT=0.0

ENTRY_PARTICIPATION_STEP1_ACTIONS=0
ENTRY_PARTICIPATION_STEP1_POSTS=1
ENTRY_PARTICIPATION_STEP2_ACTIONS=3
ENTRY_PARTICIPATION_STEP2_POSTS=2
ENTRY_PARTICIPATION_STEP3_ACTIONS=12
ENTRY_PARTICIPATION_STEP3_UNLIMITED=false
ENTRY_PARTICIPATION_UNLIMITED_DAILY_CAP=20
```

## Backfill

To backfill participation events from existing votes (e.g., after changing the window
or enabling a new action type):

```bash
cd apps/api

# Dry-run: shows what would be inserted
uv run python scripts/backfill_participation_events.py --window-days 7

# Apply: inserts records, preserving original vote timestamps
uv run python scripts/backfill_participation_events.py --window-days 7 --apply
```

The script only backfills entry votes and example votes. Page engagement, comments,
comment votes, and audio votes are never backfilled. Self-votes are excluded.
Existing events are skipped (idempotent via `source_key` uniqueness).

## Design notes

The participation score is rolling-window activity — not public reputation and not a
balance. It naturally decays as old events age out of the configured window.

`entry_vote_cost` / `entry_vote_daily_step*` keys visible in `config.py` are
**legacy** from a previous vote-cost gate system. They are not used by the active
participation gate. The active gate uses only `entry_participation_*` keys.
