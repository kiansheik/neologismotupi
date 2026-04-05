# DEV NOTES — Etymology Builder (Prototype)

## Files Added/Changed
- `apps/web/src/features/etymology-builder/EtymologyBuilder.tsx`
- `apps/web/src/features/etymology-builder/AdvancedModeEditor.tsx`
- `apps/web/src/features/etymology-builder/SimpleModeWizard.tsx`
- `apps/web/src/features/etymology-builder/ProModeEditor.tsx`
- `apps/web/src/features/etymology-builder/ModeSwitcher.tsx`
- `apps/web/src/features/etymology-builder/RootPicker.tsx`
- `apps/web/src/features/etymology-builder/DictionaryResultCard.tsx`
- `apps/web/src/features/etymology-builder/builder-store.ts`
- `apps/web/src/features/etymology-builder/dictionary-hooks.ts`
- `apps/web/src/features/etymology-builder/builder-types.ts`
- `apps/web/src/features/etymology-builder/builder-state.ts`
- `apps/web/src/features/etymology-builder/builder-render.ts`
- `apps/web/src/features/etymology-builder/dictionary-search.ts`
- `apps/web/src/features/etymology-builder/note-export.ts`
- `apps/web/src/features/etymology-builder/pydicate-preview.ts`
- `apps/web/src/features/etymology-builder/pyodide-runtime.ts`
- `apps/web/src/features/etymology-builder/orthography.ts`
- `apps/web/src/features/etymology-builder/pos.ts`
- `apps/web/src/routes/submit-page.tsx`
- `apps/web/public/etymology/dict-conjugated.json` (copied from `nhe-enga/docs/` — gzip content)
- `apps/web/public/etymology/neologisms.csv` (copied from `nhe-enga/`)

## Mode Architecture
- `EtymologyBuilder` now hosts a 3-mode switcher: Simple, Advanced, Pro.
- `builder-store.ts` is the shared state layer (canonical `BuilderNode` tree + operations + derived note/pydicate outputs).
- Simple and Advanced write to the same structured tree; Pro edits raw pydicate separately.

## Simple Mode
- Wizard flow optimized for common submission patterns.
- Paths supported:
  - Noun: compound roots, derived from verb, loan/adaptation, semantic extension.
  - Verb: base verb with optional causative/postposition + explicit subject/object slots.
  - Expression: fixed phrase or compositional roots; complex expressions include lightweight scaffolding + handoff.
- Simple mode writes to the structured tree and shows a generated note preview.
- Includes a live “Receita atual” summary so the wizard feels like a slot-based recipe instead of a form.
- Simple preview now includes the pydicate draft plus the Pyodide runtime output (verbete).
 - Derived nouns from transitive verbs require selecting an object before preview; the object is inserted into a verb frame before derivation.
 - "Usar no campo abaixo" now also applies the runtime verbete (if available) to the headword field.

## Verb Argument Representation
- Added `verb_frame` nodes that wrap a verb plus argument slots.
- Added `verb_argument` nodes with:
  - `role`: `subject` / `object`
  - `status`: `explicit` / `omitted` / `unspecified`
  - optional `value` (root or structure)
- Simple mode now builds these nodes directly, so subject/object choices are preserved into Advanced.
- Advanced mode exposes subject/object slots and allows setting them via the dictionary picker.

## Pro Mode (Raw Pydicate)
- Raw pydicate textarea seeded from current structure on demand.
- Runs the same Pyodide runtime for evaluation.
- Explicitly does not promise round-trip parsing back into the tree.

## Search Normalization / Ordering
- Mirrored from `nhe-enga/js/index.js`:
  - `removePunctuation`, `removeDiacritics`, `normalizeExact`, `normalizeNoAccent` in `orthography.ts`.
  - Search order: exact headword → diacritic-insensitive headword → exact definition → headword contains → diacritic-insensitive definition → definition substring (no bounds).
  - Same boundary regex and ranking (definition hits sorted by index position).
- Dictionary data loaded from the same compressed file; neologisms CSV is parsed with the same `buildNeoJSON` logic from the site.
- Dictionary entries are filtered to the same Tupi→Portuguese range and banlist used in `nhe-enga/verbs.py`.
- POS parsing uses a regex plan in `pos.ts` to detect noun, verb (tr/intr), postposition, etc., defaulting to noun when unknown.
  - Regex plan expanded to handle `(s)` / `(s.)`, `(v.tr.)`, `(v. intr.)`, `adj.:`, `pron.`, `posp.`, `cop.`, etc.

## Supported Operations (First Pass)
- Root lookup with local dictionary search (Tupi or Portuguese meaning).
- Compound composition (add/reorder roots).
- Derivational wrappers:
  - `sara` / `ba'e` (agent/doer)
  - `pyra` (patient/affected)
  - `emi` (patient with explicit agent)
  - `a` (basic nominalizer)
  - `saba` (circumstantial)
  - `rama` (future/intended)
  - `pûera` (past/former)
  - `ndûara` (deadverbal adjective)
  - `mo` / `ero` (causative)
- Possessor attachment.
- Postposition attachment (common list + dictionary-driven).
- Modifier attachment.
- Verb framing with explicit/omitted subject/object slots.
- Outputs:
  - Human-readable semicolon-style note synced to `morphology_notes` (compact roots + operations list + resultado).
  - Structured tree preview.
  - Best-effort Pydicate-like preview + canonical piece list.
- Derivation bank supports click or drag-and-drop onto a focused node.
- Derivation bank grouped by category (nominalizers / classifiers / deadverbal / causatives).
- Optional live runtime output via Pyodide (iframe) with local wheels.
  - Assets live in `apps/web/public/etymology/iframe_pyodide.html` and `apps/web/public/etymology/pyodide/*.whl`.
  - Pyodide itself is loaded from `https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js`.

## Intentionally Deferred
- Full argument structure editing and mood/tense controls.
- Full pronoun agreement editor.
- Exact parity with all Pydicate operators or corpus-specific helpers.
- Backend persistence of structured JSON.
- Parsing raw Pro mode edits back into the structured tree.
