import logging
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from models.contracts_models import Contract
from cruds.notifications_crud import (
    CONTRACT_SIGNED_NOTIFICATION_TYPE,
    CONTRACT_UPDATED_NOTIFICATION_TYPE,
    notify_order_event_safe,
)
from models.users_models import User
from schemas.contracts_schemas import (
    ContractCreate,
    ContractResponse,
)
from models.geography_models import Country, Region, Town
from schemas.geography_schemas import (
    CountrySchema,
    RegionReadSchema,
    RegionSchema,
    TownReadSchema,
    TownSchema,
)

logger = logging.getLogger(__name__)


async def add_contract(db: AsyncSession, contract_schema: ContractCreate):
    try:
        result = await db.execute(
            select(Contract).where(
                and_(
                    Contract.order_id == contract_schema.order_id,
                    Contract.customer_id == contract_schema.customer_id,
                    Contract.executor_id == contract_schema.executor_id,
                )
            )
        )
        existing_contract = result.scalar_one_or_none()
        if existing_contract:
            existing_contract.address_work = contract_schema.address_work
            existing_contract.title_work = contract_schema.title_work
            existing_contract.name_work = contract_schema.name_work
            existing_contract.budget_type = contract_schema.budget_type
            existing_contract.budget = contract_schema.budget
            existing_contract.currency = contract_schema.currency
            existing_contract.date_start_work = contract_schema.date_start_work
            existing_contract.date_end_work = contract_schema.date_end_work
            existing_contract.subscribe_customer = contract_schema.subscribe_customer
            existing_contract.subscribe_executor = contract_schema.subscribe_executor
            await db.flush()
            await notify_order_event_safe(
                db,
                order_id=contract_schema.order_id,
                actor_user_id=contract_schema.customer_id,
                notification_type=CONTRACT_UPDATED_NOTIFICATION_TYPE,
                recipient_id=contract_schema.executor_id,
            )
            await db.commit()
            await db.refresh(existing_contract)
            return existing_contract

        contract = Contract(
            order_id=contract_schema.order_id,
            customer_id=contract_schema.customer_id,
            executor_id=contract_schema.executor_id,
            address_work=contract_schema.address_work,
            title_work=contract_schema.title_work,
            name_work=contract_schema.name_work,
            date_start_work=contract_schema.date_start_work,
            date_end_work=contract_schema.date_end_work,
            budget_type=contract_schema.budget_type,
            budget=contract_schema.budget,
            currency=contract_schema.currency,
            subscribe_customer=contract_schema.subscribe_customer,
            subscribe_executor=contract_schema.subscribe_executor,
        )

        db.add(contract)
        await db.flush()
        await notify_order_event_safe(
            db,
            order_id=contract_schema.order_id,
            actor_user_id=contract_schema.customer_id,
            notification_type=CONTRACT_UPDATED_NOTIFICATION_TYPE,
            recipient_id=contract_schema.executor_id,
        )
        await db.commit()

        return contract
    except Exception as e:
        logger.error(f"add_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def update_contract_subscribe_customer(
    db: AsyncSession, order_id: int, subscribe_customer: bool
):
    try:
        result = await db.execute(
            select(Contract).where(
                Contract.order_id == order_id,
            )
        )
        existing_contract = result.scalar_one_or_none()
        if existing_contract:

            existing_contract.subscribe_customer = subscribe_customer
            await db.flush()
            if subscribe_customer:
                await notify_order_event_safe(
                    db,
                    order_id=order_id,
                    actor_user_id=existing_contract.customer_id,
                    notification_type=CONTRACT_SIGNED_NOTIFICATION_TYPE,
                    recipient_id=existing_contract.executor_id,
                )
            await db.commit()
            await db.refresh(existing_contract)
            return existing_contract

        return existing_contract
    except Exception as e:
        logger.error(f"add_country error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


async def update_contract_subscribe_executor(
    db: AsyncSession, order_id: int, subscribe_executor: bool
):
    try:
        result = await db.execute(
            select(Contract).where(
                Contract.order_id == order_id,
            )
        )
        existing_contract = result.scalar_one_or_none()
        if existing_contract:

            existing_contract.subscribe_executor = subscribe_executor
            await db.flush()
            if subscribe_executor:
                await notify_order_event_safe(
                    db,
                    order_id=order_id,
                    actor_user_id=existing_contract.executor_id,
                    notification_type=CONTRACT_SIGNED_NOTIFICATION_TYPE,
                    recipient_id=existing_contract.customer_id,
                )
            await db.commit()
            await db.refresh(existing_contract)
            return existing_contract

        return existing_contract
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


async def get_contract(db: AsyncSession, order_id: int) -> Optional[ContractResponse]:
    try:
        # ✅ Алиасы для разных User
        customer_user = aliased(User)
        executor_user = aliased(User)

        result = await db.execute(
            select(Contract, customer_user, executor_user)
            .outerjoin(customer_user, Contract.customer_id == customer_user.id)
            .outerjoin(executor_user, Contract.executor_id == executor_user.id)
            .where(Contract.order_id == order_id)
        )

        row = result.first()
        if not row:
            return None

        # ✅ Правильная распаковка
        contract, customer_user, executor_user = row

        return ContractResponse(
            id=contract.id,
            order_id=contract.order_id,
            customer_id=contract.customer_id,
            executor_id=contract.executor_id,
            customer_name=f"{customer_user.first_name or ''} {customer_user.last_name or ''}".strip(),
            executor_name=f"{executor_user.first_name or ''} {executor_user.last_name or ''}".strip(),
            address_work=contract.address_work,
            title_work=contract.title_work,
            name_work=contract.name_work,
            date_start_work=contract.date_start_work,
            date_end_work=contract.date_end_work,
            budget=contract.budget,
            currency=contract.currency,
            budget_type=contract.budget_type,
            subscribe_customer=contract.subscribe_customer,
            subscribe_executor=contract.subscribe_executor,
            created_at=contract.created_at.strftime("%d.%m.%Y %H:%M"),
        )

    except Exception as e:
        logger.error(f"Ошибка получения договора order_id={order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")


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
