# Оплата и эскроу

Подробное описание платёжного модуля. Общая документация: [../README.md](../README.md).

## Участники

| Роль | Действие |
|------|----------|
| **Заказчик** | Оплачивает через кнопку «Оплатить» (без ввода карты в test-режиме) |
| **Платформа** | Удерживает сумму в эскроу до подтверждения |
| **Исполнитель** | Указывает IBAN в профиле; получает выплату после release |

Карту заказчик вводит **только на стороне платёжного шлюза** (WebPay в prod).  
В нашей БД хранится `transaction_id`, не данные карты.

## Статусы `payments.status`

| Статус | Значение |
|--------|----------|
| `pending` | Платёж создан, ожидает подтверждения от шлюза |
| `escrow` | Деньги зарезервированы (логически в эскроу) |
| `released` | Подтверждено, выплата исполнителю разрешена |
| `failed` | Ошибка или отмена |

## Расчёт сумм

Файл: `backend/src/backend/cruds/payments_crud.py` → `calculate_payment_parts()`

```
commission = executor_amount × 10%
total      = executor_amount + commission   → amount в Payment
```

Сумма проверяется против остатка бюджета заказа.

## Flow (test)

```
1. POST /order/{id}/pay_escrow  { "payment_method": "test", "executor_amount": N }
2. Payment создаётся с status=escrow, transaction_id=TEST-...
3. POST /order/{id}/payment/{payment_id}/pay_executor
4. status=released, executor_bank_account_id подставляется если есть
```

## Flow (WebPay / prod)

```
1. POST /order/{id}/pay_escrow  { "payment_method": "webpay", ... }
2. Backend → mock/real WebPay → payment_url
3. Frontend redirect заказчика на payment_url
4. Шлюз → POST /payment/callback  { payment_id, status: "escrow" }
5. confirm_payment_callback() → status=escrow
6. Заказчик подтверждает → pay_executor → released
```

## Файлы

| Файл | Роль |
|------|------|
| `models/payments_models.py` | `Payment`, `ExecutorBankAccount` |
| `cruds/payments_crud.py` | create, callback, release |
| `routers/payments_router.py` | HTTP API |
| `schemas/payments_schemas.py` | DTO |
| `payments/constants.py` | статусы, COMMISSION_RATE |
| `mock_web_pay.py` | dev-шлюз :8001 |
| `frontend/.../Payment.jsx` | UI заказчика |
| `frontend/.../ExecutorPaumentStatus.jsx` | UI исполнителя |

## Безопасность

- Эндпоинты оплаты требуют JWT (`get_current_user`)
- Callback проверяет `X-Payment-Secret` == `PAYMENT_CALLBACK_SECRET`
- Суммы пересчитываются на сервере, не доверяют frontend

## Prod checklist

- [ ] `PAYMENT_ALLOW_TEST=false`
- [ ] Уникальный `PAYMENT_CALLBACK_SECRET`
- [ ] HTTPS на callback URL
- [ ] Договор с WebPay, prod credentials
- [ ] Реальный банковский перевод на IBAN после `released`
