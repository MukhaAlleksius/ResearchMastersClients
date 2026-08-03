import logging  # Логирование CRUD географии
from fastapi import HTTPException  # HTTP-ошибки
from sqlalchemy import and_, delete, func, or_, select, text  # SQL-операции
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from models.geography_models import Country, Region, Town  # ORM географии
from models.users_models import GeographyExecuteOrder, User  # География исполнителей и пользователи
from schemas.geography_schemas import (  # Pydantic-схемы географии
    CountrySchema,  # страна
    RegionReadSchema,  # регион для чтения
    RegionSchema,  # регион для записи
    TownReadSchema,  # город для чтения
    TownSchema,  # город для записи
    UserTownCreateSchema,
    validate_town_name_value,
)

logger = logging.getLogger(__name__)  # Логгер модуля


def _block_delete(reasons: list[str]) -> None:  # Запрет удаления с перечислением причин
    if reasons:  # есть блокирующие ссылки
        raise HTTPException(  # 400 с деталями
            status_code=400,  # клиентская ошибка
            detail="Нельзя удалить: " + "; ".join(reasons),  # текст причин
        )


async def add_country(db: AsyncSession, country_schema: CountrySchema):  # CREATE страны (идемпотентно)
    try:  # обработка ошибок БД
        result = await db.execute(  # SELECT существующей страны
            select(Country).where(Country.name_country == country_schema.name_country)  # по имени
        )
        existing_country = result.scalar_one_or_none()  # ORM или None
        if existing_country:  # дубликат по имени
            return existing_country  # Уже есть
        country = Country(name_country=country_schema.name_country)  # новая ORM-запись
        db.add(country)  # в сессию
        await db.commit()  # фиксация
        await db.refresh(country)  # id и timestamps
        return country  # созданная страна
    except Exception as e:  # неожиданная ошибка
        logger.error(f"add_country error: {str(e)}")  # лог
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")  # 400 клиенту


async def edit_country(db: AsyncSession, country_schema: CountrySchema):  # UPDATE названия страны
    try:  # обработка ошибок
        result = await db.execute(  # SELECT по id
            select(Country).where(Country.id == country_schema.country_id)  # pk страны
        )
        country = result.scalar_one_or_none()  # ORM или None
        if not country:  # не найдена
            raise HTTPException(status_code=404, detail="Страна не найдена")  # 404
        country.name_country = country_schema.name_country  # новое имя
        await db.commit()  # сохранение
        await db.refresh(country)  # актуальные поля
        return country  # обновлённая страна
    except HTTPException:  # уже HTTP-ошибка
        raise  # пробрасываем
    except Exception as e:  # прочие ошибки
        logger.error(f"edit_country error: {str(e)}")  # лог
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")  # 400


async def delete_country(db: AsyncSession, country_id: int) -> None:  # DELETE страны с проверками ссылок
    result = await db.execute(select(Country).where(Country.id == country_id))  # SELECT страны
    country = result.scalar_one_or_none()  # ORM или None
    if not country:  # не найдена
        raise HTTPException(status_code=404, detail="Страна не найдена")  # 404

    name = country.name_country  # Имя для поиска в legacy-полях
    reasons: list[str] = []  # Причины блокировки удаления

    regions_count = await db.scalar(  # COUNT регионов страны
        select(func.count()).select_from(Region).where(Region.country_id == country_id)  # fk country
    )
    if regions_count:  # есть дочерние регионы
        reasons.append(f"сначала удалите регионы ({regions_count})")  # причина блокировки

    users_count = await db.scalar(  # COUNT пользователей со ссылкой на страну
        select(func.count())  # агрегация
        .select_from(User)  # таблица users
        .join(Town, User.town_id == Town.id)
        .join(Region, Town.region_id == Region.id)
        .where(Region.country_id == country_id)
    )
    if users_count:  # используется профилями
        reasons.append(f"используется у пользователей ({users_count})")  # причина

    orders_result = await db.execute(  # raw SQL — legacy orders.country
        text(  # SQL текст
            "SELECT COUNT(*) FROM orders "  # подсчёт заказов
            "WHERE country = :name OR country = :id_str"  # имя или id
        ),
        {"name": name, "id_str": str(country_id)},  # параметры
    )
    orders_count = orders_result.scalar_one()  # число заказов
    if orders_count:  # есть ссылки в заказах
        reasons.append(f"используется в заказах ({orders_count})")  # причина

    geo_count = await db.scalar(  # COUNT географии исполнителей в стране
        select(func.count())  # агрегация
        .select_from(GeographyExecuteOrder)  # география исполнителя
        .join(Town, GeographyExecuteOrder.town_id == Town.id)  # город
        .join(Region, Town.region_id == Region.id)  # регион
        .where(Region.country_id == country_id)  # фильтр по стране
    )
    if geo_count:  # есть привязки исполнителей
        reasons.append(f"есть в географии исполнителей ({geo_count})")  # причина

    _block_delete(reasons)  # 400 если reasons не пуст

    await db.execute(delete(Country).where(Country.id == country_id))  # DELETE страны
    await db.commit()  # фиксация


