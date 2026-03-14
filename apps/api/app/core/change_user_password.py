import asyncio
import sys

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.models.user import User
from app.security import hash_password


async def change_user_password(email: str, new_password: str) -> None:
    normalized_email = email.strip().lower()
    if not normalized_email:
        raise SystemExit("Email cannot be empty.")
    if len(new_password) < 8:
        raise SystemExit("Password must be at least 8 characters.")

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == normalized_email))).scalar_one_or_none()
        if user is None:
            raise SystemExit(f"User not found: {normalized_email}")

        user.hashed_password = hash_password(new_password)
        await db.commit()

    print(f"Password updated for: {normalized_email}")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python -m app.core.change_user_password <email> <new_password>")
    asyncio.run(change_user_password(sys.argv[1], sys.argv[2]))


if __name__ == "__main__":
    main()
