# Current state

## 2026-10-14: browsing history and shareable searches

- Entry browsers (including profile, source and personal submissions), examples and flashcard-list search read their filters from the URL. Browser Back/Forward and direct links update the controls and queries. Notifications use `all=1` for their filter.
- Public parameters: `q`, `status`, `part_of_speech`, `sort`; existing `search` and `unseen=1/true` links remain understood. Defaults are omitted when changed; unrelated parameters and fragments survive filter updates.
- Discrete filters push history entries. Consecutive text edits within 700 ms replace the current typing entry. Entry/example tabs keep the query and compatible filters.
- Root navigation restores each history entry's scroll after asynchronous content is tall enough. Reload or another navigation during restoration preserves the intended position. User scroll/input cancels a pending restoration.
- Tab snapshots retain loaded result depth, downvote drafts, list creation/comment drafts, per-entry comment/example drafts, list-picker state and expanded history panels. Comment drafts retain inline-reference spans; successful submission clears them. Authored drafts are scoped by account and path.
- Browse and profile-audio queries retain pages for 30 minutes, with one minute of freshness; saved page counts rebuild depth after reload/cache loss. Storage is bounded to 100 snapshots, with a bounded memory fallback for unavailable storage.
- Validation: 58 web tests, two desktop Chromium browser tests with a mocked dictionary API, TypeScript and targeted ESLint passed. The browser tests cover second-batch results, scroll, Back/Forward, reload and a shared search in a fresh browser context.
- No backend/generated files changed. Local only; live-backend navigation, production deployment and physical iPhone/Safari validation remain unperformed.

See [navigation notes](navigation.md) and the [handoff](session-handoffs/2026-10-14-browsing-navigation.md).

## 2026-10-14: apostrophe normalization

- Text/search inputs and textareas convert nine apostrophe variants to ASCII `'` while preserving cursor position and other letters. The native flashcard answer input does the same.
- The backend uses `CanonicalText` on human-authored request fields: entries, examples, comments, source metadata, flashcard lists/answers, profile text, orthography mappings and moderation notes. Credentials, tokens, URLs and structured program payloads retain their exact values at the API boundary.
- Dictionary/etymology and Navarro cache searches normalize query and indexed text. Flashcard grading and personal orthography use the same canonical apostrophe.
- SQL searches and duplicate checks normalize existing stored variants at comparison time. No migration, dictionary regeneration or existing-row rewrite was performed.
- Supported variants: U+2018, U+2019, U+201A, U+201B, U+02BB, U+02BC, U+2032, U+2035 and U+FF07. Backend/frontend sets must stay aligned. Backticks, standalone acute accents, double quotes and combining accents are preserved by apostrophe normalization.
- Validation: full web suite passed (46 tests before the final search integration test); final affected web tests passed (30 tests), TypeScript and targeted ESLint/Ruff passed. The full API run had 96 passes and one `/healthz` failure. The same health failure was reproduced on untouched HEAD `95bb616` in a temporary checkout. Final apostrophe/source checks passed (21 tests).
- Local implementation only; deployment, production PostgreSQL execution and physical iPhone keyboard validation remain unperformed.

See the [handoff](session-handoffs/2026-10-14-apostrophe-normalization.md) for commands and evidence boundaries.