async def get_countries(db: AsyncSession) -> list[CountrySchema]:  # READ списка стран
    try:  # обработка ошибок
        result = await db.execute(select(Country))  # все страны
        countries = result.scalars().all()  # список ORM
        return [  # маппинг в схемы
            CountrySchema(country_id=c.id, name_country=c.name_country)  # одна страна
            for c in countries  # перебор
        ]
    except Exception as e:  # ошибка БД
        logger.error(f"get_countries error: {str(e)}")  # лог
        raise HTTPException(  # 400 клиенту
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )


async def add_region_for_country(db: AsyncSession, region_schema: RegionSchema):  # CREATE региона
    try:  # обработка ошибок
        result = await db.execute(  # SELECT дубликата
            select(Region).where(  # имя + country_id
                (Region.name_region == region_schema.name_region)  # имя региона
                & (Region.country_id == region_schema.country_id)  # страна
            )
        )
        existing_region = result.scalar_one_or_none()  # ORM или None
        if existing_region:  # уже существует
            return existing_region  # идемпотентный ответ
        region = Region(  # новая ORM-запись
            country_id=region_schema.country_id,  # fk страны
            name_region=region_schema.name_region,  # имя
        )
        db.add(region)  # в сессию
        await db.commit()  # фиксация
        await db.refresh(region)  # id
        return region  # созданный регион
    except Exception as e:  # ошибка
        logger.error(f"add_region_for_country error: {str(e)}")  # лог
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")  # 400


async def edit_region_for_country(db: AsyncSession, region_schema: RegionSchema):  # UPDATE региона
    try:  # обработка ошибок
        result = await db.execute(  # SELECT по id
            select(Region).where(Region.id == region_schema.region_id)  # pk
        )
        region = result.scalar_one_or_none()  # ORM или None
        if not region:  # не найден
            raise HTTPException(status_code=404, detail="Регион не найден")  # 404
        region.name_region = region_schema.name_region  # новое имя
        await db.commit()  # сохранение
        await db.refresh(region)  # актуальные поля
        return region  # обновлённый регион
    except HTTPException:  # уже HTTP
        raise  # пробрасываем
    except Exception as e:  # прочие
        logger.error(f"edit_region_for_country error: {str(e)}")  # лог
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")  # 400


