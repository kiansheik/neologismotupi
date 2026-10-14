# Current state

## 2026-10-14: apostrophe normalization

- Text/search inputs and textareas convert nine apostrophe variants to ASCII `'` while preserving cursor position and other letters. The native flashcard answer input does the same.
- The backend uses `CanonicalText` on human-authored request fields: entries, examples, comments, source metadata, flashcard lists/answers, profile text, orthography mappings and moderation notes. Credentials, tokens, URLs and structured program payloads retain their exact values at the API boundary.
- Dictionary/etymology and Navarro cache searches normalize query and indexed text. Flashcard grading and personal orthography use the same canonical apostrophe.
- SQL searches and duplicate checks normalize existing stored variants at comparison time. No migration, dictionary regeneration or existing-row rewrite was performed.
- Supported variants: U+2018, U+2019, U+201A, U+201B, U+02BB, U+02BC, U+2032, U+2035 and U+FF07. Backend/frontend sets must stay aligned. Backticks, standalone acute accents, double quotes and combining accents are preserved by apostrophe normalization.
- Validation: full web suite passed (46 tests before the final search integration test); final affected web tests passed (30 tests), TypeScript and targeted ESLint/Ruff passed. The full API run had 96 passes and one `/healthz` failure. The same health failure was reproduced on untouched HEAD `95bb616` in a temporary checkout. Final apostrophe/source checks passed (21 tests).
- Local implementation only; deployment, production PostgreSQL execution and physical iPhone keyboard validation remain unperformed.

See the [handoff](session-handoffs/2026-10-14-apostrophe-normalization.md) for commands and evidence boundaries.
