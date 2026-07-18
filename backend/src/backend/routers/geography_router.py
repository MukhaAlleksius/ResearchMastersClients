import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_admin_user
from core.config import get_db
from cruds.geography_crud import (
    add_country,
    add_region_for_country,
    add_town_for_region,
    edit_country,
    edit_region_for_country,
    edit_town_for_region,
    get_countries,
    get_regions_for_country,
    get_towns_for_region,
)
from schemas.geography_schemas import (
    CountrySchema,
    RegionSchema,
    TownSchema,
)
from schemas.users_schemas import UserCommonSchema


logger = logging.getLogger(__name__)


router = APIRouter(prefix="", tags=["geography"])


@router.post("/add_country", response_model=CountrySchema)
async def add_country_api(
    country_schema: CountrySchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        country = await add_country(db=db, country_schema=country_schema)
        return country
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/edit_country", response_model=CountrySchema)
async def edit_country_api(
    country_schema: CountrySchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        country = await edit_country(db=db, country_schema=country_schema)
        return country
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/countries")
async def get_countries_api(
    db: AsyncSession = Depends(get_db),
):
    try:
        countries = await get_countries(db=db)
        return countries
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_region", response_model=RegionSchema)
async def add_region_api(
    region_schema: RegionSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        region = await add_region_for_country(db=db, region_schema=region_schema)
        return region
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/edit_region", response_model=RegionSchema)
async def edit_region_api(
    region_schema: RegionSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        region = await edit_region_for_country(db=db, region_schema=region_schema)
        return region
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/countries/{country_id}/regions")
async def get_regions_api(
    country_id: int,
    db: AsyncSession = Depends(get_db),
):
    try:
        regions = await get_regions_for_country(db=db, country_id=country_id)
        return regions
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_town", response_model=TownSchema)
async def add_town_api(
    town_schema: TownSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        town = await add_town_for_region(db=db, town_schema=town_schema)
        return town
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/edit_town", response_model=TownSchema)
async def edit_town_api(
    town_schema: TownSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        town = await edit_town_for_region(db=db, town_schema=town_schema)
        return town
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/regions/{region_id}/towns")
async def get_towns_api(
    region_id: int,
    db: AsyncSession = Depends(get_db),
):
    try:
        towns = await get_towns_for_region(db=db, region_id=region_id)
        return towns
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/profile/regions")
async def get_profile_regions_api(
    db: AsyncSession = Depends(get_db),
):
    try:
        towns = await get_towns_for_region(db=db, region_id=region_id)
        return towns
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")
