"""Email verification on registration."""  # Подтверждение email при регистрации

from __future__ import annotations  # Отложенные аннотации типов

import logging  # Логирование (пока вместо SMTP)

from sqlalchemy import select  # SELECT для поиска пользователя
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.config import PUBLIC_API_URL, REQUIRE_EMAIL_VERIFICATION  # Базовый URL API и флаг обязательности
from core.tokens import create_email_verification_token  # JWT для ссылки подтверждения
from models.users_models import User  # ORM-модель пользователя

logger = logging.getLogger(__name__)  # Логгер этого модуля


def verification_link(token: str) -> str:  # Собирает URL подтверждения email
    return f"{PUBLIC_API_URL}/verify-email?token={token}"  # Ссылка с токеном в query


async def send_verification_email(*, email: str, token: str) -> None:  # «Отправка» письма (пока в лог)
    link = verification_link(token)  # Готовим ссылку
    # SMTP can be wired later; in dev the link is logged for manual testing.
    logger.info("Email verification link for %s: %s", email, link)  # Пишем ссылку в лог для ручного теста


async def issue_email_verification(db: AsyncSession, user: User) -> None:  # Выпускает письмо/ссылку при регистрации
    if user.is_verified or not REQUIRE_EMAIL_VERIFICATION:  # Уже подтверждён или проверка выключена
        return  # Ничего не делаем
    token = create_email_verification_token(subject=user.email)  # JWT с email в subject
    await send_verification_email(email=user.email, token=token)  # Отправляем (логируем) ссылку


async def verify_user_email(db: AsyncSession, *, email: str) -> User:  # Помечает пользователя как подтверждённого
    result = await db.execute(select(User).where(User.email == email))  # Ищем пользователя по email
    user = result.scalar_one_or_none()  # Один пользователь или None
    if not user:  # Не найден
        raise ValueError("User not found")  # Ошибка вызывающему коду
    user.is_verified = True  # Ставим флаг подтверждения
    await db.commit()  # Сохраняем в БД
    await db.refresh(user)  # Обновляем объект из БД
    return user  # Возвращаем пользователя
