# Browsing navigation — 2026-10-14

## Goal

Return users to their search, filters, result extent, scroll and browsing interactions when leaving a result and going Back/Forward. Make searches shareable by URL.

## Files inspected

- Required `docs/agent/{index,current-state,repo-map,open-questions}.md`; existing log and source guidance in `CLAUDE.md`.
- `apps/web/src/app/{router,providers}.tsx`, `main.tsx`, `components/{app-shell,browse-tabs,entry-browser,example-browser}.tsx`.
- Routes: entries, examples, home, profile, source detail, personal submissions, entry detail, lists/list detail, notifications, flashcards and moderation.
- Frontend API/types, query client, orthography, vote memory, SEO, page engagement, inline-reference utilities, flashcard session and list hooks/picker.
- Web test helpers, existing page/E2E tests, Vitest/TypeScript/ESLint configuration, Playwright configuration and installed browser executables.
- A quick global-memory search found no relevant implementation guidance. Current source was used throughout.

## Files changed

- Added `apps/web/src/lib/browse-url.ts`, `lib/navigation-state.ts`, `components/navigation-restoration.tsx`.
- Updated components `app-shell.tsx`, `browse-tabs.tsx`, `entry-browser.tsx`, `example-browser.tsx` and `features/flashcard-lists/components/entry-list-picker.tsx`.
- Updated routes `entries-page.tsx`, `entry-detail-page.tsx`, `profile-page.tsx`, `flashcard-lists-page.tsx`, `flashcard-list-detail-page.tsx`, `notifications-page.tsx`.
- Added a sorting-control label in all locale dictionaries in `src/i18n/messages.ts`.
- Added `tests/browse-history.test.tsx`, `tests/e2e/browse-history.spec.ts`; extended `tests/entry-detail-page.test.tsx`.
- Updated `apps/web/playwright.config.ts` with optional port/executable/server-reuse overrides and strict port binding.
- Updated `docs/agent/{index,current-state,repo-map,open-questions,log}.md`; added `navigation.md` and this handoff.

## Commands run

- Discovery/review: targeted `rg`, `cat`, `sed`, `git status --short`, `git diff --stat`, `git diff --check`, `git rev-parse --short HEAD` (starting source: `e645ba3`).
- From `apps/web`: `pnpm test --run` — 58 passed. Rechecked the nine entry-detail tests after correcting a test-only TypeScript option — nine passed.
- Final active-tab URL preservation check: ten browsing tests passed; TypeScript and ESLint for that change passed.
- `pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `pnpm exec eslint <changed TS/TSX files> --max-warnings 0` — passed.
- Prettier applied only to the five newly added source/test files.
- Final real-browser command, from `apps/web`:

```sh
PLAYWRIGHT_PORT=5184 PLAYWRIGHT_REUSE_SERVER=0 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Users/kian/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell \
pnpm exec playwright test tests/e2e/browse-history.spec.ts --config playwright.config.ts --reporter=line --workers=1
```

Two Chromium tests passed. The tests mock dictionary API responses, including async list loading; no real backend/database is required. Browser launch/localhost listening required a sandbox escalation, which was approved.

## What worked

- Shared/direct search links hydrate controls and queries; defaults and invalid values are handled without breaking API requests. Existing apostrophe handling remains intact.
- Query updates preserve unrelated parameters/hash. Select changes and text-edit bursts create useful history entries; tabs keep compatible search conditions.
- Back/Forward and reload recover second-batch results and their scroll position. Page-count snapshots rebuild missing cached batches.
- Private drafts and panel state survive returning to a route and are scoped to account/path where appropriate. Restored comment references retain their underlying tokens; posting clears the saved draft.
- The storage-blocked test verifies Back/Forward can retain an in-memory draft.
- Existing web tests remain passing. No backend, generated files, production state, commits or deployment were changed in this session.

## What failed

- Initial browser run could not bind localhost in the sandbox; approved escalation allowed testing.
- The package's default Playwright browser revision was absent. Used an already installed Chromium executable via an override.
- An existing app occupied port 5173 and was reused by the default runner. Switched to isolated strict port 5184; the other app was left running.
- Browser testing found a real interrupted-restoration bug: immediate reload after Back could overwrite the intended scroll target with the loading screen's position. Fixed and verified.
- Early fixtures omitted an entry author and selected a hidden list-picker field instead of the comment textarea. Corrected the fixtures/selectors. Also corrected a Testing Library option unsupported by its TypeScript type.
- Existing test/dev warnings remain (one unmatched `/me` test route, stale Browserslist data and Tailwind color aliases).

## Remaining questions

Check live-backend latency and physical iPhone/Safari behavior. This pass covers browsing and the listed composition drafts; it does not persist binary uploads, submission-builder state, or all edit/report forms. Cache restoration preserves context while still allowing server results to refresh. No deployment has occurred.

## Suggested next prompt

"Review the navigation changes and verify Back/Forward and a shared search on an iPhone against the real backend, then deploy through the existing workflow."
