import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from core.config import get_db
from cruds.notifications_crud import (
    acknowledge_notification,
    get_user_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)
from schemas.orders_schemas import (
    NotificationAcknowledgeResponseSchema,
    NotificationAcknowledgeSchema,
    NotificationListResponseSchema,
    NotificationSchema,
)
from schemas.users_schemas import UserCommonSchema

router = APIRouter(prefix="", tags=["notifications"])

logger = logging.getLogger(__name__)


@router.get("/notifications", response_model=NotificationListResponseSchema)
async def list_notifications_api(
    unread_only: bool = Query(False, description="Только непрочитанные"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        items, unread_count = await get_user_notifications(
            db=db,
            user_id=current_user.user_id,
            unread_only=unread_only,
            limit=limit,
        )
        return NotificationListResponseSchema(
            items=[NotificationSchema.model_validate(item) for item in items],
            unread_count=unread_count,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "list_notifications error user_id=%s: %s",
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка загрузки уведомлений") from exc


@router.patch("/notifications/{notification_id}/read", response_model=NotificationSchema)
async def mark_notification_read_api(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        notification = await mark_notification_read(
            db=db,
            notification_id=notification_id,
            user_id=current_user.user_id,
        )
        await db.commit()
        return NotificationSchema.model_validate(notification)
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "mark_notification_read error id=%s user_id=%s: %s",
            notification_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка обновления уведомления") from exc


@router.post(
    "/notifications/{notification_id}/acknowledge",
    response_model=NotificationAcknowledgeResponseSchema,
)
async def acknowledge_notification_api(
    notification_id: int,
    payload: NotificationAcknowledgeSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        deleted_id = await acknowledge_notification(
            db=db,
            notification_id=notification_id,
            user_id=current_user.user_id,
            reaction=payload.reaction,
        )
        await db.commit()
        return NotificationAcknowledgeResponseSchema(
            deleted=True,
            notification_id=deleted_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "acknowledge_notification error id=%s user_id=%s: %s",
            notification_id,
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка сохранения реакции") from exc


@router.post("/notifications/read_all")
async def mark_all_notifications_read_api(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        updated = await mark_all_notifications_read(
            db=db, user_id=current_user.user_id
        )
        await db.commit()
        return {"updated": updated}
    except Exception as exc:
        await db.rollback()
        logger.error(
            "mark_all_notifications_read error user_id=%s: %s",
            current_user.user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Ошибка обновления уведомлений") from exc
