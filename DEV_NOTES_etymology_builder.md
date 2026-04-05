# DEV NOTES — Etymology Builder (Simple + Pro)

## Files Added/Changed
- `apps/web/src/features/etymology-builder/EtymologyBuilder.tsx`
- `apps/web/src/features/etymology-builder/ModeSwitcher.tsx`
- `apps/web/src/features/etymology-builder/SimplePipelineBuilder.tsx`
- `apps/web/src/features/etymology-builder/ProModeEditor.tsx`
- `apps/web/src/features/etymology-builder/builder-store.ts`
- `apps/web/src/features/etymology-builder/builder-types.ts`
- `apps/web/src/features/etymology-builder/pipeline-derivations.ts`
- `apps/web/src/features/etymology-builder/pipeline-utils.ts`
- `apps/web/src/features/etymology-builder/pydicate-preview.ts`
- `apps/web/src/features/etymology-builder/note-export.ts`
- `apps/web/src/features/etymology-builder/RootPicker.tsx`
- `apps/web/src/features/etymology-builder/DictionaryResultCard.tsx`
- `apps/web/src/features/etymology-builder/dictionary-hooks.ts`
- `apps/web/src/features/etymology-builder/dictionary-search.ts`
- `apps/web/src/features/etymology-builder/pyodide-runtime.ts`
- `apps/web/src/features/etymology-builder/runtime-output.ts`
- `apps/web/src/features/etymology-builder/orthography.ts`
- `apps/web/src/features/etymology-builder/pos.ts`
- `apps/web/src/routes/submit-page.tsx`

Removed:
- `apps/web/src/features/etymology-builder/AdvancedModeEditor.tsx`
- `apps/web/src/features/etymology-builder/builder-state.ts`
- `apps/web/src/features/etymology-builder/builder-render.ts`
- `apps/web/src/features/etymology-builder/SimpleModeWizard.tsx`

## Mode Architecture
- Only two modes remain: `Simple` and `Pro`.
- `builder-store.ts` now holds a **pipeline-first** state (base root → modifiers → object → derivations).
- `SimplePipelineBuilder` updates that pipeline and shows live outputs.
- `ProModeEditor` is raw pydicate; it can load from the current Simple build but does not round-trip back.

## Simple Mode (Pipeline Flow)
Simple mode is a linear agglutinative pipeline:
1. **Base root**
2. **Core-meaning modifiers** using `/` (ordered chain)
3. **Object resolution** if the predicate is transitive
4. **Derivations** in chain (filtered to match the current stage)
5. **Result panel** with pydicate preview, Pyodide output, and the generated note

### Object / Transitivity Handling
- Transitivity is inferred from dictionary POS info:
  - `v.tr.` → transitive
  - `v. intr.` → intransitive
  - `v.` → unknown
- If transitivity is unknown, a manual override appears in Simple mode.
- If the current predicate is **transitive**, the object slot must be handled before **any derivation**:
  - Generic non-human (`mba'e`)
  - Generic human (`moro`)
  - Dictionary search
  - Manual entry
  - Or leave open explicitly (dictionary-style transitive verb)
- This keeps the “object required before derivation” rule enforceable without a full grammar engine.

## Derivations (Current Pipeline Support)
Derivations are filtered by the current stage (verb/noun/adverb). Supported:
- Agent/Doer: `sara`, `ba'e`
- Patient: `pyra`, `emi` (with optional explicit agent)
- Nominalizer: `-a`
- Circumstantial: `saba`
- Classifiers: `rama`, `pûera`
- Deadverbal: `ndûara` (adverb → adjective noun)
- Causatives: `mo`, `ero`

## Pydicate Rendering
- The pydicate draft is generated from the pipeline:
  - Composition is rendered via `/`
  - Object resolution is applied before derivations using `*`
  - Derivations wrap the current predicate (`sara * (...)`, `mo * (...)`, etc.)
- Dictionary verbs are emitted as `Verb("erokûab")` only (so the internal conjugation dictionary is used).
- Manual/neo verbs include class/definition if supplied.

## Note Synchronization
- `note-export.ts` now renders a compact semicolon-style note from the pipeline state.
- The note can be applied to `morphology_notes`.
- “Usar no campo abaixo” also applies the Pyodide verbete (if present) to the headword.

## Pro Mode
- Raw pydicate editor + Pyodide execution.
- Can load a draft from the Simple pipeline.
- Explicitly does not reimport raw edits back into Simple.

## Search Normalization / Ordering (Unchanged)
- Normalization and ordering mirror the public `nhe-enga` search:
  - exact headword → diacritic-insensitive headword → exact definition
  - headword contains → diacritic-insensitive definition → definition substring
- Dictionary entries filtered to the same Tupi→Portuguese range and banlist.
- POS detection uses regex in `pos.ts`, defaulting to noun when unknown.

## Intentionally Deferred
- Full clause/argument editor beyond the single object slot.
- Full mood/tense/pro-drop editing.
- Round-trip parsing from arbitrary Pro mode text into the pipeline.
- Backend persistence of structured JSON.
