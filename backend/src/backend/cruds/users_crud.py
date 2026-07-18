from datetime import datetime
import secrets
import os
from typing import Optional
from fastapi import HTTPException, logger
from fastapi.responses import FileResponse
from sqlalchemy import and_, delete, exists, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from models.orders_models import ExecutorOrder, Order, Review
from core.storage import find_avatar_key
from core.config import REQUIRE_EMAIL_VERIFICATION
from core.security import hash_password, verify_password
from models.works_materials_models import (
    CategoryWork,
    CategoryWorkMaster,
    WorkMasterFromAdmin,
    WorkMasterMyself,
)
from models.geography_models import Country, Region, Town
from core.access import is_user_blocked
from models.users_models import (
    BusinessForm,
    GeographyExecuteOrder,
    PortfolioItem,
    User,
    UserBusiness,
    UserContact,
    UserProfile,
)
from schemas.users_schemas import (
    BusinessFormSchema,
    GeographyExecuteOrderSchema,
    PortfolioItemReadSchema,
    PortfolioItemSchema,
    UserBusinessReadSchema,
    UserBusinessSchema,
    UserCardForAdminSchema,
    UserCommonSchema,
    UserContactReadSchema,
    UserContactSchema,
    UserProfileForAdminSchema,
    UserProfileForCardSchema,
    UserProfileReadSchema,
    UserProfileSchema,
    UserReadSchema,
    UserSchema,
)

import logging

logger = logging.getLogger(__name__)


# добавление в базу данных пользователя
async def add_user(db: AsyncSession, user: UserSchema):

    existing_user = await db.execute(select(User).filter(User.email == user.email))

    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="Пользователь с таким именем уже существует"
        )

    db_user = User(
        first_name=user.first_name,
        last_name=user.last_name,
        country=user.country,
        region=user.region,
        town=user.town,
        email=user.email,
        password_hash=hash_password(user.password),
        is_verified=not REQUIRE_EMAIL_VERIFICATION,
        created_at=datetime.now(),
    )

    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return db_user


async def upsert_user_from_google(
    db: AsyncSession,
    *,
    email: str,
    first_name: str,
    last_name: str,
    country: str,
    region: str,
    town: str,
    email_verified: bool,
) -> User:
    """
    Create/update a user using Google identity.

    Your DB schema requires non-null `password_hash`, so for Google users we store
    a random internal password hash (password login won't be used).
    """
    existing = await get_user(db=db, email=email)
    password_hash = hash_password(secrets.token_urlsafe(32))
    is_verified = (not REQUIRE_EMAIL_VERIFICATION) or bool(email_verified)

    if existing:
        existing.first_name = first_name
        existing.last_name = last_name
        existing.country = country
        existing.region = region
        existing.town = town
        if is_verified and not existing.is_verified:
            existing.is_verified = True
        # Keep existing password_hash for idempotency.
        await db.commit()
        await db.refresh(existing)
        return existing

    db_user = User(
        first_name=first_name,
        last_name=last_name,
        country=country,
        region=region,
        town=town,
        email=email,
        password_hash=password_hash,
        is_verified=is_verified,
        created_at=datetime.now(),
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


# выборка данных логина и пароля пользователя для аутентификации
async def get_user_authentication(
    db: AsyncSession, email: str, plain_password: str
) -> User | None:
    logging.info("Authenticating user: login=%s", email)
    try:
        result = await db.execute(select(User).filter(User.email == email))
        user = result.scalars().first()
        if not user:
            logging.warning("User not found: login=%s", email)
            return None

        ok, upgraded_hash = verify_password(plain_password, user.password_hash)
        if not ok:
            logging.warning("Invalid credentials for login=%s", email)
            return None

        if is_user_blocked(user):
            logging.warning("Blocked user attempted login: login=%s", email)
            raise HTTPException(
                status_code=403,
                detail="Аккаунт заблокирован",
            )

        if upgraded_hash:
            user.password_hash = upgraded_hash
            await db.commit()

        logging.info("User authenticated: id=%s, login=%s", user.id, user.email)
        return user
    except HTTPException:
        raise
    except Exception as e:
        logging.error("Error in get_user_authentication: %s", e, exc_info=True)
        raise


# выбор пользователя по логину
async def get_user(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalars().first()


# добавление в базу данных общие настройки пользователя или изменение общих настроек профиля пользователя
async def add_user_common(db: AsyncSession, user: UserCommonSchema):
    existing_user = await db.get(User, user.user_id)
    if existing_user:
        # Обновляем поля
        existing_user.first_name = user.first_name
        existing_user.last_name = user.last_name
        existing_user.country = user.country
        existing_user.region = user.region
        existing_user.town = user.town
        # другой способ обновить поля
        await db.commit()
        await db.refresh(existing_user)
        return existing_user


# добавление в базу данных профиля пользователя с более углубленными данными
async def add_profile_user(db: AsyncSession, user_profile: UserProfileSchema):
    # Проверяем, есть ли у пользователя уже профиль
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user_profile.user_id)
    )
    existing_user_profile = result.scalar_one_or_none()

    if existing_user_profile:
        # Если профиль существует, проверяем изменения
        if (
            existing_user_profile.avatar_url == user_profile.avatar_url
            and existing_user_profile.bio == user_profile.bio
            and existing_user_profile.short_review_master
            == user_profile.short_review_master
            and existing_user_profile.operating_mode == user_profile.operating_mode
        ):
            # Если ничего не поменялось, просто возвращаем существующий профиль
            return existing_user_profile

        # Иначе обновляем профиль
        existing_user_profile.avatar_url = user_profile.avatar_url
        existing_user_profile.bio = user_profile.bio
        existing_user_profile.short_review_master = user_profile.short_review_master
        existing_user_profile.operating_mode = user_profile.operating_mode

        await db.commit()
        await db.refresh(existing_user_profile)
        return existing_user_profile

    # Если профиль не найден, создаём новый
    db_user_profile = UserProfile(
        user_id=user_profile.user_id,
        avatar_url=user_profile.avatar_url,
        bio=user_profile.bio,
        short_review_master=user_profile.short_review_master,
        operating_mode=user_profile.operating_mode,
    )

    # Добавляем и сохраняем в базе
    db.add(db_user_profile)
    await db.commit()
    await db.refresh(db_user_profile)

    return db_user_profile


