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


def _send_smtp(*, to_email: str, subject: str, body: str, html_body: str | None = None) -> None:
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
    if html_body:
        message.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def send_email(
    *,
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    settings = get_settings()
    if settings.email_delivery == "smtp":
        await asyncio.to_thread(
            _send_smtp, to_email=to_email, subject=subject, body=body, html_body=html_body
        )
        return

    # Fallback mode for local/dev: logs include recovery links.
    logger.info(
        "Email(log mode) to=%s subject=%s body=%s html=%s",
        to_email,
        subject,
        body,
        "yes" if html_body else "no",
    )


def _public_url(path: str, token: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}{path}?token={quote(token)}"


async def send_password_reset_email(*, to_email: str, token: str) -> None:
    link = _public_url("/reset-password", token)
    subject = "Redefinir senha - Dicionário de Tupi"
    body = (
        "Recebemos um pedido para redefinir sua senha.\n\n"
        f"Acesse este link para continuar:\n{link}\n\n"
        "Se você não pediu essa alteração, ignore esta mensagem."
    )
    await send_email(to_email=to_email, subject=subject, body=body)


async def send_email_verification_email(*, to_email: str, token: str) -> None:
    link = _public_url("/verify-email", token)
    subject = "Verifique seu e-mail - Dicionário de Tupi"
    body = (
        "Precisamos confirmar seu e-mail antes de continuar.\n\n"
        f"Acesse este link para verificar:\n{link}\n\n"
        "Se você não pediu esta verificação, ignore esta mensagem."
    )
    await send_email(to_email=to_email, subject=subject, body=body)


def _entry_url(slug: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}/entries/{quote(slug)}"


def _flashcards_url() -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}/games/flashcards"


async def send_entry_moderation_email(
    *,
    to_email: str,
    headword: str,
    slug: str,
    approved: bool,
    reason: str | None = None,
) -> None:
    link = _entry_url(slug)
    if approved:
        subject = f"Seu verbete foi aprovado - {headword}"
        body = (
            "Seu verbete foi aprovado pela moderação.\n\n"
            f"Verbete: {headword}\n"
            f"Link: {link}\n\n"
            "Obrigado por contribuir."
        )
    else:
        subject = f"Seu verbete foi rejeitado - {headword}"
        reason_line = reason.strip() if reason and reason.strip() else "Sem motivo informado."
        body = (
            "Seu verbete foi rejeitado pela moderação.\n\n"
            f"Verbete: {headword}\n"
            f"Link: {link}\n"
            f"Motivo: {reason_line}\n\n"
            "Você pode revisar a proposta e enviar uma nova versão."
        )

    await send_email(to_email=to_email, subject=subject, body=body)


async def send_comment_notification_email(
    *,
    to_email: str,
    actor_display_name: str,
    entry_headword: str,
    entry_slug: str,
    comment_body: str,
    is_mention: bool,
) -> None:
    link = _entry_url(entry_slug)
    subject = (
        f"{actor_display_name} mencionou você em {entry_headword}"
        if is_mention
        else f"Novo comentário em {entry_headword}"
    )
    body = (
        f"Verbete: {entry_headword}\n"
        f"Link: {link}\n\n"
        f"Comentário:\n{comment_body}\n\n"
        "Acesse o verbete para continuar a conversa."
    )
    await send_email(to_email=to_email, subject=subject, body=body)


async def send_flashcard_reminder_email(*, to_email: str, locale: str | None = None) -> None:
    link = _flashcards_url()
    is_en = (locale or "").lower().startswith("en")
    if is_en:
        subject = "Reminder: time for your flashcards"
        body = (
            "You asked to be reminded to study flashcards today.\n\n"
            f"Open your deck here:\n{link}\n\n"
            "Keep going — a little every day adds up."
        )
    else:
        subject = "Lembrete: hora de revisar seus flashcards"
        body = (
            "Você pediu para ser lembrado de estudar flashcards hoje.\n\n"
            f"Acesse aqui:\n{link}\n\n"
            "Um pouco por dia faz diferença."
        )

    await send_email(to_email=to_email, subject=subject, body=body)