async def delete_region(db: AsyncSession, region_id: int) -> None:  # DELETE региона с проверками
    result = await db.execute(  # SELECT региона + имя страны
        select(Region, Country.name_country)  # join для legacy country
        .join(Country, Region.country_id == Country.id)  # fk
        .where(Region.id == region_id)  # pk региона
    )
    row = result.one_or_none()  # кортеж или None
    if not row:  # не найден
        raise HTTPException(status_code=404, detail="Регион не найден")  # 404

    region, country_name = row  # распаковка
    name = region.name_region  # имя региона для legacy
    reasons: list[str] = []  # причины блокировки

    towns_count = await db.scalar(  # COUNT городов региона
        select(func.count()).select_from(Town).where(Town.region_id == region_id)  # fk region
    )
    if towns_count:  # есть дочерние города
        reasons.append(f"сначала удалите города ({towns_count})")  # причина

    users_count = await db.scalar(  # COUNT пользователей с регионом
        select(func.count())  # агрегация
        .select_from(User)  # users
        .join(Town, User.town_id == Town.id)
        .where(Town.region_id == region_id)
    )
    if users_count:  # используется профилями
        reasons.append(f"используется у пользователей ({users_count})")  # причина

    orders_result = await db.execute(  # raw SQL orders.region
        text(  # SQL
            "SELECT COUNT(*) FROM orders "  # подсчёт
            "WHERE (region = :name OR region = :id_str) "  # region legacy
            "AND (country = :country_name OR country = :country_id_str)"  # country legacy
        ),
        {  # параметры
            "name": name,  # имя региона
            "id_str": str(region_id),  # id региона
            "country_name": country_name,  # имя страны
            "country_id_str": str(region.country_id),  # id страны
        },
    )
    orders_count = orders_result.scalar_one()  # число
    if orders_count:  # ссылки в заказах
        reasons.append(f"используется в заказах ({orders_count})")  # причина

    geo_count = await db.scalar(  # COUNT географии исполнителей в регионе
        select(func.count())  # агрегация
        .select_from(GeographyExecuteOrder)  # география
        .join(Town, GeographyExecuteOrder.town_id == Town.id)  # город
        .where(Town.region_id == region_id)  # фильтр по региону
    )
    if geo_count:  # привязки исполнителей
        reasons.append(f"есть в географии исполнителей ({geo_count})")  # причина

    _block_delete(reasons)  # 400 если есть причины

    await db.execute(delete(Region).where(Region.id == region_id))  # DELETE региона
    await db.commit()  # фиксация


async def get_regions_for_country(
    db: AsyncSession, country_id: int
) -> list[RegionReadSchema]:  # READ регионов страны
    try:  # обработка ошибок
        result = await db.execute(select(Region).where(Region.country_id == country_id))  # по country_id
        regions = result.scalars().all()  # список ORM
        return [  # маппинг
            RegionReadSchema(region_id=r.id, name_region=r.name_region) for r in regions  # один регион
        ]
    except Exception as e:  # ошибка
        logger.error(f"get_regions_for_country error: {str(e)}")  # лог
        raise HTTPException(  # 400
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )


async def add_town_for_region(
    db: AsyncSession,
    town_schema: TownSchema,
    *,
    source: str = "admin",
    is_verified: bool = True,
    created_by_user_id: int | None = None,
):  # CREATE города
    try:  # обработка ошибок
        name_town = validate_town_name_value(town_schema.name_town)
        region = await db.get(Region, town_schema.region_id)
        if not region:
            raise HTTPException(status_code=400, detail="Указанный регион не найден")

        result = await db.execute(  # SELECT дубликата (без учёта регистра)
            select(Town).where(
                Town.region_id == town_schema.region_id,
                func.lower(Town.name_town) == name_town.lower(),
            )
        )
        existing_town = result.scalar_one_or_none()  # ORM или None
        if existing_town:  # уже есть
            return existing_town  # идемпотентно
        town = Town(  # новая запись
            region_id=town_schema.region_id,  # fk региона
            name_town=name_town,  # имя
            source=source,
            is_verified=is_verified,
            created_by_user_id=created_by_user_id,
        )
        db.add(town)  # в сессию
        await db.commit()  # фиксация
        await db.refresh(town)  # id
        return town  # созданный город
    except HTTPException:
        raise
    except Exception as e:  # ошибка
        logger.error(f"add_town_for_region error: {str(e)}")  # лог
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")  # 400


async def add_town_by_user(
    db: AsyncSession,
    payload: UserTownCreateSchema,
    *,
    created_by_user_id: int | None = None,
) -> Town:  # город от пользователя (регистрация / профиль)
    town_schema = TownSchema(
        region_id=payload.region_id,
        name_town=payload.name_town,
    )
    return await add_town_for_region(
        db,
        town_schema,
        source="user",
        is_verified=False,
        created_by_user_id=created_by_user_id,
    )


