from app.api.routes.auth import router as auth_router
from app.api.routes.entries import example_router, router as entries_router
from app.api.routes.meta import router as meta_router
from app.api.routes.moderation import router as moderation_router

__all__ = [
    "auth_router",
    "entries_router",
    "example_router",
    "meta_router",
    "moderation_router",
]
