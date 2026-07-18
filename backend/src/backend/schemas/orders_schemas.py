from datetime import datetime
from decimal import Decimal
import re
from typing import Dict, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, validator


# валидатор для предоставления информации пользователю в карточках
class OrderActivitySignals(BaseModel):
    unread_messages: int = 0
    pending_cancel: bool = False
    responses_count: int = 0
    responses_latest_id: int = 0
    estimate_count_other: int = 0
    estimate_max_id: int = 0
    schedule_count_other: int = 0
    schedule_max_id: int = 0
    contract_other_signed: bool = False
    contract_viewer_signed: bool = False
    contract_updated_at: Optional[datetime] = None
    order_unavailable: bool = False
    order_updated_at: Optional[datetime] = None
    response_updated_at: Optional[datetime] = None
    assigned_response_latest_id: int = 0
    unread_complaint_messages: int = 0
    complaint_latest_id: int = 0
    payment_latest_id: int = 0
    payment_updated_at: Optional[datetime] = None
    review_latest_id: int = 0
    customer_info_max_id: int = 0
    executor_info_max_id: int = 0


class OrderServiceSchema(BaseModel):
    id: int
    category_work: str = Field(
        ..., max_length=200, description="Название категории работ"
    )
    title: str = Field(..., max_length=200, description="Название задания")
    # status: str = Field(..., max_length=20, description="Статус заказа")
    budget: Optional[float]
    created_at: Optional[datetime]


# валидатор для предоставления информации пользователю в карточках
class OrderUserSchema(OrderServiceSchema):
    executor_name: Optional[str] = Field(
        None, max_length=100, description="Имя исполнителя"
    )
    category_work_id: Optional[int] = None
    executor_id: Optional[int] = None
    status_order_customer: Optional[str] = Field(None)
    activity: Optional[OrderActivitySignals] = None


# валидатор для предоставления информации пользователю в карточках
class ServiceUserSchema(OrderServiceSchema):
    customer_id: Optional[int] = Field(None, description="ID заказчика")
    customer_name: Optional[str] = Field(
        None, max_length=100, description="Имя заказчика"
    )
    status_service_executor: Optional[str] = Field(None)
    activity: Optional[OrderActivitySignals] = None


# ✅ Валидатор для создания заказа
class OrderCreateSchema(BaseModel):
    category_work: str = Field(
        ..., max_length=200, description="Название категории работ"
    )
    title: str = Field(..., max_length=200, description="Название задания")
    description: str = Field(
        None, max_length=1000, description="Описание задания"
    )  # ✅ Добавлен лимит
    customer_id: int = Field(..., gt=0, description="ID заказчика")
    budget: Optional[float] = Field(None, ge=0, description="Бюджет")
    currency: str = Field(default="BYN", max_length=3, description="Валюта")
    budget_type: Optional[str] = Field(
        None, max_length=20, description="Тип бюджета (fixed/hourly)"
    )  # ✅ Optional!
    urgency_level: str = Field(..., max_length=20, description="Уровень срочности")
    country: str = Field(..., max_length=100, description="Страна")
    region: str = Field(..., max_length=100, description="Регион")
    town: str = Field(..., max_length=100, description="Город")
    location: Optional[str] = Field(None, max_length=200, description="Точный адрес")
    deadline: str = Field(..., max_length=100, description="Срок выполнения")
    insurance_required: Optional[bool] = Field(
        default=False, description="Требуется страховка"
    )


# ✅ Валидатор для обновления заказа заказчиком
class OrderUpdateSchema(OrderCreateSchema):
    category_work_id: Optional[int] = Field(
        None, gt=0, description="ID категории работ"
    )

    model_config = ConfigDict(extra="ignore")


# ✅ Валидатор для чтения заказа
class OrderReadSchema(OrderCreateSchema):
    id: int = Field(..., gt=0, description="ID заказа")
    executor_id: Optional[int] = None
    category_work_id: int = Field(None, gt=0, description="ID категории работ")
    created_at: datetime = Field(..., description="Дата создания")
    updated_at: datetime = Field(..., description="Дата обновления")

    model_config = ConfigDict(from_attributes=True)  # ✅ Pydantic v2


# валидатор для выбора заказчиком исполнителя для своего заказа
class OrderShowExecutorSchema(BaseModel):
    order_id: int
    executor_id: int


class OrderShowExecutorReadSchema(OrderShowExecutorSchema):
    id: int


# ✅ Схема для INPUT (создание/обновление)
class OrderResponseExecutorSchema(BaseModel):
    order_id: int
    executor_id: int
    proposed_price: Optional[float] = Field(None, ge=0)
    budget_type: Optional[str] = Field(None, max_length=20)
    currency: Optional[str] = Field(default="BYN", max_length=100)
    estimated_time: Optional[str] = Field(None)
    start_time_work: Optional[str] = Field(None, max_length=10)
    message: Optional[str] = Field(None, max_length=2000)

    @field_validator("start_time_work")
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if not v or not v.strip():
            return None
        date_str = v.strip()
        if re.match(r"^\d{2}\.\d{2}\.\d{2}$", date_str):
            return date_str
        raise ValueError("Формат: dd.mm.yy")


