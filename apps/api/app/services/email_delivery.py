from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from urllib.parse import quote

from app.config import get_settings

logger = logging.getLogger(__name__)


def _build_address(from_email: str, from_name: str | None) -> str:
    if not from_name:
        return from_email
    return f"{from_name} <{from_email}>"


def _send_smtp(*, to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP is not fully configured")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _build_address(settings.smtp_from_email, settings.smtp_from_name)
    message["To"] = to_email
    sender_domain = settings.smtp_from_email.split("@", maxsplit=1)[1]
    message["Message-ID"] = make_msgid(domain=sender_domain)
    message["Date"] = formatdate(localtime=True)
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def send_email(*, to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if settings.email_delivery == "smtp":
        await asyncio.to_thread(_send_smtp, to_email=to_email, subject=subject, body=body)
        return

    # Fallback mode for local/dev: logs include recovery links.
    logger.info("Email(log mode) to=%s subject=%s body=%s", to_email, subject, body)


def _public_url(path: str, token: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}{path}?token={quote(token)}"


async def send_password_reset_email(*, to_email: str, token: str) -> None:
    link = _public_url("/reset-password", token)
    subject = "Redefinir senha - Nheenga Neologismos"
    body = (
        "Recebemos um pedido para redefinir sua senha.\n\n"
        f"Acesse este link para continuar:\n{link}\n\n"
        "Se você não pediu essa alteração, ignore esta mensagem."
    )
    await send_email(to_email=to_email, subject=subject, body=body)


async def send_email_verification_email(*, to_email: str, token: str) -> None:
    link = _public_url("/verify-email", token)
    subject = "Verifique seu e-mail - Nheenga Neologismos"
    body = (
        "Precisamos confirmar seu e-mail antes de continuar.\n\n"
        f"Acesse este link para verificar:\n{link}\n\n"
        "Se você não pediu esta verificação, ignore esta mensagem."
    )
    await send_email(to_email=to_email, subject=subject, body=body)
