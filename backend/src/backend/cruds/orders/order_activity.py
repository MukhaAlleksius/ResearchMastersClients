import logging
from datetime import datetime
from typing import Literal, Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.conversations_models import (
    ComplaintConversation,
    ComplaintMessage,
    Conversation,
    Message,
)
from models.contracts_models import Contract
from models.estimate_graphic_works_models import GraphicWork, WorkEstimate
from models.orders_models import (
    CustomerOrderCancellation,
    ExecutorOrder,
    ExecutorOrderCancellation,
    Order,
    OrderResponseExecutor,
    Review,
    StatusOrderCustomer,
)
from models.payments_models import Payment
from models.users_models import UserContact
from schemas.orders_schemas import OrderActivitySignals

logger = logging.getLogger(__name__)

CUSTOMER_STATUS_DRAFT = "Не предложенные исполнителям"
CUSTOMER_STATUS_SELF = "Самостоятельное выполнение"


def _empty_signals() -> OrderActivitySignals:
    return OrderActivitySignals()


async def get_batch_order_activity(
    db: AsyncSession,
    order_ids: list[int],
    viewer_id: int,
    role: Literal["customer", "executor"],
) -> dict[int, OrderActivitySignals]:
    if not order_ids:
        return {}

    signals_map = {order_id: _empty_signals() for order_id in order_ids}

    try:
        unread_rows = await db.execute(
            select(Conversation.order_id, func.count(Message.id))
            .join(Message, Message.conversation_id == Conversation.id)
            .where(
                Conversation.order_id.in_(order_ids),
                Message.sender_id != viewer_id,
                Message.is_read.is_(False),
                or_(
                    Conversation.customer_id == viewer_id,
                    Conversation.executor_id == viewer_id,
                ),
            )
            .group_by(Conversation.order_id)
        )
        for order_id, count in unread_rows.all():
            signals_map[order_id].unread_messages = int(count or 0)

        if role == "customer":
            cancel_rows = await db.execute(
                select(ExecutorOrderCancellation.order_id)
                .where(
                    ExecutorOrderCancellation.order_id.in_(order_ids),
                    ExecutorOrderCancellation.status == "pending_customer",
                )
            )
            for (order_id,) in cancel_rows.all():
                signals_map[order_id].pending_cancel = True

            response_rows = await db.execute(
                select(
                    OrderResponseExecutor.order_id,
                    func.count(OrderResponseExecutor.id),
                    func.max(OrderResponseExecutor.id),
                    func.max(OrderResponseExecutor.created_at),
                )
                .where(OrderResponseExecutor.order_id.in_(order_ids))
                .group_by(OrderResponseExecutor.order_id)
            )
            for order_id, count, latest_id, latest_created in response_rows.all():
                signals = signals_map[order_id]
                signals.responses_count = int(count or 0)
                signals.responses_latest_id = int(latest_id or 0)
                signals.response_updated_at = latest_created

            assigned_response_rows = await db.execute(
                select(
                    ExecutorOrder.order_id,
                    OrderResponseExecutor.id,
                )
                .join(
                    OrderResponseExecutor,
                    and_(
                        OrderResponseExecutor.order_id == ExecutorOrder.order_id,
                        OrderResponseExecutor.executor_id == ExecutorOrder.executor_id,
                    ),
                )
                .where(ExecutorOrder.order_id.in_(order_ids))
            )
            for order_id, response_id in assigned_response_rows.all():
                signals_map[order_id].assigned_response_latest_id = int(response_id or 0)
        else:
            cancel_rows = await db.execute(
                select(CustomerOrderCancellation.order_id)
                .where(
                    CustomerOrderCancellation.order_id.in_(order_ids),
                    CustomerOrderCancellation.status == "pending_executor",
                )
            )
            for (order_id,) in cancel_rows.all():
                signals_map[order_id].pending_cancel = True

        estimate_rows = await db.execute(
            select(
                WorkEstimate.order_id,
                func.count(WorkEstimate.id),
                func.max(WorkEstimate.id),
            )
            .where(
                WorkEstimate.order_id.in_(order_ids),
                WorkEstimate.user_id != viewer_id,
            )
            .group_by(WorkEstimate.order_id)
        )
        for order_id, count, max_id in estimate_rows.all():
            signals = signals_map[order_id]
            signals.estimate_count_other = int(count or 0)
            signals.estimate_max_id = int(max_id or 0)

        schedule_rows = await db.execute(
            select(
                GraphicWork.order_id,
                func.count(GraphicWork.id),
                func.max(GraphicWork.id),
            )
            .where(
                GraphicWork.order_id.in_(order_ids),
                GraphicWork.user_id != viewer_id,
            )
            .group_by(GraphicWork.order_id)
        )
        for order_id, count, max_id in schedule_rows.all():
            signals = signals_map[order_id]
            signals.schedule_count_other = int(count or 0)
            signals.schedule_max_id = int(max_id or 0)

        contract_rows = await db.execute(
            select(Contract).where(Contract.order_id.in_(order_ids))
        )
        for contract in contract_rows.scalars().all():
            signals = signals_map[contract.order_id]
            signals.contract_updated_at = contract.updated_at or contract.created_at
            if role == "customer":
                signals.contract_other_signed = bool(contract.subscribe_executor)
                signals.contract_viewer_signed = bool(contract.subscribe_customer)
            else:
                signals.contract_other_signed = bool(contract.subscribe_customer)
                signals.contract_viewer_signed = bool(contract.subscribe_executor)

        order_rows = await db.execute(
            select(Order.id, Order.updated_at).where(Order.id.in_(order_ids))
        )
        for order_id, updated_at in order_rows.all():
            signals_map[order_id].order_updated_at = updated_at

        if role == "executor":
            customer_status_rows = await db.execute(
                select(StatusOrderCustomer.order_id, StatusOrderCustomer.status).where(
                    StatusOrderCustomer.order_id.in_(order_ids)
                )
            )
            customer_status_map = {
                order_id: status for order_id, status in customer_status_rows.all()
            }

            executor_order_rows = await db.execute(
                select(ExecutorOrder.order_id, ExecutorOrder.executor_id).where(
                    ExecutorOrder.order_id.in_(order_ids)
                )
            )
            selected_executor_map = {
                order_id: executor_id
                for order_id, executor_id in executor_order_rows.all()
            }

            response_exists_rows = await db.execute(
                select(OrderResponseExecutor.order_id).where(
                    OrderResponseExecutor.order_id.in_(order_ids),
                    OrderResponseExecutor.executor_id == viewer_id,
                )
            )
            responded_order_ids = {
                order_id for (order_id,) in response_exists_rows.all()
            }

            for order_id in order_ids:
                if order_id not in responded_order_ids:
                    continue

                customer_status = customer_status_map.get(order_id)
                if customer_status in (CUSTOMER_STATUS_DRAFT, CUSTOMER_STATUS_SELF):
                    signals_map[order_id].order_unavailable = True
                    continue

                selected_executor_id = selected_executor_map.get(order_id)
                if (
                    selected_executor_id is not None
                    and selected_executor_id != viewer_id
                ):
                    signals_map[order_id].order_unavailable = True

        complaint_unread_rows = await db.execute(
            select(ComplaintConversation.order_id, func.count(ComplaintMessage.id))
            .join(
                ComplaintMessage,
                ComplaintMessage.complaint_conversation_id == ComplaintConversation.id,
            )
            .where(
                ComplaintConversation.order_id.in_(order_ids),
                ComplaintMessage.sender_id != viewer_id,
                ComplaintMessage.is_read.is_(False),
            )
            .group_by(ComplaintConversation.order_id)
        )
        for order_id, count in complaint_unread_rows.all():
            signals_map[order_id].unread_complaint_messages = int(count or 0)

        complaint_latest_rows = await db.execute(
            select(
                ComplaintConversation.order_id,
                func.max(ComplaintMessage.id),
            )
            .join(
                ComplaintMessage,
                ComplaintMessage.complaint_conversation_id == ComplaintConversation.id,
            )
            .where(
                ComplaintConversation.order_id.in_(order_ids),
                ComplaintMessage.sender_id != viewer_id,
            )
            .group_by(ComplaintConversation.order_id)
        )
        for order_id, latest_id in complaint_latest_rows.all():
            signals_map[order_id].complaint_latest_id = int(latest_id or 0)

        payment_rows = await db.execute(
            select(
                Payment.order_id,
                func.max(Payment.id),
                func.max(
                    func.coalesce(
                        Payment.payout_date,
                        Payment.completed_at,
                        Payment.created_at,
                    )
                ),
            )
            .where(Payment.order_id.in_(order_ids))
            .group_by(Payment.order_id)
        )
        for order_id, latest_id, updated_at in payment_rows.all():
            signals = signals_map[order_id]
            signals.payment_latest_id = int(latest_id or 0)
            signals.payment_updated_at = updated_at

        review_rows = await db.execute(
            select(Review.order_id, func.max(Review.id))
            .where(
                Review.order_id.in_(order_ids),
                Review.reviewer_id != viewer_id,
            )
            .group_by(Review.order_id)
        )
        for order_id, latest_id in review_rows.all():
            signals_map[order_id].review_latest_id = int(latest_id or 0)

        order_party_rows = await db.execute(
            select(Order.id, Order.customer_id, ExecutorOrder.executor_id)
            .outerjoin(ExecutorOrder, ExecutorOrder.order_id == Order.id)
            .where(Order.id.in_(order_ids))
        )
        order_party_map = {
            order_id: (customer_id, executor_id)
            for order_id, customer_id, executor_id in order_party_rows.all()
        }

        party_user_ids: set[int] = set()
        for customer_id, executor_id in order_party_map.values():
            if customer_id:
                party_user_ids.add(customer_id)
            if executor_id:
                party_user_ids.add(executor_id)

        contact_max_by_user: dict[int, int] = {}
        if party_user_ids:
            contact_rows = await db.execute(
                select(UserContact.user_id, func.max(UserContact.id)).where(
                    UserContact.user_id.in_(party_user_ids)
                ).group_by(UserContact.user_id)
            )
            contact_max_by_user = {
                user_id: int(max_id or 0)
                for user_id, max_id in contact_rows.all()
            }

        for order_id in order_ids:
            customer_id, executor_id = order_party_map.get(order_id, (None, None))
            signals = signals_map[order_id]
            if role == "executor" and customer_id:
                signals.customer_info_max_id = contact_max_by_user.get(customer_id, 0)
            elif role == "customer" and executor_id:
                signals.executor_info_max_id = contact_max_by_user.get(executor_id, 0)

    except Exception as exc:
        logger.error(
            "get_batch_order_activity error viewer_id=%s role=%s: %s",
            viewer_id,
            role,
            exc,
            exc_info=True,
        )

    return signals_map


async def get_order_activity_for_viewer(
    db: AsyncSession,
    order_id: int,
    viewer_id: int,
    role: Literal["customer", "executor"],
) -> OrderActivitySignals:
    result = await get_batch_order_activity(
        db=db,
        order_ids=[order_id],
        viewer_id=viewer_id,
        role=role,
    )
    return result.get(order_id, _empty_signals())