# метод для предоставления информации на фронтенде в настройках пользователя
async def get_profile_user(db: AsyncSession, user_id: int):
    try:
        result = await db.execute(
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.country,
                User.region,
                User.town,
                UserProfile.bio,
                UserProfile.short_review_master,
                UserProfile.operating_mode,
            )
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        user_profile = UserProfileReadSchema(
            id=row.id,
            first_name=row.first_name or "",
            last_name=row.last_name or "",
            country=row.country or "",
            region=row.region or "",
            town=row.town or "",
            bio=row.bio,
            short_review_master=row.short_review_master,
            operating_mode=row.operating_mode,
        )
        return user_profile

    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# информация о пользователе для предоставления в карточке заказа клиента или исполнителя
async def get_information_about_user(db: AsyncSession, user_id: int):
    try:
        result = await db.execute(
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.country,
                User.region,
                User.town,
            )
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .where(User.id == user_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        information_about_user = UserCommonSchema(
            user_id=row.id,
            first_name=row.first_name or "",
            last_name=row.last_name or "",
            country=row.country or "",
            region=row.region or "",
            town=row.town or "",
        )
        return information_about_user

    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


def find_avatar_file(user_id: int) -> str | None:
    """Backward-compatible helper; returns storage key if avatar exists."""
    return find_avatar_key(user_id)


async def get_profiles_executors_for_cards_user(
    db: AsyncSession,
    category_work_slug: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    town: Optional[str] = None,
    max_cost: Optional[float] = None,
    page: int = 1,
    page_size: int = 12,
):
    try:
        query = (
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.country,
                User.region,
                User.town,
                UserProfile.bio,
                UserProfile.short_review_master,
                UserProfile.operating_mode,
                Country.name_country.label("country_name"),
                Region.name_region.label("region_name"),
                Town.name_town.label("town_name"),
            )
            .select_from(User)
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .join(CategoryWorkMaster, User.id == CategoryWorkMaster.master_id)
            .join(CategoryWork, CategoryWorkMaster.category_work_id == CategoryWork.id)
            .outerjoin(Country, User.country == str(Country.id))
            .outerjoin(Region, User.region == str(Region.id))
            .outerjoin(Town, User.town == str(Town.id))
            .where(
                and_(
                    # ✅ Фильтр по slug ТОЛЬКО если задан
                    (
                        (CategoryWork.slug == category_work_slug)
                        if category_work_slug
                        else True
                    ),
                    User.country.ilike(f"%{country}%") if country else True,
                    User.region.ilike(f"%{region}%") if region else True,
                    User.town.ilike(f"%{town}%") if town else True,
                    (CategoryWorkMaster.cost_hour <= max_cost) if max_cost else True,
                )
            )
            .group_by(
                User.id,
                User.first_name,
                User.last_name,
                User.country,
                User.region,
                User.town,
                UserProfile.bio,
                UserProfile.short_review_master,
                UserProfile.operating_mode,
                Country.name_country,
                Region.name_region,
                Town.name_town,
            )
            .order_by(User.first_name)
        )

        count_result = await db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one() or 0

        if total == 0:
            return [], 0

        offset = (page - 1) * page_size
        result = await db.execute(query.offset(offset).limit(page_size))
        profiles = result.all()
        print(f"🔥 Найдено профилей: {total}, страница {page}")

        profiles_executors_for_cards = []
        for profile in profiles:
            (
                user_id,
                first_name,
                last_name,
                user_country,
                user_region,
                user_town,
                bio,
                short_review,
                operating_mode,
                country_name,
                region_name,
                town_name,
            ) = profile

            avatar_url = None
            try:
                if find_avatar_key(user_id):
                    avatar_url = f"/avatar/{user_id}"
            except:
                pass

            profile_card = UserProfileForCardSchema(
                id=user_id,
                first_name=first_name or "",
                last_name=last_name or "",
                country=country_name or user_country or "Не указано",
                region=region_name or user_region or "Не указано",
                town=town_name or user_town or "Не указано",
                bio=bio or "",
                short_review_master=short_review or "",
                operating_mode=operating_mode or "Договорная",
                avatar_url=avatar_url,
                rating=0,
                review_count=0,
            )
            profiles_executors_for_cards.append(profile_card)

        return profiles_executors_for_cards, total

    except Exception as e:
        print(f"💥 ОШИБКА: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Ошибка сервера")


