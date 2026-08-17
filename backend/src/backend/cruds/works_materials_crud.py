import traceback  # Трассировка для отладки ошибок
from typing import Optional  # Опциональные типы

from fastapi import HTTPException  # HTTP-ошибки API
from sqlalchemy import and_, select  # AND-условия и SELECT
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from models.works_materials_models import (  # ORM категорий и работ
    CategoryWork,
    CategoryWorkMaster,
    Work,
    WorkMasterFromAdmin,
    WorkMasterMyself,
)
from schemas.works_materials_schemas import (  # Pydantic-схемы запросов/ответов
    CategoryWorkMasterReadSchema,
    CategoryWorkMasterSchema,
    CategoryWorkSchema,
    WorkMasterFromAdminReadSchema,
    WorkMasterFromAdminSchema,
    WorkMasterFromAdminUpdateSchema,
    WorkMasterMyselfReadSchema,
    WorkMasterMyselfSchema,
    WorkReadSchema,
    WorkSchema,
)

DEFAULT_CURRENCY = "BYN"  # Валюта по умолчанию


def _resolve_cost_currency(
    master_cost, master_currency, fallback_cost, fallback_currency
):  # Стоимость и валюта с fallback
    cost = float(
        master_cost if master_cost is not None else (fallback_cost or 0)
    )  # Цена мастера или базовая
    currency = (
        master_currency or fallback_currency or DEFAULT_CURRENCY
    )  # Валюта с запасным вариантом
    return cost, currency  # Пара для ответа


# добавление в базу данных категории работ
async def add_category_work(
    db: AsyncSession, category_work: CategoryWorkSchema
):  # Создание/обновление категории работ
    result = await db.execute(  # Ищем категорию по id из схемы
        select(CategoryWork).where(CategoryWork.id == category_work.category_work_id)
    )
    existing_category_work = result.scalar_one_or_none()

    if existing_category_work:  # Обновляем существующую категорию
        existing_category_work.name = category_work.name
        existing_category_work.description = (
            category_work.description or existing_category_work.description
        )
        existing_category_work.icon_name = (
            category_work.icon_name or existing_category_work.icon_name
        )
        existing_category_work.icon_color = (
            category_work.icon_color or existing_category_work.icon_color
        )
        existing_category_work.access_users = category_work.access_users
        existing_category_work.slug = category_work.slug
        await db.commit()  # Сохраняем изменения
        await db.refresh(existing_category_work)  # Обновляем объект из БД
        return existing_category_work

    db_category_work = CategoryWork(  # Новая категория
        name=category_work.name,
        description=category_work.description,
        icon_name=category_work.icon_name,
        icon_color=category_work.icon_color,
        access_users=category_work.access_users,
        slug=category_work.slug,
    )
    db.add(db_category_work)  # Добавляем в сессию
    await db.commit()  # Фиксируем
    await db.refresh(db_category_work)  # Читаем id и поля из БД
    return db_category_work


