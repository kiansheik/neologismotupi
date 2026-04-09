# Flashcards module

This document describes how the Flashcards module works end-to-end. It is intended to match the current code behavior exactly, not a hypothetical design. All file references below are the sources of truth.

**Scope**
- Backend scheduling, selection, and persistence in `apps/api/app/services/flashcards.py`.
- FSRS math implementation in `apps/api/app/services/flashcards_scheduler.py`.
- Data model in `apps/api/app/models/flashcards.py`.
- API surface in `apps/api/app/api/routes/flashcards.py`.
- Frontend flow in `apps/web/src/routes/flashcards-page.tsx` and `apps/web/src/features/flashcards/*`.

**Auth requirement**
- Flashcards are only available to authenticated users. The API routes are protected with `get_current_user` in `apps/api/app/api/routes/flashcards.py`.
- The UI shows a login/signup CTA and does not fetch a session when the user is not logged in. See `apps/web/src/routes/flashcards-page.tsx`.

**Core entities**
All tables live in `apps/api/app/models/flashcards.py`.

- `flashcard_settings`
- `flashcard_progress`
- `flashcard_review_log`
- `flashcard_study_session`
- `flashcard_session_segments`
- `flashcard_daily_intake`
- `flashcard_daily_plan` (legacy/unused for scheduling)

**Card identity**
- Every card is identified by `(entry_id, direction)`.
- Directions are `headword_to_gloss` and `gloss_to_headword`.
- Content is read directly from `entries` and not duplicated.

**Entry eligibility and ranking**
Eligibility and ranking are implemented in `apps/api/app/services/flashcards.py`.

Eligibility (`_entry_card_filters`, `_entry_card_exists`):
- `Entry.status == approved`
- non-empty `headword`
- non-empty `gloss_pt`
- non-empty `short_definition`

Ranking for new candidates:
1. `score_cache DESC`
2. `example_count_cache DESC`
3. `created_at ASC`
4. `id ASC`

Ranking is applied on the live `entries` table (no static snapshot). The scan is limited to `NEW_CARD_SCAN_LIMIT` (currently 400).

**Audio selection**
- If an entry has audio samples, the chosen sample is the highest `upvote_count_cache`, then oldest `created_at`, then lowest `id`.
- Audio is embedded on the card payload and used by the UI.
- Selection logic is in `build_flashcard_card_payload` in `apps/api/app/services/flashcards.py`.

**Scheduling model overview**
The authoritative state is `flashcard_progress` + `due_at`. There is no daily plan used to block same-day learning or relearning.

Progress fields that matter for scheduling:
- `card_type` (new, learn, review, relearn)
- `queue` (new, learn, review)
- `due_at` (timestamp; authoritative)
- `learning_step_index`
- `remaining_steps`
- `scheduled_days`
- `memory_stability`, `memory_difficulty`
- `last_review_at`, `last_result`, `last_response_ms`
- `reps`, `lapses`

**FSRS memory state**
Implemented in `apps/api/app/services/flashcards_scheduler.py`.

- FSRS-6 parameters are stored in settings (`fsrs_params`). Defaults are the FSRS-6 default vector stored in `DEFAULT_FSRS_PARAMS`.
- `fsrs_step()` computes a new `MemoryState` from rating, elapsed days, and prior memory state.
- Same-day reviews are treated as `delta_days == 0` and use the FSRS short-term stability formula.
- `grade` maps to FSRS rating as: again=1, hard=2, good=3, easy=4.
- `next_interval_days()` converts stability and desired retention into the next interval in days.

**Learning and relearning steps**
Implemented in `apps/api/app/services/flashcards.py` via `_apply_learning_step()`.

- Steps are minute-based arrays in settings.
- Defaults are `learning_steps_minutes = [1, 10]` and `relearning_steps_minutes = [10]`.
- Learning/relearning behavior for a single review is:
- `again` sets the step index to 0.
- `hard` repeats the current step.
- `good` advances to the next step.
- `easy` graduates immediately to review.
- When steps are complete, the card graduates to review and gets a due date in days.

