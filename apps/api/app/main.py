from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import auth_router, entries_router, example_router, meta_router, moderation_router
from app.config import get_settings
from app.core.errors import http_exception_handler, validation_exception_handler


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Nheenga Neologismos API",
        version="0.1.0",
        description="Community-driven platform API for proposed and attested contemporary Tupi usage",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    app.include_router(auth_router, prefix="/api")
    app.include_router(entries_router, prefix="/api")
    app.include_router(example_router, prefix="/api")
    app.include_router(moderation_router, prefix="/api")
    app.include_router(meta_router, prefix="/api")

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
