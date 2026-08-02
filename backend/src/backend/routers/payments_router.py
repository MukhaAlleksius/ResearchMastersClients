import logging  # Логирование платёжных операций
from typing import Annotated, Optional  # Типы для Header и optional query

from fastapi import APIRouter, Depends, Header, HTTPException, Query  # Роутер, DI, заголовки, ошибки
from pydantic import BaseModel  # Модель тела callback
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.config import PAYMENT_CALLBACK_SECRET, get_db  # Секрет callback и сессия БД
from cruds.payments_crud import (  # CRUD платежей
    add_executor_bank_account,  # Банковский счёт исполнителя
    confirm_payment_callback,  # Подтверждение от платёжки
    create_escrow_payment,  # Создание эскроу-платежа
    get_executor_order_all_payments,  # Платежи исполнителя по заказу
    get_payment_order,  # Платежи заказа для заказчика
    get_payments_for_admin,  # Список для админа
    release_payment_to_executor,  # Выпуск средств исполнителю
)
from core.auth import ensure_same_user, get_current_admin_user, get_current_user  # Авторизация
from schemas.payments_schemas import (  # Схемы платежей
    AdminPaymentsResponse,  # Ответ админ-списка
    ExecutorBankAccountSchema,  # Банковский счёт
    PaymentCreateRequest,  # Создание платежа
    PaymentCreateResponse,  # Ответ создания
    PaymentOut,  # Платёж в ответе API
)
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя

router = APIRouter(prefix="", tags=["payments"])  # Роутер платежей

logger = logging.getLogger(__name__)  # Логгер модуля


class CallbackSchema(BaseModel):  # Тело webhook от платёжной системы
    payment_id: str  # Внешний id транзакции
    status: str  # Новый статус платежа


def _payment_to_out(payment) -> PaymentOut:  # ORM Payment → схема ответа
    return PaymentOut(
        id=payment.id,  # id платежа
        order_id=payment.order_id,  # id заказа
        customer_id=payment.customer_id,  # id заказчика
        executor_id=payment.executor_id,  # id исполнителя
        executor_bank_account_id=payment.executor_bank_account_id,  # Счёт исполнителя
        amount=float(payment.amount),  # Полная сумма
        executor_amount=float(payment.executor_amount),  # Доля исполнителя
        commission=float(payment.commission),  # Комиссия
        currency=payment.currency,  # Валюта
        status=payment.status,  # Статус
        payment_method=payment.payment_method,  # Способ оплаты
        transaction_id=payment.transaction_id,  # Внешний id
        created_at=payment.created_at,  # Дата создания
        completed_at=payment.completed_at,  # Дата завершения
        payout_date=payment.payout_date,  # Дата выплаты
    )


@router.post("/order/{order_id}/pay_escrow", response_model=PaymentCreateResponse)  # POST эскроу
async def create_payment(
    order_id: int,  # id заказа
    body: PaymentCreateRequest,  # Сумма, метод, исполнитель
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Заказчик
):
    payment, payment_url, is_test = await create_escrow_payment(  # Создание платежа в CRUD
        db,
        order_id=order_id,
        customer_id=current_user.user_id,
        executor_amount_raw=body.executor_amount,
        payment_method=body.payment_method,
        fallback_executor_id=body.executor_id,
    )
    return PaymentCreateResponse(  # URL оплаты и суммы
        payment_id=payment.id,
        payment_url=payment_url,
        amount=float(payment.amount),
        executor_amount=float(payment.executor_amount),
        commission=float(payment.commission),
        currency=payment.currency,
        status=payment.status,
        test_mode=is_test,  # Тестовый режим платёжки
    )


@router.post("/order/{order_id}/payment/{payment_id}/pay_executor", response_model=PaymentOut)  # POST выпуск исполнителю
async def pay_executor_for_order_api(
    order_id: int,  # id заказа
    payment_id: int,  # id платежа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Заказчик
):
    payment = await release_payment_to_executor(  # Перевод из эскроу
        db,
        order_id=order_id,
        payment_id=payment_id,
        customer_id=current_user.user_id,
    )
    return _payment_to_out(payment)  # Обновлённый платёж


