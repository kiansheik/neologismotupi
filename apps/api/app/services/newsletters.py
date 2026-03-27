from __future__ import annotations

import html
import secrets
from datetime import date
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.newsletter import NewsletterSubscription

from app.config import get_settings

NEWSLETTER_WORD_OF_DAY = "palavra_do_dia"
DEFAULT_LOCALE = "pt-BR"
SUPPORTED_LOCALES = {"pt-BR", "en-US", "tupi-BR"}


def normalize_locale(locale: str | None) -> str:
    if locale in SUPPORTED_LOCALES:
        return locale
    return DEFAULT_LOCALE


def generate_unsubscribe_token() -> str:
    return secrets.token_urlsafe(32)


def _with_utm(url: str, *, content: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query))
    query.update(
        {
            "utm_source": "newsletter",
            "utm_medium": "email",
            "utm_campaign": NEWSLETTER_WORD_OF_DAY,
            "utm_content": content,
        }
    )
    return urlunparse(parsed._replace(query=urlencode(query)))


def build_entry_url(slug: str, *, content: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return _with_utm(f"{base}/entries/{slug}", content=content)


def build_submit_url(*, content: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return _with_utm(f"{base}/submit", content=content)


def build_home_url(*, content: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return _with_utm(f"{base}/", content=content)


def build_unsubscribe_url(token: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}/unsubscribe?token={token}"


async def get_or_create_subscription(
    db: AsyncSession,
    *,
    user_id,
    newsletter_key: str,
    preferred_locale: str,
) -> NewsletterSubscription:
    subscription = (
        await db.execute(
            select(NewsletterSubscription).where(
                NewsletterSubscription.user_id == user_id,
                NewsletterSubscription.newsletter_key == newsletter_key,
            )
        )
    ).scalar_one_or_none()
    if subscription:
        return subscription

    subscription = NewsletterSubscription(
        user_id=user_id,
        newsletter_key=newsletter_key,
        preferred_locale=normalize_locale(preferred_locale),
        unsubscribe_token=generate_unsubscribe_token(),
        is_active=True,
    )
    db.add(subscription)
    await db.flush()
    return subscription


def _part_of_speech_label(locale: str, part_of_speech: str | None) -> str | None:
    if not part_of_speech:
        return None
    labels = {
        "pt-BR": {
            "noun": "substantivo",
            "verb": "verbo",
            "adjective": "adjetivo",
            "adverb": "advérbio",
            "expression": "expressão",
            "pronoun": "pronome",
            "particle": "partícula",
            "other": "outro",
        },
        "en-US": {
            "noun": "noun",
            "verb": "verb",
            "adjective": "adjective",
            "adverb": "adverb",
            "expression": "expression",
            "pronoun": "pronoun",
            "particle": "particle",
            "other": "other",
        },
    }
    return labels.get(locale, labels["pt-BR"]).get(part_of_speech, part_of_speech)


def _select_gloss(locale: str, gloss_pt: str | None, gloss_en: str | None) -> tuple[str | None, str | None]:
    if locale == "en-US":
        primary = gloss_en or gloss_pt
        secondary = gloss_pt if gloss_en and gloss_pt else None
    else:
        primary = gloss_pt or gloss_en
        secondary = gloss_en if gloss_pt and gloss_en else None
    return primary, secondary


def build_word_of_day_email(
    *,
    locale: str,
    headword: str,
    gloss_pt: str | None,
    gloss_en: str | None,
    part_of_speech: str | None,
    short_definition: str | None,
    morphology_notes: str | None,
    example_sentence: str | None,
    example_translation: str | None,
    entry_url: str,
    submit_url: str,
    home_url: str,
    unsubscribe_url: str,
    display_name: str | None = None,
) -> tuple[str, str, str]:
    locale = normalize_locale(locale)
    primary_gloss, secondary_gloss = _select_gloss(locale, gloss_pt, gloss_en)
    part_label = _part_of_speech_label(locale, part_of_speech)

    if locale == "en-US":
        subject = f"Word of the Day: {headword}"
        greeting = f"Hi {display_name}," if display_name else "Hi,"
        headline = "Word of the Day"
        gloss_label = "Gloss"
        part_label_title = "Part of speech"
        definition_label = "Definition"
        etymology_label = "Etymology"
        example_label = "Example"
        view_label = "View entry"
        cta_intro = "Inspired? Help keep the dictionary alive:"
        cta_submit = "Add your own entry"
        cta_share = "Share the site"
        cta_karma = "Explore entries and earn karma"
        unsubscribe_label = "Unsubscribe"
    else:
        subject = f"Palavra do Dia: {headword}"
        greeting = f"Olá {display_name}," if display_name else "Olá,"
        headline = "Palavra do Dia"
        gloss_label = "Glosa"
        part_label_title = "Classe gramatical"
        definition_label = "Definição"
        etymology_label = "Etimologia"
        example_label = "Exemplo"
        view_label = "Ver verbete"
        cta_intro = "Se esta palavra inspirou você, ajude a manter o dicionário vivo:"
        cta_submit = "Envie seu próprio verbete"
        cta_share = "Compartilhe o site"
        cta_karma = "Explore verbetes e ganhe karma"
        unsubscribe_label = "Cancelar inscrição"

    lines = [greeting, headline, "", f"{view_label}: {entry_url}", ""]
    lines.append(f"{gloss_label}: {primary_gloss or '—'}")
    if secondary_gloss:
        lines.append(f"{gloss_label} (alt): {secondary_gloss}")
    if part_label:
        lines.append(f"{part_label_title}: {part_label}")
    if short_definition:
        lines.append(f"{definition_label}: {short_definition}")
    if morphology_notes:
        lines.append(f"{etymology_label}: {morphology_notes}")
    if example_sentence:
        lines.append(f"{example_label}: {example_sentence}")
        if example_translation:
            lines.append(example_translation)
    lines.append("")
    lines.append(cta_intro)
    lines.append(f"- {cta_submit}: {submit_url}")
    lines.append(f"- {cta_share}: {home_url}")
    lines.append(f"- {cta_karma}: {entry_url}")
    lines.append("")
    lines.append(f"{unsubscribe_label}: {unsubscribe_url}")
    text_body = "\n".join(lines)

    def esc(value: str | None) -> str:
        return html.escape(value or "")

    html_body = f"""
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f1e8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
    <div style="max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#fff;border:1px solid #e3d6c1;border-radius:14px;padding:24px;">
        <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">{esc(greeting)}</p>
        <div style="margin:0 0 10px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a6b3a;font-weight:700;">
          {esc(headline)}
        </div>
        <h1 style="margin:0 0 8px;font-size:24px;color:#2c3e29;">{esc(headword)}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">
          <a href="{esc(entry_url)}" style="color:#2f6f3e;text-decoration:none;font-weight:600;">{esc(view_label)}</a>
        </p>

        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#6b7280;">{esc(gloss_label)}</td><td style="padding:6px 0;color:#111827;">{esc(primary_gloss or '—')}</td></tr>
          {f'<tr><td style="padding:6px 0;color:#6b7280;">{esc(gloss_label)} (alt)</td><td style="padding:6px 0;color:#111827;">{esc(secondary_gloss)}</td></tr>' if secondary_gloss else ''}
          {f'<tr><td style="padding:6px 0;color:#6b7280;">{esc(part_label_title)}</td><td style="padding:6px 0;color:#111827;">{esc(part_label)}</td></tr>' if part_label else ''}
          {f'<tr><td style="padding:6px 0;color:#6b7280;">{esc(definition_label)}</td><td style="padding:6px 0;color:#111827;">{esc(short_definition)}</td></tr>' if short_definition else ''}
          {f'<tr><td style="padding:6px 0;color:#6b7280;">{esc(etymology_label)}</td><td style="padding:6px 0;color:#111827;">{esc(morphology_notes)}</td></tr>' if morphology_notes else ''}
        </table>

        {f'''
        <div style="margin:16px 0 0;padding:12px 14px;background:#f9f4ea;border-radius:10px;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">{esc(example_label)}</div>
          <div style="font-size:14px;color:#111827;">{esc(example_sentence)}</div>
          {f'<div style="font-size:12px;color:#6b7280;margin-top:6px;">{esc(example_translation)}</div>' if example_translation else ''}
        </div>
        ''' if example_sentence else ''}

        <div style="margin-top:20px;padding:16px;border:1px solid #e6dccb;border-radius:12px;background:#fbf7ef;">
          <p style="margin:0 0 12px;font-size:14px;color:#4b5563;">{esc(cta_intro)}</p>
          <a href="{esc(submit_url)}" style="display:block;margin:0 0 10px;padding:12px 14px;background:#2f6f3e;color:#fff;text-decoration:none;text-align:center;border-radius:9px;font-weight:700;">{esc(cta_submit)}</a>
          <a href="{esc(home_url)}" style="display:block;margin:0 0 10px;padding:12px 14px;background:#c58b3b;color:#fff;text-decoration:none;text-align:center;border-radius:9px;font-weight:700;">{esc(cta_share)}</a>
          <a href="{esc(entry_url)}" style="display:block;padding:12px 14px;background:#f3e7d4;color:#6a4b1b;text-decoration:none;text-align:center;border-radius:9px;font-weight:700;border:1px solid #e6dccb;">{esc(cta_karma)}</a>
        </div>
      </div>

      <p style="margin:16px 0 0;font-size:12px;color:#9aa3af;text-align:center;">
        <a href="{esc(unsubscribe_url)}" style="color:#9aa3af;">{esc(unsubscribe_label)}</a>
      </p>
    </div>
  </body>
</html>
"""

    return subject, text_body, html_body
