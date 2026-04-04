# DEV NOTES — Etymology Builder (Prototype)

## Files Added/Changed
- `apps/web/src/features/etymology-builder/EtymologyBuilder.tsx`
- `apps/web/src/features/etymology-builder/builder-types.ts`
- `apps/web/src/features/etymology-builder/builder-state.ts`
- `apps/web/src/features/etymology-builder/builder-render.ts`
- `apps/web/src/features/etymology-builder/dictionary-search.ts`
- `apps/web/src/features/etymology-builder/note-export.ts`
- `apps/web/src/features/etymology-builder/pydicate-preview.ts`
- `apps/web/src/features/etymology-builder/pydicate-runtime.ts`
- `apps/web/src/features/etymology-builder/orthography.ts`
- `apps/web/src/features/etymology-builder/pos.ts`
- `apps/web/src/routes/submit-page.tsx`
- `apps/web/public/etymology/dict-conjugated.json` (copied from `nhe-enga/docs/` — gzip content)
- `apps/web/public/etymology/neologisms.csv` (copied from `nhe-enga/`)

## Search Normalization / Ordering
- Mirrored from `nhe-enga/js/index.js`:
  - `removePunctuation`, `removeDiacritics`, `normalizeExact`, `normalizeNoAccent` in `orthography.ts`.
  - Search order: exact headword → diacritic-insensitive headword → exact definition → headword contains → diacritic-insensitive definition → definition substring (no bounds).
  - Same boundary regex and ranking (definition hits sorted by index position).
- Dictionary data loaded from the same compressed file; neologisms CSV is parsed with the same `buildNeoJSON` logic from the site.
- Dictionary entries are filtered to the same Tupi→Portuguese range and banlist used in `nhe-enga/verbs.py`.
- POS parsing uses a regex plan in `pos.ts` to detect noun, verb (tr/intr), postposition, etc., defaulting to noun when unknown.

## Supported Operations (First Pass)
- Root lookup with local dictionary search (Tupi or Portuguese meaning).
- Compound composition (add/reorder roots).
- Derivational wrappers:
  - `sara` (agent/doer)
  - `pyra` (patient/affected)
  - `emi` (patient with explicit agent)
  - `saba` (circumstantial)
  - `rama` (future/intended)
  - `pûera` (past/former)
  - `mo` (causative)
- Possessor attachment.
- Postposition attachment (common list + dictionary-driven).
- Modifier attachment.
- Outputs:
  - Human-readable semicolon-style note synced to `morphology_notes`.
  - Structured tree preview.
  - Best-effort Pydicate-like preview + canonical piece list.
- Optional live runtime output via the same `/api/execute` backend used in `tupi-annotation-suite` (no schema changes).
  - Configurable via `VITE_PYDICATE_API_BASE` (defaults to `http://localhost:8080`).

## Intentionally Deferred
- Full argument structure editing and mood/tense controls.
- Full pronoun agreement editor.
- Exact parity with all Pydicate operators or corpus-specific helpers.
- Backend persistence of structured JSON.