**Review behavior**
Implemented in `apply_flashcard_review()`.

- For review cards, `again` moves the card to relearning and increments `lapses`.
- For review cards, `hard`, `good`, and `easy` keep the card in review and schedule the next interval using FSRS.
- For new/learn cards, grades flow through learning steps and then graduate to review.
- `last_review_at`, `last_result`, `last_response_ms`, `memory_stability`, and `memory_difficulty` are updated on every review.
- A `flashcard_review_log` row is inserted for every review.

**Queue assembly (session building)**
Implemented in `build_flashcard_session()`.

The session is computed dynamically from current DB state on every request:
1. Load settings and the currently active session, if any.
2. Compute today’s review counts and reviewed cards.
3. Check for a pending sibling (reverse card) that must be shown immediately.
4. Load due learning/relearning cards whose `due_at <= now`.
5. Load due review cards whose `due_at <= now`, respecting `max_reviews_per_day` if set.
6. Select new candidates from live entry ranking.
7. Compute `due_later_today` for learning/relearning/review cards due later the same UTC day.
8. Choose the next card in priority order: pending sibling -> learn/relearn -> review -> new.

Important details:
- `due_now` includes reviews due now, new entries available, and any pending sibling.
- `new_remaining` counts entries that have never been studied before (new pairs).
- The UTC day boundary is used for “today” counts.
- There is no reshuffle of learning cards; `due_at` controls resurfacing.

**Sessions and new-card intake**
Study sessions are explicit, and new cards are introduced continuously during a session.

- A session begins on the first review and ends when the user clicks “Finish session”.
- Active time is tracked in `flashcard_session_segments`. Each segment is a continuous active interval.
- When the user leaves the session (tab hidden or page exit), the open segment is closed and the session becomes paused.
- Returning shows a “Continue session” / “Start new session” choice. Starting new finalizes the old session at the last active segment end time.
- There is no daily cap in the session queue. New cards are always available as long as eligible entries exist.
- `flashcard_daily_intake` remains in the database but is not used by the scheduler.
- Each review log row stores the `session_id` so session analytics can be derived later.

**Sibling behavior**
- The two directions of a card are treated as siblings.
- New entries are introduced as a pair. The first card is always `headword_to_gloss`, followed immediately by `gloss_to_headword`.
- After the pair is shown, burying is enforced based on cards already reviewed today, not merely shown.
- If a sibling was reviewed today, the other direction is excluded from today’s due lists and new candidate lists.
- This is controlled by `settings.bury_siblings` and implemented via `_sibling_buried()` and `_select_pending_sibling()` in `apps/api/app/services/flashcards.py`.

**New card breadth rule**
New cards are introduced at the entry level:
- Only entries with no prior progress are counted as “new”.
- The first card for a new entry is always `headword_to_gloss`.
- The reverse direction is shown immediately afterward as part of the same new entry pair.

**Review logging and research-ready data**
`flashcard_review_log` stores per-review, per-user, per-card data for future analysis:
- `user_id`, `entry_id`, `direction`
- `session_id`
- `grade`, `response_ms`, `reviewed_at`
- `state_before`, `state_after`, `interval_before`, `interval_after`
- `memory_stability_before/after`, `memory_difficulty_before/after`

These logs allow future analysis of difficulty by entry, direction, and user cohort.

**Frontend behavior**
Key files:
- `apps/web/src/routes/flashcards-page.tsx`
- `apps/web/src/features/flashcards/components/flashcard-session.tsx`
- `apps/web/src/features/flashcards/components/flashcard-summary.tsx`
- `apps/web/src/features/flashcards/components/flashcard-settings.tsx`
- `apps/web/src/features/flashcards/hooks.ts`
- `apps/web/src/features/flashcards/api.ts`

