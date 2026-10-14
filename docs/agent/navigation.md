# Browsing URLs and restoration

## Public URL state

`apps/web/src/lib/browse-url.ts` owns parsing and navigation. URL values are read on every navigation rather than copied into mount-only component state.

Example: `/entries?q=tembi%27u&status=approved&part_of_speech=noun&sort=alphabetical`.

- `q`: user-entered search, with canonical apostrophes. Incoming `search` is supported as an alias.
- `status`, `part_of_speech`, `sort`: validated against each browser's available values. Permissions still constrain visible results; unavailable staff/unseen filters are not destructively erased while auth is loading.
- `unseen=1` or `unseen=true`: legacy entry-browse links. Changing sorting removes the alias.
- `/lists?q=...`: flashcard-list search. `/notifications?all=1`: notification filter.
- Filters preserve unrelated query parameters and fragments. Entry/example tabs transfer the search and compatible status/score sorting.
- A typing burst creates one history step; subsequent changes within 700 ms replace it. Select changes push a new history entry. Back/Forward are handled by the router.

## Private tab state

`navigation-state.ts` stores a bounded collection in sessionStorage, with a bounded memory fallback if storage is blocked/full. This data is not included in a shared URL.

`usePageState` scopes state by pathname and caller-provided name. Authored drafts include the account ID. Drafts are retained when revisiting a route; browser history does not undo server mutations or turn every input edit into a separate snapshot.

Covered state: downvote drafts/panels, list creation/comments/pickers, per-entry comment and example composition, expanded entry/example/comment history, and loaded browse/profile-audio page counts. Comment spans retain hidden inline-reference IDs; successful posting clears drafts.

Browse queries use 60-second freshness and 30-minute cache retention. `useRestoreResultPages` re-fetches the previously loaded depth if a cache has expired or the app reloads. This recovers the result extent; it does not freeze server data.

## Scroll and validation

`NavigationRestoration` is mounted once by AppShell. Positions are keyed by history entry plus URL. It owns manual browser scroll restoration, preserves scroll on same-page filter updates and moves fresh page navigations to the top (or hash anchor).

POP waits for async document height before restoring, for up to 10 seconds. Further navigation/reload keeps the intended target; wheel/touch/pointer/keyboard interaction cancels a pending restore. Snapshots are saved before link clicks, on POP/pagehide and on route cleanup.

58 frontend unit/integration tests and two mocked-API desktop Chromium tests passed. Live backend behavior and physical Safari/iPhone remain unverified. See the [handoff](session-handoffs/2026-10-14-browsing-navigation.md) for commands.
