import logging
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.geography_models import Country, Region, Town
from schemas.geography_schemas import (
    CountrySchema,
    RegionReadSchema,
    RegionSchema,
    TownReadSchema,
    TownSchema,
)

logger = logging.getLogger(__name__)


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
    except Exception as e:
        logger.error(f"edit_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


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
    except Exception as e:
        logger.error(f"edit_region_for_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


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
    except Exception as e:
        logger.error(f"edit_town_for_region error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


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
