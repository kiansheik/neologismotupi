# Entry Participation Gate

Votes are quality signals. They are never spent, consumed, or reduced when a user
submits an entry.

Entry submission uses a weighted participation score based on recent review actions
and page engagement. The score is computed over a rolling window (default: 4 days).

## Qualifying events

The following events contribute to the participation score:

| Event | Weight | Notes |
|---|---|---|
| Vote on another user's entry | 3.0 | Strongest signal |
| Vote on another user's example | 2.0 | Medium signal |
| Vote on a comment | 1.0 | Weakest vote signal |
| Page engagement — excellent (≥67% of new items voted) | +2.0 | Bonus per page visit |
| Page engagement — fair (33–67%) | +1.0 | Bonus per page visit |
| Page engagement — poor (<33%) | −0.5 | Small penalty per page visit |

Votes on a user's own content do not count. Repeated changes to the same vote target
do not count again, and deleting then re-voting the same target does not create
another participation action. One page engagement event is recorded per entry page
per UTC day.

## Scoring model

`participation_score = sum of weighted events in the rolling window`

The window defaults to 4 days. Score is floored at zero.

With the defaults, a user who votes on 2 entries in a 4-day window reaches a score of
6 (unlimited tier). Inactivity causes the score to drop as old events leave the window:
after 4 days with no activity the score falls to zero.

## Posting allowance

| Score threshold | Allowed posts per UTC day |
|---|---|
| < 3 | 0 (gate closed) |
| ≥ 3 | 1 |
| ≥ 5 | 2 |
| ≥ 6 | unlimited |

## Page engagement tracking

When a logged-in user visits an entry detail page, the client tracks which votable
items are new (not previously voted). On navigation away, the engagement rate
(weighted votes cast / weighted opportunities) is computed and bucketed:

- **excellent**: ≥ 67% of new items voted
- **fair**: 33–67%
- **poor**: < 33%

The tier is piggybacked onto the next outbound API request (entry fetch or
submit-gate poll) as `?prev_page_id=<uuid>&prev_page_tier=<tier>`, so no extra
network round trip is added.

For votes cast from entry cards (homepage, browse, example list), an engagement
event for the parent entry is reported immediately as "excellent" (the user engaged
with the one visible item).

## Configuration

All weights and thresholds are configurable via environment variables:

```
ENTRY_PARTICIPATION_GATE_ENABLED=true
ENTRY_PARTICIPATION_WINDOW_DAYS=4
ENTRY_PARTICIPATION_STEP1_ACTIONS=3
ENTRY_PARTICIPATION_STEP1_POSTS=1
ENTRY_PARTICIPATION_STEP2_ACTIONS=5
ENTRY_PARTICIPATION_STEP2_POSTS=2
ENTRY_PARTICIPATION_STEP3_ACTIONS=6
ENTRY_PARTICIPATION_STEP3_UNLIMITED=true

ENTRY_PARTICIPATION_ENTRY_VOTE_WEIGHT=3.0
ENTRY_PARTICIPATION_EXAMPLE_VOTE_WEIGHT=2.0
ENTRY_PARTICIPATION_COMMENT_VOTE_WEIGHT=1.0
ENTRY_PARTICIPATION_PAGE_EXCELLENT_WEIGHT=2.0
ENTRY_PARTICIPATION_PAGE_FAIR_WEIGHT=1.0
ENTRY_PARTICIPATION_PAGE_POOR_WEIGHT=-0.5
```

## Design notes

The participation score is rolling-window activity, not public reputation and
not a balance. It naturally decays as old events leave the configured window.
Public karma/reputation continues to be computed from vote scores and is separate
from the active participation score.

A user who has a very active day (voting on many entries and engaging deeply with
pages) can accumulate a score well above the unlimited threshold. That buffer carries
them for the full window length. After the window expires with no new activity, the
score returns to zero and the gate closes until they participate again.

Durable participation events start from rollout time. They are an audit of the
first qualifying review action per user and target per day, not a credit ledger.