Production scoring (typed-answer mode):
- Users type their answer rather than self-grading.
- Grade is auto-computed via Levenshtein distance after normalizing both strings to lowercase with collapsed whitespace.
  - ratio >= 0.85 → `good`
  - ratio >= 0.50 → `hard`
  - ratio < 0.50 → `again`
- The typed response is stored in `flashcard_review_log.user_response` for analysis.
- The result banner shows “Congrats!” or “Study more” with the percentage match.
- For cards without audio, an inline `AudioCapture` is shown so users can contribute recordings without leaving the quiz.
- A pro-tip to repeat audio is shown on cards that have audio.

Prompt behavior:
- Prompt side shows `headword` for `headword_to_gloss` and `gloss_pt` for `gloss_to_headword`.
- The expected answer is `gloss_pt` for `headword_to_gloss` and the orthography-applied `headword` for `gloss_to_headword`.
- Audio autoplay is direction-specific: Tupi -> PT plays on prompt; PT -> Tupi plays on reveal.

Response time:
- `response_ms` is measured from the moment the prompt is shown to the moment the user clicks “Submit”.
- That value is sent to the backend with the review, and stored in `flashcard_review_log`.

Empty states:
- If nothing is due now but there are cards due later today, the UI shows a “due later today” message.

Session controls and stats:
- The “Finish session” button ends the active session and closes any open segment.
- If a session is paused (no open segment), the UI prompts the user to continue or start a new session.
- If the user checks “Remind me tomorrow at this time”, the UI sends the request with the browser time zone.
- The backend computes the next-day reminder time using the session `started_at` in that time zone and stores it in `flashcard_reminders`.
- A “Resumo de hoje” card shows today’s reviews, new entries, study minutes, and session count.
- A minimalist 7‑day bar chart shows study minutes per day.

**Reminders (email job)**
- Reminders are stored in `flashcard_reminders` with `remind_at`, `time_zone`, and `sent_at`.
- `POST /api/flashcards/finish-session` schedules a reminder if `remind_tomorrow` is set.
- The scheduler in `apps/api/app/core/schedule_flashcard_reminders.py` polls due reminders and sends emails via `send_flashcard_reminder_email` in `apps/api/app/services/email_delivery.py`.
- After a successful send, `sent_at` is set so the reminder is not resent.

**API endpoints**
Defined in `apps/api/app/api/routes/flashcards.py`:
- `GET /api/flashcards/settings`
- `PATCH /api/flashcards/settings`
- `GET /api/flashcards/session`
- `POST /api/flashcards/review`
- `POST /api/flashcards/finish-session`
- `POST /api/flashcards/session/presence`
- `GET /api/flashcards/stats`

**Analytics**
Tracked in the frontend:
- `flashcards_page_view`
- `flashcard_reveal`
- `flashcard_review_submitted`
- `flashcard_settings_updated`
- `flashcard_session_completed`

**Legacy table note**
- `flashcard_daily_plan` still exists, but it is not used as the authoritative queue and does not block same-day learning or relearning.
- `flashcard_daily_intake` still exists, but it is not used for limiting new cards.

**Glossary of key fields**
- `due_at`: The authoritative timestamp for when a card is eligible to be shown.
- `card_type`: Scheduling state (new, learn, review, relearn).
- `queue`: UI-facing label derived from state.
- `memory_stability` / `memory_difficulty`: FSRS memory state.
- `scheduled_days`: The current review interval in days when the card is in review.
- `remaining_steps`: Number of learning steps remaining (computed during learning/relearning updates).

**Where to look when debugging**
- Scheduler logic: `apps/api/app/services/flashcards.py` and `apps/api/app/services/flashcards_scheduler.py`.
- API behavior: `apps/api/app/api/routes/flashcards.py`.
- DB shape: `apps/api/app/models/flashcards.py` and the Alembic migration `apps/api/alembic/versions/0020_flashcards_fsrs.py`.
- Frontend behavior: `apps/web/src/routes/flashcards-page.tsx` and `apps/web/src/features/flashcards/components/flashcard-session.tsx`.
