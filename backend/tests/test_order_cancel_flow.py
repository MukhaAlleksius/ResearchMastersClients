"""Правила отказов, статусов заказа и каталога — без живой БД."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.access import CATALOG_PUBLIC_STATUS, is_order_listed_in_catalog
from core.notification_tabs import resolve_notification_tab
from cruds.notifications_crud import (
    CANCEL_ADMIN_DELETED_NOTIFICATION_TYPE,
    CANCEL_ADMIN_VERDICT_NOTIFICATION_TYPE,
    CANCEL_DECISION_NOTIFICATION_TYPE,
    CANCEL_REQUESTED_NOTIFICATION_TYPE,
    ORDER_REFUSED_NOTIFICATION_TYPE,
    should_email_notification,
)
from cruds.orders.create_orders import (
    AWAITING_EXECUTION_STATUS,
    REFUSED_BY_CUSTOMER_STATUS,
    REFUSED_BY_ORDER_STATUS,
    SEARCH_EXECUTOR_STATUS,
    _can_release_order_to_search,
    _is_refused_pair_status,
    _release_order_to_search,
    apply_executor_cancel_agreed,
    apply_in_progress_customer_cancel_agreed,
    is_executor_blocked_from_customer_reoffer,
)
from cruds.orders.delete_orders import (
    CUSTOMER_DELETABLE_STATUSES,
    delete_cancel_dispute_for_admin,
)


IN_PROGRESS_STATUS = "В процессе выполнения"
DRAFT_STATUS = "Не предложенные исполнителям"
COMPLETED_STATUS = "Выполнен"


def _run(coro):
    return asyncio.run(coro)


class _ScalarResult:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def _sql(stmt) -> str:
    try:
        return str(stmt.compile(compile_kwargs={"render_postcompile": True})).lower()
    except Exception:
        return str(stmt).lower()


class OrderMemory:
    """Минимальная сессия: статусы, назначение, удаление отказа."""

    def __init__(
        self,
        *,
        customer_status,
        executor_status=None,
        executor_row=True,
        agreed_customer_cancel=False,
        agreed_executor_cancel=False,
        cancel_row=None,
    ):
        self.customer_row = SimpleNamespace(status=customer_status)
        self.executor_row = (
            SimpleNamespace(status=executor_status) if executor_row else None
        )
        self.executor_status = executor_status
        self.agreed_customer_cancel = agreed_customer_cancel
        self.agreed_executor_cancel = agreed_executor_cancel
        self.cancel_row = cancel_row
        self.deleted_sql = []
        self.deleted_objects = []
        self.added = []
        self.committed = False

    async def execute(self, stmt):
        sql = _sql(stmt)
        if sql.strip().startswith("delete"):
            self.deleted_sql.append(sql)
            return _ScalarResult()
        if sql.strip().startswith("update"):
            return _ScalarResult()
        if "statuses_orders_customers" in sql:
            select_clause = sql.split("from")[0]
            if ".status" in select_clause and ".id" not in select_clause:
                return _ScalarResult(self.customer_row.status)
            return _ScalarResult(self.customer_row)
        if "statuses_orders_executors" in sql:
            select_clause = sql.split("from")[0]
            if ".status" in select_clause and ".id" not in select_clause:
                return _ScalarResult(self.executor_status)
            return _ScalarResult(self.executor_row)
        if "customer_order_cancellations" in sql:
            if self.cancel_row is not None:
                return _ScalarResult(self.cancel_row)
            return _ScalarResult(1 if self.agreed_customer_cancel else None)
        if "executor_order_cancellations" in sql:
            if self.cancel_row is not None:
                return _ScalarResult(self.cancel_row)
            return _ScalarResult(1 if self.agreed_executor_cancel else None)
        return _ScalarResult()

    async def flush(self):
        return None

    def add(self, obj):
        self.added.append(obj)
        self.executor_row = obj
        self.executor_status = getattr(obj, "status", self.executor_status)

    async def delete(self, obj):
        self.deleted_objects.append(obj)

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        return obj

    async def rollback(self):
        return None


def _customer_tab_label(status: str) -> str:
    """Зеркало frontend getCustomerOrderStatusLabel: Мои заказы."""
    text = status or ""
    if "Отказано заказчиком" in text:
        return "Отказ"
    if "Отказ от заказа" in text:
        return "Отказано"
    return text or "Без статуса"


@pytest.mark.parametrize(
    "status, expected",
    [
        (AWAITING_EXECUTION_STATUS, True),
        (IN_PROGRESS_STATUS, True),
        (SEARCH_EXECUTOR_STATUS, False),
        (DRAFT_STATUS, False),
        (REFUSED_BY_CUSTOMER_STATUS, False),
        (REFUSED_BY_ORDER_STATUS, False),
        (COMPLETED_STATUS, False),
        (None, False),
        ("", False),
    ],
)
def test_can_unbind_only_from_assigned_work(status, expected):
    assert _can_release_order_to_search(status) is expected


@pytest.mark.parametrize(
    "status, expected",
    [
        (REFUSED_BY_CUSTOMER_STATUS, True),
        (REFUSED_BY_ORDER_STATUS, True),
        (SEARCH_EXECUTOR_STATUS, False),
        (AWAITING_EXECUTION_STATUS, False),
        (None, False),
    ],
)
def test_refused_pair_status(status, expected):
    assert _is_refused_pair_status(status) is expected


def test_catalog_is_only_search_status():
    assert CATALOG_PUBLIC_STATUS == SEARCH_EXECUTOR_STATUS


@pytest.mark.parametrize(
    "status, listed",
    [
        (SEARCH_EXECUTOR_STATUS, True),
        (DRAFT_STATUS, False),
        (AWAITING_EXECUTION_STATUS, False),
        (IN_PROGRESS_STATUS, False),
        (REFUSED_BY_CUSTOMER_STATUS, False),
        (REFUSED_BY_ORDER_STATUS, False),
        (COMPLETED_STATUS, False),
    ],
)
def test_order_listed_in_catalog_only_when_searching(status, listed):
    db = OrderMemory(customer_status=status)

    async def _check():
        return await is_order_listed_in_catalog(db, 1)

    assert _run(_check()) is listed


def test_customer_cabinet_labels_for_refusals():
    assert _customer_tab_label(REFUSED_BY_CUSTOMER_STATUS) == "Отказ"
    assert _customer_tab_label(REFUSED_BY_ORDER_STATUS) == "Отказано"


def test_customer_can_delete_refused_but_not_in_progress_or_done():
    assert REFUSED_BY_CUSTOMER_STATUS in CUSTOMER_DELETABLE_STATUSES
    assert REFUSED_BY_ORDER_STATUS in CUSTOMER_DELETABLE_STATUSES
    assert SEARCH_EXECUTOR_STATUS in CUSTOMER_DELETABLE_STATUSES
    assert IN_PROGRESS_STATUS not in CUSTOMER_DELETABLE_STATUSES
    assert COMPLETED_STATUS not in CUSTOMER_DELETABLE_STATUSES


@pytest.mark.parametrize(
    "notification_type, is_customer, tab",
    [
        (CANCEL_REQUESTED_NOTIFICATION_TYPE, True, "customerCancelOrder"),
        (CANCEL_DECISION_NOTIFICATION_TYPE, False, "executorCancelOrder"),
        (ORDER_REFUSED_NOTIFICATION_TYPE, True, "customerCancelOrder"),
        (CANCEL_ADMIN_VERDICT_NOTIFICATION_TYPE, False, "executorCancelOrder"),
        (CANCEL_ADMIN_DELETED_NOTIFICATION_TYPE, True, "orderInfo"),
    ],
)
def test_cancel_notifications_open_expected_tab(notification_type, is_customer, tab):
    assert (
        resolve_notification_tab(notification_type, recipient_is_customer=is_customer)
        == tab
    )


def test_admin_cancel_events_are_emailed():
    assert should_email_notification(CANCEL_ADMIN_VERDICT_NOTIFICATION_TYPE) is True
    assert should_email_notification(CANCEL_ADMIN_DELETED_NOTIFICATION_TYPE) is True


def test_customer_agree_unbinds_to_refused_by_customer_not_search(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_order_refusal_collateral", _noop
    )
    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_cancel_notifications_for_order", _noop
    )

    db = OrderMemory(
        customer_status=IN_PROGRESS_STATUS,
        executor_status=IN_PROGRESS_STATUS,
    )

    async def _act():
        ok = await apply_in_progress_customer_cancel_agreed(
            db, order_id=1, customer_id=2, executor_id=3
        )
        assert ok is True

    _run(_act())
    assert db.customer_row.status == REFUSED_BY_CUSTOMER_STATUS
    assert db.executor_row.status == REFUSED_BY_CUSTOMER_STATUS
    assert db.customer_row.status != SEARCH_EXECUTOR_STATUS
    assert any("executors_orders" in sql for sql in db.deleted_sql)


def test_executor_agree_unbinds_to_refused_by_order(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_order_refusal_collateral", _noop
    )
    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_cancel_notifications_for_order", _noop
    )

    db = OrderMemory(
        customer_status=AWAITING_EXECUTION_STATUS,
        executor_status=AWAITING_EXECUTION_STATUS,
    )

    async def _act():
        ok = await apply_executor_cancel_agreed(
            db, order_id=1, customer_id=2, executor_id=3
        )
        assert ok is True

    _run(_act())
    assert db.customer_row.status == REFUSED_BY_ORDER_STATUS
    assert db.executor_row.status == REFUSED_BY_ORDER_STATUS
    assert any("executors_orders" in sql for sql in db.deleted_sql)


def test_unbind_skipped_if_already_in_search(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_order_refusal_collateral", _noop
    )
    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_cancel_notifications_for_order", _noop
    )

    db = OrderMemory(customer_status=SEARCH_EXECUTOR_STATUS)

    async def _act():
        return await apply_in_progress_customer_cancel_agreed(
            db, order_id=1, customer_id=2, executor_id=3
        )

    assert _run(_act()) is False
    assert db.customer_row.status == SEARCH_EXECUTOR_STATUS
    assert db.deleted_sql == []


def test_same_executor_blocked_after_refusal_status():
    db = OrderMemory(
        customer_status=REFUSED_BY_CUSTOMER_STATUS,
        executor_status=REFUSED_BY_CUSTOMER_STATUS,
    )

    async def _act():
        return await is_executor_blocked_from_customer_reoffer(
            db, order_id=1, executor_id=3
        )

    assert _run(_act()) is True


def test_same_executor_blocked_after_agreed_cancel_record():
    db = OrderMemory(
        customer_status=SEARCH_EXECUTOR_STATUS,
        executor_status=SEARCH_EXECUTOR_STATUS,
        agreed_customer_cancel=True,
    )

    async def _act():
        return await is_executor_blocked_from_customer_reoffer(
            db, order_id=1, executor_id=3
        )

    assert _run(_act()) is True


def test_executor_not_blocked_without_refusal():
    db = OrderMemory(
        customer_status=AWAITING_EXECUTION_STATUS,
        executor_status=AWAITING_EXECUTION_STATUS,
    )

    async def _act():
        return await is_executor_blocked_from_customer_reoffer(
            db, order_id=1, executor_id=3
        )

    assert _run(_act()) is False


def test_admin_delete_refusal_removes_record_not_assignment(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "cruds.orders.delete_orders.clear_cancel_notifications_for_order", _noop
    )
    monkeypatch.setattr("cruds.orders.delete_orders.notify_cancel_admin_verdict", _noop)

    cancellation = SimpleNamespace(
        id=9,
        order_id=1,
        customer_id=2,
        executor_id=3,
        status="resolved",
    )
    db = OrderMemory(
        customer_status=REFUSED_BY_CUSTOMER_STATUS,
        executor_status=REFUSED_BY_CUSTOMER_STATUS,
        cancel_row=cancellation,
    )

    async def _act():
        return await delete_cancel_dispute_for_admin(
            db, source="customer", cancel_id=9
        )

    result = _run(_act())
    assert result["deleted"] is True
    assert result["order_id"] == 1
    assert db.deleted_objects == [cancellation]
    assert db.customer_row.status == REFUSED_BY_CUSTOMER_STATUS
    assert not any("executors_orders" in sql for sql in db.deleted_sql)


def test_admin_delete_unknown_source_rejected():
    db = OrderMemory(customer_status=AWAITING_EXECUTION_STATUS)

    async def _act():
        await delete_cancel_dispute_for_admin(db, source="unknown", cancel_id=1)

    with pytest.raises(HTTPException) as exc:
        _run(_act())
    assert exc.value.status_code == 400


def test_release_creates_executor_status_if_missing(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_order_refusal_collateral", _noop
    )
    monkeypatch.setattr(
        "cruds.orders.create_orders.clear_cancel_notifications_for_order", _noop
    )

    db = OrderMemory(
        customer_status=AWAITING_EXECUTION_STATUS,
        executor_row=False,
        executor_status=None,
    )

    async def _act():
        await _release_order_to_search(
            db,
            order_id=1,
            customer_id=2,
            executor_id=3,
            executor_status=REFUSED_BY_CUSTOMER_STATUS,
        )

    _run(_act())
    assert db.customer_row.status == REFUSED_BY_CUSTOMER_STATUS
    assert db.added
    assert db.added[0].status == REFUSED_BY_CUSTOMER_STATUS
    assert db.added[0].executor_id == 3
