from enum import Enum


class EntryStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    disputed = "disputed"
    rejected = "rejected"
    archived = "archived"


class ExampleStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    hidden = "hidden"
    rejected = "rejected"


class ReportTargetType(str, Enum):
    entry = "entry"
    example = "example"
    profile = "profile"


class ReportReasonCode(str, Enum):
    spam = "spam"
    harassment = "harassment"
    bad_faith = "bad_faith"
    duplicate = "duplicate"
    offensive = "offensive"
    incorrect = "incorrect"
    other = "other"


class ReportStatus(str, Enum):
    open = "open"
    reviewed = "reviewed"
    resolved = "resolved"
    dismissed = "dismissed"


class TagType(str, Enum):
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


class FlashcardDirection(str, Enum):
    headword_to_gloss = "headword_to_gloss"
    gloss_to_headword = "gloss_to_headword"


class FlashcardState(str, Enum):
    new = "new"
    learning = "learning"
    review = "review"
    relearning = "relearning"


class FlashcardQueueType(str, Enum):
    new = "new"
    review = "review"


class FlashcardReviewResult(str, Enum):
    correct = "correct"
    study_more = "study_more"
