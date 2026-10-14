# Repository map

Inspected areas; this is not an exhaustive inventory.

| Area | Source of truth |
| --- | --- |
| Development, tests and deployment targets | `Makefile`, `CLAUDE.md`, `apps/web/package.json`, `apps/api/pyproject.toml` |
| Shared text inputs | `apps/web/src/components/ui/input.tsx`, `textarea.tsx`; normalization in `apps/web/src/lib/text.ts` |
| Dictionary browse/search | `apps/web/src/components/entry-browser.tsx`, `example-browser.tsx`; API in `apps/api/app/api/routes/entries.py` |
| Etymology dictionary search | `apps/web/src/features/etymology-builder/dictionary-search.ts`, `orthography.ts` |
| Navarro cache search | `apps/web/src/features/navarro/cache.ts`; backend in `apps/api/app/services/navarro.py`, routes in `api/routes/navarro.py` |
| Personal orthography | `apps/web/src/lib/orthography.tsx`; persisted preferences in API user schemas/routes |
| Flashcard answers/grading | `apps/web/src/features/flashcards/components/flashcard-session.tsx`; request schema in `apps/api/app/schemas/flashcards.py` |
| Text request validation | `apps/api/app/schemas/text.py` defines `CanonicalText`; consumer schemas in the same directory |
| Search normalization and SQL compatibility | `apps/api/app/core/utils.py`; entry, source and list queries use these helpers |
| Source reuse/search | `apps/api/app/services/sources.py` |
| Backend test database | `apps/api/app/tests/conftest.py` replaces the session factory with temporary SQLite databases |
| API health/cache startup | `apps/api/app/main.py` imports a session factory directly; see the baseline health-test issue in open questions |
| Regression tests | `apps/web/tests/text-input.test.tsx`, `dictionary-search.test.ts`, `entries-page.test.tsx`, `flashcards-page.test.tsx`; `apps/api/app/tests/test_apostrophes.py` |

All raw frontend text controls found in the inspection use shared components except the flashcard answer input. Other native inputs are checkboxes or file inputs.
