import logging
from fastapi import HTTPException
from sqlalchemy import and_, delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.geography_models import Country, Region, Town
from models.users_models import GeographyExecuteOrder, User
from schemas.geography_schemas import (
    CountrySchema,
    RegionReadSchema,
    RegionSchema,
    TownReadSchema,
    TownSchema,
)

logger = logging.getLogger(__name__)


def _block_delete(reasons: list[str]) -> None:
    if reasons:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить: " + "; ".join(reasons),
        )


async def add_country(db: AsyncSession, country_schema: CountrySchema):
    try:
        result = await db.execute(
            select(Country).where(Country.name_country == country_schema.name_country)
        )
        existing_country = result.scalar_one_or_none()
        if existing_country:
            return existing_country
        country = Country(name_country=country_schema.name_country)
        db.add(country)
        await db.commit()
        await db.refresh(country)
        return country
    except Exception as e:
        logger.error(f"add_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def edit_country(db: AsyncSession, country_schema: CountrySchema):
    try:
        result = await db.execute(
            select(Country).where(Country.id == country_schema.country_id)
        )
        country = result.scalar_one_or_none()
        if not country:
            raise HTTPException(status_code=404, detail="Страна не найдена")
        country.name_country = country_schema.name_country
        await db.commit()
        await db.refresh(country)
        return country
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"edit_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def delete_country(db: AsyncSession, country_id: int) -> None:
    result = await db.execute(select(Country).where(Country.id == country_id))
    country = result.scalar_one_or_none()
    if not country:
        raise HTTPException(status_code=404, detail="Страна не найдена")

    name = country.name_country
    reasons: list[str] = []

    regions_count = await db.scalar(
        select(func.count()).select_from(Region).where(Region.country_id == country_id)
    )
    if regions_count:
        reasons.append(f"сначала удалите регионы ({regions_count})")

    users_count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            or_(
                User.country == name,
                User.country == str(country_id),
            )
        )
    )
    if users_count:
        reasons.append(f"используется у пользователей ({users_count})")

    orders_result = await db.execute(
        text(
            "SELECT COUNT(*) FROM orders "
            "WHERE country = :name OR country = :id_str"
        ),
        {"name": name, "id_str": str(country_id)},
    )
    orders_count = orders_result.scalar_one()
    if orders_count:
        reasons.append(f"используется в заказах ({orders_count})")

    geo_count = await db.scalar(
        select(func.count())
        .select_from(GeographyExecuteOrder)
        .join(Town, GeographyExecuteOrder.town_id == Town.id)
        .join(Region, Town.region_id == Region.id)
        .where(Region.country_id == country_id)
    )
    if geo_count:
        reasons.append(f"есть в географии исполнителей ({geo_count})")

    _block_delete(reasons)

    await db.execute(delete(Country).where(Country.id == country_id))
    await db.commit()


