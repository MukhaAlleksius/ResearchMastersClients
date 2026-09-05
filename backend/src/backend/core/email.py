"""Transactional email via SMTP. Without SMTP settings the letter is logged."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

from core.config import (
    PUBLIC_APP_URL,
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
    return bool(SMTP_HOST and SMTP_FROM_EMAIL)


def build_app_link(action_path: Optional[str]) -> str:
    if not action_path:
        return PUBLIC_APP_URL
    if action_path.startswith("http://") or action_path.startswith("https://"):
        return action_path
    path = action_path if action_path.startswith("/") else f"/{action_path}"
    return f"{PUBLIC_APP_URL}{path}"


def _from_header() -> str:
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
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _from_header()
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
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
            smtp.starttls(context=context)
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
        logger.info("Email body for %s:\n%s", recipient, text_body)
        return False

    try:
        await asyncio.to_thread(
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
