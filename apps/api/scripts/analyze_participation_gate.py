#!/usr/bin/env python3
"""Calibrate the Dicionário de Tupi participation gate from existing data.

This script is intentionally read-only. It connects to the existing database, pulls
main-branch interaction tables, derives user/day behavior, simulates multiple
candidate participation formulas, and writes CSV + Markdown outputs.

Run from repo root:

    cd apps/api
    uv run --with pandas python scripts/analyze_participation_gate.py

Or with an explicit DB URL:

    cd apps/api
    DATABASE_URL='postgresql+asyncpg://...' \
      uv run --with pandas python scripts/analyze_participation_gate.py

The script uses asyncpg from the API dependencies and pandas supplied via
`uv run --with pandas`. It does not require the new participation-event schema to
exist; it estimates from the old/current tables.
"""

from __future__ import annotations

import argparse
import asyncio
import math
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

try:
    import asyncpg
except ImportError as exc:  # pragma: no cover - user-facing bootstrap help
    raise SystemExit(
        "Missing asyncpg. Run from apps/api with: "
        "uv run --with pandas python scripts/analyze_participation_gate.py"
    ) from exc

try:
    import pandas as pd
except ImportError as exc:  # pragma: no cover - user-facing bootstrap help
    raise SystemExit(
        "Missing pandas. Run from apps/api with: "
        "uv run --with pandas python scripts/analyze_participation_gate.py"
    ) from exc


ROOT = Path(__file__).resolve().parents[3]
API_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "analysis" / "participation_gate"


@dataclass(frozen=True)
class Formula:
    name: str
    window_days: int
    weights: dict[str, float]
    step1_score: float
    step1_posts: int
    step2_score: float
    step2_posts: int
    step3_score: float
    unlimited: bool = True
    unlimited_daily_cap: int | None = None
    description: str = ""


FORMULAS: list[Formula] = [
    Formula(
        name="A_simple_7d_entry_example_1x_threshold_0_3_6",
        window_days=7,
        weights={"entry_vote": 1.0, "example_vote": 1.0},
        step1_score=0.0,
        step1_posts=1,
        step2_score=3.0,
        step2_posts=2,
        step3_score=6.0,
        description="Simple humane default: votes are actions, not money; everyone gets 1/day.",
    ),
    Formula(
        name="B_weighted_7d_entry_1_example_075_comment_1_threshold_0_3_6",
        window_days=7,
        weights={"entry_vote": 1.0, "example_vote": 0.75, "entry_comment": 1.0},
        step1_score=0.0,
        step1_posts=1,
        step2_score=3.0,
        step2_posts=2,
        step3_score=6.0,
        description="Adds constructive comments, but keeps votes modestly weighted.",
    ),
    Formula(
        name="C_pr17_current_4d_weighted_threshold_3_5_6",
        window_days=4,
        weights={
            "entry_vote": 3.0,
            "example_vote": 2.0,
            "comment_vote": 1.0,
            "audio_vote": 1.0,
            "entry_comment": 1.0,
        },
        step1_score=3.0,
        step1_posts=1,
        step2_score=5.0,
        step2_posts=2,
        step3_score=6.0,
        description="Mirrors PR #17 defaults; useful to test whether it is too permissive.",
    ),
    Formula(
        name="D_pr17_scaled_4d_weighted_threshold_0_9_18",
        window_days=4,
        weights={
            "entry_vote": 3.0,
            "example_vote": 2.0,
            "comment_vote": 1.0,
            "audio_vote": 1.0,
            "entry_comment": 1.0,
        },
        step1_score=0.0,
        step1_posts=1,
        step2_score=9.0,
        step2_posts=2,
        step3_score=18.0,
        description="Same weights as PR #17 but preserves old 3/6-entry-vote intuition.",
    ),
    Formula(
        name="E_pr17_scaled_7d_weighted_threshold_0_9_18",
        window_days=7,
        weights={
            "entry_vote": 3.0,
            "example_vote": 2.0,
            "comment_vote": 1.0,
            "audio_vote": 1.0,
            "entry_comment": 1.0,
        },
        step1_score=0.0,
        step1_posts=1,
        step2_score=9.0,
        step2_posts=2,
        step3_score=18.0,
        description="Weighted version with a more humane weekly window.",
    ),
    Formula(
        name="F_entry_only_7d_threshold_0_3_6",
        window_days=7,
        weights={"entry_vote": 1.0},
        step1_score=0.0,
        step1_posts=1,
        step2_score=3.0,
        step2_posts=2,
        step3_score=6.0,
        description="Strictest clean baseline: only entry review counts toward posting trust.",
    ),
]


# ---------------------------------------------------------------------------
# Environment + DB helpers
# ---------------------------------------------------------------------------


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def load_repo_env() -> None:
    # Shell env wins; then root .env; then apps/api/.env for local dev convenience.
    load_env_file(ROOT / ".env")
    load_env_file(API_DIR / ".env")


def normalize_db_url(url: str) -> str:
    return (
        url.strip()
        .replace("postgresql+asyncpg://", "postgresql://", 1)
        .replace("postgres+asyncpg://", "postgresql://", 1)
    )