# Изменяем досуп пользователей к определенной категории
async def change_access_users(  # Переключение access_users у категории
    db: AsyncSession, category_work_id: int, access_users: bool
):
    try:
        result = await db.execute(  # Загружаем категорию
            select(CategoryWork).where(CategoryWork.id == category_work_id)
        )
        category = result.scalar_one_or_none()

        if not category:  # Категория не найдена
            raise HTTPException(status_code=404, detail="Категория не найдена")

        category.access_users = access_users  # Меняем флаг доступа
        print(
            f"🔄 ИЗМЕНИЛИ: {category.name} → access_users={access_users}"
        )  # Отладочный вывод

        await db.commit()  # Сохраняем
        print("✅ COMMIT выполнен!")  # Отладка commit

        result = await db.execute(  # Перечитываем для проверки
            select(CategoryWork).where(CategoryWork.id == category_work_id)
        )
        fresh_category = result.scalar_one_or_none()

        print(
            f"🔍 ИЗ БАЗЫ: access_users={fresh_category.access_users}"
        )  # Отладка значения
        return fresh_category

    except Exception as e:  # Любая ошибка — откат и 500
        await db.rollback()
        print(f"💥 ОШИБКА: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# метод для предоставления информации о категориях работ для пользователей
async def get_categories_works_for_users(
    db: AsyncSession,
):  # Категории с access_users=True
    try:
        list_categories_works = []  # Список схем для ответа
        result = await db.execute(  # Только доступные пользователям категории
            select(CategoryWork).where(CategoryWork.access_users == True)
        )
        result_categories_works = result.scalars().all()
        if not result_categories_works:  # Пустой результат
            return []

        for category_work in result_categories_works:  # ORM → схема

            category_work_schema = CategoryWorkSchema(
                category_work_id=category_work.id,
                name=category_work.name or "",
                description=category_work.description or "",
                icon_name=category_work.icon_name or "",
                icon_color=category_work.icon_color or "",
                access_users=category_work.access_users or False,
                slug=category_work.slug or "",
            )
            list_categories_works.append(category_work_schema)
        return list_categories_works

    except Exception as e:  # Ошибка чтения
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# метод для предоставления информации о категориях работ для администратора
async def get_categories_works(db: AsyncSession):  # Все категории для админа
    try:
        list_categories_works = []  # Список схем
        result = await db.execute(select(CategoryWork))  # Все категории
        result_categories_works = result.scalars().all()
        if not result_categories_works:  # Нет категорий
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        for category_work in result_categories_works:  # ORM → схема

            category_work_schema = CategoryWorkSchema(
                category_work_id=category_work.id,
                name=category_work.name or "",
                description=category_work.description or "",
                icon_name=category_work.icon_name or "",
                icon_color=category_work.icon_color or "",
                access_users=category_work.access_users or False,
                slug=category_work.slug or "",
            )
            list_categories_works.append(category_work_schema)
        return list_categories_works

    except Exception as e:  # Ошибка чтения
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# добавление в базу данных работ
async def add_work(
    db: AsyncSession, work: WorkSchema
):  # Создание/обновление работы по имени

    result_work = await db.execute(
        select(Work).where(Work.name_work == work.name_work)
    )  # По имени
    existing_work = result_work.scalar_one_or_none()

    if existing_work:  # Обновляем существующую работу
        existing_work.user_id = work.user_id
        existing_work.name_work = work.name_work
        existing_work.unit_measurement = work.unit_measurement
        existing_work.cost = work.cost
        existing_work.currency = (
            work.currency or existing_work.currency or DEFAULT_CURRENCY
        )
        existing_work.category_work_id = work.category_work_id

        await db.commit()
        await db.refresh(existing_work)
        return existing_work

    # Создаём новую работ
    db_work = Work(
        user_id=work.user_id,
        name_work=work.name_work,
        unit_measurement=work.unit_measurement,
        cost=work.cost,
        currency=work.currency or DEFAULT_CURRENCY,
        category_work_id=work.category_work_id,
    )

    # Добавляем и сохраняем в базе
    db.add(db_work)
    await db.commit()
    await db.refresh(db_work)

    return db_work


# # метод для предоставления информации о работах для категории работ
# async def get_works_for_category_work(
#     db: AsyncSession, user_id: int, name_category_work: str
# ):
#     try:
#         result_category = await db.execute(
#             select(CategoryWork).where(CategoryWork.name == name_category_work)
#         )
#         category_work_obj = result_category.scalar_one_or_none()
#         if not category_work_obj:
#             raise HTTPException(status_code=404, detail="Категория работы не найдена")

#         category_work_id = category_work_obj.id

#         result_works = await db.execute(
#             select(Work).where(
#                 and_(Work.user_id == user_id, Work.category_work_id == category_work_id)
#             )
#         )
#         works = result_works.scalars().all()

#         list_works = [
#             WorkReadSchema(
#                 name_work=work.name_work,
#                 unit_measurement=work.unit_measurement,
#                 cost=work.cost,
#                 category_work=name_category_work,
#             )
#             for work in works
#         ]

#         return list_works

#     except Exception as e:
#         print(
#             f"Ошибка в get_works_for_category_work: {str(e)}"
#         )  # Лог в консоль или лог-файл

#         raise HTTPException(status_code=403, detail=f"[translate:Ошибка]: {str(e)}")


# добавление в базу данных категории работ
async def add_category_work_for_master(  # Специализация мастера по категории
    db: AsyncSession, category_work_master: CategoryWorkMasterSchema
):
    result = await db.execute(  # Уже есть запись мастер+категория?
        select(CategoryWorkMaster).where(
            and_(
                CategoryWorkMaster.master_id == category_work_master.master_id,
                CategoryWorkMaster.category_work_id
                == category_work_master.category_work_id,
            )
        )
    )
    existing_category_work = result.scalar_one_or_none()

    if existing_category_work:  # Обновляем поля специализации
        existing_category_work.name = category_work_master.name
        existing_category_work.description = category_work_master.description
        existing_category_work.experience = category_work_master.experience
        existing_category_work.cost_hour = category_work_master.cost_hour

        await db.commit()
        await db.refresh(existing_category_work)
        return existing_category_work

    # Создаём новую категорию работ
    db_category_work = CategoryWorkMaster(
        master_id=category_work_master.master_id,
        category_work_id=category_work_master.category_work_id,
        description=category_work_master.description,
        experience=category_work_master.experience,
        cost_hour=category_work_master.cost_hour,
    )

    # Добавляем и сохраняем в базе
    db.add(db_category_work)
    await db.commit()
    await db.refresh(db_category_work)

    return db_category_work


# Выбираем категории работ для предоставления их в виде
# карточек на экране со специализациями мастера
async def get_categories_works_master(
    db: AsyncSession, master_id: int
):  # Карточки специализаций мастера
    try:
        list_categories_works_master = []  # Список для ответа
        result = await db.execute(  # JOIN категории и специализации мастера
            select(CategoryWork, CategoryWorkMaster)
            .join(
                CategoryWorkMaster,
                CategoryWorkMaster.category_work_id == CategoryWork.id,
            )
            .where(CategoryWorkMaster.master_id == master_id)
        )
        result_categories_works_master = result.all()

        if not result_categories_works_master:  # Нет специализаций
            return []

        for (
            category_work,
            category_work_master,
        ) in result_categories_works_master:  # Пара ORM → схема
            category_work_master_schema = CategoryWorkMasterReadSchema(
                category_work_id=category_work.id,
                name=category_work.name or "",
                icon_name=category_work.icon_name or "",
                category_work_master_id=category_work_master.id,
                description_master=category_work_master.description or "",
                experience=category_work_master.experience,
                cost_hour=category_work_master.cost_hour,
            )

            list_categories_works_master.append(category_work_master_schema)

        return list_categories_works_master

    except Exception as e:  # Ошибка с трассировкой
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Изменяем информацию о специализации в интерфейсе редактирования специализации
async def change_category_work_master(  # Редактирование специализации мастера
    db: AsyncSession, category_work_master: CategoryWorkMasterSchema
):
    try:
        result_category_work_master = await db.execute(  # Запись по id специализации
            select(CategoryWorkMaster).where(
                CategoryWorkMaster.id == category_work_master.category_work_master_id
            )
        )
        existing_category_work_master = result_category_work_master.scalar_one_or_none()

        if existing_category_work_master is None:  # Нет такой специализации
            raise HTTPException(
                status_code=404, detail="Такой специализации нет для этого мастера"
            )

        # Обновление полей напрямую без вложенного begin
        existing_category_work_master.description = category_work_master.description
        existing_category_work_master.experience = category_work_master.experience
        existing_category_work_master.cost_hour = category_work_master.cost_hour

        # Коммит изменений
        await db.commit()

        # Обновление состояния объекта из базы
        await db.refresh(existing_category_work_master)

        return CategoryWorkMasterSchema.from_orm(
            existing_category_work_master
        )  # Схема для ответа

    except Exception as e:  # Ошибка с трассировкой
        import traceback

        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Выбираем работы, относящиеся к конкретной категории работ
async def get_works_for_category_work(
    db: AsyncSession, category_work_id: int
):  # Работы категории для каталога
    try:
        result = await db.execute(  # JOIN работа + категория
            select(Work, CategoryWork)
            .join(
                CategoryWork,
                CategoryWork.id == Work.category_work_id,
            )
            .where(Work.category_work_id == category_work_id)
        )
        # Получаем список кортежей (work, category_work)
        result_works = result.all()

        if not result_works:  # Пусто — неявный return []
            []

        list_works = [  # Список схем для API
            WorkReadSchema(
                work_id=work.id,
                name_work=work.name_work,
                unit_measurement=work.unit_measurement,
                cost=work.cost,
                currency=work.currency or DEFAULT_CURRENCY,
                category_work=category_work.name,
            )
            for work, category_work in result_works
        ]

        return list_works

    except Exception as e:  # Ошибка чтения
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"[translate:Ошибка:] {str(e)}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист из списка работ, которые предоставляет администратор
async def add_work_master_from_admin(  # Мастер выбирает работу из каталога админа
    db: AsyncSession, work_master: WorkMasterFromAdminSchema
):
    work_result = await db.execute(  # Базовая работа из справочника
        select(Work).where(Work.id == work_master.work_id)
    )
    work = work_result.scalar_one_or_none()
    if not work:  # Работа не найдена
        raise HTTPException(status_code=404, detail="Работа не найдена")

    cost, currency = _resolve_cost_currency(  # Цена/валюта мастера или из Work
        work_master.cost,
        work_master.currency,
        work.cost,
        work.currency,
    )

    result = await db.execute(  # Уже есть связь мастер+работа?
        select(WorkMasterFromAdmin).where(
            and_(
                WorkMasterFromAdmin.master_id == work_master.master_id,
                WorkMasterFromAdmin.work_id == work_master.work_id,
            )
        )
    )
    existing_work_master = result.scalar_one_or_none()

    if existing_work_master:  # Обновляем цену
        existing_work_master.cost = cost
        existing_work_master.currency = currency
        await db.commit()
        await db.refresh(existing_work_master)
        return existing_work_master

    db_work_master = WorkMasterFromAdmin(  # Новая запись мастера
        master_id=work_master.master_id,
        work_id=work_master.work_id,
        cost=cost,
        currency=currency,
    )

    # Добавляем и сохраняем в базе
    db.add(db_work_master)
    await db.commit()
    await db.refresh(db_work_master)

    return db_work_master


# Выбираем работы, которые выбрал для себя мастер из работ добавленных администратором
async def get_works_master_from_admin_for_category_work(  # Работы мастера из каталога по категории
    db: AsyncSession, master_id: int, category_work_id: int
):
    try:
        result = await db.execute(  # JOIN WorkMasterFromAdmin + Work
            select(WorkMasterFromAdmin, Work)
            .join(Work, WorkMasterFromAdmin.work_id == Work.id)
            .where(
                and_(
                    WorkMasterFromAdmin.master_id == master_id,
                    Work.category_work_id == category_work_id,
                )
            )
        )
        result_works_master = result.all()

        if not result_works_master:  # Нет работ
            return []
        list_works_master = []  # Список схем
        for work_master_from_admin, work in result_works_master:  # Пара ORM
            cost, currency = _resolve_cost_currency(  # Итоговая цена/валюта
                work_master_from_admin.cost,
                work_master_from_admin.currency,
                work.cost,
                work.currency,
            )
            list_works_master.append(
                WorkMasterFromAdminReadSchema(
                    work_master_from_admin_id=work_master_from_admin.id,
                    work_id=work.id,
                    name_work=work.name_work,
                    unit_measurement=work.unit_measurement,
                    cost=cost,
                    currency=currency,
                )
            )

        return list_works_master

    except Exception as e:  # Ошибка чтения
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист
async def ensure_work_master_myself(  # Upsert своей работы мастера (для сметы и каталога)
    db: AsyncSession,
    *,
    master_id: int,
    category_work_id: int,
    name_work: str,
    unit_measurement: str,
    cost,
    currency: Optional[str] = None,
) -> WorkMasterMyself:
    normalized_name = (name_work or "").strip()
    normalized_unit = (unit_measurement or "").strip()
    if (
        not master_id
        or not category_work_id
        or not normalized_name
        or not normalized_unit
    ):
        raise ValueError("Недостаточно данных для сохранения работы мастера")

    result = await db.execute(
        select(WorkMasterMyself).where(
            and_(
                WorkMasterMyself.master_id == master_id,
                WorkMasterMyself.category_work_id == category_work_id,
                WorkMasterMyself.name_work == normalized_name,
                WorkMasterMyself.unit_measurement == normalized_unit,
            )
        )
    )
    existing = result.scalar_one_or_none()
    resolved_currency = currency or DEFAULT_CURRENCY
    if existing:
        existing.cost = cost
        existing.currency = resolved_currency
        return existing

    db_work_master = WorkMasterMyself(
        master_id=master_id,
        category_work_id=category_work_id,
        name_work=normalized_name,
        unit_measurement=normalized_unit,
        cost=cost,
        currency=resolved_currency,
    )
    db.add(db_work_master)
    return db_work_master


async def add_work_master_myself(
    db: AsyncSession, work_master: WorkMasterMyselfSchema
):  # Своя работа мастера
    db_work_master = await ensure_work_master_myself(
        db,
        master_id=work_master.master_id,
        category_work_id=work_master.category_work_id,
        name_work=work_master.name_work,
        unit_measurement=work_master.unit_measurement,
        cost=work_master.cost,
        currency=work_master.currency,
    )
    await db.commit()
    await db.refresh(db_work_master)
    return db_work_master


# удаление работы мастера от администратора
async def delete_work_master_from_admin(  # Удаление WorkMasterFromAdmin по id
    db: AsyncSession, work_master_from_admin_id: int
):
    result = await db.execute(  # Ищем запись
        select(WorkMasterFromAdmin).where(
            WorkMasterFromAdmin.id == work_master_from_admin_id
        )
    )
    work_master_from_admin = result.scalars().first()
    if not work_master_from_admin:  # Не найдена
        return False  # Контакт не найден
    await db.delete(work_master_from_admin)  # Удаляем
    await db.commit()  # Фиксируем
    return True  # Успех


# Удаление работы мастера добавленной самим или измененной от администратора
async def delete_work_master_myself(
    db: AsyncSession, work_master_myself_id: int
):  # Удаление своей работы
    result = await db.execute(  # Ищем запись
        select(WorkMasterMyself).where(WorkMasterMyself.id == work_master_myself_id)
    )
    work_master_myself = result.scalars().first()
    if not work_master_myself:  # Не найдена
        return False  # Контакт не найден
    await db.delete(work_master_myself)  # Удаляем
    await db.commit()  # Фиксируем
    return True  # Успех


# удаление категории работ мастера
async def delete_category_work_master(
    db: AsyncSession, master_id: int, category_work_id: int
):
    result_category_work_master = await db.execute(
        select(CategoryWorkMaster).where(
            CategoryWorkMaster.master_id == master_id,
            CategoryWorkMaster.category_work_id == category_work_id,
        )
    )
    category_work_master = result_category_work_master.scalars().first()
    if not category_work_master:
        return False

    result_work_master_from_admin = await db.execute(
        select(WorkMasterFromAdmin)
        .join(Work, WorkMasterFromAdmin.work_id == Work.id)
        .where(
            WorkMasterFromAdmin.master_id == master_id,
            Work.category_work_id == category_work_id,
        )
    )
    for work_master_from_admin in result_work_master_from_admin.scalars().all():
        await db.delete(work_master_from_admin)

    result_work_master_myself = await db.execute(
        select(WorkMasterMyself).where(
            WorkMasterMyself.master_id == master_id,
            WorkMasterMyself.category_work_id == category_work_id,
        )
    )
    for work_master_myself in result_work_master_myself.scalars().all():
        await db.delete(work_master_myself)

    await db.delete(category_work_master)
    await db.commit()
    return True


# Изменяем информацию о работе мастера для определенной категории, из собственных работ, или измененной
async def change_work_master_from_admin(  # Обновление цены работы из каталога админа
    db: AsyncSession, work_master_from_admin: WorkMasterFromAdminUpdateSchema
):
    try:
        result_work_master_from_admin = await db.execute(  # Запись мастера по id
            select(WorkMasterFromAdmin).where(
                WorkMasterFromAdmin.id
                == work_master_from_admin.work_master_from_admin_id
            )
        )
        existing_work_master_from_admin = (
            result_work_master_from_admin.scalar_one_or_none()
        )

        if existing_work_master_from_admin is None:  # Нет записи
            raise HTTPException(
                status_code=404, detail="Такой работы нет для этого мастера"
            )

        if (
            existing_work_master_from_admin.master_id
            != work_master_from_admin.master_id
        ):  # Чужая работа
            raise HTTPException(status_code=403, detail="Нет доступа к этой работе")

        existing_work_master_from_admin.cost = work_master_from_admin.cost  # Новая цена
        existing_work_master_from_admin.currency = (
            work_master_from_admin.currency or DEFAULT_CURRENCY
        )

        await db.commit()
        await db.refresh(existing_work_master_from_admin)

        work_result = await db.execute(  # Базовая работа для названия и единиц
            select(Work).where(Work.id == existing_work_master_from_admin.work_id)
        )
        work = work_result.scalar_one_or_none()
        if not work:  # Справочная работа удалена
            raise HTTPException(status_code=404, detail="Работа не найдена")

        cost, currency = _resolve_cost_currency(  # Итог для ответа
            existing_work_master_from_admin.cost,
            existing_work_master_from_admin.currency,
            work.cost,
            work.currency,
        )

        return WorkMasterFromAdminReadSchema(  # Схема ответа
            work_master_from_admin_id=existing_work_master_from_admin.id,
            work_id=work.id,
            name_work=work.name_work,
            unit_measurement=work.unit_measurement,
            cost=cost,
            currency=currency,
        )

    except HTTPException:  # Пробрасываем HTTP-ошибки
        raise
    except Exception as e:  # Прочие ошибки
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Изменяем информацию о работе мастера для определенной категории, из собственных работ, или измененной
# работы от администратора
async def change_work_master_myself(  # Редактирование своей работы мастера
    db: AsyncSession, work_master_myself: WorkMasterMyselfSchema
):
    try:
        result_work_master_myself = await db.execute(  # Запись по id
            select(WorkMasterMyself).where(
                WorkMasterMyself.id == work_master_myself.work_master_myself_id
            )
        )
        existing_work_master_myself = result_work_master_myself.scalar_one_or_none()

        if existing_work_master_myself is None:  # Нет записи
            raise HTTPException(
                status_code=404, detail="Такой специализации нет для этого мастера"
            )

        existing_work_master_myself.name_work = (
            work_master_myself.name_work
        )  # Обновляем поля
        existing_work_master_myself.unit_measurement = (
            work_master_myself.unit_measurement
        )
        existing_work_master_myself.cost = work_master_myself.cost
        existing_work_master_myself.currency = (
            work_master_myself.currency or DEFAULT_CURRENCY
        )

        await db.commit()
        await db.refresh(existing_work_master_myself)

        return WorkMasterMyselfReadSchema(  # Схема ответа
            work_master_myself_id=existing_work_master_myself.id,
            name_work=existing_work_master_myself.name_work,
            unit_measurement=existing_work_master_myself.unit_measurement,
            cost=existing_work_master_myself.cost,
            currency=existing_work_master_myself.currency,
        )

    except Exception as e:  # Ошибка обновления
        import traceback

        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Выбираем работы, которые выбрал для себя мастер из своих собственных работ
# или измененных работ от администратора
async def get_works_master_myself_for_category_work(  # Свои работы мастера по категории
    db: AsyncSession, master_id: int, category_work_id: int
):
    try:
        list_works_master = []  # Список схем (перезаписывается ниже)
        result = await db.execute(  # WorkMasterMyself по мастеру и категории
            select(WorkMasterMyself).where(
                and_(
                    WorkMasterMyself.master_id == master_id,
                    WorkMasterMyself.category_work_id == category_work_id,
                )
            )
        )
        result_works_master = result.scalars().all()

        if not result_works_master:  # Нет работ
            return []
        list_works_master = [  # ORM → схемы
            WorkMasterMyselfReadSchema(
                work_master_myself_id=work_master_myself.id,
                name_work=work_master_myself.name_work,
                unit_measurement=work_master_myself.unit_measurement,
                cost=work_master_myself.cost,
                currency=work_master_myself.currency or DEFAULT_CURRENCY,
            )
            for work_master_myself in result_works_master
        ]

        return list_works_master

    except Exception as e:  # Ошибка чтения
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")
