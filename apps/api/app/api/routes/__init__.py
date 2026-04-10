from app.api.routes.auth import router as auth_router
from app.api.routes.audio import router as audio_router
from app.api.routes.entries import comment_router, example_router, router as entries_router
from app.api.routes.flashcards import router as flashcards_router
from app.api.routes.flashcard_lists import router as flashcard_lists_router
from app.api.routes.meta import router as meta_router
from app.api.routes.moderation import router as moderation_router
from app.api.routes.newsletters import router as newsletters_router
from app.api.routes.sources import router as sources_router
from app.api.routes.users import router as users_router

__all__ = [
    "auth_router",
    "audio_router",
    "comment_router",
    "entries_router",
    "example_router",
    "flashcards_router",
    "flashcard_lists_router",
    "meta_router",
    "moderation_router",
    "newsletters_router",
    "sources_router",
    "users_router",
]
