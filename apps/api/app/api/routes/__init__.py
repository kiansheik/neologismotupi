from app.api.routes.auth import router as auth_router
from app.api.routes.entries import comment_router, example_router, router as entries_router
from app.api.routes.meta import router as meta_router
from app.api.routes.moderation import router as moderation_router
from app.api.routes.users import router as users_router

__all__ = [
    "auth_router",
    "comment_router",
    "entries_router",
    "example_router",
    "meta_router",
    "moderation_router",
    "users_router",
]
