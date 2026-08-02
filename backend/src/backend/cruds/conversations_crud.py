from datetime import datetime, timedelta, timezone  # Время для блокировок и сроков
import logging  # Логирование операций чатов
from typing import Optional  # Опциональные id и параметры
from fastapi import HTTPException  # HTTP-ошибки API
from sqlalchemy import and_, func, or_, select, update  # Условия, SELECT, UPDATE
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД
from sqlalchemy.orm import aliased, joinedload  # Алиасы и eager-load (импорт)

from sqlalchemy.exc import NoResultFound, MultipleResultsFound  # Ошибки ORM при get


from sqlalchemy.orm import selectinload  # Подгрузка связей списком

from cruds.notifications_crud import (  # Уведомления о сообщениях и жалобах
    NEW_MESSAGE_NOTIFICATION_TYPE,
    notify_complaint_message,
    notify_order_event,
)
from models.orders_models import ExecutorOrder, Order, StatusOrderExecutor  # Заказ и назначение
from models.conversations_models import (  # ORM чатов, жалоб, поддержки
    ActionType,
    ComplaintConversation,
    ComplaintMessage,
    ComplaintModerationAction,
    Conversation,
    Message,
    SupportConversation,
    SupportMessage,
)
from models.users_models import User  # ORM пользователя
from schemas.conversations_schemas import (  # Pydantic-схемы чатов
    ComplaintChatRead,
    ComplaintConversationCreate,
    ComplaintConversationRead,
    ComplaintMessageCreate,
    ComplaintMessageRead,
    ConversationBase,
    ConversationRead,
    MessageBase,
    MessageRead,
    ModerationActionCreate,
    SupportConversationCreate,
    SupportMessageCreate,
)

logger = logging.getLogger(__name__)  # Логгер модуля


