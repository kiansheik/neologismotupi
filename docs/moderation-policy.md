# Moderation Policy (MVP)

## Principles
- Preserve good-faith contributions.
- Avoid silent deletions and hidden moderation without trace.
- Keep transparent state changes (`pending`, `approved`, `disputed`, `rejected`, `archived`).
- Preserve revision history for entry edits.
- Log all moderator actions in `moderation_actions`.

## Moderator reason guide
- spam
- duplicate
- abusive
- bad-faith trolling
- off-topic
- insufficient information
- unsafe or insulting usage
- community-sensitive / needs review

## Workflow
1. New content enters queue as `pending` based on anti-abuse thresholds.
2. Moderators review entries/examples and can approve, reject, dispute, or hide.
3. Reports are reviewed and marked `reviewed`, `resolved`, or `dismissed`.
4. Moderation actions write an audit record with notes/metadata.

## Removal policy
- Normal workflows should not hard-delete community content.
- Use status transitions and moderation notes.
- Preserve historical revisions for entries.

## Transparency
- Entry status is visible in public UI.
- Disputed entries remain visible with clear status markers where possible.
