import logging  # Логирование ошибок географии

from fastapi import APIRouter, Depends, HTTPException, Query  # Роутер, DI, ошибки, query
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from core.auth import get_current_admin_user, get_optional_current_user  # Админ / опциональный юзер
from core.config import get_db  # Зависимость сессии БД
from cruds.geography_crud import (  # CRUD стран/регионов/городов
    add_country,  # Добавить страну
    add_region_for_country,  # Добавить регион
    add_town_by_user,  # Город от пользователя
    add_town_for_region,  # Добавить город
    delete_country,  # Удалить страну
    delete_region,  # Удалить регион
    delete_town,  # Удалить город
    edit_country,  # Редактировать страну
    edit_region_for_country,  # Редактировать регион
    edit_town_for_region,  # Редактировать город
    get_countries,  # Список стран
    get_regions_for_country,  # Регионы страны
    get_towns_for_region,  # Города региона
    town_to_schema,
)
from schemas.geography_schemas import (  # Pydantic-схемы географии
    CountrySchema,  # Страна
    RegionSchema,  # Регион
    TownSchema,  # Город
    UserTownCreateSchema,
)
from schemas.users_schemas import UserCommonSchema  # Схема текущего пользователя


logger = logging.getLogger(__name__)  # Логгер модуля


router = APIRouter(prefix="", tags=["geography"])  # Роутер географии


@router.post("/add_country", response_model=CountrySchema)  # POST добавить страну
async def add_country_api(
    country_schema: CountrySchema,  # Тело запроса
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    try:
        country = await add_country(db=db, country_schema=country_schema)  # Создание в CRUD
        return country  # Созданная страна
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # Ошибка из CRUD


@router.post("/edit_country", response_model=CountrySchema)  # POST редактировать страну
async def edit_country_api(
    country_schema: CountrySchema,  # Данные страны
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    try:
        country = await edit_country(db=db, country_schema=country_schema)  # Обновление в CRUD
        return country  # Обновлённая страна
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.delete("/delete_country/{country_id}")  # DELETE страна
async def delete_country_api(
    country_id: int,  # id страны
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    await delete_country(db=db, country_id=country_id)  # Удаление в CRUD
    return {"message": "Страна удалена"}  # Подтверждение


@router.get("/countries")  # GET список стран
async def get_countries_api(
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        countries = await get_countries(db=db)  # Загрузка всех стран
        return countries  # Список стран
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # Ошибка доступа


@router.post("/add_region", response_model=RegionSchema)  # POST добавить регион
async def add_region_api(
    region_schema: RegionSchema,  # Тело запроса
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    try:
        region = await add_region_for_country(db=db, region_schema=region_schema)  # CRUD
        return region  # Созданный регион
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/edit_region", response_model=RegionSchema)  # POST редактировать регион
async def edit_region_api(
    region_schema: RegionSchema,  # Данные региона
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    try:
        region = await edit_region_for_country(db=db, region_schema=region_schema)  # CRUD
        return region  # Обновлённый регион
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.delete("/delete_region/{region_id}")  # DELETE регион
async def delete_region_api(
    region_id: int,  # id региона
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    await delete_region(db=db, region_id=region_id)  # Удаление в CRUD
    return {"message": "Регион удалён"}  # Подтверждение


@router.get("/countries/{country_id}/regions")  # GET регионы страны
async def get_regions_api(
    country_id: int,  # id страны
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        regions = await get_regions_for_country(db=db, country_id=country_id)  # CRUD
        return regions  # Список регионов
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_town", response_model=TownSchema)  # POST добавить город
async def add_town_api(
    town_schema: TownSchema,  # Тело запроса
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    try:
        town = await add_town_for_region(
            db=db,
            town_schema=town_schema,
            source="admin",
            is_verified=True,
            created_by_user_id=current_user.user_id,
        )  # CRUD
        return town_to_schema(town)
    except HTTPException as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/add_town_by_user", response_model=TownSchema)  # POST город при регистрации/профиле
async def add_town_by_user_api(
    payload: UserTownCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    try:
        town = await add_town_by_user(
            db=db,
            payload=payload,
            created_by_user_id=current_user.user_id if current_user else None,
        )
        return town_to_schema(town)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("add_town_by_user error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/edit_town", response_model=TownSchema)  # POST редактировать город
async def edit_town_api(
    town_schema: TownSchema,  # Данные города
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    try:
        town = await edit_town_for_region(db=db, town_schema=town_schema)  # CRUD
        return town_to_schema(town)
    except HTTPException as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.delete("/delete_town/{town_id}")  # DELETE город
async def delete_town_api(
    town_id: int,  # id города
    db: AsyncSession = Depends(get_db),  # Сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # Только админ
):
    await delete_town(db=db, town_id=town_id)  # Удаление в CRUD
    return {"message": "Город удалён"}  # Подтверждение


@router.get("/regions/{region_id}/towns")  # GET города региона
async def get_towns_api(
    region_id: int,  # id региона
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        towns = await get_towns_for_region(db=db, region_id=region_id)  # CRUD
        return towns  # Список городов
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")

@router.get("/profile/regions")  # GET регионы для профиля (исходный код без region_id)
async def get_profile_regions_api(
    db: AsyncSession = Depends(get_db),  # Сессия БД
):
    try:
        towns = await get_towns_for_region(db=db, region_id=region_id)  # region_id не определён в сигнатуре
        return towns  # Список городов
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")