def town_to_schema(town: Town) -> TownSchema:
    return TownSchema(
        town_id=town.id,
        region_id=town.region_id,
        name_town=town.name_town,
        source=town.source,
        is_verified=town.is_verified,
    )


async def edit_town_for_region(db: AsyncSession, town_schema: TownSchema):  # UPDATE города
    try:  # обработка ошибок
        result = await db.execute(select(Town).where(Town.id == town_schema.town_id))  # по pk
        town = result.scalar_one_or_none()  # ORM или None
        if not town:  # не найден
            raise HTTPException(status_code=404, detail="Город не найден")  # 404
        name_town = validate_town_name_value(town_schema.name_town)
        town.name_town = name_town  # новое имя
        town.region_id = town_schema.region_id  # новый регион
        town.is_verified = True  # правка админом = проверен
        town.source = town.source or "admin"
        await db.commit()  # сохранение
        await db.refresh(town)  # актуальные поля
        return town  # обновлённый город
    except HTTPException:  # уже HTTP
        raise  # пробрасываем
    except Exception as e:  # прочие
        logger.error(f"edit_town_for_region error: {str(e)}")  # лог
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")  # 400


async def delete_town(db: AsyncSession, town_id: int) -> None:  # DELETE города с проверками
    result = await db.execute(  # SELECT города + region/country names
        select(Town, Region.name_region, Country.name_country, Region.country_id)  # join chain
        .join(Region, Town.region_id == Region.id)  # регион
        .join(Country, Region.country_id == Country.id)  # страна
        .where(Town.id == town_id)  # pk города
    )
    row = result.one_or_none()  # кортеж или None
    if not row:  # не найден
        raise HTTPException(status_code=404, detail="Город не найден")  # 404

    town, region_name, country_name, country_id = row  # распаковка
    name = town.name_town  # имя для legacy
    region_id = town.region_id  # fk региона
    reasons: list[str] = []  # причины блокировки

    geo_count = await db.scalar(  # COUNT географии исполнителя по town_id
        select(func.count())  # агрегация
        .select_from(GeographyExecuteOrder)  # география
        .where(GeographyExecuteOrder.town_id == town_id)  # fk town
    )
    if geo_count:  # привязки исполнителей
        reasons.append(f"есть в географии исполнителей ({geo_count})")  # причина

    users_count = await db.scalar(  # COUNT users с town_id
        select(func.count())  # агрегация
        .select_from(User)  # users
        .where(User.town_id == town_id)
    )
    if users_count:  # используется профилями
        reasons.append(f"используется у пользователей ({users_count})")  # причина

    orders_result = await db.execute(  # raw SQL orders.town/region/country
        text(  # SQL
            "SELECT COUNT(*) FROM orders "  # подсчёт
            "WHERE (town = :name OR town = :id_str) "  # town legacy
            "AND (region = :region_name OR region = :region_id_str) "  # region
            "AND (country = :country_name OR country = :country_id_str)"  # country
        ),
        {  # параметры
            "name": name,  # имя города
            "id_str": str(town_id),  # id города
            "region_name": region_name,  # имя региона
            "region_id_str": str(region_id),  # id региона
            "country_name": country_name,  # имя страны
            "country_id_str": str(country_id),  # id страны
        },
    )
    orders_count = orders_result.scalar_one()  # число
    if orders_count:  # ссылки в заказах
        reasons.append(f"используется в заказах ({orders_count})")  # причина

    _block_delete(reasons)  # 400 если есть причины

    await db.execute(delete(Town).where(Town.id == town_id))  # DELETE города
    await db.commit()  # фиксация


async def get_towns_for_region(
    db: AsyncSession, region_id: int
) -> list[TownReadSchema]:  # READ городов региона
    try:  # обработка ошибок
        result = await db.execute(select(Town).where(Town.region_id == region_id))  # по region_id
        towns = result.scalars().all()  # список ORM
        return [
            TownReadSchema(
                town_id=t.id,
                name_town=t.name_town,
                source=t.source,
                is_verified=t.is_verified,
            )
            for t in towns
        ]  # маппинг
    except Exception as e:  # ошибка
        logger.error(f"get_towns_for_region error: {str(e)}")  # лог
        raise HTTPException(  # 400
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )
