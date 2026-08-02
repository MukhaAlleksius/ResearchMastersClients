import logging  # Логирование ошибок переписок
from typing import Optional  # Optional для query и полей

from fastapi import APIRouter, Depends, HTTPException, Query  # Роутер, DI, ошибки, query
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.auth import ensure_same_user, get_current_admin_user, get_current_user  # Авторизация
from cruds.conversations_crud import (  # CRUD бесед, жалоб, поддержки
    add_complaint_conversation,  # Создать жалобу
    add_complaint_message,  # Сообщение в жалобе
    add_conversation,  # Беседа по заказу
    add_message,  # Сообщение в беседе
    add_verdict_admin,  # Вердикт модератора
    create_support_conversation,  # Беседа поддержки
    create_support_message,  # Сообщение поддержки
    get_complaint,  # Одна жалоба
    get_complaint_chat_for_admin,  # Чат жалобы для админа
    get_complaints_for_admin,  # Все жалобы для админа
    get_conversation as get_order_conversation,  # Беседа по заказу (алиас)
    get_messages_by_conversation,  # Сообщения беседы поддержки
    get_support_conversation,  # Беседа поддержки
    get_user_conversations,  # Беседы пользователя
    mark_messages_as_read,  # Пометить прочитанными
    update_complaint_status,  # Статус жалобы
)
from schemas.conversations_schemas import (  # Pydantic-схемы
    ComplaintConversationCreate,  # Создание жалобы
    ComplaintConversationRead,  # Чтение жалобы
    ComplaintMessageCreate,  # Сообщение жалобы
    ComplaintMessageRead,  # Ответ сообщения жалобы
    ConversationBase,  # Базовая беседа заказа
    MessageBase,  # Сообщение заказа
    MessageRead,  # Ответ сообщения
    ModerationActionCreate,  # Вердикт модерации
    SupportConversationCreate,  # Создание поддержки
    SupportConversationRead,  # Беседа поддержки
    SupportMessageCreate,  # Сообщение поддержки
    SupportMessageRead,  # Ответ сообщения поддержки
)
from core.config import get_db  # Зависимость сессии БД
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя


logger = logging.getLogger(__name__)  # Логгер модуля


router = APIRouter(prefix="", tags=["geography"])  # Роутер бесед (тег geography)


