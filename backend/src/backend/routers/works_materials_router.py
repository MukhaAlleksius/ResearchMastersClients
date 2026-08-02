import logging  # Стандартное логирование

from fastapi import APIRouter, Depends, HTTPException, Query  # FastAPI: роутер, DI, ошибки, query
from fastapi.responses import JSONResponse  # JSON-ответ с произвольным телом
from pydantic import BaseModel  # Базовая модель для локальных схем
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия SQLAlchemy

from core.config import get_db  # Зависимость сессии БД
from core.auth import (  # Авторизация и проверка пользователя
    ensure_same_user,
    get_current_admin_user,
    get_current_user,
)
from cruds.works_materials_crud import (  # CRUD: категории и работы мастеров
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
from schemas.works_materials_schemas import (  # Pydantic-схемы работ и категорий
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
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя
from fastapi import status  # HTTP-коды ответа


logger = logging.getLogger(__name__)  # Логгер модуля


router = APIRouter(prefix="", tags=["users"])  # Роутер работ и материалов


# Добавляем данные на сервер и возвращаем пользователю категории работ
@router.post("/add_category_work")  # POST: новая категория работ (админ)
async def add_category_work_api(
    category_work: CategoryWorkSchema,  # Данные категории
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только администратор
):
    try:
        category_work_obj = await add_category_work(db=db, category_work=category_work)  # Сохраняем в БД
        return {  # Отдаём ключевые поля созданной категории
            "id": category_work_obj.id,
            "name": category_work_obj.name,
            "description": category_work_obj.description,
            "icon_name": category_work_obj.icon_name,
            "icon_color": category_work_obj.icon_color,  # ← Возвращаем цвет!
            "access_users": category_work_obj.access_users,
        }
    except HTTPException:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail="Ошибка создания категории")


class AccessRequest(BaseModel):  # Тело запроса смены доступа категории
    access_users: bool


@router.put("/change_access_users/{category_work_id}")  # PUT: видимость категории для пользователей
async def change_access_users_api(
    category_work_id: int,  # ID категории из URL
    request: AccessRequest,  # Новый флаг доступа
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только администратор
):
    try:
        category_work = await change_access_users(  # Обновляем access_users в БД
            db=db,
            category_work_id=category_work_id,
            access_users=request.access_users,  # ✅ bool значение
        )
        return category_work  # Возвращаем обновлённую категорию
    except HTTPException:  # Бизнес-ошибки CRUD пробрасываем как есть
        raise


# получаем из базы данных все категории работ для пользователей
@router.get("/categories_works_for_users", response_model=list[CategoryWorkSchema])  # GET: категории для пользователей
async def get_category_work_api(
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        categories_works = await get_categories_works_for_users(db=db)  # Читаем доступные категории
        return categories_works  # Список категорий
    except HTTPException as e:  # Ошибка доступа
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# получаем из базы данных все категории работ для администратора
@router.get("/categories_works", response_model=list[CategoryWorkSchema])  # GET: все категории (админ)
async def get_category_work_api(
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        categories_works = await get_categories_works(db=db)  # Читаем все категории
        return categories_works  # Список категорий
    except HTTPException as e:  # Ошибка доступа
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Добавляем данные на сервер и возвращаем пользователю работы для категории работ
@router.post("/add_work")  # POST: новая работа в категории (админ)
async def add_work_api(
    work_schema: WorkSchema,  # Данные работы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только администратор
):
    try:
        work = await add_work(db=db, work=work_schema)  # Сохраняем работу в БД
        return {  # Отдаём ключевые поля созданной работы
            "id": work.id,
            "name_work": work.name_work,
            "unit_measurement": work.unit_measurement,
            "cost": work.cost,
            "currency": work.currency,
        }
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем работы, относящиеся к конкретной категории работ
@router.get(  # GET: работы одной категории
    "/works_for_category_work/{category_work_id}",
    response_model=list[WorkReadSchema],
)
async def get_works_for_category_work_api(
    category_work_id: int,  # ID категории из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        works = await get_works_for_category_work(  # Читаем работы категории
            db=db, category_work_id=category_work_id
        )
        return works  # Список работ
    except HTTPException as e:  # Ошибка доступа
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
@router.post("/add_category_work_master", response_model=CategoryWorkMasterSchema)  # POST: специализация мастера
async def add_category_work_for_master_api(
    category_work_master: CategoryWorkMasterSchema,  # Данные специализации
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    ensure_same_user(current_user, category_work_master.master_id)  # Только сам мастер
    try:
        category_work_master = await add_category_work_for_master(  # Сохраняем специализацию
            db=db, category_work_master=category_work_master
        )
        return category_work_master  # Возвращаем созданную запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем категории работ для предоставления их в виде
# карточек на экране со специализациями мастера
@router.get(  # GET: специализации мастера для карточек
    "/categories_works_master/{master_id}",
    response_model=list[CategoryWorkMasterReadSchema],
)
async def get_category_work_master_api(
    master_id: int,  # ID мастера из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        categories_works = await get_categories_works_master(db=db, master_id=master_id)  # Читаем специализации
        return categories_works  # Список категорий мастера
    except HTTPException as e:  # Ошибка доступа
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Изменяем информацию о специализации в интерфейсе редактирования специализации
@router.put("/change_category_work_master", response_model=CategoryWorkMasterSchema)  # PUT: правка специализации
async def change_category_work_master_api(
    category_work_master: CategoryWorkMasterSchema,  # Новые данные специализации
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    ensure_same_user(current_user, category_work_master.master_id)  # Только сам мастер
    try:
        category_work_master = await change_category_work_master(  # Обновляем в БД
            db=db, category_work_master=category_work_master
        )
        return category_work_master  # Возвращаем обновлённую запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист из списка работ, которые предоставляет администратор
@router.post("/add_work_master_from_admin")  # POST: работа мастера из каталога админа
async def add_work_master_from_admin_api(
    work_master: WorkMasterFromAdminSchema,  # Данные работы мастера
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    ensure_same_user(current_user, work_master.master_id)  # Только сам мастер
    try:
        work_master = await add_work_master_from_admin(db=db, work_master=work_master)  # Сохраняем в БД
        return work_master  # Возвращаем созданную запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Добавляем работу пользователя на сервер. Потльзователь добавляет себе на страницу
# работу, которую выполняет как специалист
@router.post("/add_work_master_myself")  # POST: собственная работа мастера
async def add_work_master_myself_api(
    work_master: WorkMasterMyselfSchema,  # Данные своей работы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    ensure_same_user(current_user, work_master.master_id)  # Только сам мастер
    try:
        work_master = await add_work_master_myself(db=db, work_master=work_master)  # Сохраняем в БД
        return work_master  # Возвращаем созданную запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем работы, которые выбрал для себя мастер из работ добавленных администратором
@router.get(  # GET: работы мастера из каталога админа по категории
    "/works_master_from_admin/{master_id}/{category_work_id}",
    response_model=list[WorkMasterFromAdminReadSchema],
)
async def get_works_master_from_admin_for_category_work_api(
    master_id: int,  # ID мастера из URL
    category_work_id: int,  # ID категории из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        categories_works = await get_works_master_from_admin_for_category_work(  # Читаем работы из БД
            db=db, master_id=master_id, category_work_id=category_work_id
        )
        return categories_works  # Список работ мастера
    except HTTPException as e:  # Ошибка доступа
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# удаление работы мастера от администратора
@router.delete("/delete_work_master_from_admin/{work_master_from_admin_id}")  # DELETE: работа из каталога админа
async def delete_work_master_from_admin_api(
    work_master_from_admin_id: int,  # ID записи работы мастера
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    try:
        await delete_work_master_from_admin(  # Удаляем запись из БД
            db=db, work_master_from_admin_id=work_master_from_admin_id
        )
        return JSONResponse(  # Успешный JSON-ответ
            content={"detail": "Удаление успешно"}, status_code=status.HTTP_200_OK
        )
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Удаление работы мастера добавленной самим или измененной от администратора
@router.delete("/delete_work_master_myself/{work_master_myself_id}")  # DELETE: собственная работа мастера
async def delete_work_master_myself_api(
    work_master_myself_id: int,  # ID записи своей работы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    try:
        await delete_work_master_myself(  # Удаляем запись из БД
            db=db, work_master_myself_id=work_master_myself_id
        )
        return JSONResponse(  # Успешный JSON-ответ
            content={"detail": "Удаление успешно"}, status_code=status.HTTP_200_OK
        )
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Изменяем информацию о работе мастера для определенной категории, добавленной из работ администатора
@router.put(  # PUT: правка работы мастера из каталога админа
    "/change_work_master_from_admin", response_model=WorkMasterFromAdminReadSchema
)
async def change_work_master_from_admin_api(
    work_master_from_admin_schema: WorkMasterFromAdminUpdateSchema,  # Новые данные работы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    ensure_same_user(current_user, work_master_from_admin_schema.master_id)  # Только сам мастер
    try:
        work_master_from_admin = await change_work_master_from_admin(  # Обновляем в БД
            db=db, work_master_from_admin=work_master_from_admin_schema
        )
        return work_master_from_admin  # Возвращаем обновлённую запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Изменяем информацию о работе мастера для определенной категории, из собственных работ, или измененной
# работы от администратора
@router.put("/change_work_master_myself", response_model=WorkMasterMyselfReadSchema)  # PUT: правка своей работы
async def change_work_master_myself_api(
    work_master_myself_schema: WorkMasterMyselfSchema,  # Новые данные своей работы
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # Авторизованный мастер
):
    ensure_same_user(current_user, work_master_myself_schema.master_id)  # Только сам мастер
    try:
        work_master_myself = await change_work_master_myself(  # Обновляем в БД
            db=db, work_master_myself=work_master_myself_schema
        )
        return work_master_myself  # Возвращаем обновлённую запись
    except HTTPException as e:  # Ошибка доступа или валидации
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# Выбираем работы, которые выбрал для себя мастер из своих собственных работ
# или измененных работ от администратора
@router.get(  # GET: собственные работы мастера по категории
    "/works_master_myself/{master_id}/{category_work_id}",
    response_model=list[WorkMasterMyselfReadSchema],
)
async def get_works_master_myself_for_category_work_api(
    master_id: int,  # ID мастера из URL
    category_work_id: int,  # ID категории из URL
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        works_master = await get_works_master_myself_for_category_work(  # Читаем работы из БД
            db=db, master_id=master_id, category_work_id=category_work_id
        )
        return works_master  # Список собственных работ
    except HTTPException as e:  # Ошибка доступа
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")
