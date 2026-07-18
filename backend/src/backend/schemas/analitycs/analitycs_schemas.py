from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class DateRangeIn(BaseModel):
    start_date: date
    end_date: date


class PeriodStatsOut(BaseModel):
    total_orders: int
    completed_orders: int
    in_progress_orders: int
    cancelled_orders: int


class MoneyStatsOut(BaseModel):
    total_amount: float = Field(default=0)
    average_amount: float = Field(default=0)
    min_amount: float = Field(default=0)
    max_amount: float = Field(default=0)
    currency: Optional[str] = None


class CancellationStatsOut(BaseModel):
    customer_cancellations: int
    executor_cancellations: int
    total_cancellations: int


class RatingStatsOut(BaseModel):
    average_rating: float = Field(default=0)
    reviews_count: int = Field(default=0)


class AnalyticsSummaryOut(BaseModel):
    period: DateRangeIn
    orders: PeriodStatsOut
    money: MoneyStatsOut
    cancellations: CancellationStatsOut
    ratings: RatingStatsOut