async def get_countries(db: AsyncSession) -> list[CountrySchema]:
    try:
        result = await db.execute(select(Country))
        countries = result.scalars().all()
        return [
            CountrySchema(country_id=c.id, name_country=c.name_country)
            for c in countries
        ]
    except Exception as e:
        logger.error(f"get_countries error: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )


async def add_region_for_country(db: AsyncSession, region_schema: RegionSchema):
    try:
        result = await db.execute(
            select(Region).where(
                (Region.name_region == region_schema.name_region)
                & (Region.country_id == region_schema.country_id)
            )
        )
        existing_region = result.scalar_one_or_none()
        if existing_region:
            return existing_region
        region = Region(
            country_id=region_schema.country_id,
            name_region=region_schema.name_region,
        )
        db.add(region)
        await db.commit()
        await db.refresh(region)
        return region
    except Exception as e:
        logger.error(f"add_region_for_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def edit_region_for_country(db: AsyncSession, region_schema: RegionSchema):
    try:
        result = await db.execute(
            select(Region).where(Region.id == region_schema.region_id)
        )
        region = result.scalar_one_or_none()
        if not region:
            raise HTTPException(status_code=404, detail="Регион не найден")
        region.name_region = region_schema.name_region
        await db.commit()
        await db.refresh(region)
        return region
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"edit_region_for_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def delete_region(db: AsyncSession, region_id: int) -> None:
    result = await db.execute(
        select(Region, Country.name_country)
        .join(Country, Region.country_id == Country.id)
        .where(Region.id == region_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Регион не найден")

    region, country_name = row
    name = region.name_region
    reasons: list[str] = []

    towns_count = await db.scalar(
        select(func.count()).select_from(Town).where(Town.region_id == region_id)
    )
    if towns_count:
        reasons.append(f"сначала удалите города ({towns_count})")

    users_count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            and_(
                or_(User.region == name, User.region == str(region_id)),
                or_(
                    User.country == country_name,
                    User.country == str(region.country_id),
                ),
            )
        )
    )
    if users_count:
        reasons.append(f"используется у пользователей ({users_count})")

    orders_result = await db.execute(
        text(
            "SELECT COUNT(*) FROM orders "
            "WHERE (region = :name OR region = :id_str) "
            "AND (country = :country_name OR country = :country_id_str)"
        ),
        {
            "name": name,
            "id_str": str(region_id),
            "country_name": country_name,
            "country_id_str": str(region.country_id),
        },
    )
    orders_count = orders_result.scalar_one()
    if orders_count:
        reasons.append(f"используется в заказах ({orders_count})")

    geo_count = await db.scalar(
        select(func.count())
        .select_from(GeographyExecuteOrder)
        .join(Town, GeographyExecuteOrder.town_id == Town.id)
        .where(Town.region_id == region_id)
    )
    if geo_count:
        reasons.append(f"есть в географии исполнителей ({geo_count})")

    _block_delete(reasons)

    await db.execute(delete(Region).where(Region.id == region_id))
    await db.commit()


async def get_regions_for_country(
    db: AsyncSession, country_id: int
) -> list[RegionReadSchema]:
    try:
        result = await db.execute(select(Region).where(Region.country_id == country_id))
        regions = result.scalars().all()
        return [
            RegionReadSchema(region_id=r.id, name_region=r.name_region) for r in regions
        ]
    except Exception as e:
        logger.error(f"get_regions_for_country error: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )


async def add_town_for_region(db: AsyncSession, town_schema: TownSchema):
    try:
        result = await db.execute(
            select(Town).where(
                (Town.name_town == town_schema.name_town)
                & (Town.region_id == town_schema.region_id)
            )
        )
        existing_town = result.scalar_one_or_none()
        if existing_town:
            return existing_town
        town = Town(
            region_id=town_schema.region_id,
            name_town=town_schema.name_town,
        )
        db.add(town)
        await db.commit()
        await db.refresh(town)
        return town
    except Exception as e:
        logger.error(f"add_town_for_region error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def edit_town_for_region(db: AsyncSession, town_schema: TownSchema):
    try:
        result = await db.execute(select(Town).where(Town.id == town_schema.town_id))
        town = result.scalar_one_or_none()
        if not town:
            raise HTTPException(status_code=404, detail="Город не найден")
        town.name_town = town_schema.name_town
        town.region_id = town_schema.region_id
        await db.commit()
        await db.refresh(town)
        return town
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"edit_town_for_region error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def delete_town(db: AsyncSession, town_id: int) -> None:
    result = await db.execute(
        select(Town, Region.name_region, Country.name_country, Region.country_id)
        .join(Region, Town.region_id == Region.id)
        .join(Country, Region.country_id == Country.id)
        .where(Town.id == town_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Город не найден")

    town, region_name, country_name, country_id = row
    name = town.name_town
    region_id = town.region_id
    reasons: list[str] = []

    geo_count = await db.scalar(
        select(func.count())
        .select_from(GeographyExecuteOrder)
        .where(GeographyExecuteOrder.town_id == town_id)
    )
    if geo_count:
        reasons.append(f"есть в географии исполнителей ({geo_count})")

    users_count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            and_(
                or_(User.town == name, User.town == str(town_id)),
                or_(User.region == region_name, User.region == str(region_id)),
                or_(User.country == country_name, User.country == str(country_id)),
            )
        )
    )
    if users_count:
        reasons.append(f"используется у пользователей ({users_count})")

    orders_result = await db.execute(
        text(
            "SELECT COUNT(*) FROM orders "
            "WHERE (town = :name OR town = :id_str) "
            "AND (region = :region_name OR region = :region_id_str) "
            "AND (country = :country_name OR country = :country_id_str)"
        ),
        {
            "name": name,
            "id_str": str(town_id),
            "region_name": region_name,
            "region_id_str": str(region_id),
            "country_name": country_name,
            "country_id_str": str(country_id),
        },
    )
    orders_count = orders_result.scalar_one()
    if orders_count:
        reasons.append(f"используется в заказах ({orders_count})")

    _block_delete(reasons)

    await db.execute(delete(Town).where(Town.id == town_id))
    await db.commit()


async def get_towns_for_region(
    db: AsyncSession, region_id: int
) -> list[TownReadSchema]:
    try:
        result = await db.execute(select(Town).where(Town.region_id == region_id))
        towns = result.scalars().all()
        return [TownReadSchema(town_id=t.id, name_town=t.name_town) for t in towns]
    except Exception as e:
        logger.error(f"get_towns_for_region error: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Ошибка получения данных: {str(e)}"
        )
