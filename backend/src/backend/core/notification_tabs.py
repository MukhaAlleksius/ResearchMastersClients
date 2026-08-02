"""Карта тип уведомления → вкладка UI.

Зеркало frontend/src/utils/workDetailCatalog.js (NOTIFICATION_TYPE_TO_TAB /
resolveNotificationTab). Меняя вкладки — правьте оба места.
"""

from __future__ import annotations

from typing import Optional

# Фиксированное соответствие (без ролевых исключений).
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
    "executor_assigned": "orderInfo",
    "customer_status_changed": "orderInfo",
    "executor_status_changed": "orderInfo",
    "customer_order_offer": "orderInfo",
    "customer_accepted_proposal": "orderInfo",
}

_CANCEL_TYPES = frozenset(
    {"cancel_requested", "cancel_decision", "order_refused"}
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

    if notification_type == "counterparty_info_updated":
        return "executorInfo" if recipient_is_customer else "customerInfo"

    return NOTIFICATION_TYPE_TO_TAB.get(notification_type)
