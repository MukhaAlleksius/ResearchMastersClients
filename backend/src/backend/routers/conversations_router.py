import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import ensure_same_user, get_current_admin_user, get_current_user
from cruds.conversations_crud import (
    add_complaint_conversation,
    add_complaint_message,
    add_conversation,
    add_message,
    add_verdict_admin,
    create_support_conversation,
    create_support_message,
    get_complaint,
    get_complaint_chat_for_admin,
    get_complaints_for_admin,
    get_conversation as get_order_conversation,
    get_messages_by_conversation,
    get_support_conversation,
    get_user_conversations,
    mark_messages_as_read,
    update_complaint_status,
)
from schemas.conversations_schemas import (
    ComplaintConversationCreate,
    ComplaintConversationRead,
    ComplaintMessageCreate,
    ComplaintMessageRead,
    ConversationBase,
    MessageBase,
    MessageRead,
    ModerationActionCreate,
    SupportConversationCreate,
    SupportConversationRead,
    SupportMessageCreate,
    SupportMessageRead,
)
from core.config import get_db
from schemas.users_schemas import UserCommonSchema


logger = logging.getLogger(__name__)


router = APIRouter(prefix="", tags=["geography"])


@router.post("/add_conversation")
async def add_conversation_api(
    conversation_schema: ConversationBase,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    if current_user.user_id not in (
        conversation_schema.customer_id,
        conversation_schema.executor_id,
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        conversation = await add_conversation(
            db=db, conversation_schema=conversation_schema
        )
        return conversation
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post(
    "/add_message",
    response_model=MessageRead,
)
async def add_message_api(
    message_schema: MessageBase,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, message_schema.sender_id)
    try:
        message = await add_message(db=db, message_schema=message_schema)
        return message
    except HTTPException:
        raise


@router.get("/conversation/{order_id}/{current_user_id}")
async def get_conversation_api(
    order_id: int,
    current_user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, current_user_id)
    try:
        conversation = await get_order_conversation(
            db=db, order_id=order_id, current_user_id=current_user.user_id
        )
        return conversation
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Маршруты для жалоб пользователей админитратору и вынесение вердиктов
@router.post("/create_complaint", response_model=ComplaintConversationRead)
async def create_complaint_api(
    schema: ComplaintConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    return await add_complaint_conversation(db, schema, current_user.user_id)


@router.post("/add_complaint_message/{sender_id}", response_model=ComplaintMessageRead)
async def add_complaint_message_api(
    schema: ComplaintMessageCreate,
    sender_id: int,
    complaint_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, sender_id)
    return await add_complaint_message(db, schema, current_user.user_id, complaint_id)


@router.get("/complaints", response_model=ComplaintConversationRead)
async def get_complaint_api(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    result = await get_complaint(db, complaint_id, current_user.user_id)
    if not result:
        raise HTTPException(404, "Жалоба не доступна")
    return result


# Получить все беседы с жалобами для администратора
@router.get("/admin/complaints", response_model=list[ComplaintConversationRead])
async def get_complaints_for_admin_api(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    return await get_complaints_for_admin(db)


@router.get("/admin/complaint/order")
async def get_complaint_chat_for_admin_api(
    order_id: Optional[int] = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    return await get_complaint_chat_for_admin(db, order_id=order_id)


@router.patch("/{complaint_id}/{user_id}/status")
async def update_status_api(
    complaint_id: int,
    user_id: int,
    status: str,
    verdict: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_id)
    return await update_complaint_status(
        db, complaint_id, status, verdict, current_user.user_id
    )


@router.post("/add_verdict_admin")
async def add_verdict_admin_api(
    moderation_action_schema: ModerationActionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        await add_verdict_admin(db, moderation_action_schema)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail="Ошибка при добавлении вердикта модератора"
        )


# Поддержка пользователей администратором
@router.post("/support/add_conversation")
async def start_conversation(
    data: SupportConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, data.user_id)

    conv = await create_support_conversation(db, data)
    return conv


@router.get("/support/conversations", response_model=list[SupportConversationRead])
async def list_user_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    convs = await get_user_conversations(db, user_id=current_user.user_id)
    return convs


@router.get("/support/conversation/{conv_id}", response_model=SupportConversationRead)
async def get_support_conversation_api(
    conv_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    conv = await get_support_conversation(db, conv_id, user_id=current_user.user_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.post("/support/add_message", response_model=SupportMessageRead)
async def send_message(
    payload: SupportMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, payload.sender_id)

    conv = await get_support_conversation(db, conv_id=payload.support_conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg = await create_support_message(db, payload)
    return msg


@router.get(
    "/support/conversation/{conv_id}/messages",
    response_model=list[SupportMessageRead],
)
async def get_conversation_messages(
    conv_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    conv = await get_support_conversation(db, conv_id, user_id=current_user.user_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msgs = await get_messages_by_conversation(db, conv_id)
    return msgs


@router.post("/support/conversation/{conv_id}/mark_as_read")
async def mark_conversation_as_read(
    conv_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    await mark_messages_as_read(db, conv_id, is_read=True)
    return {"ok": True}