# добавление в базу данных бизнес настройки пользователя
async def add_user_business(db: AsyncSession, user_business: UserBusinessSchema):
    # Получаем id бизнес-формы из названия
    result = await db.execute(
        select(BusinessForm.id).where(
            BusinessForm.name == user_business.business_form_name
        )
    )
    business_form_id = result.scalar_one_or_none()
    if business_form_id is None:
        raise HTTPException(
            status_code=400, detail="Указанная форма бизнеса не найдена"
        )

    # Проверяем, есть ли уже настройки для пользователя
    result = await db.execute(
        select(UserBusiness).where(UserBusiness.user_id == user_business.user_id)
    )
    existing_user_business = result.scalar_one_or_none()
    if existing_user_business:
        if (
            existing_user_business.business_form_id == business_form_id
            and existing_user_business.registration_number
            == user_business.registration_number
            and existing_user_business.location == user_business.location
        ):
            # Если ничего не поменялось, просто возвращаем существующие бизнес настройки
            return existing_user_business
        # Иначе обновляем бизнес настройки
        existing_user_business.business_form_id = business_form_id
        existing_user_business.registration_number = user_business.registration_number

        existing_user_business.location = user_business.location

        await db.commit()
        await db.refresh(existing_user_business)
        return existing_user_business

    # Создаём новые бизнес настройки в случае если у пользователя их не было
    db_user_business = UserBusiness(
        user_id=user_business.user_id,
        business_form_id=business_form_id,
        registration_number=user_business.registration_number,
        location=user_business.location,
    )

    # Добавляем и сохраняем в базе
    db.add(db_user_business)
    await db.commit()
    await db.refresh(db_user_business)

    return db_user_business


# добавление в базу данных формы бизнеса
async def add_business_form(db: AsyncSession, business_form_schema: BusinessFormSchema):
    if business_form_schema.id is not None:
        result = await db.execute(
            select(BusinessForm).where(BusinessForm.id == business_form_schema.id)
        )
        existing_by_id = result.scalar_one_or_none()
        if not existing_by_id:
            raise HTTPException(status_code=404, detail="Бизнес-форма не найдена")
        existing_by_id.name = business_form_schema.name
        existing_by_id.description = business_form_schema.description
        await db.commit()
        await db.refresh(existing_by_id)
        return existing_by_id

    result = await db.execute(
        select(BusinessForm).where(BusinessForm.name == business_form_schema.name)
    )
    existing_business_form = result.scalar_one_or_none()

    if existing_business_form is not None:
        existing_business_form.description = business_form_schema.description
        await db.commit()
        await db.refresh(existing_business_form)
        return existing_business_form

    business_form = BusinessForm(
        name=business_form_schema.name,
        description=business_form_schema.description,
    )

    db.add(business_form)
    await db.commit()
    await db.refresh(business_form)
    return business_form


