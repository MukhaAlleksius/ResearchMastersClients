"""Какое уведомление открывает какую вкладку в карточке заказа.

Должно совпадать с frontend/src/utils/workDetailCatalog.js
(NOTIFICATION_TYPE_TO_TAB / resolveNotificationTab). Меняя вкладки — правьте оба места.
"""

from __future__ import annotations  # Отложенные аннотации типов

from typing import Optional  # Вкладки может не быть

# Тип уведомления из БД → id вкладки на фронте (без учёта роли).
NOTIFICATION_TYPE_TO_TAB: dict[str, str] = {
    "new_message": "chat",
    "estimate_updated": "estimateWorks",
    "schedule_updated": "schedule",
    "executor_response": "orderResponesExecutors",  # опечатка id сохранена (совместимость)
    "executor_response_updated": "orderResponesExecutors",
    "order_updated": "orderInfo",
    "contract_updated": "customerExecutorContract",
    "contract_signed": "customerExecutorContract",
    "complaint_message": "complaints",
    "payment_updated": "payment",
    "work_started": "schedule",
    "order_completed": "orderInfo",
    "start_date_updated": "orderInfo",
    "work_starts_tomorrow": "orderInfo",
    "listing_expired": "orderInfo",
    "executor_assigned": "orderInfo",
    "customer_order_offer": "orderInfo",
    "customer_accepted_proposal": "orderInfo",
    "cancel_admin_deleted": "orderInfo",
}

_CANCEL_TYPES = frozenset(  # Отказы: у заказчика и исполнителя разные вкладки
    {
        "cancel_requested",
        "cancel_decision",
        "order_refused",
        "cancel_admin_verdict",
    }
)


def resolve_notification_tab(
    notification_type: str,
    *,
    recipient_is_customer: bool,
) -> Optional[str]:
    """Вкладка UI для типа уведомления с учётом роли получателя."""
    if notification_type in _CANCEL_TYPES:
        return (
            "customerCancelOrder" if recipient_is_customer else "executorCancelOrder"
        )

    return NOTIFICATION_TYPE_TO_TAB.get(notification_type)  # None — вкладку не открываем
