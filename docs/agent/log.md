# Work log

## 2026-10-14 — browsing navigation

Moved browsing filters into shareable URLs, with history entries for filter changes and grouped typing. Added asynchronous scroll restoration, result-depth recovery and account/path-scoped tab drafts/panel state. Fixed interrupted reload restoration after detecting it in Chromium. Validated 58 web tests, two isolated browser tests, TypeScript and targeted ESLint. No deployment or backend changes. See the [navigation handoff](session-handoffs/2026-10-14-browsing-navigation.md).

## 2026-10-14

Implemented canonical apostrophes across text entry, request validation, searches, duplicate detection, personal orthography and flashcard grading. Added regressions for the reported short words, pasted text, cursor position and legacy stored variants. Initialized the previously absent agent documentation. Local checks passed for affected functionality; the full API run exposed a baseline health-test failure reproduced on untouched HEAD. See the [session handoff](session-handoffs/2026-10-14-apostrophe-normalization.md).