# метод для предоставления информации на фронтенде в настройках о формах бизнеса
async def get_business_form(db: AsyncSession):
    try:
        list_business_form = []
        result = await db.execute(select(BusinessForm))
        business_form_result = result.scalars().all()
        if not business_form_result:
            return []
        for business_form in business_form_result:
            business_form_schema = BusinessFormSchema(
                id=business_form.id,
                name=business_form.name,
                description=business_form.description,
            )
            list_business_form.append(business_form_schema)
        return list_business_form

    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# метод для предоставления информации на фронтенде в настройках бизнеса пользователя
async def get_user_business(db: AsyncSession, user_id: int):
    try:
        result = await db.execute(
            select(BusinessForm, UserBusiness)
            .outerjoin(UserBusiness, BusinessForm.id == UserBusiness.business_form_id)
            .outerjoin(User, User.id == UserBusiness.user_id)
            .filter(User.id == user_id)
        )
        user_business_result = result.first()
        if not user_business_result:
            raise HTTPException(
                status_code=404, detail="Данные пользователя не найдены"
            )

        business_form, user_business = user_business_result
        if not user_business:
            raise HTTPException(
                status_code=404, detail="Форма бизнеса пользователя не найдена"
            )

        user_business_schema = UserBusinessReadSchema(
            business_form_name=business_form.name,
            description=business_form.description,
            registration_number=user_business.registration_number,
            location=user_business.location,
        )
        return user_business_schema

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")


# добавление в базу данных контактов пользователя
async def add_user_contact(db: AsyncSession, user_contact: UserContactSchema):
    result = await db.execute(
        select(UserContact.id).where(
            and_(
                UserContact.user_id == user_contact.user_id,
                UserContact.name_contact == user_contact.name_contact,
                UserContact.contact == user_contact.contact,
            )
        )
    )
    user_contact_id = result.scalar_one_or_none()
    if user_contact_id is not None:
        raise HTTPException(status_code=400, detail="Такой контакт уже существует")

    # Иначе создаём новый контакт
    db_user_contact = UserContact(
        user_id=user_contact.user_id,
        name_contact=user_contact.name_contact,
        contact=user_contact.contact,
    )
    db.add(db_user_contact)
    await db.commit()
    await db.refresh(db_user_contact)
    return db_user_contact


# метод для предоставления информации на фронтенде в настройках контакты пользователя
async def get_user_contacts(db: AsyncSession, user_id: int):
    try:
        user_contacts = []

        result = await db.execute(
            select(UserContact).where(UserContact.user_id == user_id)
        )
        contacts = result.scalars().all()

        # if not contacts:
        #     raise HTTPException(
        #         status_code=404, detail="Данные контактов пользователя не найдены"
        #     )

        user_contacts = [
            UserContactReadSchema(
                contact_id=contact.id,
                name_contact=contact.name_contact,
                contact=contact.contact,
            )
            for contact in contacts
        ]

        return user_contacts  # вернёт [] если нет контактов

    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


# добавление в базу данных географию выполнения заказов пользователя
async def add_user_geography_execute_order(
    db: AsyncSession, user_geography_execute_order: GeographyExecuteOrderSchema
):
    result_town_id = await db.execute(
        select(Town.id)
        .join(Town.region)
        .join(Region.country)
        .where(
            and_(
                Country.name_country == user_geography_execute_order.country,
                Region.name_region == user_geography_execute_order.region,
                Town.name_town == user_geography_execute_order.town,
            )
        )
    )

    town_id = result_town_id.scalar_one_or_none()
    result = await db.execute(
        select(GeographyExecuteOrder.id).where(
            and_(
                GeographyExecuteOrder.user_id == user_geography_execute_order.user_id,
                GeographyExecuteOrder.town_id == town_id,
            )
        )
    )
    user_geography_execute_order_id = result.scalar_one_or_none()
    if user_geography_execute_order_id is not None:
        raise HTTPException(
            status_code=400, detail="География выполнения заказа уже существует"
        )

    # Создаём новый контакт
    db_user_geography_execute_order = GeographyExecuteOrder(
        user_id=user_geography_execute_order.user_id,
        town_id=town_id,
    )

    # Добавляем и сохраняем в базе
    db.add(db_user_geography_execute_order)
    await db.commit()
    await db.refresh(db_user_geography_execute_order)