# ✅ Схема для OUTPUT (чтение из БД)
class OrderResponseExecutorReadSchema(BaseModel):
    id: int
    executor_id: int
    executor_name: Optional[Dict[str, str]] = Field(
        None, description="Данные исполнителя {first_name, second_name}"
    )
    proposed_price: Optional[float] = None
    budget_type: Optional[str] = None
    currency: Optional[str] = None
    estimated_time: Optional[str] = None
    start_time_work: Optional[str] = None
    message: Optional[str] = None
    created_at: Optional[datetime] = None  # Дополнение из БД

    @field_validator("start_time_work")
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if not v or not v.strip():
            return None
        date_str = v.strip()
        if re.match(r"^\d{2}\.\d{2}\.\d{2}$", date_str):
            return date_str
        return v  # ✅ Не выбрасываем ошибку для чтения!


# валидатор для добавления статуса заказа пользователя относительно заказчика
class StatusOrderCustomerSchema(BaseModel):
    order_id: int
    customer_id: int
    status: str
    suppress_executor_notification: bool = False


# валидатор для добавления статуса заказа пользователя относительно исполнителя
class StatusOrderExecutorSchema(BaseModel):
    order_id: int
    executor_id: int
    status: str


class ExecutorOrderSchema(BaseModel):
    order_id: int
    executor_id: int


class PhotoOrderSchema(BaseModel):
    order_id: int
    photo_order: str = Field(None, max_length=500)


class InformationAboutCustomerSchema(BaseModel):
    customer_id: int
    executor_id: int
    phone: str = Field(None, max_length=100)
    notification: Optional[str] = None

    class Config:
        from_attributes = True


class InformationAboutCustomerRead(BaseModel):
    name_customer: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    notification: Optional[str] = None

    class Config:
        from_attributes = True


class InformationAboutExecutorRead(BaseModel):
    executor_id: Optional[int] = None
    name_executor: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    notification: Optional[str] = None

    class Config:
        from_attributes = True


class CustomerExecutorListItemSchema(BaseModel):
    executor_id: int
    name_executor: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    notification: Optional[str] = None
    has_saved_info: bool = False


class ExecutorCustomerListItemSchema(BaseModel):
    customer_id: int
    name_customer: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    notification: Optional[str] = None
    has_saved_info: bool = False


class InformationAboutExecutorSchema(BaseModel):
    executor_id: int
    customer_id: int
    phone: str = Field(None, max_length=100)
    notification: Optional[str] = None

    class Config:
        from_attributes = True


class InformationAboutExecuteOrderRead(BaseModel):
    """Статус заказа для исполнителя на этапе «На рассмотрении заказчика»."""

    order_unavailable: bool = False
    unavailability_reason: Optional[str] = None
    customer_chose_another_executor: bool = False
    message: Optional[str] = None
    selected_executor_id: Optional[int] = None
    selected_executor_name: Optional[str] = None


class PaymentSchema(BaseModel):
    order_id: int
    customer_id: int
    executor_id: int
    amount: float  # Сумма платежа
    commission: float  # Комиссия
    currency: str = Field(..., max_length=3)  # Валюта платежа
    status: str = Field(..., max_length=20)  # Статус платежа
    payment_method: str = Field(..., max_length=50)  # Способ оплаты
    transaction_id: int  # Идентификатор транзакции
    created_at: datetime = Field(
        default_factory=datetime.now, description="время отправки сообщения"
    )  # Время создания
    completed_at: datetime = Field(
        default_factory=datetime.now, description="время отправки сообщения"
    )  # Время завершения

    class Config:
        from_attributes = True


class ReviewSchema(BaseModel):
    order_id: int
    reviewer_id: int
    reviewee_id: int
    rating: int
    comment: Optional[str]
    criteria_quality: Optional[int]  # Качество
    criteria_timeliness: Optional[int]  # Своевременность
    criteria_communication: Optional[int]  # Коммуникация
    criteria_price: Optional[int]  # Цена
    is_verified: Optional[bool]  # Проверенный отзыв
    created_at: datetime = Field(
        default_factory=datetime.now, description="время отправки сообщения"
    )

    class Config:
        from_attributes = True


class NotificationSchema(BaseModel):
    id: int
    user_id: int
    title: str = Field(..., max_length=200)
    message: str
    notification_type: str = Field(..., max_length=50)
    is_read: bool = False
    order_id: Optional[int] = None
    order_title: Optional[str] = None
    executor_reaction: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    action_path: Optional[str] = None
    created_at: Optional[datetime] = None

    @field_validator("is_read", mode="before")
    @classmethod
    def normalize_is_read(cls, value):
        return False if value is None else value

    class Config:
        from_attributes = True


class NotificationListResponseSchema(BaseModel):
    items: list[NotificationSchema]
    unread_count: int


