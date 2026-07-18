from datetime import date
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from core.config import get_db
from cruds.analitycs.analitycs_users_crud import (
    get_cancellation_stats,
    get_order_status_stats,
    get_orders_money_stats,
    get_rating_stats,
)
from schemas.analitycs.analitycs_schemas import AnalyticsSummaryOut
from schemas.users_schemas import UserCommonSchema


router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/summary", response_model=AnalyticsSummaryOut)
async def get_analytics_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    session: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    if start_date > end_date:
        raise HTTPException(
            status_code=400, detail="start_date cannot be greater than end_date"
        )

    user_id = current_user.user_id
    orders_stats = await get_order_status_stats(session, user_id, start_date, end_date)
    money_stats = await get_orders_money_stats(session, user_id, start_date, end_date)
    cancellation_stats = await get_cancellation_stats(
        session, user_id, start_date, end_date
    )
    rating_stats = await get_rating_stats(session, user_id, start_date, end_date)

    return {
        "period": {
            "start_date": start_date,
            "end_date": end_date,
        },
        "orders": orders_stats,
        "money": money_stats,
        "cancellations": cancellation_stats,
        "ratings": rating_stats,
    }
