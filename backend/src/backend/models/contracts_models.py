from sqlalchemy.orm import relationship
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from core.database import Base


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    customer_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    executor_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )

    # ✅ Метаданные
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), onupdate=func.now(), server_default=func.now()
    )

    # ✅ Поля договора (с валидацией и ограничениями)
    address_work = Column(String(500), nullable=False)
    title_work = Column(String(255), nullable=False)
    name_work = Column(Text, nullable=False)

    date_start_work = Column(String(20), nullable=False)
    date_end_work = Column(String(50), nullable=True)

    budget_type = Column(String(100), nullable=True)
    budget = Column(Numeric(precision=12, scale=2), nullable=False)
    currency = Column(String(20), default="BYN", nullable=False)

    subscribe_customer = Column(Boolean)
    subscribe_executor = Column(Boolean)
