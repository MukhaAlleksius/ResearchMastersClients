"""Письмо со ссылкой сброса пароля."""

from __future__ import annotations  # Отложенные аннотации типов

import logging  # Если SMTP нет — ссылку пишем в лог

from core.email import build_app_link, send_email  # URL сайта и отправка
from core.tokens import create_password_reset_token  # JWT на 2 часа

logger = logging.getLogger(__name__)


def password_reset_link(token: str) -> str:
    """Ссылка на страницу «новый пароль» с токеном в адресе."""
    return build_app_link(f"/reset-password?token={token}")


async def send_password_reset_email(*, email: str, token: str) -> None:
    """Письмо со ссылкой. Если почта не настроена — ссылка остаётся в логе сервера."""
    link = password_reset_link(token)
    text_body = (
        "Сброс пароля в Fixer.\n\n"
        f"{link}\n\n"
        "Ссылка действует 2 часа. Если вы не запрашивали сброс, просто проигнорируйте письмо."
    )
    html_body = (
        "<!DOCTYPE html><html><body "
        'style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">'
        "<p>Сброс пароля в Fixer.</p>"
        f'<p><a href="{link}">Задать новый пароль</a></p>'
        "<p style=\"color:#6b7280;font-size:12px\">"
        "Ссылка действует 2 часа. Если вы не запрашивали сброс, просто проигнорируйте письмо.</p>"
        "</body></html>"
    )
    sent = await send_email(
        to_email=email,
        subject="Сброс пароля — Fixer",
        text_body=text_body,
        html_body=html_body,
    )
    if not sent:
        logger.info("Password reset link for %s: %s", email, link)  # Dev: скопировать из лога


def issue_password_reset_token(*, email: str) -> str:
    """Выпустить JWT сброса. Подставляется в ссылку письма."""
    return create_password_reset_token(subject=email)
