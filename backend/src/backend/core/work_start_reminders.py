"""Фоновые письма: завтра начало работ и снятие заказа с публикации."""

import asyncio  # Паузы и отмена цикла
import logging  # Запись в лог, если рассылка упала
import os  # Интервал из переменной окружения

from core.database import async_session_maker  # Сессия БД для фоновой задачи
from cruds.notifications_crud import (
    send_expired_listing_notices,  # Заказы, у которых вышел срок размещения
    send_upcoming_work_start_reminders,  # Напоминание за день до старта
)

logger = logging.getLogger(__name__)  # Логгер этого модуля

_INTERVAL_SEC = int(os.getenv("WORK_START_REMINDER_INTERVAL_SEC", "3600"))  # По умолчанию раз в час
_STARTUP_DELAY_SEC = 15  # Подождать после старта API, чтобы БД успела подняться


async def run_work_start_reminder_loop() -> None:
    """Раз в час: завтра начало работ; истёк срок размещения заказа."""
    await asyncio.sleep(_STARTUP_DELAY_SEC)  # Не долбить БД в первую секунду запуска
    while True:  # Бесконечный цикл, пока жив процесс
        try:
            async with async_session_maker() as session:  # Отдельная сессия на проход
                sent = await send_upcoming_work_start_reminders(session)  # Письма «завтра работы»
                expired = await send_expired_listing_notices(session)  # Снять просроченные с каталога
                await session.commit()  # Сохранить уведомления / смену статуса
                if sent:
                    logger.info("work start reminders sent count=%s", sent)
                if expired:
                    logger.info("listing expired notices sent count=%s", expired)
        except asyncio.CancelledError:  # Сервер останавливается
            raise  # Не глотаем отмену
        except Exception:
            logger.exception("work start reminders failed")  # Ошибка прохода — цикл продолжается
        await asyncio.sleep(max(_INTERVAL_SEC, 60))  # Пауза не короче минуты
