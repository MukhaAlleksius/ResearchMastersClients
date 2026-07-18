from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, condecimal, field_validator

TwoDigitsDecimal = Annotated[Decimal, Field(max_digits=12, decimal_places=2)]


class WorkEstimateSchema(BaseModel):
    user_id: int
    order_id: int
    name_work: str
    quantity: TwoDigitsDecimal
    unit_measurement: str = Field(..., max_length=100)
    cost_unit: TwoDigitsDecimal
    currency: str = Field(..., max_length=100)


class WorkEstimateReadSchema(WorkEstimateSchema):
    id: int
    done_quantity: Optional[TwoDigitsDecimal] = None

    class Config:
        from_attributes = True


class WorkEstimateUpdateSchema(BaseModel):
    name_work: Optional[str] = None
    quantity: Optional[TwoDigitsDecimal] = None
    unit_measurement: Optional[str] = Field(None, max_length=100)
    cost_unit: Optional[TwoDigitsDecimal] = None
    currency: Optional[str] = Field(None, max_length=100)


class MaterialEstimateSchema(BaseModel):
    work_estimate_id: int
    name_material: str
    quantity: TwoDigitsDecimal
    unit_measurement: str = Field(..., max_length=100)
    cost_unit: TwoDigitsDecimal
    currency: str = Field(..., max_length=100)


class MaterialEstimateReadSchema(MaterialEstimateSchema):
    id: int

    class Config:
        from_attributes = True


# ✅ НОВАЯ модель - работа + материалы
class WorkEstimateFullReadSchema(WorkEstimateReadSchema):
    materials: list[MaterialEstimateReadSchema] = []


# ✅ Обертка с итогами
class EstimateTotals(BaseModel):
    works_total: float
    materials_total: float
    grand_total: float


class FullEstimateResponse(BaseModel):
    works: list[WorkEstimateFullReadSchema] = []
    totals: EstimateTotals


class GraphicWorksSchema(BaseModel):
    user_id: Optional[int] = None
    order_id: Optional[int] = None
    name_work: str
    quantity: float
    unit_measurement: str = Field(..., max_length=100)
    cost_unit: Optional[float] = None

    # Union[str, date] означает: Pydantic примет и строку, и объект даты.
    # Это решает конфликт, когда бэкенд отдает объект date, а схема ждала строку.
    work_date: Optional[Union[str, date]] = None

    # mode="before" говорит: выполнить этот код ДО того, как Pydantic начнет
    # основную проверку типов.
    @field_validator("work_date", mode="before")
    @classmethod
    def parse_date(cls, v):
        # Если пришел уже объект даты (например, из SQLAlchemy), просто возвращаем его.
        if isinstance(v, date):
            return v

        # Если пришла строка (из JSON запроса), парсим её.
        if isinstance(v, str):
            try:
                # Превращаем "2026-04-30" в объект datetime.date
                return datetime.strptime(v, "%Y-%m-%d").date()
            except ValueError:
                raise ValueError("Дата должна быть в формате YYYY-MM-DD")
        return v

    # ConfigDict(from_attributes=True) позволяет Pydantic читать данные из ORM-моделей
    # (SQLAlchemy). Без этого он не смог бы "достать" данные из объекта БД.
    model_config = ConfigDict(from_attributes=True)


class WorkFromGraphicWorksSchema(BaseModel):
    name_work: str
    quantity: float
    unit_measurement: str = Field(..., max_length=100)


class QuantityWorksFromGraphicWorksSchema(BaseModel):
    quantity: float


class DateGraphicWorkSchema(BaseModel):
    work_date: Union[str, date]
    works: Optional[list[WorkFromGraphicWorksSchema]] = None

    model_config = ConfigDict(from_attributes=True)


class GraphicWorksReadSchema(GraphicWorksSchema):
    id: int
