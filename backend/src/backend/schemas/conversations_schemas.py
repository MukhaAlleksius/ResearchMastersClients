from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, FieldValidationInfo
from datetime import datetime

from models.conversations_models import ActionType


# Базовая схема для модели Message с основными полями
class MessageBase(BaseModel):
    order_id: Optional[int] = None
    sender_id: int  # ID пользователя, отправившего сообщение
    content: str  # Текст сообщения
    message_type: Optional[str] = "text"  # Тип сообщения, по умолчанию текст
    file_url: Optional[HttpUrl] = None  # URL файла, если сообщение содержит вложение
    is_read: Optional[bool] = False  # Прочитано ли сообщение, по умолчанию False


# Схема для создания нового сообщения (наследуется от базовой)
class MessageCreate(MessageBase):
    pass  # Дополнительных полей нет


# Схема для чтения сообщения (расширяет базовую, добавляется ID)
class MessageRead(MessageBase):
    id: int  # Уникальный идентификатор сообщения
    is_own: bool = False
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Базовая схема для модели Conversation (Беседа)
class ConversationBase(BaseModel):
    order_id: int  # ID заказа, к которому относится беседа
    customer_id: int  # ID пользователя-заказчика беседы
    executor_id: int  # ID пользователя-исполнителя беседы
    created_at: Optional[datetime] = None  # Дата создания беседы


# Схема для создания беседы
class ConversationCreate(ConversationBase):
    pass  # Дополнительных полей нет


# Схема для чтения беседы с вложенными сообщениями
class ConversationRead(ConversationBase):
    id: int  # Уникальный ID беседы
    messages: list[MessageRead] = []  # Список вложенных сообщений, связанных с беседой


class ComplaintConversationBase(BaseModel):
    pass


class ComplaintConversationCreate(ComplaintConversationBase):
    pass


# Чат для жалоб пользователей администратору
class ComplaintMessageBase(BaseModel):
    content: str
    sender_type: str
    message_type: str = "text"
    file_url: Optional[str] = None


class ComplaintMessageCreate(ComplaintMessageBase):
    complaint_id: Optional[int] = None
    order_id: int
    sender_id: int
    admin_id: int
    status: Optional[str] = Field(None, gt=1, le=20)
    verdict: Optional[str] = None


class ComplaintMessageRead(ComplaintMessageBase):
    id: int
    sender_id: int
    is_read: bool
    created_at: datetime


class ComplaintConversationRead(BaseModel):
    id: int
    order_id: int
    admin_id: Optional[int] = None
    created_at: datetime


class ComplaintChatRead(ComplaintConversationRead):
    messages: list[ComplaintMessageRead] = []


class ModerationActionCreate(BaseModel):
    """📝 Валидация данных при создании действия (POST)"""

    complaint_id: int
    action_type: ActionType  # обязательно

    target_user_id: Optional[int] = Field(
        None, description="ID исполнителя / customer (если применимо)"
    )

    amount_customer: float = Field(0, ge=0, description="Сумма заказчику ₽")
    amount_executor: float = Field(0, ge=0, description="Сумма исполнителю ₽")

    duration_days: Optional[int] = Field(
        None, ge=1, le=365, description="Длительность бана/предупреждения"
    )

    comment: str = Field(
        None, min_length=5, max_length=1000, description="Объяснение решения модератора"
    )

    admin_id: int  # id модератора/администратора

    blocked: bool = Field(False, description="Пользователь заблокирован (бан)")
    blocked_until: Optional[datetime] = Field(None, description="Дата окончания бана")

    # Валидатор 1: target_user_id обязателен для WARNING / BAN
    @field_validator("target_user_id")
    def check_target_user(cls, v: Any, info: FieldValidationInfo) -> Any:
        action_type = info.data.get("action_type")
        if action_type in (ActionType.WARNING, ActionType.BAN) and v is None:
            raise ValueError("target_user_id ОБЯЗАТЕЛЕН для WARNING и BAN")
        return v

    # Валидатор 2: duration_days обязателен для WARNING / BAN
    @field_validator("duration_days")
    def check_duration(cls, v: Any, info: FieldValidationInfo) -> Any:
        action_type = info.data.get("action_type")
        if action_type in (ActionType.WARNING, ActionType.BAN) and v is None:
            raise ValueError("duration_days ОБЯЗАТЕЛЕН для WARNING и BAN")
        if v is not None and (v <= 0 or v > 365):
            raise ValueError("duration_days должно быть в диапазоне 1–365 дней")
        return v

    # Валидатор 3: деньги только для вердиктов
    @field_validator("amount_customer")
    def check_money_customer(cls, v: Any, info: FieldValidationInfo) -> Any:
        action_type = info.data.get("action_type")
        money_allowed_types = {ActionType.VERDICT_REFUND, ActionType.VERDICT_SPLIT}
        if action_type not in money_allowed_types and v > 0:
            raise ValueError(
                "amount_customer может быть > 0 только для VERDICT_REFUND / VERDICT_SPLIT"
            )
        return v

    @field_validator("amount_executor")
    def check_money_executor(cls, v: Any, info: FieldValidationInfo) -> Any:
        action_type = info.data.get("action_type")
        money_allowed_types = {ActionType.VERDICT_PAY, ActionType.VERDICT_SPLIT}
        if action_type not in money_allowed_types and v > 0:
            raise ValueError(
                "amount_executor может быть > 0 только для VERDICT_PAY / VERDICT_SPLIT"
            )
        return v

    # Валидатор 4: blocked только для BAN
    @field_validator("blocked")
    def check_blocked(cls, v: Any, info: FieldValidationInfo) -> Any:
        action_type = info.data.get("action_type")
        if v is True and action_type != ActionType.BAN:
            raise ValueError("blocked = True допустимо только для BAN")
        return v

    # Валидатор 5: blocked_until согласован с duration_days для BAN
    @field_validator("blocked_until")
    def check_end_time(cls, v: Any, info: FieldValidationInfo) -> Any:
        duration = info.data.get("duration_days")
        action_type = info.data.get("action_type")
        if v is None and action_type == ActionType.BAN and duration is not None:
            raise ValueError(
                "Для BAN при указании duration_days должно быть указано blocked_until"
            )
        return v


class SupportMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10_000)
    sender_type: str  # "user" | "admin"
    sender_id: int
    support_conversation_id: int
    message_type: str = "text"  # "text", "image", "file"
    file_url: Optional[str] = None

    @field_validator("sender_type")
    def validate_sender_type(cls, v):
        if v not in ("user", "admin"):
            raise ValueError('sender_type must be "user" or "admin"')
        return v

    @field_validator("message_type")
    def validate_message_type(cls, v):
        if v not in ("text", "image", "file"):
            raise ValueError('message_type must be "text", "image" or "file"')
        return v


class SupportMessageRead(BaseModel):
    id: int
    sender_type: str
    sender_id: int
    content: str
    message_type: str
    file_url: Optional[str]
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SupportConversationCreate(BaseModel):
    user_id: int
    topic: str  


class SupportConversationRead(BaseModel):
    id: int
    user_id: int
    created_at: datetime
    is_closed: bool
    messages: list[SupportMessageRead] = []

    class Config:
        from_attributes = True
