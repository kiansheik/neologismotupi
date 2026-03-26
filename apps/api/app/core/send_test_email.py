import asyncio
import sys
from datetime import UTC, datetime

from app.services.email_delivery import send_email


async def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python -m app.core.send_test_email <to_email>")

    to_email = sys.argv[1].strip()
    if not to_email:
        raise SystemExit("Recipient email cannot be empty")

    now = datetime.now(UTC).isoformat()
    await send_email(
        to_email=to_email,
        subject="Teste de e-mail - Dicionário de Tupi",
        body=(
            "Este e-mail confirma que a configuração SMTP está funcionando.\n\n"
            f"Timestamp (UTC): {now}\n"
        ),
    )
    print(f"Test email sent to {to_email}.")


if __name__ == "__main__":
    asyncio.run(main())
