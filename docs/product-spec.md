# Product Spec (MVP)

## Mission
Dicionário de Tupi is a living, community-built dictionary of Tupi usage - historical and contemporary.
It is not an official dictionary and does not claim institutional authority.

## User groups
- Public visitors: discover and evaluate entries.
- Registered contributors: propose entries, examples, and reports.
- Moderators: triage pending content and reports with transparent actions.

## MVP scope
- Public pages: home, browse/search, entry detail, recent entries.
- Account pages: signup, login/logout, profile view.
- Contribution flows: submit entry, edit own entry, add example, vote, report.
- Moderation flows: queue review, report review, status transitions.
- Data integrity: revision history, moderation audit logs, no silent destructive edits.

## Status model
### Entry status
- `pending`
- `approved`
- `disputed`
- `rejected`
- `archived`

### Example status
- `pending`
- `approved`
- `hidden`
- `rejected`

## Core constraints
- One vote per user per entry.
- New users cannot downvote until account age >= 72 hours.
- First 3 entries by each non-moderator user default to `pending`.
- First 5 examples by each non-moderator user default to `pending`.
- Duplicate hints shown before submission; forced submission remains possible.
- Moderator actions are logged.

## Non-goals for MVP
- OAuth
- AI moderation
- Audio uploads
- Message threads
- Notification systems
