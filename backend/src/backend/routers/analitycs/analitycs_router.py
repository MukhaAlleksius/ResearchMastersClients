from datetime import date  # Дата периода аналитики
from fastapi import APIRouter, Depends, Query, HTTPException  # Роутер, DI, query, ошибки
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.auth import get_current_user  # Текущий пользователь из JWT
from core.config import get_db  # Зависимость сессии БД
from cruds.analitycs.analitycs_users_crud import (  # CRUD аналитики пользователя
    get_cancellation_stats,  # Статистика отмен
    get_order_status_stats,  # Статистика статусов заказов
    get_orders_money_stats,  # Денежная статистика
    get_rating_stats,  # Статистика рейтингов
)
from schemas.analitycs.analitycs_schemas import AnalyticsSummaryOut  # Схема сводки
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя


router = APIRouter(prefix="/analytics", tags=["Analytics"])  # Роутер аналитики


@router.get("/summary", response_model=AnalyticsSummaryOut)  # GET сводка за период
async def get_analytics_summary(
    start_date: date = Query(...),  # Начало периода (обязательно)
    end_date: date = Query(...),  # Конец периода (обязательно)
    session: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    if start_date > end_date:  # Некорректный диапазон дат
        raise HTTPException(  # 400 клиенту
            status_code=400, detail="start_date cannot be greater than end_date"
        )

    user_id = current_user.user_id  # id пользователя для выборок
    orders_stats = await get_order_status_stats(session, user_id, start_date, end_date)  # Заказы по статусам
    money_stats = await get_orders_money_stats(session, user_id, start_date, end_date)  # Суммы по заказам
    cancellation_stats = await get_cancellation_stats(  # Отмены за период
        session, user_id, start_date, end_date
    )
    rating_stats = await get_rating_stats(session, user_id, start_date, end_date)  # Рейтинги за период

    return {  # Сводный ответ API
        "period": {  # Границы периода
            "start_date": start_date,
            "end_date": end_date,
        },
        "orders": orders_stats,  # Блок заказов
        "money": money_stats,  # Блок денег
        "cancellations": cancellation_stats,  # Блок отмен
        "ratings": rating_stats,  # Блок рейтингов
    }
