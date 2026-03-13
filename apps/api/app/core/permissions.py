from app.models.entry import Entry, Example
from app.models.user import User


def is_moderator(user: User) -> bool:
    return bool(user.is_superuser)


def can_edit_entry(user: User, entry: Entry) -> bool:
    return user.is_superuser or entry.proposer_user_id == user.id


def can_edit_example(user: User, example: Example) -> bool:
    return user.is_superuser or example.user_id == user.id