# метод для предоставления информации на фронтенде в настройках географии выполнения работ пользователя
# !!! Пример кода для запросов с ленивой загрузкой связанных объектов !!!
async def get_user_geography_execute_orders(db: AsyncSession, user_id: int):
    try:
        result = await db.execute(
            select(GeographyExecuteOrder)
            .options(
                joinedload(GeographyExecuteOrder.town)
                .joinedload(Town.region)
                .joinedload(Region.country)
            )
            .where(GeographyExecuteOrder.user_id == user_id)
        )
        # Этот код представяел собой запрос с ленивой загрузкой и аналогичен тому коду, что написан ниже
        # result = await db.execute(
        #     select(
        #         GeographyExecuteOrder.town_id,
        #         Country.name_country,
        #         Region.name_region,
        #         Town.name_town,
        #     )
        #     .select_from(GeographyExecuteOrder)
        #     .outerjoin(Town, GeographyExecuteOrder.town_id == Town.id)
        #     .outerjoin(Region, Town.region_id == Region.id)
        #     .outerjoin(Country, Region.country_id == Country.id)
        #     .where(GeographyExecuteOrder.user_id == user_id)
        # )
        orders = result.scalars().all()

        if not orders:
            return {"countries": {}}

        # Формируем структуру для ответа
        countries = {}
        for order in orders:
            town = order.town
            if not town:
                continue

            region = town.region
            country = region.country if region else None

            name_country = country.name_country if country else "Неизвестно"
            name_region = region.name_region if region else "Неизвестно"
            town_id = town.id
            name_town = town.name_town

            if name_country not in countries:
                countries[name_country] = {"name_country": name_country, "regions": {}}

            if name_region not in countries[name_country]["regions"]:
                countries[name_country]["regions"][name_region] = {
                    "name_region": name_region,
                    "towns": [],
                }

            countries[name_country]["regions"][name_region]["towns"].append(
                {"town_id": town_id, "name_town": name_town}
            )

        return {"countries": countries}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")


async def delete_town_user_geography_execute_orders(
    db: AsyncSession, user_id: int, town_id: int
):
    await db.execute(
        delete(GeographyExecuteOrder).where(
            and_(
                GeographyExecuteOrder.user_id == user_id,
                GeographyExecuteOrder.town_id == town_id,
            )
        )
    )

    await db.commit()


async def delete_contact_user(db: AsyncSession, contact_id: int):
    result = await db.execute(select(UserContact).where(UserContact.id == contact_id))
    contact = result.scalars().first()
    if not contact:
        return False  # Контакт не найден
    await db.delete(contact)
    await db.commit()
    return True


# Добавлям портфолио для пользователя
async def add_project_portfolio_master(
    db: AsyncSession, portfolio_item: PortfolioItemSchema
):

    existing_portfolio_item = await db.execute(
        select(PortfolioItem).filter(
            PortfolioItem.user_id == portfolio_item.user_id,
            PortfolioItem.title == portfolio_item.title,
            PortfolioItem.description == portfolio_item.description,
            PortfolioItem.category_id == portfolio_item.category_id,
        )
    )

    if existing_portfolio_item.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Такое портфолио для этого пользователя уже существует",
        )

    db_portfolio = PortfolioItem(
        user_id=portfolio_item.user_id,
        title=portfolio_item.title,
        description=portfolio_item.description,
        category_id=portfolio_item.category_id,
        created_at=portfolio_item.created_at,
    )

    db.add(db_portfolio)
    await db.commit()
    await db.refresh(db_portfolio)

    return db_portfolio


# метод для предоставления информации на фронтенде карточек с проектами портфолио мастера
async def get_projects_portfolio_master(db: AsyncSession, user_id: int):
    try:
        projects_portfolio_master = []

        result = await db.execute(
            select(PortfolioItem, CategoryWork)
            .outerjoin(CategoryWork, PortfolioItem.category_id == CategoryWork.id)
            .where(PortfolioItem.user_id == user_id)
        )
        result_projects_portfolio_master = result.all()

        # if not contacts:
        #     raise HTTPException(
        #         status_code=404, detail="Данные контактов пользователя не найдены"
        #     )

        projects_portfolio_master = [
            PortfolioItemReadSchema(
                portfolio_item_id=project_portfolio_master.id,
                title=project_portfolio_master.title,
                description=project_portfolio_master.description,
                category_work=category_work.name,
                created_at=project_portfolio_master.created_at,
            )
            for project_portfolio_master, category_work in result_projects_portfolio_master
        ]

        return projects_portfolio_master  # вернёт [] если нет контактов

    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")


