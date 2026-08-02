from datetime import datetime, time  # Границы периода для аналитики
from sqlalchemy import select, func, and_, case  # SQL-выражения и агрегаты
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from models.orders_models import (  # Модели заказов и отзывов
    CustomerOrderCancellation,
    ExecutorOrderCancellation,
    Order,
    Review,
    StatusOrderCustomer,
)


def _period_bounds(start_date, end_date):  # Начало и конец календарного периода
    start_dt = datetime.combine(start_date, time.min)  # 00:00:00 первого дня
    end_dt = datetime.combine(end_date, time.max)  # 23:59:59 последнего дня
    return start_dt, end_dt


async def get_orders_count_by_period(
    session: AsyncSession, user_id: int, start_date, end_date
):  # Количество заказов заказчика за период
    start_dt, end_dt = _period_bounds(start_date, end_date)

    stmt = select(func.count(Order.id)).where(  # COUNT заказов
        Order.customer_id == user_id,
        Order.created_at >= start_dt,
        Order.created_at <= end_dt,
    )
    result = await session.execute(stmt)
    return result.scalar() or 0  # 0, если заказов нет


async def get_orders_money_stats(
    session: AsyncSession, user_id: int, start_date, end_date
):  # Денежная статистика по бюджетам заказов
    start_dt, end_dt = _period_bounds(start_date, end_date)

    stmt = select(
        func.coalesce(func.sum(Order.budget), 0),  # Сумма бюджетов
        func.coalesce(func.avg(Order.budget), 0),  # Средний бюджет
        func.coalesce(func.min(Order.budget), 0),  # Минимальный
        func.coalesce(func.max(Order.budget), 0),  # Максимальный
        func.coalesce(func.max(Order.currency), None),  # Валюта (любая из периода)
    ).where(
        Order.customer_id == user_id,
        Order.created_at >= start_dt,
        Order.created_at <= end_dt,
    )
    result = await session.execute(stmt)
    total_amount, average_amount, min_amount, max_amount, currency = result.one()
    return {
        "total_amount": float(total_amount or 0),
        "average_amount": float(average_amount or 0),
        "min_amount": float(min_amount or 0),
        "max_amount": float(max_amount or 0),
        "currency": currency,
    }


async def get_cancellation_stats(
    session: AsyncSession, user_id: int, start_date, end_date
):  # Статистика отмен заказов пользователем
    start_dt, end_dt = _period_bounds(start_date, end_date)

    customer_stmt = select(func.count(CustomerOrderCancellation.id)).where(  # Отмены как заказчик
        CustomerOrderCancellation.customer_id == user_id,
        CustomerOrderCancellation.created_at >= start_dt,
        CustomerOrderCancellation.created_at <= end_dt,
    )

    executor_stmt = select(func.count(ExecutorOrderCancellation.id)).where(  # Отмены как исполнитель
        ExecutorOrderCancellation.executor_id == user_id,
        ExecutorOrderCancellation.created_at >= start_dt,
        ExecutorOrderCancellation.created_at <= end_dt,
    )

    customer_res = await session.execute(customer_stmt)
    executor_res = await session.execute(executor_stmt)

    customer_count = customer_res.scalar() or 0
    executor_count = executor_res.scalar() or 0

    return {
        "customer_cancellations": customer_count,
        "executor_cancellations": executor_count,
        "total_cancellations": customer_count + executor_count,  # Суммарно
    }


async def get_rating_stats(session: AsyncSession, user_id: int, start_date, end_date):  # Рейтинг и число отзывов
    start_dt, end_dt = _period_bounds(start_date, end_date)

    stmt = select(
        func.coalesce(func.avg(Review.rating), 0),  # Средняя оценка
        func.count(Review.id),  # Количество отзывов
    ).where(
        Review.reviewee_id == user_id,  # Отзывы о данном пользователе
        Review.created_at >= start_dt,
        Review.created_at <= end_dt,
    )
    result = await session.execute(stmt)
    avg_rating, reviews_count = result.one()

    return {
        "average_rating": float(avg_rating or 0),
        "reviews_count": reviews_count or 0,
    }


async def get_order_status_stats(
    session: AsyncSession, user_id: int, start_date, end_date
):  # Распределение заказов по статусам
    start_dt, end_dt = _period_bounds(start_date, end_date)

    total_stmt = select(func.count(Order.id)).where(  # Все заказы за период
        Order.customer_id == user_id,
        Order.created_at >= start_dt,
        Order.created_at <= end_dt,
    )

    completed_stmt = (  # Завершённые заказы
        select(func.count(StatusOrderCustomer.id))
        .select_from(StatusOrderCustomer)
        .join(Order, Order.id == StatusOrderCustomer.order_id)
        .where(
            Order.customer_id == user_id,
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
            StatusOrderCustomer.status == "completed",
        )
    )

    in_progress_stmt = (  # Заказы в работе
        select(func.count(StatusOrderCustomer.id))
        .select_from(StatusOrderCustomer)
        .join(Order, Order.id == StatusOrderCustomer.order_id)
        .where(
            Order.customer_id == user_id,
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
            StatusOrderCustomer.status == "in_progress",
        )
    )

    cancelled_stmt = (  # Отменённые заказы
        select(func.count(StatusOrderCustomer.id))
        .select_from(StatusOrderCustomer)
        .join(Order, Order.id == StatusOrderCustomer.order_id)
        .where(
            Order.customer_id == user_id,
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
            StatusOrderCustomer.status == "cancelled",
        )
    )

    total_res = await session.execute(total_stmt)
    completed_res = await session.execute(completed_stmt)
    in_progress_res = await session.execute(in_progress_stmt)
    cancelled_res = await session.execute(cancelled_stmt)

    return {
        "total_orders": total_res.scalar() or 0,
        "completed_orders": completed_res.scalar() or 0,
        "in_progress_orders": in_progress_res.scalar() or 0,
        "cancelled_orders": cancelled_res.scalar() or 0,
    }
