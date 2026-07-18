import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_db
from core.auth import (
    ensure_same_user,
    get_current_admin_user,
    get_current_user,
    get_optional_current_user,
)
from core.access import assert_can_view_executor_profile
from cruds.works_materials_crud import (
    add_category_work,
    add_category_work_for_master,
    add_work,
    add_work_master_from_admin,
    add_work_master_myself,
    change_access_users,
    change_category_work_master,
    change_work_master_from_admin,
    change_work_master_myself,
    delete_work_master_from_admin,
    delete_work_master_myself,
    get_categories_works,
    get_categories_works_for_users,
    get_categories_works_master,
    get_works_for_category_work,
    get_works_master_from_admin_for_category_work,
    get_works_master_myself_for_category_work,
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
from schemas.users_schemas import UserCommonSchema
from fastapi import status


logger = logging.getLogger(__name__)


router = APIRouter(prefix="", tags=["users"])


# Добавляем данные на сервер и возвращаем пользователю категории работ
@router.post("/add_category_work")
async def add_category_work_api(
    category_work: CategoryWorkSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        category_work_obj = await add_category_work(db=db, category_work=category_work)
        return {
            "id": category_work_obj.id,
            "name": category_work_obj.name,
            "description": category_work_obj.description,
            "icon_name": category_work_obj.icon_name,
            "icon_color": category_work_obj.icon_color,  # ← Возвращаем цвет!
            "access_users": category_work_obj.access_users,
        }
    except HTTPException:
        raise HTTPException(status_code=403, detail="Ошибка создания категории")


class AccessRequest(BaseModel):
    access_users: bool


@router.put("/change_access_users/{category_work_id}")
async def change_access_users_api(
    category_work_id: int,
    request: AccessRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        category_work = await change_access_users(
            db=db,
            category_work_id=category_work_id,
            access_users=request.access_users,  # ✅ bool значение
        )
        return category_work
    except HTTPException:
        raise


# получаем из базы данных все категории работ для пользователей
@router.get("/categories_works_for_users", response_model=list[CategoryWorkSchema])
async def get_category_work_api(
    db: AsyncSession = Depends(get_db),
):
    try:
        categories_works = await get_categories_works_for_users(db=db)
        return categories_works
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# получаем из базы данных все категории работ для администратора
@router.get("/categories_works", response_model=list[CategoryWorkSchema])
async def get_category_work_api(
    db: AsyncSession = Depends(get_db),
):
    try:
        categories_works = await get_categories_works(db=db)
        return categories_works
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Добавляем данные на сервер и возвращаем пользователю работы для категории работ
@router.post("/add_work")
async def add_work_api(
    work_schema: WorkSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        work = await add_work(db=db, work=work_schema)
        return {
            "id": work.id,
            "name_work": work.name_work,
            "unit_measurement": work.unit_measurement,
            "cost": work.cost,
            "currency": work.currency,
        }
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем работы, относящиеся к конкретной категории работ
@router.get(
    "/works_for_category_work/{category_work_id}",
    response_model=list[WorkReadSchema],
)
async def get_works_for_category_work_api(
    category_work_id: int,
    db: AsyncSession = Depends(get_db),
):
    try:
        works = await get_works_for_category_work(
            db=db, category_work_id=category_work_id
        )
        return works
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# # получаем из базы данных все работы для категории работ
# @router.get("/works_for_category_work", response_model=list[WorkReadSchema])
# async def get_works_for_category_work_api(
#     db: AsyncSession = Depends(get_db),
#     user_id: int = Query(...),
#     name_category_work: str = Query(...),
# ):
#     try:
#         works = await get_works_for_category_work(
#             db=db, user_id=user_id, name_category_work=name_category_work
#         )
#         return works
#     except HTTPException as e:
#         raise HTTPException(status_code=e.status_code, detail=f"Ошибка: {e.detail}")


# Добавляем специализацию пользователя на сервер
@router.post("/add_category_work_master", response_model=CategoryWorkMasterSchema)
async def add_category_work_for_master_api(
    category_work_master: CategoryWorkMasterSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, category_work_master.master_id)
    try:
        category_work_master = await add_category_work_for_master(
            db=db, category_work_master=category_work_master
        )
        return category_work_master
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем категории работ для предоставления их в виде
# карточек на экране со специализациями мастера
@router.get(
    "/categories_works_master/{master_id}",
    response_model=list[CategoryWorkMasterReadSchema],
)
async def get_category_work_master_api(
    master_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=master_id, current_user=current_user
    )
    try:
        categories_works = await get_categories_works_master(db=db, master_id=master_id)
        return categories_works
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Изменяем информацию о специализации в интерфейсе редактирования специализации
@router.put("/change_category_work_master", response_model=CategoryWorkMasterSchema)
async def change_category_work_master_api(
    category_work_master: CategoryWorkMasterSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, category_work_master.master_id)
    try:
        category_work_master = await change_category_work_master(
            db=db, category_work_master=category_work_master
        )
        return category_work_master
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист из списка работ, которые предоставляет администратор
@router.post("/add_work_master_from_admin")
async def add_work_master_from_admin_api(
    work_master: WorkMasterFromAdminSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, work_master.master_id)
    try:
        work_master = await add_work_master_from_admin(db=db, work_master=work_master)
        return work_master
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист
@router.post("/add_work_master_myself")
async def add_work_master_myself_api(
    work_master: WorkMasterMyselfSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, work_master.master_id)
    try:
        work_master = await add_work_master_myself(db=db, work_master=work_master)
        return work_master
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем работы, которые выбрал для себя мастер из работ добавленных администратором
@router.get(
    "/works_master_from_admin/{master_id}/{category_work_id}",
    response_model=list[WorkMasterFromAdminReadSchema],
)
async def get_works_master_from_admin_for_category_work_api(
    master_id: int,
    category_work_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=master_id, current_user=current_user
    )
    try:
        categories_works = await get_works_master_from_admin_for_category_work(
            db=db, master_id=master_id, category_work_id=category_work_id
        )
        return categories_works
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# удаление работы мастера от администратора
@router.delete("/delete_work_master_from_admin/{work_master_from_admin_id}")
async def delete_work_master_from_admin_api(
    work_master_from_admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        await delete_work_master_from_admin(
            db=db, work_master_from_admin_id=work_master_from_admin_id
        )
        return JSONResponse(
            content={"detail": "Удаление успешно"}, status_code=status.HTTP_200_OK
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Удаление работы мастера добавленной самим или измененной от администратора
@router.delete("/delete_work_master_myself/{work_master_myself_id}")
async def delete_work_master_myself_api(
    work_master_myself_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        await delete_work_master_myself(
            db=db, work_master_myself_id=work_master_myself_id
        )
        return JSONResponse(
            content={"detail": "Удаление успешно"}, status_code=status.HTTP_200_OK
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Изменяем информацию о работе мастера для определенной категории, добавленной из работ администатора
@router.put(
    "/change_work_master_from_admin", response_model=WorkMasterFromAdminReadSchema
)
async def change_work_master_from_admin_api(
    work_master_from_admin_schema: WorkMasterFromAdminUpdateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, work_master_from_admin_schema.master_id)
    try:
        work_master_from_admin = await change_work_master_from_admin(
            db=db, work_master_from_admin=work_master_from_admin_schema
        )
        return work_master_from_admin
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Изменяем информацию о работе мастера для определенной категории, из собственных работ, или измененной
# работы от администратора
@router.put("/change_work_master_myself", response_model=WorkMasterMyselfReadSchema)
async def change_work_master_myself_api(
    work_master_myself_schema: WorkMasterMyselfSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, work_master_myself_schema.master_id)
    try:
        work_master_myself = await change_work_master_myself(
            db=db, work_master_myself=work_master_myself_schema
        )
        return work_master_myself
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем работы, которые выбрал для себя мастер из своих собственных работ
# или измененных работ от администратора
@router.get(
    "/works_master_myself/{master_id}/{category_work_id}",
    response_model=list[WorkMasterMyselfReadSchema],
)
async def get_works_master_myself_for_category_work_api(
    master_id: int,
    category_work_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=master_id, current_user=current_user
    )
    try:
        works_master = await get_works_master_myself_for_category_work(
            db=db, master_id=master_id, category_work_id=category_work_id
        )
        return works_master
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")