async def get_users_for_admin(
    db: AsyncSession,
    category_work_slug: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    town: Optional[str] = None,
    business_form: Optional[str] = None,
    blocked: Optional[bool] = None,
    role_user: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 12,
):
    try:
        base_query = (
            select(User, UserProfile.avatar_url)
            .select_from(User)
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .outerjoin(UserBusiness, User.id == UserBusiness.user_id)
            .outerjoin(BusinessForm, UserBusiness.business_form_id == BusinessForm.id)
        )

        query = base_query

        if role_user == "Исполнитель":
            query = query.outerjoin(
                ExecutorOrder, User.id == ExecutorOrder.executor_id
            ).where(ExecutorOrder.executor_id.isnot(None))
        elif role_user == "Заказчик":
            query = query.outerjoin(Order, User.id == Order.customer_id).where(
                Order.customer_id.isnot(None)
            )
        elif role_user == "Ни исполнитель, ни заказчик":
            query = (
                query.outerjoin(ExecutorOrder, User.id == ExecutorOrder.executor_id)
                .outerjoin(Order, User.id == Order.customer_id)
                .where(ExecutorOrder.executor_id.is_(None))
                .where(Order.customer_id.is_(None))
            )
        else:
            query = query.outerjoin(
                ExecutorOrder, User.id == ExecutorOrder.executor_id
            ).outerjoin(Order, User.id == Order.customer_id)

        if category_work_slug:
            cat_subquery = (
                select(User.id)
                .select_from(User)
                .join(CategoryWorkMaster, User.id == CategoryWorkMaster.master_id)
                .join(
                    CategoryWork, CategoryWorkMaster.category_work_id == CategoryWork.id
                )
                .where(CategoryWork.slug == category_work_slug)
            )
            query = query.where(User.id.in_(cat_subquery))

        if country:
            query = query.where(User.country == country)
        if region:
            query = query.where(User.region == region)
        if town:
            query = query.where(User.town == town)
        if business_form:
            query = query.where(BusinessForm.name == business_form)
        if blocked is not None:
            query = query.where(User.blocked == blocked)

        if search and search.strip():
            pattern = f"%{search.strip()}%"
            query = query.where(
                or_(
                    User.first_name.ilike(pattern),
                    User.last_name.ilike(pattern),
                    User.email.ilike(pattern),
                )
            )

        distinct_query = query.distinct()
        ids_subq = distinct_query.with_only_columns(User.id).subquery()
        total = (
            await db.execute(select(func.count()).select_from(ids_subq))
        ).scalar() or 0

        offset = max(page - 1, 0) * page_size
        result = await db.execute(
            distinct_query.order_by(User.id.desc()).offset(offset).limit(page_size)
        )
        rows = result.all()

        items = [
            UserCardForAdminSchema(
                id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                country=user.country,
                region=user.region,
                town=user.town,
                role=user.role,
                avatar_url=avatar_url,
                blocked=user.blocked,
                is_active=user.is_active,
            )
            for user, avatar_url in rows
        ]

        return items, total

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")


async def get_user_profile_for_admin(db: AsyncSession, user_id: int):
    try:
        result = await db.execute(
            select(User, UserProfile, UserBusiness, BusinessForm)
            .select_from(User)
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .outerjoin(UserBusiness, User.id == UserBusiness.user_id)
            .outerjoin(BusinessForm, UserBusiness.business_form_id == BusinessForm.id)
            .where(User.id == user_id)
            .distinct()
        )

        user_row = result.first()
        if not user_row:
            return None

        user, user_profile, user_business, business_form = user_row

        user_profile_data = UserProfileForAdminSchema(
            id=user.id,
            first_name=user.first_name,
            last_name=user.last_name,
            country=user.country,
            region=user.region,
            town=user.town,
            blocked=user.blocked,
            email=user.email,
            role=user.role,
            is_verified=user.is_verified,
            is_active=user.is_active,
            created_at=user.created_at.isoformat() if user.created_at else None,
            last_login=user.last_login.isoformat() if user.last_login else None,
            name_business_form=business_form.name if business_form else None,
            registration_number=(
                user_business.registration_number if user_business else None
            ),
            name_business=(user_business.name if user_business else None),
            location=user_business.location if user_business else None,
            avatar_url=user_profile.avatar_url if user_profile else None,
            bio=user_profile.bio if user_profile else None,
            short_review_master=(
                user_profile.short_review_master if user_profile else None
            ),
            operating_mode=user_profile.operating_mode if user_profile else None,
        )

        return user_profile_data

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")