def parse_as_of(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    cleaned = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(cleaned)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


async def table_exists(conn: asyncpg.Connection, table_name: str) -> bool:
    return bool(await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", table_name))


async def fetch_df(conn: asyncpg.Connection, sql: str, *args: Any) -> pd.DataFrame:
    rows = await conn.fetch(sql, *args)
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame([dict(row) for row in rows])


async def fetch_optional_df(
    conn: asyncpg.Connection,
    table_name: str,
    sql: str,
    *args: Any,
) -> pd.DataFrame:
    if not await table_exists(conn, table_name):
        return pd.DataFrame()
    return await fetch_df(conn, sql, *args)


def ensure_datetime(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    if df.empty:
        return df
    for col in columns:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")
    return df


def utc_day(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, utc=True, errors="coerce").dt.date


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


async def load_data(conn: asyncpg.Connection) -> dict[str, pd.DataFrame]:
    data: dict[str, pd.DataFrame] = {}

    data["users"] = await fetch_optional_df(
        conn,
        "users",
        """
        SELECT
            u.id::text AS user_id,
            u.created_at,
            u.updated_at,
            u.is_active,
            u.is_verified,
            u.is_superuser,
            COALESCE(p.display_name, split_part(u.email, '@', 1), left(u.id::text, 8))
                AS display_name,
            COALESCE(p.reputation_score, 0) AS reputation_score
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        """,
    )

    data["sessions"] = await fetch_optional_df(
        conn,
        "sessions",
        """
        SELECT user_id::text, created_at, last_seen_at, expires_at
        FROM sessions
        """,
    )

    data["entries"] = await fetch_optional_df(
        conn,
        "entries",
        """
        SELECT
            id::text AS entry_id,
            proposer_user_id::text AS user_id,
            created_at,
            updated_at,
            status::text AS status,
            COALESCE(score_cache, 0) AS score_cache,
            COALESCE(upvote_count_cache, 0) AS upvote_count_cache,
            COALESCE(downvote_count_cache, 0) AS downvote_count_cache,
            COALESCE(example_count_cache, 0) AS example_count_cache
        FROM entries
        """,
    )

    data["entry_votes"] = await fetch_optional_df(
        conn,
        "votes",
        """
        SELECT
            v.id::text AS vote_id,
            v.user_id::text AS user_id,
            v.entry_id::text AS target_id,
            v.value,
            v.created_at,
            v.updated_at,
            e.proposer_user_id::text AS target_owner_id,
            e.status::text AS target_status,
            e.created_at AS target_created_at
        FROM votes v
        JOIN entries e ON e.id = v.entry_id
        """,
    )

    data["examples"] = await fetch_optional_df(
        conn,
        "examples",
        """
        SELECT
            id::text AS example_id,
            entry_id::text AS entry_id,
            user_id::text AS user_id,
            created_at,
            updated_at,
            status::text AS status,
            COALESCE(score_cache, 0) AS score_cache,
            COALESCE(upvote_count_cache, 0) AS upvote_count_cache,
            COALESCE(downvote_count_cache, 0) AS downvote_count_cache
        FROM examples
        """,
    )

    data["example_votes"] = await fetch_optional_df(
        conn,
        "example_votes",
        """
        SELECT
            ev.id::text AS vote_id,
            ev.user_id::text AS user_id,
            ev.example_id::text AS target_id,
            ev.value,
            ev.created_at,
            ev.updated_at,
            ex.user_id::text AS target_owner_id,
            ex.status::text AS target_status,
            ex.created_at AS target_created_at
        FROM example_votes ev
        JOIN examples ex ON ex.id = ev.example_id
        """,
    )

    data["comments"] = await fetch_optional_df(
        conn,
        "entry_comments",
        """
        SELECT
            c.id::text AS comment_id,
            c.entry_id::text AS entry_id,
            c.user_id::text AS user_id,
            c.parent_comment_id::text AS parent_comment_id,
            c.created_at,
            c.updated_at,
            c.edited_at,
            COALESCE(c.score_cache, 0) AS score_cache,
            COALESCE(c.upvote_count_cache, 0) AS upvote_count_cache,
            COALESCE(c.downvote_count_cache, 0) AS downvote_count_cache,
            length(trim(c.body)) AS body_len,
            e.proposer_user_id::text AS entry_owner_id
        FROM entry_comments c
        JOIN entries e ON e.id = c.entry_id
        """,
    )

    data["comment_votes"] = await fetch_optional_df(
        conn,
        "comment_votes",
        """
        SELECT
            cv.id::text AS vote_id,
            cv.user_id::text AS user_id,
            cv.comment_id::text AS target_id,
            cv.value,
            cv.created_at,
            cv.updated_at,
            c.user_id::text AS target_owner_id,
            c.entry_id::text AS entry_id
        FROM comment_votes cv
        JOIN entry_comments c ON c.id = cv.comment_id
        """,
    )

    data["audio_samples"] = await fetch_optional_df(
        conn,
        "audio_samples",
        """
        SELECT
            id::text AS audio_id,
            entry_id::text AS entry_id,
            example_id::text AS example_id,
            user_id::text AS user_id,
            created_at,
            updated_at,
            COALESCE(score_cache, 0) AS score_cache,
            COALESCE(upvote_count_cache, 0) AS upvote_count_cache,
            COALESCE(downvote_count_cache, 0) AS downvote_count_cache
        FROM audio_samples
        """,
    )

    data["audio_votes"] = await fetch_optional_df(
        conn,
        "audio_votes",
        """
        SELECT
            av.id::text AS vote_id,
            av.user_id::text AS user_id,
            av.audio_id::text AS target_id,
            av.value,
            av.created_at,
            av.updated_at,
            a.user_id::text AS target_owner_id,
            a.entry_id::text AS entry_id,
            a.example_id::text AS example_id
        FROM audio_votes av
        JOIN audio_samples a ON a.id = av.audio_id
        """,
    )

    data["reports"] = await fetch_optional_df(
        conn,
        "reports",
        """
        SELECT
            id::text AS report_id,
            reporter_user_id::text AS user_id,
            target_type::text AS target_type,
            target_id::text AS target_id,
            reason_code::text AS reason_code,
            status::text AS status,
            created_at,
            reviewed_at
        FROM reports
        """,
    )

    data["moderation_actions"] = await fetch_optional_df(
        conn,
        "moderation_actions",
        """
        SELECT
            id::text AS moderation_action_id,
            moderator_user_id::text AS user_id,
            target_type::text AS target_type,
            target_id::text AS target_id,
            action_type::text AS action_type,
            created_at
        FROM moderation_actions
        """,
    )

    for key, df in data.items():
        data[key] = ensure_datetime(
            df,
            ["created_at", "updated_at", "last_seen_at", "expires_at", "reviewed_at", "edited_at"],
        )
    return data


# ---------------------------------------------------------------------------
# Derivation helpers
# ---------------------------------------------------------------------------


def event_frame(
    df: pd.DataFrame,
    *,
    action_type: str,
    target_type: str,
    target_id_col: str,
    owner_col: str | None = None,
    entry_id_col: str | None = None,
    value_col: str | None = None,
) -> pd.DataFrame:
    if df.empty or "created_at" not in df.columns:
        return pd.DataFrame()
    out = pd.DataFrame(
        {
            "user_id": df["user_id"].astype(str),
            "action_type": action_type,
            "target_type": target_type,
            "target_id": df[target_id_col].astype(str),
            "created_at": df["created_at"],
        }
    )
    if owner_col and owner_col in df.columns:
        out["target_owner_id"] = df[owner_col].astype(str)
    else:
        out["target_owner_id"] = None
    if entry_id_col and entry_id_col in df.columns:
        out["entry_id"] = df[entry_id_col].astype(str)
    else:
        out["entry_id"] = None
    if value_col and value_col in df.columns:
        out["value"] = pd.to_numeric(df[value_col], errors="coerce")
    else:
        out["value"] = pd.NA
    out["is_self_action"] = out["user_id"] == out["target_owner_id"]
    out["day"] = utc_day(out["created_at"])
    return out


def build_activity_events(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []

    frames.append(
        event_frame(
            data.get("entry_votes", pd.DataFrame()),
            action_type="entry_vote",
            target_type="entry",
            target_id_col="target_id",
            owner_col="target_owner_id",
            value_col="value",
        )
    )
    frames.append(
        event_frame(
            data.get("example_votes", pd.DataFrame()),
            action_type="example_vote",
            target_type="example",
            target_id_col="target_id",
            owner_col="target_owner_id",
            value_col="value",
        )
    )
    frames.append(
        event_frame(
            data.get("comment_votes", pd.DataFrame()),
            action_type="comment_vote",
            target_type="comment",
            target_id_col="target_id",
            owner_col="target_owner_id",
            entry_id_col="entry_id",
            value_col="value",
        )
    )
    frames.append(
        event_frame(
            data.get("audio_votes", pd.DataFrame()),
            action_type="audio_vote",
            target_type="audio",
            target_id_col="target_id",
            owner_col="target_owner_id",
            entry_id_col="entry_id",
            value_col="value",
        )
    )

    entries = data.get("entries", pd.DataFrame())
    if not entries.empty:
        entry_submit = pd.DataFrame(
            {
                "user_id": entries["user_id"].astype(str),
                "action_type": "entry_submit",
                "target_type": "entry",
                "target_id": entries["entry_id"].astype(str),
                "target_owner_id": entries["user_id"].astype(str),
                "entry_id": entries["entry_id"].astype(str),
                "created_at": entries["created_at"],
                "value": pd.NA,
                "is_self_action": True,
            }
        )
        entry_submit["day"] = utc_day(entry_submit["created_at"])
        frames.append(entry_submit)

    examples = data.get("examples", pd.DataFrame())
    if not examples.empty:
        example_submit = pd.DataFrame(
            {
                "user_id": examples["user_id"].astype(str),
                "action_type": "example_submit",
                "target_type": "example",
                "target_id": examples["example_id"].astype(str),
                "target_owner_id": examples["user_id"].astype(str),
                "entry_id": examples["entry_id"].astype(str),
                "created_at": examples["created_at"],
                "value": pd.NA,
                "is_self_action": True,
            }
        )
        example_submit["day"] = utc_day(example_submit["created_at"])
        frames.append(example_submit)

    comments = data.get("comments", pd.DataFrame())
    if not comments.empty:
        comment_submit = pd.DataFrame(
            {
                "user_id": comments["user_id"].astype(str),
                "action_type": "entry_comment",
                "target_type": "comment",
                "target_id": comments["comment_id"].astype(str),
                "target_owner_id": comments["entry_owner_id"].astype(str),
                "entry_id": comments["entry_id"].astype(str),
                "created_at": comments["created_at"],
                "value": pd.NA,
                "is_self_action": comments["user_id"].astype(str)
                == comments["entry_owner_id"].astype(str),
            }
        )
        comment_submit["day"] = utc_day(comment_submit["created_at"])
        frames.append(comment_submit)

    events = pd.concat([frame for frame in frames if not frame.empty], ignore_index=True)
    if events.empty:
        return events
    events = events.dropna(subset=["created_at", "user_id"])
    events["created_at"] = pd.to_datetime(events["created_at"], utc=True)
    events["participation_key"] = events.apply(make_participation_key, axis=1)
    return events.sort_values("created_at").reset_index(drop=True)


def make_participation_key(row: pd.Series) -> str:
    action = row["action_type"]
    if action == "entry_comment":
        entry_id = row.get("entry_id") or row.get("target_id")
        return f"entry_comment:{entry_id}:{row.get('day')}"
    return f"{action}:{row['target_id']}"


def gate_for_score(formula: Formula, score: float, entries_today: int) -> dict[str, Any]:
    score = max(0.0, float(score))
    entries_today = max(0, int(entries_today))

    if score >= formula.step3_score:
        if formula.unlimited and formula.unlimited_daily_cap is None:
            allowed_posts = math.inf
            remaining_posts = math.inf
            unlimited = True
        else:
            allowed_posts = formula.unlimited_daily_cap or formula.step2_posts
            remaining_posts = max(0, int(allowed_posts) - entries_today)
            unlimited = False
        next_required = 0.0
    elif score >= formula.step2_score:
        allowed_posts = formula.step2_posts
        remaining_posts = max(0, allowed_posts - entries_today)
        unlimited = False
        next_required = max(0.0, formula.step3_score - score)
    elif score >= formula.step1_score:
        allowed_posts = formula.step1_posts
        remaining_posts = max(0, allowed_posts - entries_today)
        unlimited = False
        next_required = max(0.0, formula.step2_score - score)
    else:
        allowed_posts = 0
        remaining_posts = 0
        unlimited = False
        next_required = max(0.0, formula.step1_score - score)

    return {
        "allowed_posts": None if allowed_posts is math.inf else allowed_posts,
        "remaining_posts": None if remaining_posts is math.inf else remaining_posts,
        "unlimited": unlimited,
        "next_score_required": next_required,
        "would_allow_next_entry": bool(unlimited or remaining_posts > 0),
    }


def score_events_for_formula(
    events: pd.DataFrame,
    formula: Formula,
    as_of: datetime,
) -> pd.DataFrame:
    if events.empty:
        return pd.DataFrame(columns=["user_id", "score"])
    window_start = as_of - timedelta(days=formula.window_days)
    eligible = events[
        (events["created_at"] >= window_start)
        & (events["created_at"] <= as_of)
        & (~events["is_self_action"].fillna(False))
        & (events["action_type"].isin(formula.weights))
    ].copy()
    if eligible.empty:
        return pd.DataFrame(columns=["user_id", "score"])

    # Match the durable-event semantics: one event per user/source_key.
    eligible = eligible.drop_duplicates(["user_id", "participation_key"], keep="first")
    eligible["weight"] = eligible["action_type"].map(formula.weights).fillna(0.0)
    scored = eligible.groupby("user_id", as_index=False)["weight"].sum()
    return scored.rename(columns={"weight": "score"})


# ---------------------------------------------------------------------------
# Analyses
# ---------------------------------------------------------------------------


def build_user_day_activity(events: pd.DataFrame) -> pd.DataFrame:
    if events.empty:
        return pd.DataFrame()
    df = events.copy()
    df["review_action"] = (
        df["action_type"].isin(["entry_vote", "example_vote", "comment_vote", "audio_vote", "entry_comment"])
        & (~df["is_self_action"].fillna(False))
    )
    grouped = (
        df.groupby(["user_id", "day", "action_type"])
        .size()
        .rename("count")
        .reset_index()
        .pivot_table(
            index=["user_id", "day"],
            columns="action_type",
            values="count",
            aggfunc="sum",
            fill_value=0,
        )
        .reset_index()
    )
    grouped.columns.name = None

    review_counts = (
        df[df["review_action"]]
        .groupby(["user_id", "day"])
        .agg(
            review_actions=("participation_key", "nunique"),
            distinct_review_targets=("target_id", "nunique"),
            distinct_reviewed_authors=("target_owner_id", "nunique"),
        )
        .reset_index()
    )
    out = grouped.merge(review_counts, on=["user_id", "day"], how="left")
    for col in ["review_actions", "distinct_review_targets", "distinct_reviewed_authors"]:
        out[col] = out[col].fillna(0).astype(int)
    return out.sort_values(["day", "user_id"])


def analyze_old_gate_currency_behavior(user_day: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    if user_day.empty:
        return pd.DataFrame(), pd.DataFrame()
    df = user_day.copy()
    for col in ["entry_vote", "entry_submit"]:
        if col not in df.columns:
            df[col] = 0
    df["posting_day"] = df["entry_submit"] > 0
    df["entry_votes_bucket"] = df["entry_vote"].clip(upper=12)
    df["hit_old_threshold"] = df["entry_vote"].isin([3, 5, 6])

    threshold_summary = (
        df.groupby("posting_day")
        .agg(
            user_days=("user_id", "count"),
            days_at_3_votes=("entry_vote", lambda s: int((s == 3).sum())),
            days_at_5_votes=("entry_vote", lambda s: int((s == 5).sum())),
            days_at_6_votes=("entry_vote", lambda s: int((s == 6).sum())),
            days_at_any_old_threshold=("hit_old_threshold", "sum"),
            median_entry_votes=("entry_vote", "median"),
            mean_entry_votes=("entry_vote", "mean"),
            median_entries_submitted=("entry_submit", "median"),
        )
        .reset_index()
    )
    threshold_summary["pct_at_any_old_threshold"] = (
        threshold_summary["days_at_any_old_threshold"] / threshold_summary["user_days"]
    ).round(4)

    distribution = (
        df.groupby(["posting_day", "entry_votes_bucket"])
        .size()
        .rename("user_days")
        .reset_index()
        .sort_values(["posting_day", "entry_votes_bucket"])
    )
    return threshold_summary, distribution


def analyze_vote_submission_lags(events: pd.DataFrame, entries: pd.DataFrame) -> pd.DataFrame:
    if events.empty or entries.empty:
        return pd.DataFrame()
    votes = events[
        (events["action_type"] == "entry_vote")
        & (~events["is_self_action"].fillna(False))
    ][["user_id", "created_at"]].rename(columns={"created_at": "vote_at"})
    submissions = entries[["entry_id", "user_id", "created_at"]].rename(
        columns={"created_at": "submitted_at"}
    )
    if votes.empty or submissions.empty:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    votes_by_user = {user_id: group.sort_values("vote_at") for user_id, group in votes.groupby("user_id")}
    for row in submissions.sort_values("submitted_at").itertuples(index=False):
        user_votes = votes_by_user.get(str(row.user_id))
        submitted_at = row.submitted_at
        if user_votes is None or pd.isna(submitted_at):
            relevant = pd.DataFrame()
        else:
            same_day_start = submitted_at.normalize()
            relevant = user_votes[
                (user_votes["vote_at"] < submitted_at) & (user_votes["vote_at"] >= same_day_start)
            ]
        counts = {
            "votes_5m_before": 0,
            "votes_30m_before": 0,
            "votes_2h_before": 0,
            "votes_same_day_before": 0,
        }
        if not relevant.empty:
            deltas = submitted_at - relevant["vote_at"]
            counts["votes_5m_before"] = int((deltas <= pd.Timedelta(minutes=5)).sum())
            counts["votes_30m_before"] = int((deltas <= pd.Timedelta(minutes=30)).sum())
            counts["votes_2h_before"] = int((deltas <= pd.Timedelta(hours=2)).sum())
            counts["votes_same_day_before"] = int(len(relevant))
            last_vote_at = relevant["vote_at"].max()
            first_vote_at = relevant["vote_at"].min()
            last_vote_lag_minutes = (submitted_at - last_vote_at).total_seconds() / 60
            first_vote_lag_minutes = (submitted_at - first_vote_at).total_seconds() / 60
        else:
            last_vote_lag_minutes = math.nan
            first_vote_lag_minutes = math.nan
        rows.append(
            {
                "entry_id": row.entry_id,
                "user_id": row.user_id,
                "submitted_at": submitted_at,
                **counts,
                "last_vote_lag_minutes": last_vote_lag_minutes,
                "first_vote_lag_minutes": first_vote_lag_minutes,
            }
        )
    return pd.DataFrame(rows)


def build_user_summary(
    data: dict[str, pd.DataFrame],
    events: pd.DataFrame,
    as_of: datetime,
) -> pd.DataFrame:
    users = data.get("users", pd.DataFrame()).copy()
    if users.empty:
        return pd.DataFrame()

    summary = users[[
        "user_id",
        "display_name",
        "created_at",
        "is_active",
        "is_verified",
        "is_superuser",
        "reputation_score",
    ]].copy()

    sessions = data.get("sessions", pd.DataFrame())
    if not sessions.empty:
        last_seen = sessions.groupby("user_id", as_index=False)["last_seen_at"].max()
        summary = summary.merge(last_seen, on="user_id", how="left")

    total_entries = data.get("entries", pd.DataFrame())
    if not total_entries.empty:
        entry_stats = (
            total_entries.groupby("user_id")
            .agg(
                total_entries=("entry_id", "count"),
                approved_entries=("status", lambda s: int((s == "approved").sum())),
                rejected_entries=("status", lambda s: int((s == "rejected").sum())),
                total_entry_score=("score_cache", "sum"),
            )
            .reset_index()
        )
        summary = summary.merge(entry_stats, on="user_id", how="left")

    if not events.empty:
        for days in [4, 7, 14, 30]:
            start = as_of - timedelta(days=days)
            window = events[(events["created_at"] >= start) & (events["created_at"] <= as_of)].copy()
            review = window[
                window["action_type"].isin(
                    ["entry_vote", "example_vote", "comment_vote", "audio_vote", "entry_comment"]
                )
                & (~window["is_self_action"].fillna(False))
            ].drop_duplicates(["user_id", "participation_key"])
            posts = window[window["action_type"] == "entry_submit"]
            if not review.empty:
                review_stats = (
                    review.groupby("user_id")
                    .agg(
                        **{
                            f"review_actions_{days}d": ("participation_key", "nunique"),
                            f"entry_votes_on_others_{days}d": (
                                "action_type",
                                lambda s: int((s == "entry_vote").sum()),
                            ),
                            f"example_votes_on_others_{days}d": (
                                "action_type",
                                lambda s: int((s == "example_vote").sum()),
                            ),
                            f"comments_on_others_{days}d": (
                                "action_type",
                                lambda s: int((s == "entry_comment").sum()),
                            ),
                            f"distinct_review_targets_{days}d": ("target_id", "nunique"),
                            f"distinct_reviewed_authors_{days}d": ("target_owner_id", "nunique"),
                        }
                    )
                    .reset_index()
                )
                summary = summary.merge(review_stats, on="user_id", how="left")
            if not posts.empty:
                post_stats = (
                    posts.groupby("user_id")
                    .agg(**{f"entries_submitted_{days}d": ("target_id", "nunique")})
                    .reset_index()
                )
                summary = summary.merge(post_stats, on="user_id", how="left")

    numeric_cols = [col for col in summary.columns if col not in {"user_id", "display_name"}]
    for col in numeric_cols:
        if pd.api.types.is_numeric_dtype(summary[col]):
            summary[col] = summary[col].fillna(0)

    for days in [4, 7, 14, 30]:
        reviews = f"review_actions_{days}d"
        posts = f"entries_submitted_{days}d"
        if reviews in summary.columns and posts in summary.columns:
            summary[f"review_to_submission_ratio_{days}d"] = summary[reviews] / summary[posts].replace(0, pd.NA)

    return summary.sort_values(["reputation_score", "total_entries"], ascending=[False, False])


def simulate_formula_snapshot(
    formula: Formula,
    users: pd.DataFrame,
    events: pd.DataFrame,
    as_of: datetime,
) -> pd.DataFrame:
    base = users[["user_id", "display_name", "reputation_score", "is_superuser"]].copy()
    score_df = score_events_for_formula(events, formula, as_of)
    out = base.merge(score_df, on="user_id", how="left")
    out["score"] = out["score"].fillna(0.0)

    today = as_of.date()
    entries_today = (
        events[(events["action_type"] == "entry_submit") & (events["day"] == today)]
        .groupby("user_id")
        .size()
        .rename("entries_today")
        .reset_index()
    )
    out = out.merge(entries_today, on="user_id", how="left")
    out["entries_today"] = out["entries_today"].fillna(0).astype(int)

    gates = [gate_for_score(formula, score, entries) for score, entries in zip(out["score"], out["entries_today"], strict=False)]
    gate_df = pd.DataFrame(gates)
    out = pd.concat([out.reset_index(drop=True), gate_df.reset_index(drop=True)], axis=1)
    out["formula"] = formula.name
    out["window_days"] = formula.window_days
    return out


def simulate_historical_submissions(
    formula: Formula,
    events: pd.DataFrame,
    entries: pd.DataFrame,
    as_of: datetime,
    lookback_days: int,
) -> pd.DataFrame:
    if events.empty or entries.empty:
        return pd.DataFrame()
    start = as_of - timedelta(days=lookback_days)
    submissions = entries[
        (entries["created_at"] >= start) & (entries["created_at"] <= as_of)
    ].copy()
    if submissions.empty:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    entry_events = events[events["action_type"] == "entry_submit"]
    for sub in submissions.sort_values("created_at").itertuples(index=False):
        submitted_at = sub.created_at
        user_id = str(sub.user_id)
        score_df = score_events_for_formula(events[events["user_id"] == user_id], formula, submitted_at)
        score = 0.0 if score_df.empty else float(score_df.iloc[0]["score"])
        day_start = submitted_at.normalize()
        entries_so_far = int(
            len(
                entry_events[
                    (entry_events["user_id"] == user_id)
                    & (entry_events["created_at"] >= day_start)
                    & (entry_events["created_at"] < submitted_at)
                ]
            )
        )
        gate = gate_for_score(formula, score, entries_so_far)
        rows.append(
            {
                "formula": formula.name,
                "entry_id": sub.entry_id,
                "user_id": user_id,
                "submitted_at": submitted_at,
                "entry_status": sub.status,
                "entry_score_cache": sub.score_cache,
                "score_before_submission": score,
                "entries_so_far_that_day": entries_so_far,
                "would_allow_submission": gate["would_allow_next_entry"],
                "allowed_posts": gate["allowed_posts"],
                "unlimited": gate["unlimited"],
                "next_score_required": gate["next_score_required"],
            }
        )
    return pd.DataFrame(rows)


def summarize_formula_results(
    snapshot: pd.DataFrame,
    historical: pd.DataFrame,
    user_summary: pd.DataFrame,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    if snapshot.empty:
        return pd.DataFrame()

    high_rep_cutoff = None
    if "reputation_score" in snapshot.columns and len(snapshot) > 0:
        high_rep_cutoff = snapshot["reputation_score"].quantile(0.75)

    for formula, group in snapshot.groupby("formula"):
        historical_group = historical[historical["formula"] == formula] if not historical.empty else pd.DataFrame()
        row: dict[str, Any] = {
            "formula": formula,
            "users_total": int(len(group)),
            "users_with_score_gt_0": int((group["score"] > 0).sum()),
            "users_unlimited_now": int(group["unlimited"].sum()),
            "users_allowed_0_now": int((group["allowed_posts"] == 0).sum()),
            "users_allowed_1_now": int((group["allowed_posts"] == 1).sum()),
            "users_allowed_2_now": int((group["allowed_posts"] == 2).sum()),
            "median_score": round(float(group["score"].median()), 3),
            "p90_score": round(float(group["score"].quantile(0.9)), 3),
        }
        if high_rep_cutoff is not None:
            high_rep = group[group["reputation_score"] >= high_rep_cutoff]
            row["high_rep_users_blocked_now"] = int((~high_rep["would_allow_next_entry"]).sum())
        if not historical_group.empty:
            row["historical_submissions_evaluated"] = int(len(historical_group))
            row["historical_submissions_blocked"] = int((~historical_group["would_allow_submission"]).sum())
            row["historical_submission_block_rate"] = round(
                float((~historical_group["would_allow_submission"]).mean()), 4
            )
            row["unique_users_with_blocked_historical_submission"] = int(
                historical_group.loc[~historical_group["would_allow_submission"], "user_id"].nunique()
            )
            approved = historical_group[historical_group["entry_status"] == "approved"]
            if not approved.empty:
                row["approved_submission_block_rate"] = round(
                    float((~approved["would_allow_submission"]).mean()), 4
                )
        if not user_summary.empty and "entries_submitted_30d" in user_summary.columns:
            high_volume_low_review = user_summary[
                (user_summary.get("entries_submitted_30d", 0) >= 3)
                & (user_summary.get("review_actions_30d", 0) < user_summary.get("entries_submitted_30d", 0))
            ][["user_id"]]
            hv = group.merge(high_volume_low_review, on="user_id", how="inner")
            row["high_volume_low_review_users"] = int(len(hv))
            row["high_volume_low_review_blocked_now"] = int((~hv["would_allow_next_entry"]).sum())
        rows.append(row)
    return pd.DataFrame(rows).sort_values("formula")


def build_backfill_preview(
    users: pd.DataFrame,
    events: pd.DataFrame,
    as_of: datetime,
) -> pd.DataFrame:
    if users.empty:
        return pd.DataFrame()
    base = users[["user_id", "display_name", "reputation_score"]].copy()
    for window_days in [4, 7, 14]:
        formula = Formula(
            name=f"backfill_{window_days}d_entry_example_1x",
            window_days=window_days,
            weights={"entry_vote": 1.0, "example_vote": 1.0},
            step1_score=0.0,
            step1_posts=1,
            step2_score=3.0,
            step2_posts=2,
            step3_score=6.0,
        )
        score_df = score_events_for_formula(events, formula, as_of).rename(
            columns={"score": f"score_{window_days}d"}
        )
        base = base.merge(score_df, on="user_id", how="left")
        base[f"score_{window_days}d"] = base[f"score_{window_days}d"].fillna(0.0)
        base[f"tier_{window_days}d"] = base[f"score_{window_days}d"].apply(score_to_tier)
    return base.sort_values("score_7d", ascending=False)


def score_to_tier(score: float) -> str:
    if score >= 6:
        return "unlimited"
    if score >= 3:
        return "2_posts"
    return "1_post"


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def write_csv(df: pd.DataFrame, out_dir: Path, name: str) -> None:
    path = out_dir / name
    df.to_csv(path, index=False)


def md_table(df: pd.DataFrame, max_rows: int = 12) -> str:
    if df.empty:
        return "_No rows._"
    view = df.head(max_rows).copy()
    for col in view.columns:
        if pd.api.types.is_float_dtype(view[col]):
            view[col] = view[col].map(lambda x: "" if pd.isna(x) else f"{x:.4g}")
    columns = list(view.columns)
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for _, row in view.iterrows():
        values = [str(row[col]).replace("\n", " ") for col in columns]
        lines.append("| " + " | ".join(values) + " |")
    if len(df) > max_rows:
        lines.append(f"\n_Showing {max_rows} of {len(df)} rows._")
    return "\n".join(lines)


def build_report(
    *,
    as_of: datetime,
    lookback_days: int,
    data: dict[str, pd.DataFrame],
    events: pd.DataFrame,
    user_day: pd.DataFrame,
    threshold_summary: pd.DataFrame,
    threshold_distribution: pd.DataFrame,
    lag_df: pd.DataFrame,
    formula_summary: pd.DataFrame,
    backfill_preview: pd.DataFrame,
) -> str:
    counts = {
        "users": len(data.get("users", pd.DataFrame())),
        "entries": len(data.get("entries", pd.DataFrame())),
        "entry_votes": len(data.get("entry_votes", pd.DataFrame())),
        "examples": len(data.get("examples", pd.DataFrame())),
        "example_votes": len(data.get("example_votes", pd.DataFrame())),
        "comments": len(data.get("comments", pd.DataFrame())),
        "comment_votes": len(data.get("comment_votes", pd.DataFrame())),
        "audio_samples": len(data.get("audio_samples", pd.DataFrame())),
        "audio_votes": len(data.get("audio_votes", pd.DataFrame())),
    }
    counts_df = pd.DataFrame([{"table_or_signal": k, "rows": v} for k, v in counts.items()])

    lag_summary = pd.DataFrame()
    if not lag_df.empty:
        lag_summary = pd.DataFrame(
            [
                {
                    "submissions": len(lag_df),
                    "pct_with_vote_5m_before": (lag_df["votes_5m_before"] > 0).mean(),
                    "pct_with_vote_30m_before": (lag_df["votes_30m_before"] > 0).mean(),
                    "pct_with_vote_2h_before": (lag_df["votes_2h_before"] > 0).mean(),
                    "pct_with_same_day_vote_before": (lag_df["votes_same_day_before"] > 0).mean(),
                    "median_last_vote_lag_minutes": lag_df["last_vote_lag_minutes"].median(),
                }
            ]
        )

    old_gate_dist_focus = pd.DataFrame()
    if not threshold_distribution.empty:
        old_gate_dist_focus = threshold_distribution[threshold_distribution["entry_votes_bucket"].isin([0, 1, 2, 3, 4, 5, 6, 7])]

    pr17_warning = ""
    if not formula_summary.empty:
        pr17 = formula_summary[formula_summary["formula"].str.startswith("C_pr17_current")]
        if not pr17.empty:
            users_unlimited = int(pr17.iloc[0].get("users_unlimited_now", 0))
            pr17_warning = (
                f"\n- PR #17 default simulation currently places **{users_unlimited} users** "
                "in unlimited status at the as-of snapshot. Remember that with entry_vote=3 "
                "and unlimited threshold=6, two entry votes are enough for unlimited.\n"
            )

    return f"""# Participation Gate Calibration Report

Generated at: `{datetime.now(UTC).isoformat()}`  
As-of timestamp: `{as_of.isoformat()}`  
Historical submission lookback: `{lookback_days}` days

## Data loaded

{md_table(counts_df)}

## Old gate / currency-behavior signals

These tables ask whether users cluster around the old same-day thresholds of 3, 5, and 6 entry votes.

### Threshold summary

{md_table(threshold_summary)}

### Vote-count distribution on posting vs non-posting days

{md_table(old_gate_dist_focus, max_rows=30)}

## Vote timing before submissions

If votes bunch shortly before entry submission, that is evidence that users are treating votes as a prerequisite/currency rather than immediate quality judgments.

{md_table(lag_summary)}

## Candidate formula comparison

This compares current/as-of tier placement plus historical “would this actual submission have been blocked?” simulation.

{md_table(formula_summary, max_rows=20)}

{pr17_warning}

## Backfill preview

This estimates initial rollout score using existing historical entry/example votes only. It intentionally does not backfill page engagement.

{md_table(backfill_preview[[c for c in backfill_preview.columns if c in ['display_name', 'reputation_score', 'score_4d', 'tier_4d', 'score_7d', 'tier_7d', 'score_14d', 'tier_14d']]], max_rows=20)}

## Picky data-science interpretation checklist

1. If posting days cluster strongly at exactly 3/5/6 votes, the old system is producing quota behavior.
2. If many submissions have votes within 5–30 minutes beforehand, voting is being temporally coupled to posting.
3. If PR-style weights make many users unlimited after only a tiny amount of review, scale thresholds upward.
4. If a formula blocks many historically approved/high-score submissions, it is too strict.
5. If a formula does not block high-volume low-review posters, it is too weak.
6. Do not use page-engagement penalties for gate decisions until you have collected and validated them after rollout.
7. Prefer a configuration that users can understand as participation/trust, not payment.

## Output files

- `user_day_activity.csv`
- `old_gate_threshold_summary.csv`
- `old_gate_vote_distribution.csv`
- `vote_submission_lags.csv`
- `user_summary.csv`
- `formula_user_snapshot.csv`
- `formula_historical_submission_impact.csv`
- `formula_summary.csv`
- `backfill_preview.csv`
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def amain() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=None, help="Override DATABASE_URL")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--as-of", default=None, help="ISO timestamp; default now UTC")
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=60,
        help="Historical submission lookback for formula impact simulation",
    )
    args = parser.parse_args()

    load_repo_env()
    db_url = args.database_url or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit(
            "DATABASE_URL not found. Put it in apps/api/.env or pass --database-url."
        )

    as_of = parse_as_of(args.as_of)
    out_dir = args.out_dir / as_of.strftime("%Y%m%dT%H%M%SZ")
    out_dir.mkdir(parents=True, exist_ok=True)

    conn = await asyncpg.connect(normalize_db_url(db_url))
    try:
        data = await load_data(conn)
    finally:
        await conn.close()

    events = build_activity_events(data)
    users = data.get("users", pd.DataFrame())
    entries = data.get("entries", pd.DataFrame())

    user_day = build_user_day_activity(events)
    threshold_summary, threshold_distribution = analyze_old_gate_currency_behavior(user_day)
    lag_df = analyze_vote_submission_lags(events, entries)
    user_summary = build_user_summary(data, events, as_of)

    snapshots: list[pd.DataFrame] = []
    historicals: list[pd.DataFrame] = []
    for formula in FORMULAS:
        snapshots.append(simulate_formula_snapshot(formula, users, events, as_of))
        historicals.append(
            simulate_historical_submissions(
                formula,
                events,
                entries,
                as_of,
                lookback_days=args.lookback_days,
            )
        )
    formula_snapshot = pd.concat([df for df in snapshots if not df.empty], ignore_index=True)
    formula_historical = pd.concat([df for df in historicals if not df.empty], ignore_index=True)
    formula_summary = summarize_formula_results(formula_snapshot, formula_historical, user_summary)
    backfill_preview = build_backfill_preview(users, events, as_of)

    write_csv(user_day, out_dir, "user_day_activity.csv")
    write_csv(threshold_summary, out_dir, "old_gate_threshold_summary.csv")
    write_csv(threshold_distribution, out_dir, "old_gate_vote_distribution.csv")
    write_csv(lag_df, out_dir, "vote_submission_lags.csv")
    write_csv(user_summary, out_dir, "user_summary.csv")
    write_csv(formula_snapshot, out_dir, "formula_user_snapshot.csv")
    write_csv(formula_historical, out_dir, "formula_historical_submission_impact.csv")
    write_csv(formula_summary, out_dir, "formula_summary.csv")
    write_csv(backfill_preview, out_dir, "backfill_preview.csv")

    report = build_report(
        as_of=as_of,
        lookback_days=args.lookback_days,
        data=data,
        events=events,
        user_day=user_day,
        threshold_summary=threshold_summary,
        threshold_distribution=threshold_distribution,
        lag_df=lag_df,
        formula_summary=formula_summary,
        backfill_preview=backfill_preview,
    )
    (out_dir / "report.md").write_text(report)

    print(f"Wrote participation analysis to: {out_dir}")
    print(f"Open: {out_dir / 'report.md'}")


if __name__ == "__main__":
    asyncio.run(amain())