@router.post("/order/{order_id}/approve")  # POST совместимость: approve = release escrow
async def approve_order(
    order_id: int,  # id заказа
    payment_id: int | None = Query(default=None),  # id платежа (опционально)
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Заказчик
):
    """Совместимость: подтверждение выполнения = выпуск эскроу."""
    from sqlalchemy import select  # Локальный импорт SELECT
    from models.payments_models import Payment  # ORM платежа
    from payments.constants import PAYMENT_STATUS_ESCROW  # Статус эскроу

    resolved_payment_id = payment_id  # Явно переданный id
    if resolved_payment_id is None:  # Ищем последний эскроу-платёж заказа
        result = await db.execute(
            select(Payment.id)  # Только id
            .where(
                Payment.order_id == order_id,
                Payment.customer_id == current_user.user_id,
                Payment.status == PAYMENT_STATUS_ESCROW,
            )
            .order_by(Payment.created_at.desc())  # Сначала новые
            .limit(1)  # Один платёж
        )
        resolved_payment_id = result.scalar_one_or_none()  # id или None
        if not resolved_payment_id:  # Эскроу не найден
            raise HTTPException(status_code=404, detail="Нет платежа в эскроу")

    payment = await release_payment_to_executor(  # Выпуск средств
        db,
        order_id=order_id,
        payment_id=resolved_payment_id,
        customer_id=current_user.user_id,
    )
    return {  # Статус и данные платежа
        "status": "released",
        "payment": _payment_to_out(payment),
    }


@router.post("/payment/callback")  # POST webhook платёжной системы
async def payment_callback(
    callback: CallbackSchema,  # Тело callback
    db: AsyncSession = Depends(get_db),  # Сессия БД
    x_payment_secret: Annotated[Optional[str], Header()] = None,  # Секрет в заголовке
):
    if x_payment_secret != PAYMENT_CALLBACK_SECRET:  # Проверка секрета
        raise HTTPException(status_code=403, detail="Недопустимый callback")  # Отклоняем подделку

    payment = await confirm_payment_callback(  # Обновление статуса в CRUD
        db,
        transaction_id=callback.payment_id,
        status=callback.status,
    )
    if payment:  # Платёж найден и обновлён
        logger.info(
            "Payment %s updated to %s", callback.payment_id, payment.status
        )
        return {"status": "ok", "updated": True, "payment_status": payment.status}  # Успех

    logger.warning("Payment %s not found", callback.payment_id)  # Неизвестный transaction_id
    return {"status": "ok", "updated": False}  # 200 без обновления (идемпотентность)


@router.post("/executor/{executor_id}/bank-account")  # POST банковский счёт исполнителя
async def add_executor_bank_account_api(
    executor_id: int,  # id исполнителя
    executor_bank_account_schema: ExecutorBankAccountSchema,  # Реквизиты
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    ensure_same_user(current_user, executor_id)  # Только сам исполнитель
    return await add_executor_bank_account(  # Сохранение в CRUD
        db, executor_id, executor_bank_account_schema
    )


@router.get(  # GET платежи заказа для заказчика
    "/payment_for_order/{order_id}/{customer_id}",
    response_model=list[PaymentOut],
)
async def get_payment_for_order_api(
    order_id: int,  # id заказа
    customer_id: int,  # id заказчика
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    ensure_same_user(current_user, customer_id)  # Только свой customer_id
    payments = await get_payment_order(  # Список из CRUD
        db=db, order_id=order_id, customer_id=customer_id
    )
    return [_payment_to_out(p) for p in payments]  # ORM → схемы


@router.get("/executor/{executor_id}/order/{order_id}/payments", response_model=list[PaymentOut])  # GET платежи исполнителя
async def get_executor_order_all_payments_api(
    executor_id: int,  # id исполнителя
    order_id: int,  # id заказа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    ensure_same_user(current_user, executor_id)  # Только сам исполнитель
    payments = await get_executor_order_all_payments(  # CRUD
        db=db, executor_id=executor_id, order_id=order_id
    )
    return [_payment_to_out(p) for p in payments]  # Список PaymentOut


@router.get("/admin/payments", response_model=AdminPaymentsResponse)  # GET все платежи для админа
async def get_admin_payments_api(
    status: Optional[str] = Query(default="all"),  # Фильтр по статусу
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    return await get_payments_for_admin(db, status=status)  # Список из CRUD
