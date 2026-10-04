"""Письмо пользователю о блокировке аккаунта."""

from __future__ import annotations  # Отложенные аннотации типов

import logging  # Ошибку отправки пишем в лог, запрос не роняем
from typing import Any  # Пользователь приходит как ORM-объект

from core.access import blocked_account_detail  # Текст: причина и срок блокировки
from core.email import send_email  # SMTP или запись в лог

logger = logging.getLogger(__name__)  # Логгер этого модуля


def _block_email_text(detail: dict[str, Any]) -> str:
    """Собирает простой текст письма из структуры блокировки."""
    parts = [detail.get("message") or "Аккаунт заблокирован"]  # Первая фраза
    reason = (detail.get("reason") or "").strip()  # Почему заблокировали
    if reason:
        parts.append(f"Причина: {reason}.")
    until = detail.get("blocked_until")  # Дата окончания, если временная
    if until:
        parts.append(f"Срок блокировки: до {until}.")
    else:
        parts.append("Блокировка без срока.")  # Постоянная
    return " ".join(parts)


async def notify_account_blocked(user: Any) -> None:
    """Письмо на почту: аккаунт заблокирован. Ошибки отправки не роняют запрос."""
    email = getattr(user, "email", None)  # Кому слать
    if not email:
        return  # Без email некуда
    detail = blocked_account_detail(user)  # Причина и срок из записи пользователя
    try:
        await send_email(
            to_email=email,
            subject="Ваш аккаунт заблокирован",
            text_body=_block_email_text(detail),
        )
    except Exception as error:
        logger.warning(  # Админ уже сохранил блок, письмо — дополнительное
            "notify account blocked failed user_id=%s: %s",
            getattr(user, "id", None),
            error,
        )