@router.post("/add_conversation")  # POST беседа по заказу
async def add_conversation_api(
    conversation_schema: ConversationBase,  # Заказчик, исполнитель, order_id
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    if current_user.user_id not in (  # Только участники заказа
        conversation_schema.customer_id,
        conversation_schema.executor_id,
    ):
        raise HTTPException(status_code=403, detail="Access denied")  # Чужая беседа
    try:
        conversation = await add_conversation(  # Создание в CRUD
            db=db, conversation_schema=conversation_schema
        )
        return conversation  # Созданная беседа
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # Ошибка из CRUD


@router.post(  # POST сообщение в беседе заказа
    "/add_message",
    response_model=MessageRead,
)
async def add_message_api(
    message_schema: MessageBase,  # Текст, sender_id, conversation_id
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    ensure_same_user(current_user, message_schema.sender_id)  # Только от своего имени
    try:
        message = await add_message(db=db, message_schema=message_schema)  # CRUD
        return message  # Созданное сообщение
    except HTTPException:
        raise  # Пробрасываем HTTP-ошибки


@router.get("/conversation/{order_id}/{current_user_id}")  # GET беседа по заказу
async def get_conversation_api(
    order_id: int,  # id заказа
    current_user_id: int,  # id пользователя в path (проверка)
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT-пользователь
):
    ensure_same_user(current_user, current_user_id)  # path user_id = текущий
    try:
        conversation = await get_order_conversation(  # Загрузка беседы
            db=db, order_id=order_id, current_user_id=current_user.user_id
        )
        return conversation  # Данные беседы
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # Нет доступа


# Маршруты для жалоб пользователей админитратору и вынесение вердиктов
@router.post("/create_complaint", response_model=ComplaintConversationRead)  # POST создать жалобу
async def create_complaint_api(
    schema: ComplaintConversationCreate,  # Данные жалобы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Автор жалобы
):
    return await add_complaint_conversation(db, schema, current_user.user_id)  # CRUD


@router.post("/add_complaint_message/{sender_id}", response_model=ComplaintMessageRead)  # POST сообщение жалобы
async def add_complaint_message_api(
    schema: ComplaintMessageCreate,  # Текст сообщения
    sender_id: int,  # id отправителя в path
    complaint_id: Optional[int] = Query(None),  # id жалобы (опционально)
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    ensure_same_user(current_user, sender_id)  # Только от своего имени
    return await add_complaint_message(db, schema, current_user.user_id, complaint_id)  # CRUD


@router.get("/complaints", response_model=ComplaintConversationRead)  # GET одна жалоба
async def get_complaint_api(
    complaint_id: int,  # id жалобы (query, не в path)
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    result = await get_complaint(db, complaint_id, current_user.user_id)  # CRUD с проверкой доступа
    if not result:  # Жалоба не найдена или недоступна
        raise HTTPException(404, "Жалоба не доступна")  # 404
    return result  # Данные жалобы


# Получить все беседы с жалобами для администратора
@router.get("/admin/complaints", response_model=list[ComplaintConversationRead])  # GET все жалобы (админ)
async def get_complaints_for_admin_api(
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    return await get_complaints_for_admin(db)  # Список из CRUD


@router.get("/admin/complaint/order")  # GET чат жалобы по order_id (админ)
async def get_complaint_chat_for_admin_api(
    order_id: Optional[int] = Query(...),  # id заказа (обязательный query)
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    return await get_complaint_chat_for_admin(db, order_id=order_id)  # CRUD


@router.patch("/{complaint_id}/{user_id}/status")  # PATCH статус жалобы
async def update_status_api(
    complaint_id: int,  # id жалобы
    user_id: int,  # id пользователя (инициатор)
    status: str,  # Новый статус
    verdict: Optional[str] = None,  # Вердикт (опционально)
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    ensure_same_user(current_user, user_id)  # Только от своего user_id
    return await update_complaint_status(  # Обновление в CRUD
        db, complaint_id, status, verdict, current_user.user_id
    )


@router.post("/add_verdict_admin")  # POST вердикт модератора
async def add_verdict_admin_api(
    moderation_action_schema: ModerationActionCreate,  # Действие модерации
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    try:
        await add_verdict_admin(db, moderation_action_schema)  # Сохранение вердикта
    except Exception as e:
        raise HTTPException(  # 500 при любой ошибке
            status_code=500, detail="Ошибка при добавлении вердикта модератора"
        )


# Поддержка пользователей администратором
@router.post("/support/add_conversation")  # POST начать беседу поддержки
async def start_conversation(
    data: SupportConversationCreate,  # user_id и тема
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Пользователь
):
    ensure_same_user(current_user, data.user_id)  # Только для себя

    conv = await create_support_conversation(db, data)  # CRUD
    return conv  # Созданная беседа


@router.get("/support/conversations", response_model=list[SupportConversationRead])  # GET беседы пользователя
async def list_user_conversations(
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Текущий пользователь
):
    convs = await get_user_conversations(db, user_id=current_user.user_id)  # CRUD
    return convs  # Список бесед


@router.get("/support/conversation/{conv_id}", response_model=SupportConversationRead)  # GET одна беседа поддержки
async def get_support_conversation_api(
    conv_id: int,  # id беседы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Владелец беседы
):
    conv = await get_support_conversation(db, conv_id, user_id=current_user.user_id)  # С проверкой user_id
    if not conv:  # Не найдена или чужая
        raise HTTPException(status_code=404, detail="Conversation not found")  # 404
    return conv  # Данные беседы


@router.post("/support/add_message", response_model=SupportMessageRead)  # POST сообщение поддержки
async def send_message(
    payload: SupportMessageCreate,  # Текст и id беседы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Отправитель
):
    ensure_same_user(current_user, payload.sender_id)  # Только от своего имени

    conv = await get_support_conversation(db, conv_id=payload.support_conversation_id)  # Без фильтра user
    if not conv:  # Беседа не существует
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg = await create_support_message(db, payload)  # CRUD
    return msg  # Созданное сообщение


@router.get(  # GET сообщения беседы поддержки
    "/support/conversation/{conv_id}/messages",
    response_model=list[SupportMessageRead],
)
async def get_conversation_messages(
    conv_id: int,  # id беседы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Участник
):
    conv = await get_support_conversation(db, conv_id, user_id=current_user.user_id)  # Проверка доступа
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")  # 404

    msgs = await get_messages_by_conversation(db, conv_id)  # Все сообщения
    return msgs  # Список SupportMessageRead


@router.post("/support/conversation/{conv_id}/mark_as_read")  # POST пометить прочитанным (админ)
async def mark_conversation_as_read(
    conv_id: int,  # id беседы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Админ поддержки
):
    await mark_messages_as_read(db, conv_id, is_read=True)  # CRUD
    return {"ok": True}  # Подтверждение
