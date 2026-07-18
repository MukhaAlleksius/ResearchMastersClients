from sqlalchemy.orm import relationship
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from enum import Enum as PyEnum

from core.database import Base


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True, autoincrement=True)  # Идентификатор беседы
    order_id = Column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE")
    )  # Связь с заданием
    customer_id = Column(Integer, ForeignKey("users.id"))  # Заказчик беседы
    executor_id = Column(Integer, ForeignKey("users.id"))  # Исполнитель беседы
    # participant_type = Column(String(20), default="order")  # ✅ "order", "support"
    # admin_id = Column(
    #     Integer, ForeignKey("users.id"), nullable=True
    # )  # ✅ Для support чатов
    created_at = Column(
        DateTime(timezone=True), server_default=func.now()
    )  # Дата создания беседы


class Message(Base):
    __tablename__ = "messages"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Идентификатор сообщения
    conversation_id = Column(
        Integer, ForeignKey("conversations.id", ondelete="CASCADE")
    )  # Связь с беседой
    sender_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )  # Отправитель
    content = Column(Text, nullable=False)  # Текст сообщения
    message_type = Column(
        String(20), default="text"
    )  # Тип сообщения (текст, файл, системное)
    file_url = Column(String(500))  # Ссылка на файл (если есть)
    is_read = Column(Boolean, default=False)  # Прочитано ли сообщение
    created_at = Column(
        DateTime(timezone=True), server_default=func.now()
    )  # Время отправки


class ComplaintConversation(Base):
    __tablename__ = "complaints_conversations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ✅ Правильная связь (один-ко-многим)
    messages = relationship(
        "ComplaintMessage",
        back_populates="conversation",  # ✅ Связь в обе стороны
        cascade="all, delete-orphan",  # ✅ Удаляет сообщения при удалении
        order_by="ComplaintMessage.created_at",  # ✅ Автосортировка
    )

    moderation_actions = relationship(
        "ComplaintModerationAction",
        back_populates="complaint",
        cascade="all, delete-orphan",
    )

    order = relationship("Order", back_populates="complaint_conversation")


class ComplaintMessage(Base):
    __tablename__ = "complaints_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    complaint_conversation_id = Column(
        Integer, ForeignKey("complaints_conversations.id", ondelete="CASCADE")
    )
    sender_type = Column(String(20), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    content = Column(Text, nullable=False)
    message_type = Column(String(20), default="text")
    file_url = Column(String(500))
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ✅ ИСПРАВЛЕНО: conversaion → conversation
    conversation = relationship(  # ✅ Правильное имя
        "ComplaintConversation", back_populates="messages"  # ✅ Связь в обе стороны
    )


class ActionType(str, PyEnum):
    """Типы действий модератора по спору"""

    WARNING = "warning"  # ⚠️ Предупреждение (+1-5 баллов в warnings_count)
    VERDICT_REFUND = "verdict_refund"  # 💰 Вернуть деньги заказчику (полная сумма)
    VERDICT_PAY = "verdict_pay"  # 💼 Выплатить деньги исполнителю (полная сумма)
    VERDICT_SPLIT = (
        "verdict_split"  # 🤝 Разделить 50/50 между заказчиком и исполнителем
    )
    VERDICT_CLOSE = "verdict_close"  # ✅ Закрыть спор без последствий (0 выплат)
    BAN = "ban"  # 🚫 Блокировка аккаунта (blocked_until в users)
    # MUTE = "mute"              # 🤐 ЗАБРАКОВАН - не нужен (удалить)


class ComplaintModerationAction(Base):
    __tablename__ = "complaint_moderation_actions"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(
        Integer, ForeignKey("complaints_conversations.id"), nullable=False, index=True
    )

    # Тип действия
    action_type = Column(Enum(ActionType), nullable=False, index=True)

    # Кому
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Деньги
    refund_amount_customer = Column(Numeric(10, 2), default=0)
    refund_amount_executor = Column(Numeric(10, 2), default=0)

    # Комментарий
    comment = Column(String(1000), nullable=True)

    # Кто сделал
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Метаданные
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    complaint = relationship(
        "ComplaintConversation", back_populates="moderation_actions"
    )
    admin = relationship("User", foreign_keys=[admin_id])
    target_user = relationship("User", foreign_keys=[target_user_id])


class SupportConversation(Base):
    __tablename__ = "support_conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Пользователь, который начал обращение
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    topic = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связь с сообщениями
    messages = relationship(
        "SupportMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",  # удаляются сообщения при удалении беседы
        order_by="SupportMessage.created_at",
    )


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Беседа, к которой относится сообщение
    support_conversation_id = Column(
        Integer,
        ForeignKey("support_conversations.id", ondelete="CASCADE"),
    )

    # Кто отправил сообщение: "user" или "admin"
    sender_type = Column(String(20), nullable=False)  # "user", "admin"
    sender_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )  # ссылка на user/admin в таблице users

    content = Column(Text, nullable=False)
    message_type = Column(String(20), default="text")  # "text", "image", "file"
    file_url = Column(String(500))
    is_read = Column(Boolean, default=False)  # прочитано ли админом
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связь с беседой
    conversation = relationship(
        "SupportConversation",
        back_populates="messages",
    )
