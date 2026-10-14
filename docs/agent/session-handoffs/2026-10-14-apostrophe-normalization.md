# Apostrophe normalization — 2026-10-14

## Goal

Make iPhone smart apostrophes and other common single-quote variants work as ASCII `'` anywhere users enter language text, including the reported `tembi’u`, `a’e` and `e’õ’ar` searches.

## Files inspected

- Supplied agent instructions; required `docs/agent/index.md`, `current-state.md`, `repo-map.md`, `open-questions.md` were initially absent.
- `CLAUDE.md`, `Makefile`, `.gitignore`, `apps/web/package.json`, `vite.config.ts`, `tsconfig.app.json`, `apps/api/pyproject.toml`.
- Shared Input/Textarea, entry/example browsers, entry-detail and submit routes, inline-reference textarea, flashcard session, dictionary-search/orthography, Navarro cache and frontend API client.
- API core utils, entry/Navarro/source services, entry/Navarro/source/list/user routes, auth/entry/flashcard/list/user/moderation/source schemas, Navarro model, `main.py`, `db.py`.
- Existing frontend page tests/setup/test-utils and API conftest/API-flow/list tests. A quick global-memory search returned no relevant implementation guidance; no memory-derived behavior was used.

## Files changed

- Web: added `src/lib/text.ts`; updated shared `components/ui/input.tsx`, `textarea.tsx`, `components/entry-browser.tsx`, `routes/entry-detail-page.tsx`, `lib/orthography.tsx`, `features/etymology-builder/{orthography,dictionary-search}.ts`, `features/flashcards/components/flashcard-session.tsx`.
- Web tests: added `tests/text-input.test.tsx`, `dictionary-search.test.ts`; updated `entries-page.test.tsx`, `flashcards-page.test.tsx`.
- API: updated `app/core/utils.py`, `app/api/routes/{entries,flashcard_lists}.py`, `app/services/{entries,navarro,sources}.py`; added `app/schemas/text.py`; updated `app/schemas/{auth,entries,flashcard_lists,flashcards,moderation,users}.py`.
- API tests: added `app/tests/test_apostrophes.py`.
- Documentation: added `docs/agent/{index,current-state,repo-map,open-questions,log}.md` and this handoff.

## Commands run

- Discovery: `rg --files`, targeted `rg -n`, `cat`, `sed`, `git status --short`, `git diff --stat`, `git diff --check`, `git rev-parse --short HEAD`.
- Web, from `apps/web`: `pnpm test --run` — 46 tests passed before the final search integration test; final `pnpm test --run tests/entries-page.test.tsx tests/text-input.test.tsx tests/dictionary-search.test.ts tests/flashcards-page.test.tsx` — 30 passed.
- Web: `pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false`; `pnpm exec eslint <changed source/test files> --max-warnings 0` — passed.
- API, from `apps/api`: `.venv/bin/python -m pytest app/tests/test_apostrophes.py -x` — initial 15 passed before narrowing the variant set and adding source coverage; `.venv/bin/python -m pytest` — 96 passed, one failed.
- Final API: `.venv/bin/python -m pytest app/tests/test_apostrophes.py app/tests/test_api_flows.py -k 'apostroph or source' --disable-warnings --tb=short` — 21 passed, 50 deselected.
- API: `.venv/bin/ruff check <changed Python files>` — passed. Applied Ruff formatting only to new/small files; unrelated formatter changes in existing large files were removed.
- Baseline reproduction: `git archive HEAD apps/api` into a temporary directory; ran `test_api_flows.py::test_healthz` with that directory as `PYTHONPATH` using the existing virtualenv. Same 503/assertion failure on untouched `95bb616`.

## What worked

- Nine apostrophe variants become `'` on typing/paste before state or React Hook Form handlers receive the value; replacement preserves text length and caret position.
- Queries and existing cache/SQL fields compare canonically, including historical curly-apostrophe normalized columns.
- Entry/example duplicate detection and source reuse recognize equivalent variants. Flashcards assign the same exact-match grade.
- API text normalization preserves optional nulls, existing validation errors, credentials, tokens, URLs and program payloads.
- Accents, double quotes and other characters remain intact in input normalization. Existing accent-insensitive search behavior remains available.

## What failed

- An initial regression fixture searched an unapproved example through a public-only endpoint. Corrected the fixture by approving its entry/example; visibility rules were preserved.
- Ruff flagged intentional Unicode fixtures; the new regression file has an explained RUF001 exemption.
- Full API suite: `/healthz` failed with 503, reproduced separately on original code. Also emitted existing FastAPI/passlib deprecation and SQLite thread-cleanup warnings. No unrelated health/session changes were made.

## Remaining questions

See [open questions](../open-questions.md). No deployment, production PostgreSQL execution, full browser E2E or physical iPhone validation was performed. No generated dictionary files or existing database rows were changed.

## Suggested next prompt

"Review the apostrophe normalization diff and validate it with an iPhone keyboard before deploying through the existing workflow."
