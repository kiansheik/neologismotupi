import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import AsyncSessionLocal
from app.models.user import Profile, User
from app.security import hash_password


def _display_name_from_email(email: str) -> str:
    local_part = email.split("@", maxsplit=1)[0]
    cleaned = local_part.replace(".", " ").replace("_", " ").replace("-", " ").strip()
    return cleaned.title()[:120] or "Admin"


async def bootstrap_admin(email: str, password: str, display_name: str | None = None) -> None:
    normalized_email = email.strip().lower()
    if not normalized_email:
        raise SystemExit("Email cannot be empty.")
    if len(password) < 12:
        raise SystemExit("Password must be at least 12 characters for admin bootstrap.")

    resolved_display_name = (display_name or _display_name_from_email(normalized_email)).strip()
    if not resolved_display_name:
        raise SystemExit("Display name cannot be empty.")

    async with AsyncSessionLocal() as db:
        user = (
            await db.execute(
                select(User).where(User.email == normalized_email).options(selectinload(User.profile))
            )
        ).scalar_one_or_none()

        if user is None:
            user = User(
                email=normalized_email,
                hashed_password=hash_password(password),
                is_active=True,
                is_verified=True,
                is_superuser=True,
            )
            db.add(user)
            await db.flush()
            db.add(Profile(user_id=user.id, display_name=resolved_display_name[:120]))
            action = "created"
        else:
            user.hashed_password = hash_password(password)
            user.is_active = True
            user.is_superuser = True
            if user.profile is None:
                db.add(Profile(user_id=user.id, display_name=resolved_display_name[:120]))
            elif display_name:
                user.profile.display_name = resolved_display_name[:120]
            action = "updated"

        await db.commit()

    print(f"Admin user {action}: {normalized_email}")


def main() -> None:
    if len(sys.argv) not in (3, 4):
        raise SystemExit(
            "Usage: python -m app.core.bootstrap_admin <email> <password> [display_name]"
        )
    display_name = sys.argv[3] if len(sys.argv) == 4 else None
    asyncio.run(bootstrap_admin(sys.argv[1], sys.argv[2], display_name))


if __name__ == "__main__":
    main()
