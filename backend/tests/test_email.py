import asyncio

import pytest

from core.email import build_app_link, is_smtp_configured, send_email
from cruds.notifications_crud import (
    CANCEL_DECISION_NOTIFICATION_TYPE,
    CANCEL_REQUESTED_NOTIFICATION_TYPE,
    NEW_MESSAGE_NOTIFICATION_TYPE,
    ORDER_DELETED_NOTIFICATION_TYPE,
    ORDER_REFUSED_NOTIFICATION_TYPE,
    PROPOSAL_ACCEPTED_NOTIFICATION_TYPE,
    should_email_notification,
)


@pytest.mark.parametrize(
    "notification_type",
    [
        CANCEL_REQUESTED_NOTIFICATION_TYPE,
        CANCEL_DECISION_NOTIFICATION_TYPE,
        ORDER_REFUSED_NOTIFICATION_TYPE,
        ORDER_DELETED_NOTIFICATION_TYPE,
        PROPOSAL_ACCEPTED_NOTIFICATION_TYPE,
    ],
)
def test_important_notifications_are_emailed(notification_type):
    assert should_email_notification(notification_type) is True


def test_chat_notifications_are_not_emailed():
    assert should_email_notification(NEW_MESSAGE_NOTIFICATION_TYPE) is False


def test_build_app_link_joins_path():
    assert build_app_link("/profile/orders/12").endswith("/profile/orders/12")
    assert build_app_link("https://example.com/x") == "https://example.com/x"


def test_send_email_without_smtp_does_not_raise():
    if is_smtp_configured():
        pytest.skip("SMTP is configured in this environment")
    sent = asyncio.run(
        send_email(
            to_email="customer@example.com",
            subject="Отказ от заказа",
            text_body="Исполнитель отказался от заказа.",
        )
    )
    assert sent is False
