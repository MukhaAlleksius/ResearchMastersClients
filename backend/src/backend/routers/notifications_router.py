import logging  # Логирование ошибок уведомлений

from fastapi import APIRouter, Depends, HTTPException, Query  # Роутер, DI, ошибки, query
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.auth import get_current_user  # Текущий пользователь из JWT
from core.config import get_db  # Зависимость сессии БД
from cruds.notifications_crud import (  # CRUD уведомлений
    acknowledge_notification,  # Подтверждение/реакция на уведомление
    get_user_notifications,  # Список уведомлений пользователя
    mark_all_notifications_read,  # Прочитать все
    mark_notification_read,  # Прочитать одно
)
from schemas.orders_schemas import (  # Схемы уведомлений
    NotificationAcknowledgeResponseSchema,  # Ответ на acknowledge
    NotificationAcknowledgeSchema,  # Тело реакции
    NotificationListResponseSchema,  # Список с счётчиком
    NotificationSchema,  # Одно уведомление
)
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя

router = APIRouter(prefix="", tags=["notifications"])  # Роутер уведомлений

logger = logging.getLogger(__name__)  # Логгер модуля


@router.get("/notifications", response_model=NotificationListResponseSchema)  # GET список уведомлений
async def list_notifications_api(
    unread_only: bool = Query(False, description="Только непрочитанные"),  # Фильтр непрочитанных
    limit: int = Query(50, ge=1, le=100),  # Лимит записей
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    try:
        items, unread_count = await get_user_notifications(  # Загрузка из CRUD
            db=db,
            user_id=current_user.user_id,
            unread_only=unread_only,
            limit=limit,
        )
        return NotificationListResponseSchema(  # Ответ со списком и счётчиком
            items=[NotificationSchema.model_validate(item) for item in items],  # ORM → схема
            unread_count=unread_count,  # Число непрочитанных
        )
    except HTTPException:
        raise  # Пробрасываем HTTP-ошибки
    except Exception as exc:
        logger.error(  # Логируем неожиданную ошибку
            "list_notifications error user_id=%s: %s",
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка загрузки уведомлений") from exc  # 500 клиенту


@router.patch("/notifications/{notification_id}/read", response_model=NotificationSchema)  # PATCH прочитано
async def mark_notification_read_api(
    notification_id: int,  # id уведомления
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    try:
        notification = await mark_notification_read(  # Помечаем прочитанным в CRUD
            db=db,
            notification_id=notification_id,
            user_id=current_user.user_id,
        )
        await db.commit()  # Фиксируем транзакцию
        return NotificationSchema.model_validate(notification)  # Обновлённое уведомление
    except HTTPException:
        raise  # Ошибки доступа/404
    except Exception as exc:
        await db.rollback()  # Откат при сбое
        logger.error(
            "mark_notification_read error id=%s user_id=%s: %s",
            notification_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка обновления уведомления") from exc


@router.post(  # POST реакция на уведомление (acknowledge)
    "/notifications/{notification_id}/acknowledge",
    response_model=NotificationAcknowledgeResponseSchema,
)
async def acknowledge_notification_api(
    notification_id: int,  # id уведомления
    payload: NotificationAcknowledgeSchema,  # Реакция пользователя
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    try:
        deleted_id = await acknowledge_notification(  # Сохраняем реакцию / удаляем
            db=db,
            notification_id=notification_id,
            user_id=current_user.user_id,
            reaction=payload.reaction,
        )
        await db.commit()  # Фиксируем изменения
        return NotificationAcknowledgeResponseSchema(  # Подтверждение удаления
            deleted=True,
            notification_id=deleted_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()  # Откат транзакции
        logger.error(
            "acknowledge_notification error id=%s user_id=%s: %s",
            notification_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка сохранения реакции") from exc


@router.post("/notifications/read_all")  # POST прочитать все уведомления
async def mark_all_notifications_read_api(
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    try:
        updated = await mark_all_notifications_read(  # Массовая пометка в CRUD
            db=db, user_id=current_user.user_id
        )
        await db.commit()  # Сохраняем в БД
        return {"updated": updated}  # Число обновлённых записей
    except Exception as exc:
        await db.rollback()  # Откат при ошибке
        logger.error(
            "mark_all_notifications_read error user_id=%s: %s",
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка обновления уведомлений") from exc
