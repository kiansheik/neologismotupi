import logging
from time import perf_counter

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import (
    auth_router,
    comment_router,
    entries_router,
    example_router,
    meta_router,
    moderation_router,
    sources_router,
    users_router,
)
from app.config import get_settings
from app.core.errors import http_exception_handler, validation_exception_handler
from app.db import AsyncSessionLocal

request_logger = logging.getLogger("uvicorn.error")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Dicionário de Tupi API",
        version="0.1.0",
        description="Community-driven API for a living Tupi dictionary with historical and contemporary usage",
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

    @app.middleware("http")
    async def log_requests_with_user(request, call_next):
        started_at = perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            client_host = request.client.host if request.client else "-"
            client_port = request.client.port if request.client else 0
            query = f"?{request.url.query}" if request.url.query else ""
            path_with_query = f"{request.url.path}{query}"
            user_email = getattr(request.state, "auth_user_email", None) or "-"
            duration_ms = (perf_counter() - started_at) * 1000
            request_logger.info(
                'request %s:%s - "%s %s" %s user_email=%s duration_ms=%.1f',
                client_host,
                client_port,
                request.method,
                path_with_query,
                status_code,
                user_email,
                duration_ms,
            )

    app.include_router(auth_router, prefix="/api")
    app.include_router(entries_router, prefix="/api")
    app.include_router(example_router, prefix="/api")
    app.include_router(comment_router, prefix="/api")
    app.include_router(moderation_router, prefix="/api")
    app.include_router(meta_router, prefix="/api")
    app.include_router(sources_router, prefix="/api")
    app.include_router(users_router, prefix="/api")

    @app.get("/healthz")
    async def healthz():
        release = settings.app_release
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text("SELECT 1"))
            return {"ok": True, "database": "ok", "release": release}
        except Exception:
            return JSONResponse(status_code=503, content={"ok": False, "database": "error", "release": release})

    @app.get("/health")
    async def health():
        return await healthz()

    return app


app = create_app()
