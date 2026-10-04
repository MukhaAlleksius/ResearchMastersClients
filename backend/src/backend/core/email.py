"""Письма через SMTP. Если SMTP не задан — текст письма пишется в лог."""

from __future__ import annotations  # Отложенные аннотации типов

import asyncio  # Отправка в отдельном потоке, чтобы не блокировать API
import logging
import smtplib  # Протокол почты
import ssl  # Шифрование соединения с почтовым сервером
from email.message import EmailMessage  # Письмо: тема, кому, текст/HTML
from typing import Optional

from core.config import (
    PUBLIC_APP_URL,  # Базовый адрес сайта для ссылок в письме
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_SSL,
    SMTP_USE_TLS,
    SMTP_USERNAME,
)

logger = logging.getLogger(__name__)


def is_smtp_configured() -> bool:
    """True, если заданы хост и адрес отправителя — можно слать почту."""
    return bool(SMTP_HOST and SMTP_FROM_EMAIL)


def build_app_link(action_path: Optional[str]) -> str:
    """Собирает ссылку на страницу сайта (подтверждение email, сброс пароля)."""
    if not action_path:
        return PUBLIC_APP_URL  # Просто главная
    if action_path.startswith("http://") or action_path.startswith("https://"):
        return action_path  # Уже полный URL
    path = action_path if action_path.startswith("/") else f"/{action_path}"
    return f"{PUBLIC_APP_URL}{path}"


def _from_header() -> str:
    """Строка From: «Fixer <noreply@...>' или только email."""
    if SMTP_FROM_NAME:
        return f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    return SMTP_FROM_EMAIL


def _send_sync(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    """Синхронная отправка (вызывается из потока). SSL или STARTTLS — из настроек."""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _from_header()
    message["To"] = to_email
    message.set_content(text_body)  # Текстовая версия
    if html_body:
        message.add_alternative(html_body, subtype="html")  # Красивая версия для почты

    context = ssl.create_default_context()  # Проверка сертификата SMTP
    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(
            SMTP_HOST, SMTP_PORT, timeout=20, context=context
        ) as smtp:
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
        return

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls(context=context)  # Обычный порт 587
        if SMTP_USERNAME:
            smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)


async def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> bool:
    """Отправить письмо. True — ушло. False — нет SMTP / битый адрес / ошибка сервера."""
    recipient = (to_email or "").strip()
    if not recipient or "@" not in recipient:
        logger.warning("Skip email: invalid recipient %r", to_email)
        return False

    if not is_smtp_configured():
        logger.warning(
            "SMTP is not configured; email to %s was not sent: %s",
            recipient,
            subject,
        )
        logger.info("Email body for %s:\n%s", recipient, text_body)  # Дома читаете лог
        return False

    try:
        await asyncio.to_thread(  # Не блокировать FastAPI, пока идёт SMTP
            _send_sync,
            to_email=recipient,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )
        logger.info("Email sent to %s: %s", recipient, subject)
        return True
    except Exception as error:
        logger.warning("Email failed to %s (%s): %s", recipient, subject, error)
        return False
