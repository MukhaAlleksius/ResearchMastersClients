import traceback
from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.works_materials_models import (
    CategoryWork,
    CategoryWorkMaster,
    Work,
    WorkMasterFromAdmin,
    WorkMasterMyself,
)
from schemas.works_materials_schemas import (
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

DEFAULT_CURRENCY = "BYN"


def _resolve_cost_currency(master_cost, master_currency, fallback_cost, fallback_currency):
    cost = float(master_cost if master_cost is not None else (fallback_cost or 0))
    currency = master_currency or fallback_currency or DEFAULT_CURRENCY
    return cost, currency


# добавление в базу данных категории работ
async def add_category_work(db: AsyncSession, category_work: CategoryWorkSchema):
    result = await db.execute(
        select(CategoryWork).where(CategoryWork.id == category_work.category_work_id)
    )
    existing_category_work = result.scalar_one_or_none()

    if existing_category_work:
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
        await db.commit()
        await db.refresh(existing_category_work)
        return existing_category_work

    db_category_work = CategoryWork(
        name=category_work.name,
        description=category_work.description,
        icon_name=category_work.icon_name,
        icon_color=category_work.icon_color,
        access_users=category_work.access_users,
        slug=category_work.slug,
    )
    db.add(db_category_work)
    await db.commit()
    await db.refresh(db_category_work)
    return db_category_work


# Изменяем досуп пользователей к определенной категории
async def change_access_users(
    db: AsyncSession, category_work_id: int, access_users: bool
):
    try:
        result = await db.execute(
            select(CategoryWork).where(CategoryWork.id == category_work_id)
        )
        category = result.scalar_one_or_none()

        if not category:
            raise HTTPException(status_code=404, detail="Категория не найдена")

        category.access_users = access_users
        print(f"🔄 ИЗМЕНИЛИ: {category.name} → access_users={access_users}")

        await db.commit()
        print("✅ COMMIT выполнен!")

        result = await db.execute(
            select(CategoryWork).where(CategoryWork.id == category_work_id)
        )
        fresh_category = result.scalar_one_or_none()

        print(f"🔍 ИЗ БАЗЫ: access_users={fresh_category.access_users}")
        return fresh_category

    except Exception as e:
        await db.rollback()
        print(f"💥 ОШИБКА: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# метод для предоставления информации о категориях работ для пользователей
async def get_categories_works_for_users(db: AsyncSession):
    try:
        list_categories_works = []
        result = await db.execute(
            select(CategoryWork).where(CategoryWork.access_users == True)
        )
        result_categories_works = result.scalars().all()
        if not result_categories_works:
            return []

        for category_work in result_categories_works:

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

    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# метод для предоставления информации о категориях работ для администратора
async def get_categories_works(db: AsyncSession):
    try:
        list_categories_works = []
        result = await db.execute(select(CategoryWork))
        result_categories_works = result.scalars().all()
        if not result_categories_works:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        for category_work in result_categories_works:

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

    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# добавление в базу данных работ
async def add_work(db: AsyncSession, work: WorkSchema):

    result_work = await db.execute(select(Work).where(Work.name_work == work.name_work))
    existing_work = result_work.scalar_one_or_none()

    if existing_work:
        existing_work.user_id = work.user_id
        existing_work.name_work = work.name_work
        existing_work.unit_measurement = work.unit_measurement
        existing_work.cost = work.cost
        existing_work.currency = work.currency or existing_work.currency or DEFAULT_CURRENCY
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
async def add_category_work_for_master(
    db: AsyncSession, category_work_master: CategoryWorkMasterSchema
):
    result = await db.execute(
        select(CategoryWorkMaster).where(
            and_(
                CategoryWorkMaster.master_id == category_work_master.master_id,
                CategoryWorkMaster.category_work_id
                == category_work_master.category_work_id,
            )
        )
    )
    existing_category_work = result.scalar_one_or_none()

    if existing_category_work:
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
async def get_categories_works_master(db: AsyncSession, master_id: int):
    try:
        list_categories_works_master = []
        result = await db.execute(
            select(CategoryWork, CategoryWorkMaster)
            .join(
                CategoryWorkMaster,
                CategoryWorkMaster.category_work_id == CategoryWork.id,
            )
            .where(CategoryWorkMaster.master_id == master_id)
        )
        result_categories_works_master = result.all()

        if not result_categories_works_master:
            return []

        for category_work, category_work_master in result_categories_works_master:
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

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Изменяем информацию о специализации в интерфейсе редактирования специализации
async def change_category_work_master(
    db: AsyncSession, category_work_master: CategoryWorkMasterSchema
):
    try:
        result_category_work_master = await db.execute(
            select(CategoryWorkMaster).where(
                CategoryWorkMaster.id == category_work_master.category_work_master_id
            )
        )
        existing_category_work_master = result_category_work_master.scalar_one_or_none()

        if existing_category_work_master is None:
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

        return CategoryWorkMasterSchema.from_orm(existing_category_work_master)

    except Exception as e:
        import traceback

        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Выбираем работы, относящиеся к конкретной категории работ
async def get_works_for_category_work(db: AsyncSession, category_work_id: int):
    try:
        result = await db.execute(
            select(Work, CategoryWork)
            .join(
                CategoryWork,
                CategoryWork.id == Work.category_work_id,
            )
            .where(Work.category_work_id == category_work_id)
        )
        # Получаем список кортежей (work, category_work)
        result_works = result.all()

        if not result_works:
            []

        list_works = [
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

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"[translate:Ошибка:] {str(e)}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист из списка работ, которые предоставляет администратор
async def add_work_master_from_admin(
    db: AsyncSession, work_master: WorkMasterFromAdminSchema
):
    work_result = await db.execute(
        select(Work).where(Work.id == work_master.work_id)
    )
    work = work_result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")

    cost, currency = _resolve_cost_currency(
        work_master.cost,
        work_master.currency,
        work.cost,
        work.currency,
    )

    result = await db.execute(
        select(WorkMasterFromAdmin).where(
            and_(
                WorkMasterFromAdmin.master_id == work_master.master_id,
                WorkMasterFromAdmin.work_id == work_master.work_id,
            )
        )
    )
    existing_work_master = result.scalar_one_or_none()

    if existing_work_master:
        existing_work_master.cost = cost
        existing_work_master.currency = currency
        await db.commit()
        await db.refresh(existing_work_master)
        return existing_work_master

    db_work_master = WorkMasterFromAdmin(
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
async def get_works_master_from_admin_for_category_work(
    db: AsyncSession, master_id: int, category_work_id: int
):
    try:
        result = await db.execute(
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

        if not result_works_master:
            return []
        list_works_master = []
        for work_master_from_admin, work in result_works_master:
            cost, currency = _resolve_cost_currency(
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

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист
async def add_work_master_myself(db: AsyncSession, work_master: WorkMasterMyselfSchema):
    result = await db.execute(
        select(WorkMasterMyself).where(
            and_(
                WorkMasterMyself.master_id == work_master.master_id,
                WorkMasterMyself.category_work_id == work_master.category_work_id,
                WorkMasterMyself.name_work == work_master.name_work,
                WorkMasterMyself.unit_measurement == work_master.unit_measurement,
                WorkMasterMyself.cost == work_master.cost,
            )
        )
    )
    existing_work_master = result.scalar_one_or_none()

    if existing_work_master:
        return existing_work_master

    # Создаём новую работу для мастера
    db_work_master = WorkMasterMyself(
        master_id=work_master.master_id,
        category_work_id=work_master.category_work_id,
        name_work=work_master.name_work,
        unit_measurement=work_master.unit_measurement,
        cost=work_master.cost,
        currency=work_master.currency or DEFAULT_CURRENCY,
    )

    # Добавляем и сохраняем в базе
    db.add(db_work_master)
    await db.commit()
    await db.refresh(db_work_master)

    return db_work_master


# удаление работы мастера от администратора
async def delete_work_master_from_admin(
    db: AsyncSession, work_master_from_admin_id: int
):
    result = await db.execute(
        select(WorkMasterFromAdmin).where(
            WorkMasterFromAdmin.id == work_master_from_admin_id
        )
    )
    work_master_from_admin = result.scalars().first()
    if not work_master_from_admin:
        return False  # Контакт не найден
    await db.delete(work_master_from_admin)
    await db.commit()
    return True


# Удаление работы мастера добавленной самим или измененной от администратора
async def delete_work_master_myself(db: AsyncSession, work_master_myself_id: int):
    result = await db.execute(
        select(WorkMasterMyself).where(WorkMasterMyself.id == work_master_myself_id)
    )
    work_master_myself = result.scalars().first()
    if not work_master_myself:
        return False  # Контакт не найден
    await db.delete(work_master_myself)
    await db.commit()
    return True


# Изменяем информацию о работе мастера для определенной категории, из собственных работ, или измененной
async def change_work_master_from_admin(
    db: AsyncSession, work_master_from_admin: WorkMasterFromAdminUpdateSchema
):
    try:
        result_work_master_from_admin = await db.execute(
            select(WorkMasterFromAdmin).where(
                WorkMasterFromAdmin.id
                == work_master_from_admin.work_master_from_admin_id
            )
        )
        existing_work_master_from_admin = (
            result_work_master_from_admin.scalar_one_or_none()
        )

        if existing_work_master_from_admin is None:
            raise HTTPException(
                status_code=404, detail="Такой работы нет для этого мастера"
            )

        if existing_work_master_from_admin.master_id != work_master_from_admin.master_id:
            raise HTTPException(status_code=403, detail="Нет доступа к этой работе")

        existing_work_master_from_admin.cost = work_master_from_admin.cost
        existing_work_master_from_admin.currency = (
            work_master_from_admin.currency or DEFAULT_CURRENCY
        )

        await db.commit()
        await db.refresh(existing_work_master_from_admin)

        work_result = await db.execute(
            select(Work).where(Work.id == existing_work_master_from_admin.work_id)
        )
        work = work_result.scalar_one_or_none()
        if not work:
            raise HTTPException(status_code=404, detail="Работа не найдена")

        cost, currency = _resolve_cost_currency(
            existing_work_master_from_admin.cost,
            existing_work_master_from_admin.currency,
            work.cost,
            work.currency,
        )

        return WorkMasterFromAdminReadSchema(
            work_master_from_admin_id=existing_work_master_from_admin.id,
            work_id=work.id,
            name_work=work.name_work,
            unit_measurement=work.unit_measurement,
            cost=cost,
            currency=currency,
        )

    except HTTPException:
        raise
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Изменяем информацию о работе мастера для определенной категории, из собственных работ, или измененной
# работы от администратора
async def change_work_master_myself(
    db: AsyncSession, work_master_myself: WorkMasterMyselfSchema
):
    try:
        result_work_master_myself = await db.execute(
            select(WorkMasterMyself).where(
                WorkMasterMyself.id == work_master_myself.work_master_myself_id
            )
        )
        existing_work_master_myself = result_work_master_myself.scalar_one_or_none()

        if existing_work_master_myself is None:
            raise HTTPException(
                status_code=404, detail="Такой специализации нет для этого мастера"
            )

        existing_work_master_myself.name_work = work_master_myself.name_work
        existing_work_master_myself.unit_measurement = (
            work_master_myself.unit_measurement
        )
        existing_work_master_myself.cost = work_master_myself.cost
        existing_work_master_myself.currency = (
            work_master_myself.currency or DEFAULT_CURRENCY
        )

        await db.commit()
        await db.refresh(existing_work_master_myself)

        return WorkMasterMyselfReadSchema(
            work_master_myself_id=existing_work_master_myself.id,
            name_work=existing_work_master_myself.name_work,
            unit_measurement=existing_work_master_myself.unit_measurement,
            cost=existing_work_master_myself.cost,
            currency=existing_work_master_myself.currency,
        )

    except Exception as e:
        import traceback

        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# Выбираем работы, которые выбрал для себя мастер из своих собственных работ
# или измененных работ от администратора
async def get_works_master_myself_for_category_work(
    db: AsyncSession, master_id: int, category_work_id: int
):
    try:
        list_works_master = []
        result = await db.execute(
            select(WorkMasterMyself).where(
                and_(
                    WorkMasterMyself.master_id == master_id,
                    WorkMasterMyself.category_work_id == category_work_id,
                )
            )
        )
        result_works_master = result.scalars().all()

        if not result_works_master:
            return []
        list_works_master = [
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

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")
