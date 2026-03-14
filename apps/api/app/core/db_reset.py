import asyncio

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings


def _quote_identifier(identifier: str) -> str:
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


async def reset_database() -> None:
    database_url = get_settings().database_url
    parsed_url = make_url(database_url)
    target_db_name = parsed_url.database
    if not target_db_name:
        raise ValueError("DATABASE_URL must include a database name")

    admin_db_name = "postgres" if target_db_name != "postgres" else "template1"
    admin_url = parsed_url.set(database=admin_db_name)

    engine = create_async_engine(
        admin_url.render_as_string(hide_password=False),
        isolation_level="AUTOCOMMIT",
    )

    quoted_target = _quote_identifier(target_db_name)
    terminate_sql = text(
        """
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = :target_db
          AND pid <> pg_backend_pid()
        """
    )

    try:
        async with engine.connect() as conn:
            await conn.execute(terminate_sql, {"target_db": target_db_name})
            await conn.execute(text(f"DROP DATABASE IF EXISTS {quoted_target}"))
            await conn.execute(text(f"CREATE DATABASE {quoted_target}"))
    finally:
        await engine.dispose()

    print(f"Reset database: {target_db_name}")


if __name__ == "__main__":
    asyncio.run(reset_database())