async def add_conversation(db: AsyncSession, conversation_schema: ConversationBase):  # Создание чата по заказу
    try:

        result = await db.execute(  # Уже есть чат для тройки order/customer/executor?
            select(Conversation).where(
                and_(
                    Conversation.order_id == conversation_schema.order_id,
                    Conversation.customer_id == conversation_schema.customer_id,
                    Conversation.executor_id == conversation_schema.executor_id,
                )
            )
        )
        row = result.scalar_one_or_none()

        if not row:  # Создаём новый чат

            conversation = Conversation(
                order_id=conversation_schema.order_id,
                customer_id=conversation_schema.customer_id,
                executor_id=conversation_schema.executor_id,
            )

            db.add(conversation)
            await db.commit()

        return conversation  # Существующий или новый
    except Exception as e:  # Ошибка создания
        logger.error(f"add_message error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def add_message(db: AsyncSession, message_schema: MessageBase):  # Добавление сообщения в чат заказа
    try:
        logger.info(  # Отладочный лог параметров
            f"🔍 order_id={message_schema.order_id}, sender_id={message_schema.sender_id}"
        )

        # 1. Ищем conversation
        result = await db.execute(  # Id чата, где отправитель — заказчик или исполнитель
            select(Conversation.id).where(
                and_(
                    Conversation.order_id == message_schema.order_id,
                    or_(
                        Conversation.customer_id == message_schema.sender_id,
                        Conversation.executor_id == message_schema.sender_id,
                    ),
                )
            )
        )
        conversation_id = result.scalar_one_or_none()

        if not conversation_id:  # Чата нет — создаём из заказа
            # ✅ ИСПРАВЛЕНО: Используем fetchone() вместо first()
            order_result = await db.execute(  # Заказ + назначение исполнителя
                select(Order, ExecutorOrder)
                .outerjoin(ExecutorOrder, Order.id == ExecutorOrder.order_id)
                .where(Order.id == message_schema.order_id)
            )

            # ✅ ПРОВЕРЯЕМ результат!
            row = order_result.fetchone()
            if not row:  # Заказ не найден
                raise HTTPException(status_code=404, detail="Заказ не найден")

            order, executor_order = (
                row.Order,
                row.ExecutorOrder,
            )  # ✅ Правильный доступ!

            # ✅ Проверка executor_order
            if executor_order is None:  # Исполнитель не назначен
                raise HTTPException(status_code=404, detail="Исполнитель не назначен")

            # Создаем conversation
            conversation = Conversation(
                order_id=message_schema.order_id,
                customer_id=order.customer_id,
                executor_id=executor_order.executor_id,
            )
            db.add(conversation)
            await db.flush()  # Получаем id без commit
            conversation_id = conversation.id

        # Создаем сообщение
        message = Message(
            conversation_id=conversation_id,
            sender_id=message_schema.sender_id,
            content=message_schema.content,
            message_type=message_schema.message_type or "text",
            file_url=message_schema.file_url,
            is_read=False,
        )

        db.add(message)
        await db.flush()  # Id сообщения до уведомления
        try:
            await notify_order_event(  # Push/email о новом сообщении
                db,
                order_id=message_schema.order_id,
                actor_user_id=message_schema.sender_id,
                notification_type=NEW_MESSAGE_NOTIFICATION_TYPE,
            )
        except Exception as notify_error:  # Уведомление не блокирует сохранение
            logger.warning("notify new_message failed: %s", notify_error)
        await db.commit()  # Фиксируем сообщение
        await db.refresh(message)  # Актуальные поля из БД
        return message

    except HTTPException:  # Пробрасываем HTTP-ошибки
        raise
    except Exception as e:  # Откат и общая ошибка
        await db.rollback()
        logger.error(f"add_message error: {str(e)}")
        raise HTTPException(status_code=400, detail="Ошибка добавления сообщения")


# async def edit_country(db: AsyncSession, country_schema: CountrySchema):
#     try:
#         result = await db.execute(
#             select(Country).where(Country.id == country_schema.country_id)
#         )
#         country = result.scalar_one_or_none()
#         if not country:
#             raise HTTPException(status_code=404, detail="Страна не найдена")
#         country.name_country = country_schema.name_country
#         await db.commit()
#         await db.refresh(country)
#         return country
#     except Exception as e:
#         logger.error(f"edit_country error: {str(e)}")
#         raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def get_conversation(db: AsyncSession, order_id: int, current_user_id: int):  # Чат заказа для участника
    try:
        result = await db.execute(  # Чат + все сообщения (outer join)
            select(Conversation, Message)
            .outerjoin(Message, Conversation.id == Message.conversation_id)
            .where(
                and_(
                    Conversation.order_id == order_id,  # ← КРИТИЧНО!
                    or_(
                        Conversation.customer_id == current_user_id,
                        Conversation.executor_id == current_user_id,
                    ),
                )
            )
        )

        rows = result.all()
        if not rows:  # Чата ещё нет — заглушка из заказа
            order_result = await db.execute(
                select(Order.id, Order.customer_id, ExecutorOrder.executor_id)
                .outerjoin(ExecutorOrder, ExecutorOrder.order_id == Order.id)
                .where(Order.id == order_id)
            )
            order_row = order_result.first()
            if not order_row:  # Заказ не найден
                return None

            return ConversationRead(  # Пустой чат с id=0
                id=0,
                order_id=order_id,
                customer_id=order_row.customer_id,
                executor_id=order_row.executor_id or 0,
                messages=[],
            )

        conversation = rows[0].Conversation  # Первая строка — метаданные чата
        messages = [  # Сообщения из join (без None)
            MessageRead(
                id=msg.Message.id,
                sender_id=msg.Message.sender_id,
                content=msg.Message.content,
                file_url=msg.Message.file_url,
                is_read=msg.Message.is_read,
                created_at=msg.Message.created_at,  # ← НЕТ strftime()
            )
            for msg in rows
            if msg.Message is not None
        ]

        return ConversationRead(  # Полный ответ
            id=conversation.id,
            order_id=conversation.order_id,
            customer_id=conversation.customer_id,
            executor_id=conversation.executor_id,
            messages=messages,  # ← НЕТ created_at=strftime()
        )
    except Exception as e:  # Внутренняя ошибка
        logger.error(f"get_conversation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")  # ← detail!


# Опрерации для жалоб пользователей админситратору и вынесение вердиктов
async def add_complaint_conversation(  # Создание жалобы по заказу
    db: AsyncSession, schema: ComplaintConversationCreate, current_user_id: int
):

    try:

        # 1. ✅ Проверяем существующую жалобу
        result = await db.execute(  # Активная жалоба того же типа от пользователя
            select(ComplaintConversation).where(
                and_(
                    ComplaintConversation.order_id == schema.order_id,
                    ComplaintConversation.complainant_type == schema.complainant_type,
                    ComplaintConversation.complainant_id == current_user_id,
                    ComplaintConversation.status.in_(
                        ["new", "investigating"]
                    ),  # Только активные
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing:  # Не дублируем — возвращаем существующую
            logger.info(f"Жалоба уже существует: {existing.id}")
            await db.refresh(existing)  # Обновляем данные
            return existing

        # 2. ✅ Создаём новую жалобу
        conversation = ComplaintConversation(
            order_id=schema.order_id,
            complainant_type=schema.complainant_type,
            complainant_id=current_user_id,
            status="new",
        )
        db.add(conversation)
        await db.flush()  # Генерирует ID

        # 3. ✅ Системное сообщение
        sys_msg = ComplaintMessage(
            complaint_conversation_id=conversation.id,
            sender_type="system",
            sender_id=None,  # ✅ System не user
            content=f"Жалоба от {schema.complainant_type}: Заказ #{schema.order_id}",
            message_type="system",
        )
        db.add(sys_msg)
        await db.commit()
        await db.refresh(conversation)

        logger.info(f"Создана жалоба #{conversation.id}")
        return conversation

    except HTTPException:  # Пробрасываем FastAPI исключения
        raise  # Пробрасываем FastAPI исключения
    except Exception as e:  # Откат и 500
        await db.rollback()
        logger.error(f"create_complaint error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка создания жалобы")


async def add_complaint_message(  # Сообщение в чат жалобы
    db: AsyncSession,
    schema: ComplaintMessageCreate,
    current_user_id: int,
    complaint_id: Optional[int] = None,
) -> ComplaintMessage:
    try:
        # 1. Получаем заказ
        order_stmt = select(Order).where(Order.id == schema.order_id)
        order_result = await db.execute(order_stmt)
        order = order_result.scalar_one_or_none()
        if not order:  # Заказ не найден
            raise HTTPException(status_code=404, detail="Заказ не найден")

        # 1.1 Получаем executor_order (если нужно)
        executor_stmt = select(ExecutorOrder).where(
            ExecutorOrder.order_id == schema.order_id
        )
        executor_result = await db.execute(executor_stmt)
        executor_order = executor_result.scalar_one_or_none()

        # 2. Найти беседу по жалобе (одна на заказ)
        if complaint_id is not None:  # По id жалобы
            conversation_stmt = select(ComplaintConversation).where(
                ComplaintConversation.id == complaint_id,
            )
        else:  # По order_id
            conversation_stmt = select(ComplaintConversation).where(
                ComplaintConversation.order_id == schema.order_id,
            )
        conversation_result = await db.execute(conversation_stmt)
        conversation = conversation_result.scalar_one_or_none()

        if not conversation:  # Создаём беседу, если нет

            conversation = ComplaintConversation(
                order_id=schema.order_id,
                admin_id=schema.admin_id,  # если есть
            )
            db.add(conversation)
            await db.flush()
            logger.info(
                f"Создана беседа жалобы #{conversation.id} для заказа {schema.order_id}"
            )

        # 3. Проверка прав отправителя
        sender_type = schema.sender_type

        if sender_type == "admin":
            # Админ всегда может писать
            pass

        elif sender_type == "customer":  # Только заказчик заказа
            if current_user_id != order.customer_id:
                raise HTTPException(
                    status_code=403,
                    detail="Вы не являетесь заказчиком по этому заказу",
                )

        elif sender_type == "executor":  # Только назначенный исполнитель
            if not executor_order or current_user_id != executor_order.executor_id:
                raise HTTPException(
                    status_code=403,
                    detail="Вы не являетесь исполнителем по этому заказу",
                )

        else:  # Неверный тип отправителя
            raise HTTPException(status_code=400, detail="Неверный sender_type")

        # 4. Создать сообщение
        message = ComplaintMessage(
            complaint_conversation_id=conversation.id,
            sender_type=sender_type,
            sender_id=current_user_id,
            content=schema.content,
            message_type=schema.message_type or "text",
            file_url=schema.file_url,
            is_read=False,
        )
        db.add(message)
        await db.flush()
        try:
            await notify_complaint_message(  # Уведомление участникам жалобы
                db,
                order_id=schema.order_id,
                sender_user_id=current_user_id,
                sender_type=sender_type,
            )
        except Exception as notify_error:  # Не блокируем сохранение
            logger.warning("notify complaint_message failed: %s", notify_error)
        await db.commit()
        await db.refresh(message)

        logger.info(
            f"Добавлено сообщение #{message.id} в жалобу заказа {schema.order_id}"
        )
        return message

    except HTTPException:  # Пробрасываем
        raise

    except Exception as e:  # Откат и 500
        await db.rollback()
        logger.error(f"add_complaint_message error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка добавления сообщения")


async def get_complaint(  # Жалоба с историей для текущего пользователя
    db: AsyncSession, complaint_id: int, current_user_id: int
) -> Optional[ComplaintConversation]:

    try:
        # 1. ✅ Ищем жалобу с полной историей сообщений
        result = await db.execute(
            select(ComplaintConversation)
            .options(
                selectinload(ComplaintConversation.messages).order_by(
                    ComplaintMessage.created_at
                )
            )
            .where(
                or_(
                    ComplaintConversation.id == complaint_id,
                    # Свои жалобы
                    and_(
                        ComplaintConversation.complainant_id == current_user_id,
                        ComplaintConversation.status.in_(
                            ["new", "investigating", "active"]
                        ),
                    ),
                )
            )
        )
        conversation = result.scalar_one_or_none()

        if not conversation:  # Нет доступа или не найдена
            logger.warning(
                f"Жалоба #{complaint_id} недоступна для user #{current_user_id}"
            )
            return None  # Не 404, а None для фронта

        # 2. ✅ Помечаем непрочитанные как прочитанные
        for msg in conversation.messages:
            if not msg.is_read and msg.sender_id != current_user_id:
                msg.is_read = True

        await db.commit()  # Сохраняем is_read
        return conversation

    except Exception as e:  # Ошибка загрузки
        logger.error(f"get_complaint error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка получения жалобы")


# Получить все беседы с жалобами для администратора
async def get_complaints_for_admin(db: AsyncSession) -> list[ComplaintConversationRead]:  # Список всех жалоб
    try:
        # Выбираем все жалобы с нужными статусами
        result = await db.execute(select(ComplaintConversation))

        conversations = result.scalars().all()

        # Можно не возвращать None, а просто пустой список
        return conversations

    except Exception as e:  # Ошибка списка
        logger.error(f"get_complaints_for_admin error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка получения списка жалоб")


# получаем чат для споров между заказчиком, исполнителем и админитратором
async def get_complaint_chat_for_admin(  # Полный чат жалобы для админки
    db: AsyncSession,
    order_id: int,
):
    try:
        CustomerUser = aliased(User, name="customer_user")  # Алиас заказчика (не используется в запросах ниже)
        ExecutorUser = aliased(User, name="executor_user")  # Алиас исполнителя

        # ✅ ПРОСТОЙ запрос ТОЛЬКО ComplaintConversation
        stmt_conversation = select(ComplaintConversation).where(
            ComplaintConversation.order_id == order_id
        )
        result_conv = await db.execute(stmt_conversation)
        conversation = result_conv.scalar_one_or_none()

        if not conversation:  # Жалоба по заказу не найдена
            raise HTTPException(status_code=404, detail="Жалоба не найдена")

        # ✅ ОТДЕЛЬНЫЙ запрос Order
        stmt_order = select(Order).where(Order.id == order_id)
        result_order = await db.execute(stmt_order)
        order = result_order.scalar_one_or_none()

        # ✅ ОТДЕЛЬНЫЙ запрос Customer
        customer = None
        if order and order.customer_id:
            stmt_customer = select(User).where(User.id == order.customer_id)
            result_customer = await db.execute(stmt_customer)
            customer = result_customer.scalar_one_or_none()

        # ✅ ОТДЕЛЬНЫЙ запрос ExecutorOrder и Executor
        executor_user = None
        stmt_exec_order = select(ExecutorOrder).where(
            ExecutorOrder.order_id == order_id
        )
        result_exec = await db.execute(stmt_exec_order)
        exec_orders = result_exec.scalars().all()

        if exec_orders:  # Берём первого назначенного исполнителя
            executor_id = exec_orders[0].executor_id
            stmt_executor = select(User).where(User.id == executor_id)
            result_executor = await db.execute(stmt_executor)
            executor_user = result_executor.scalar_one_or_none()

        # ✅ ОТДЕЛЬНЫЙ запрос сообщений
        stmt_messages = (
            select(ComplaintMessage)
            .where(ComplaintMessage.complaint_conversation_id == conversation.id)
            .order_by(ComplaintMessage.created_at)
        )
        result_msg = await db.execute(stmt_messages)
        messages = result_msg.scalars().all()

        logger.info(  # Отладочная сводка
            f"🔍 Conversation ID: {conversation.id} | "
            f"Сообщений: {len(messages)} | "
            f"Customer: {customer.first_name if customer else 'None'}"
        )

        return {  # Словарь для админ-UI
            "id": conversation.id,
            "order_id": conversation.order_id,
            "admin_id": conversation.admin_id,
            "created_at": (
                conversation.created_at.isoformat() if conversation.created_at else None
            ),
            "customer": (
                {
                    "id": customer.id,
                    "first_name": customer.first_name,
                    "last_name": customer.last_name,
                }
                if customer
                else None
            ),
            "executor": (
                {
                    "id": executor_user.id,
                    "first_name": executor_user.first_name,
                    "last_name": executor_user.last_name,
                }
                if executor_user
                else None
            ),
            "order": {
                "id": order.id,
                "title": order.title,
                "budget": float(order.budget) if order and order.budget else None,
            },
            "messages": [
                {
                    "id": msg.id,
                    "content": msg.content,
                    "sender_type": msg.sender_type,
                    "sender_id": msg.sender_id,
                    "message_type": getattr(msg, "message_type", "text"),
                    "file_url": getattr(msg, "file_url", None),
                    "is_read": getattr(msg, "is_read", False),
                    "created_at": msg.created_at.isoformat(),
                }
                for msg in messages
            ],
        }

    except HTTPException:  # Пробрасываем
        raise
    except Exception as e:  # Ошибка сборки чата
        logger.error(f"get_complaint_chat_for_admin error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка загрузки чата жалобы")


async def update_complaint_status(  # Смена статуса и вердикта жалобы
    db: AsyncSession,
    complaint_id: int,
    status: str,
    verdict: Optional[str] = None,
    admin_id: Optional[int] = None,
) -> ComplaintConversation:

    try:
        # ✅ Валидация статусов
        valid_statuses = ["new", "investigating", "active", "verdict", "closed"]
        if status not in valid_statuses:  # Недопустимый статус
            raise HTTPException(status_code=400, detail=f"Неверный статус: {status}")

        # 1. ✅ Находим жалобу
        conversation = await db.get(ComplaintConversation, complaint_id)
        if not conversation:  # Не найдена
            raise HTTPException(status_code=404, detail="Жалоба не найдена")

        # 2. ✅ Проверяем админа (если передан)
        if admin_id:
            admin = await db.get(User, admin_id)
            if not admin or getattr(admin, "role", None) != "admin":  # Не админ
                raise HTTPException(status_code=403, detail="Требуется администратор")

        # 3. ✅ Логика статусов
        if status == "investigating" and not conversation.admin_id:  # Назначаем админа
            conversation.admin_id = admin_id

        if status == "closed" and not verdict:  # Закрытие без вердикта запрещено
            raise HTTPException(
                status_code=400, detail="Вердикт обязателен для закрытия"
            )

        # 4. ✅ Обновляем
        conversation.status = status
        conversation.verdict = verdict
        await db.commit()
        await db.refresh(conversation)

        logger.info(f"Жалоба #{complaint_id} → статус: {status}")
        return conversation

    except HTTPException:  # Пробрасываем
        raise
    except Exception as e:  # Откат и 500
        await db.rollback()
        logger.error(f"update_complaint_status error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка обновления статуса")


# добавляем вердикт администратора для жалобы
async def add_verdict_admin(  # Модерационное действие по жалобе (бан, предупреждение)
    db: AsyncSession,
    moderation_action_schema: ModerationActionCreate,
) -> ComplaintModerationAction:
    try:
        # 1. Проверяем, есть ли уже такое действие
        stmt_moderation = select(ComplaintModerationAction).where(
            ComplaintModerationAction.action_type
            == moderation_action_schema.action_type,
            ComplaintModerationAction.complaint_id
            == moderation_action_schema.complaint_id,
            ComplaintModerationAction.target_user_id
            == moderation_action_schema.target_user_id,
        )

        result_moderation = await db.execute(stmt_moderation)
        moderation_action_admin = result_moderation.scalar_one_or_none()

        if moderation_action_admin is not None:
            return moderation_action_admin  # уже есть

        # 2. Загружаем пользователя
        stmt_user = select(User).where(
            User.id == moderation_action_schema.target_user_id
        )

        result_user = await db.execute(stmt_user)
        user = result_user.scalar_one()  # Должен существовать

        # 3. Применяем действия модерации
        now = datetime.now(timezone.utc)  # Текущее UTC-время

        if moderation_action_schema.action_type == ActionType.BAN:  # Блокировка
            user.blocked = True
            if moderation_action_schema.duration_days is not None:  # Временный бан
                user.blocked_until = now + timedelta(
                    days=moderation_action_schema.duration_days
                )
            await db.flush()  # чтобы сразу зафиксировать изменение user

        elif moderation_action_schema.action_type == ActionType.WARNING:  # Предупреждение
            user.warnings_count += 1
            await db.flush()

        # 4. Создаём moderation_action
        moderation_action = ComplaintModerationAction(
            complaint_id=moderation_action_schema.complaint_id,
            action_type=moderation_action_schema.action_type,
            target_user_id=moderation_action_schema.target_user_id,
            amount_customer=moderation_action_schema.amount_customer,
            amount_executor=moderation_action_schema.amount_executor,
            comment=moderation_action_schema.comment,
            admin_id=moderation_action_schema.admin_id,
        )

        db.add(moderation_action)
        await db.commit()
        await db.refresh(moderation_action)

        return moderation_action

    except (NoResultFound, MultipleResultsFound) as exc:  # Пользователь/действие не найдены
        logger.error(
            f"Ошибка поиска ModerationAction или User: {str(exc)}", exc_info=True
        )
        raise HTTPException(
            status_code=404, detail="Пользователь или действие не найдены"
        )
    except Exception as e:  # Прочая ошибка
        logger.error(f"add_verdict_admin error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Ошибка при добавлении вердикта модератора"
        )


# Функции для поддержки пользователей администратором
async def create_support_conversation(  # Тема обращения в поддержку (без дубликатов)
    db: AsyncSession, conv: SupportConversationCreate
) -> SupportConversation:
    try:
        result = await db.execute(  # Уже есть диалог user+topic?
            select(SupportConversation).where(
                and_(
                    SupportConversation.user_id == conv.user_id,
                    SupportConversation.topic == conv.topic,
                )
            )
        )
        support_conversation = result.scalar_one_or_none()
        if support_conversation is not None:
            return support_conversation  # Возвращаем существующий
        db_conv = SupportConversation(user_id=conv.user_id, topic=conv.topic)
        db.add(db_conv)
        await db.commit()
        await db.refresh(db_conv)
        return db_conv

    except Exception as e:  # Откат и 500
        await db.rollback()
        logger.error(f"create_support_conversation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка добавления разговора")


async def get_support_conversation(  # Один диалог поддержки по id
    db: AsyncSession, conv_id: int, user_id: int = None
) -> SupportConversation | None:
    stmt = select(SupportConversation).where(SupportConversation.id == conv_id)
    if user_id is not None:  # Ограничение владельцем
        stmt = stmt.where(SupportConversation.user_id == user_id)

    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_conversations(  # Все диалоги поддержки пользователя
    db: AsyncSession, user_id: int
) -> list[SupportConversation]:
    stmt = select(SupportConversation).where(SupportConversation.user_id == user_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_support_message(  # Сообщение в чат поддержки
    db: AsyncSession, msg: SupportMessageCreate
) -> SupportMessage:
    try:
        db_msg = SupportMessage(
            support_conversation_id=msg.support_conversation_id,
            sender_type=msg.sender_type,
            sender_id=msg.sender_id,
            content=msg.content,
            message_type=msg.message_type,
            file_url=msg.file_url,
        )
        db.add(db_msg)
        await db.commit()
        await db.refresh(db_msg)
        return db_msg

    except Exception as e:  # Откат и 500
        await db.rollback()
        logger.error(f"create_support_message error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка добавления сообщения")


async def get_messages_by_conversation(  # История сообщений поддержки
    db: AsyncSession, conv_id: int
) -> list[SupportMessage]:
    stmt = (
        select(SupportMessage)
        .where(SupportMessage.support_conversation_id == conv_id)
        .order_by(SupportMessage.created_at)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def mark_messages_as_read(  # Пометить сообщения поддержки прочитанными
    db: AsyncSession, conv_id: int, is_read: bool = True
) -> None:
    stmt = (
        update(SupportMessage)
        .where(SupportMessage.support_conversation_id == conv_id)
        .values(is_read=is_read)
    )
    await db.execute(stmt)
    await db.commit()