class NotificationAcknowledgeSchema(BaseModel):
    reaction: str = Field(
        default="understood",
        max_length=100,
        description="understood | find_other_orders | view_offer | view_wait_execute | open_order",
    )


class NotificationAcknowledgeResponseSchema(BaseModel):
    deleted: bool = True
    notification_id: int


class OrderCardForAdmin(BaseModel):
    id: int
    title: Optional[str] = None
    description: Optional[str] = None
    category_work: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    town: Optional[str] = None
    location: Optional[str] = None
    budget: Optional[float] = None
    currency: Optional[str] = None
    created_at: Optional[datetime] = None
    status_order_customer: Optional[str] = None
    status_service_executor: Optional[str] = None
    status: Optional[str] = None


class OrderProfileForAdmin(OrderReadSchema):
    customer_name: Optional[dict[str, str]] = None
    executor_name: Optional[dict[str, str]] = None
    executor_id: Optional[int] = None
    status_order_customer: Optional[str] = None
    date_start_work: Optional[str] = None
    date_end_work: Optional[str] = None
    budget_contract: Optional[float] = None
    currency_contract: Optional[str] = None


class ServiceProfileForAdmin(OrderReadSchema):
    customer_name: Optional[dict[str, str]] = None
    executor_name: Optional[dict[str, str]] = None
    status_order_executor: Optional[str] = None
    date_start_work: Optional[str] = None
    date_end_work: Optional[str] = None
    budget_contract: Optional[float] = None
    currency_contract: Optional[str] = None


class CustomerOrderCancellationCreateSchema(BaseModel):
    order_id: int
    customer_id: int
    executor_id: int
    status: Optional[str] = Field(None, min_length=1, max_length=20)
    executor_comment: Optional[str] = None
    reason_type: Optional[str] = None
    reason_text: Optional[str] = None

    refund_amount_customer: Optional[str] = None
    refund_amount_executor: Optional[str] = None
    admin_comment: Optional[str] = None


class CustomerOrderCancellationReadSchema(CustomerOrderCancellationCreateSchema):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True  # SQLAlchemy 2.0 (был orm_mode)


class ExecutorOrderCancellationCreateSchema(BaseModel):
    order_id: int
    customer_id: int
    executor_id: int
    status: Optional[str] = Field(..., min_length=1, max_length=20)
    customer_comment: Optional[str] = None
    reason_type: Optional[str] = None
    reason_text: Optional[str] = None
    refund_amount_customer: Optional[Decimal] = None
    refund_amount_executor: Optional[Decimal] = None
    admin_comment: Optional[str] = None


class ExecutorOrderCancellationReadSchema(ExecutorOrderCancellationCreateSchema):
    id: int
    create_at: Optional[datetime] = None

    class Config:
        from_attributes = True  # SQLAlchemy 2.0 (был orm_mode)


# добавляем ответ от зазказчика на отказ от исполнителя
class CustomerDecisionSchema(BaseModel):
    order_id: int
    customer_id: int
    executor_id: int
    status: Optional[str] = Field(..., min_length=1, max_length=20)
    customer_comment: Optional[str] = None


# добавляем ответ от исполнителя на отказ от заказчика
class ExecutorDecisionSchema(BaseModel):
    order_id: int
    customer_id: int
    executor_id: int
    status: Optional[str] = Field(..., min_length=1, max_length=20)
    executor_comment: Optional[str] = None


# class CancelOrderForAdminCustomerRead(CustomerOrderCancellationCreateSchema):
#     id: int
#     create_at: Optional[datetime] = None

#     class Config:
#         from_attributes = True  # SQLAlchemy 2.0 (был orm_mode)


# получение информации об отмене заказа заказчиком администратором для выведения в список
class CancelOrderCustomerForAdminRead(BaseModel):
    id: int
    order_id: int
    order_name: str
    customer_name: str
    executor_name: str


class GraphicOrderMasterCreate(BaseModel):
    user_id: int
    order_id: int
    date_start: datetime


class GraphicOrderMasterRead(BaseModel):
    id: int
    name_order: Optional[str] = None
    address: Optional[str] = None
    date_start: Optional[datetime]


class OrderDeleteResponseSchema(BaseModel):
    order_id: int
    deleted: bool
    notified_executors: int = 0


class OrderCancellationWithdrawResponseSchema(BaseModel):
    order_id: int
    withdrawn: bool = True


class OrderClearAfterExecutorRefusalResponseSchema(BaseModel):
    order_id: int
    cleared: bool
    deleted_responses: int = 0


class OrderClearAfterExecutorRefusalEligibilitySchema(BaseModel):
    can_clear: bool


class ExecutorServiceDeleteResponseSchema(BaseModel):
    order_id: int
    deleted: bool


class ExecutorServiceDeleteEligibilitySchema(BaseModel):
    can_delete: bool


class CustomerExecutorDeleteResponseSchema(BaseModel):
    executor_id: int
    removed: bool = True


class ExecutorCustomerDeleteResponseSchema(BaseModel):
    customer_id: int
    removed: bool = True
