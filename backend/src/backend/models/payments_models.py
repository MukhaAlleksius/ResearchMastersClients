from sqlalchemy import DECIMAL, String, Integer, DateTime, ForeignKey, func  # SQL типы
from sqlalchemy.orm import Mapped, mapped_column, relationship  # SQLAlchemy 2.0
from sqlalchemy.ext.asyncio import AsyncAttrs
from datetime import datetime
from typing import Optional
from core.database import Base


class ExecutorBankAccount(AsyncAttrs, Base):  # Наследуем от Base
    __tablename__ = "executor_bank_accounts"  # Имя таблицы в БД

    # ✅ ID записи — автоинкремент, уникальный ключ
    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True  # INTEGER PRIMARY KEY + индекс
    )

    # ✅ ID исполнителя (связь с таблицей users)
    executor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True  # FOREIGN KEY на users.id + индекс
    )

    # ✅ Название банка (Беларусбанк, Приорбанк)
    bank_name: Mapped[str] = mapped_column(
        String(255), nullable=False  # VARCHAR(255) NOT NULL
    )

    # ✅ Расчётный счёт исполнителя (IBAN BY13BLBB...)
    account_number: Mapped[str] = mapped_column(
        String(34), nullable=False  # VARCHAR(34) NOT NULL (IBAN длина)
    )

    # ✅ ИНН исполнителя (9 цифр для РБ)
    inn: Mapped[str] = mapped_column(String(9), nullable=False)  # VARCHAR(9) NOT NULL

    # ✅ БИК банка (9 символов, напр. BLBBBY2X)
    bank_bic: Mapped[str] = mapped_column(
        String(9), nullable=False  # VARCHAR(9) NOT NULL
    )

    # ✅ Корреспондентский счёт банка (20+ цифр)
    bank_account: Mapped[str] = mapped_column(
        String(34), nullable=False  # VARCHAR(34) NOT NULL
    )

    agreed_to_processing: Mapped[bool] = mapped_column(default=False)  # ✅ Согласие!

    # ✅ Когда создана запись
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()  # TIMESTAMP DEFAULT NOW()
    )

    # ✅ Когда последний раз обновлена (NULL при создании)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, server_default=func.now()  # TIMESTAMP ON UPDATE NOW()
    )


class Payment(AsyncAttrs, Base):
    __tablename__ = "payments"

    # ✅ Идентификатор платежа (автоинкремент)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ✅ Связь с заказом
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # ✅ Заказчик (кто платит)
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    # ✅ Исполнитель (кому платят)
    executor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    # ✅ Счёт исполнителя для выплаты (NULL до подтверждения)
    executor_bank_account_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("executor_bank_accounts.id"), index=True
    )

    # ✅ Сумма платежа (полная)
    amount: Mapped[DECIMAL] = mapped_column(
        DECIMAL(10, 2), nullable=False  # 99999999.99 BYN
    )

    # ✅ Сумма для исполнителя (после комиссии)
    executor_amount: Mapped[DECIMAL] = mapped_column(
        DECIMAL(10, 2), nullable=False  # amount - commission
    )

    # ✅ Комиссия платформы
    commission: Mapped[DECIMAL] = mapped_column(
        DECIMAL(10, 2), default=0.0, nullable=False
    )

    # ✅ Валюта
    currency: Mapped[str] = mapped_column(String(3), default="BYN", nullable=False)

    # ✅ Статусы escrow-платформы
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)

    # ✅ Метод оплаты заказчиком
    payment_method: Mapped[Optional[str]] = mapped_column(String(50))

    # ✅ ID транзакции WebPay
    transaction_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, index=True
    )

    # ✅ Время создания
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # ✅ Время завершения (оплаты)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # ✅ Время выплаты исполнителю
    payout_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
