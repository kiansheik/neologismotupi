from sqlalchemy import false, true

from app.core.enums import EntryStatus
from app.models.entry import Entry, Example
from app.models.user import User

HIDDEN_ENTRY_STATUSES = {EntryStatus.rejected, EntryStatus.archived}


def is_moderator(user: User) -> bool:
    return bool(user.is_superuser)


def can_view_hidden_entry(user: User | None) -> bool:
    return bool(user and is_moderator(user))


def can_view_entry(user: User | None, entry: Entry) -> bool:
    return entry.status not in HIDDEN_ENTRY_STATUSES or can_view_hidden_entry(user)


def entry_visibility_clause(user: User | None, entry_model=Entry):
    if can_view_hidden_entry(user):
        return true()
    return entry_model.status.notin_(HIDDEN_ENTRY_STATUSES)


def filtered_entry_status_clause(user: User | None, status: EntryStatus | None, entry_model=Entry):
    if status is None:
        return entry_model.status.notin_(HIDDEN_ENTRY_STATUSES)
    if status in HIDDEN_ENTRY_STATUSES and not can_view_hidden_entry(user):
        return false()
    return entry_model.status == status


def can_edit_entry(user: User, entry: Entry) -> bool:
    return user.is_superuser or entry.proposer_user_id == user.id


def can_edit_example(user: User, example: Example) -> bool:
    return user.is_superuser or example.user_id == user.id
