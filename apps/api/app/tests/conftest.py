from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

from app import models  # noqa: F401
from app.config import get_settings
from app.db import Base, get_engine, set_database_url
from app.main import create_app


@pytest.fixture(autouse=True)
async def reset_database(tmp_path, monkeypatch) -> AsyncGenerator[None, None]:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("FIRST_USER_IS_ADMIN", "false")
    monkeypatch.setenv("TURNSTILE_ENABLED", "false")

    get_settings.cache_clear()
    set_database_url(database_url)

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client
