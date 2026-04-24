from enum import StrEnum


class EntryStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    disputed = "disputed"
    rejected = "rejected"
    archived = "archived"


class ExampleStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    hidden = "hidden"
    rejected = "rejected"


class ReportTargetType(StrEnum):
    entry = "entry"
    example = "example"
    profile = "profile"


class ReportReasonCode(StrEnum):
    spam = "spam"
    harassment = "harassment"
    bad_faith = "bad_faith"
    duplicate = "duplicate"
    offensive = "offensive"
    incorrect = "incorrect"
    other = "other"


class ReportStatus(StrEnum):
    open = "open"
    reviewed = "reviewed"
    resolved = "resolved"
    dismissed = "dismissed"


class TagType(StrEnum):
    domain = "domain"
    region = "region"
    community = "community"
    grammar = "grammar"


PARTS_OF_SPEECH = [
    "noun",
    "verb",
    "adjective",
    "adverb",
    "pronoun",
    "particle",
    "expression",
    "other",
]


class FlashcardDirection(StrEnum):
    headword_to_gloss = "headword_to_gloss"
    gloss_to_headword = "gloss_to_headword"


class FlashcardCardType(StrEnum):
    new = "new"
    learn = "learn"
    review = "review"
    relearn = "relearn"


class FlashcardQueue(StrEnum):
    new = "new"
    learn = "learn"
    review = "review"
    day_learn = "day_learn"
    buried = "buried"
    suspended = "suspended"


class FlashcardGrade(StrEnum):
    again = "again"
    hard = "hard"
    good = "good"
    easy = "easy"
