from datetime import datetime  # Метка времени регистрации
import secrets  # Случайные пароли для OAuth-пользователей
import os  # Работа с путями (legacy)
from typing import Optional  # Опциональные фильтры списков
from fastapi import HTTPException, logger  # HTTP-ошибки и логгер FastAPI
from fastapi.responses import FileResponse  # Отдача файлов (legacy)
from sqlalchemy import (
    and_,
    delete,
    exists,
    func,
    or_,
    select,
    true,
)  # SQL-выражения и агрегаты
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД
from sqlalchemy.orm import joinedload  # Eager-load связей

from models.orders_models import (
    ExecutorOrder,
    Order,
    Review,
)  # Заказы и роли пользователей
from core.storage import find_avatar_key  # Ключ аватара в хранилище
from core.config import (
    REQUIRE_EMAIL_VERIFICATION,
)  # Флаг обязательной верификации email
from core.security import (
    hash_password,
    verify_password,
)  # Хеширование и проверка пароля
from models.works_materials_models import (  # Категории работ мастера
    CategoryWork,
    CategoryWorkMaster,
    WorkMasterFromAdmin,
    WorkMasterMyself,
)
from models.geography_models import Country, Region, Town  # Справочник географии
from core.access import is_user_blocked  # Проверка блокировки аккаунта
from models.users_models import (  # ORM-модели пользователя и профиля
    BusinessForm,
    GeographyExecuteOrder,
    PortfolioItem,
    User,
    UserBusiness,
    UserContact,
    UserProfile,
)
from schemas.users_schemas import (  # Pydantic-схемы API пользователей
    BusinessFormSchema,
    GeographyExecuteOrderSchema,
    PortfolioItemReadSchema,
    PortfolioItemSchema,
    UserBusinessReadSchema,
    UserBusinessSchema,
    UserCardForAdminSchema,
    UserCategoryWork,
    UserCommonReadSchema,
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

import logging  # Стандартный логгер

logger = logging.getLogger(__name__)  # Логгер модуля users_crud


async def _ensure_town_exists(db: AsyncSession, town_id: int) -> Town:
    town = await db.get(Town, town_id)
    if not town:
        raise HTTPException(status_code=400, detail="Указанный город не найден")
    return town


async def _geo_names_for_town_id(
    db: AsyncSession, town_id: int | None
) -> tuple[str, str, str]:
    """Вернуть (country, region, town) имена по town_id."""
    if not town_id:
        return "", "", ""
    result = await db.execute(
        select(Country.name_country, Region.name_region, Town.name_town)
        .select_from(Town)
        .join(Region, Town.region_id == Region.id)
        .join(Country, Region.country_id == Country.id)
        .where(Town.id == town_id)
    )
    row = result.first()
    if not row:
        return "", "", ""
    return row.name_country or "", row.name_region or "", row.name_town or ""


async def add_user(
    db: AsyncSession, user: UserSchema
):  # Регистрация нового пользователя
    existing_user = await db.execute(
        select(User).filter(User.email == user.email)
    )  # Проверка email

    if existing_user.scalar_one_or_none():  # Уже есть в БД
        raise HTTPException(  # 400 — дубликат
            status_code=400, detail="Пользователь с таким именем уже существует"
        )

    await _ensure_town_exists(db, user.town_id)

    db_user = User(  # ORM-объект нового пользователя
        first_name=user.first_name,  # имя
        last_name=user.last_name,  # фамилия
        town_id=user.town_id,
        email=user.email,
        password_hash=hash_password(user.password),  # хеш пароля
        is_verified=not REQUIRE_EMAIL_VERIFICATION,  # сразу verified, если верификация не требуется
        created_at=datetime.now(),  # дата регистрации
    )

    db.add(db_user)  # В очередь INSERT
    await db.commit()  # Сохраняем
    await db.refresh(db_user)  # Подтягиваем id и defaults

    return db_user  # Созданный User


async def upsert_user_from_google(  # Создание/обновление пользователя через Google OAuth
    db: AsyncSession,
    *,
    email: str,
    first_name: str,
    last_name: str,
    town_id: int,
    email_verified: bool,
) -> User:
    """
    Create/update a user using Google identity.

    Your DB schema requires non-null `password_hash`, so for Google users we store
    a random internal password hash (password login won't be used).
    """
    await _ensure_town_exists(db, town_id)
    existing = await get_user(db=db, email=email)  # Уже есть аккаунт с этим email
    password_hash = hash_password(
        secrets.token_urlsafe(32)
    )  # Случайный пароль (логин по паролю не используется)
    is_verified = (not REQUIRE_EMAIL_VERIFICATION) or bool(
        email_verified
    )  # Флаг verified

    if existing:  # Обновляем существующего
        existing.first_name = first_name  # имя
        existing.last_name = last_name  # фамилия
        existing.town_id = town_id
        if is_verified and not existing.is_verified:  # Google подтвердил email
            existing.is_verified = True  # помечаем verified
        # Keep existing password_hash for idempotency.
        await db.commit()  # Сохраняем изменения
        await db.refresh(existing)  # Актуальный объект
        return existing  # Обновлённый пользователь

    db_user = User(  # Новый пользователь Google
        first_name=first_name,  # имя
        last_name=last_name,  # фамилия
        town_id=town_id,
        email=email,  # email из Google
        password_hash=password_hash,  # обязательный non-null hash
        is_verified=is_verified,  # verified по настройке/Google
        created_at=datetime.now(),  # дата создания
    )
    db.add(db_user)  # INSERT
    await db.commit()  # commit
    await db.refresh(db_user)  # id и defaults
    return db_user  # Созданный User


async def get_user_authentication(  # Аутентификация по email и паролю
    db: AsyncSession, email: str, plain_password: str
) -> User | None:
    logging.info("Authenticating user: login=%s", email)  # Лог попытки входа
    try:
        result = await db.execute(
            select(User).filter(User.email == email)
        )  # SELECT по email
        user = result.scalars().first()  # Первая запись или None
        if not user:  # Не найден
            logging.warning("User not found: login=%s", email)  # Лог
            return None  # Неверные учётные данные

        ok, upgraded_hash = verify_password(
            plain_password, user.password_hash
        )  # Проверка пароля (возможен rehash)
        if not ok:  # Пароль неверный
            logging.warning("Invalid credentials for login=%s", email)  # Лог
            return None  # Отказ

        if is_user_blocked(user):  # Аккаунт заблокирован
            logging.warning("Blocked user attempted login: login=%s", email)  # Лог
            raise HTTPException(  # 403
                status_code=403,
                detail="Аккаунт заблокирован",
            )

        if upgraded_hash:  # Нужно обновить hash (bcrypt rounds и т.п.)
            user.password_hash = upgraded_hash  # новый hash
            await db.commit()  # сохраняем

        logging.info(
            "User authenticated: id=%s, login=%s", user.id, user.email
        )  # Успех
        return user  # Аутентифицированный User
    except HTTPException:  # Уже HTTP-ошибка
        raise  # пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logging.error(
            "Error in get_user_authentication: %s", e, exc_info=True
        )  # Лог с traceback
        raise  # пробрасываем


async def get_user(
    db: AsyncSession, email: str
) -> User | None:  # Поиск пользователя по email
    result = await db.execute(select(User).where(User.email == email))  # SELECT
    return result.scalars().first()  # User или None


async def add_user_common(
    db: AsyncSession, user: UserCommonSchema
) -> UserCommonReadSchema:  # Обновление общих полей пользователя
    existing_user = await db.get(User, user.user_id)  # Загрузка по PK
    if not existing_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    existing_user.first_name = user.first_name  # имя
    existing_user.last_name = user.last_name  # фамилия
    if user.town_id is not None:
        await _ensure_town_exists(db, user.town_id)
        existing_user.town_id = user.town_id
    await db.commit()  # commit
    await db.refresh(existing_user)  # актуальные данные

    country, region, town = await _geo_names_for_town_id(db, existing_user.town_id)
    return UserCommonReadSchema(
        first_name=existing_user.first_name,
        last_name=existing_user.last_name,
        town_id=existing_user.town_id,
        country=country or None,
        region=region or None,
        town=town or None,
        location=None,
    )


async def add_profile_user(
    db: AsyncSession, user_profile: UserProfileSchema
):  # Создание/обновление профиля
    result = await db.execute(  # Есть ли профиль у пользователя
        select(UserProfile).where(UserProfile.user_id == user_profile.user_id)
    )
    existing_user_profile = result.scalar_one_or_none()  # UserProfile или None

    if existing_user_profile:  # Профиль уже существует
        if (  # Данные не изменились
            existing_user_profile.avatar_url == user_profile.avatar_url
            and existing_user_profile.bio == user_profile.bio
            and existing_user_profile.short_review_master
            == user_profile.short_review_master
            and existing_user_profile.operating_mode == user_profile.operating_mode
        ):
            return existing_user_profile  # без записи в БД

        if user_profile.avatar_url is not None:  # обновляем аватар
            existing_user_profile.avatar_url = user_profile.avatar_url
        if user_profile.bio is not None:  # био
            existing_user_profile.bio = user_profile.bio
        if user_profile.short_review_master is not None:  # краткий отзыв
            existing_user_profile.short_review_master = user_profile.short_review_master
        if user_profile.operating_mode is not None:  # режим работы
            existing_user_profile.operating_mode = user_profile.operating_mode

        await db.commit()  # сохраняем
        await db.refresh(existing_user_profile)  # актуальный профиль
        return existing_user_profile  # обновлённый профиль

    db_user_profile = UserProfile(  # Новый профиль
        user_id=user_profile.user_id,  # FK на User
        avatar_url=user_profile.avatar_url,  # аватар
        bio=user_profile.bio,  # описание
        short_review_master=user_profile.short_review_master,  # краткий отзыв
        operating_mode=user_profile.operating_mode,  # режим работы
    )

    db.add(db_user_profile)  # INSERT
    await db.commit()  # commit
    await db.refresh(db_user_profile)  # id

    return db_user_profile  # созданный профиль


async def get_profile_user(
    db: AsyncSession, user_id: int
):  # Профиль для экрана настроек
    try:
        result = await db.execute(  # JOIN User + Profile + Business + geo
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.town_id,
                User.created_at,
                Country.name_country,
                Region.name_region,
                Town.name_town,
                UserBusiness.location,
                UserProfile.bio,
                UserProfile.short_review_master,
                UserProfile.operating_mode,
            )
            .outerjoin(Town, User.town_id == Town.id)
            .outerjoin(Region, Town.region_id == Region.id)
            .outerjoin(Country, Region.country_id == Country.id)
            .outerjoin(
                UserProfile, User.id == UserProfile.user_id
            )  # профиль опционален
            .outerjoin(
                UserBusiness, User.id == UserBusiness.user_id
            )  # бизнес опционален
            .where(User.id == user_id)  # по id
        )
        row = result.first()  # одна строка или None
        if not row:  # пользователь не найден
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        user_profile = UserProfileReadSchema(  # DTO для фронта
            id=row.id,  # id
            first_name=row.first_name or "",  # имя
            last_name=row.last_name or "",  # фамилия
            town_id=row.town_id,
            country=row.name_country or "",  # страна
            region=row.name_region or "",  # регион
            town=row.name_town or "",  # город
            location=row.location,  # адрес бизнеса
            bio=row.bio,  # био
            short_review_master=row.short_review_master,  # краткий отзыв
            operating_mode=row.operating_mode,  # режим работы
            created_at=row.created_at,  # дата регистрации
        )
        return user_profile  # схема профиля

    except HTTPException:
        raise
    except Exception as e:  # любая ошибка
        raise HTTPException(
            status_code=403, detail=f"Ошибка: {str(e)}"
        )  # 403 с текстом


async def get_information_about_user(
    db: AsyncSession, user_id: int
):  # Краткая инфо для карточки заказа
    try:
        result = await db.execute(  # User + location из бизнеса + geo
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.town_id,
                Country.name_country,
                Region.name_region,
                Town.name_town,
                UserBusiness.location,
            )
            .outerjoin(Town, User.town_id == Town.id)
            .outerjoin(Region, Town.region_id == Region.id)
            .outerjoin(Country, Region.country_id == Country.id)
            .outerjoin(
                UserProfile, User.id == UserProfile.user_id
            )  # join для совместимости
            .outerjoin(UserBusiness, User.id == UserBusiness.user_id)  # location
            .where(User.id == user_id)  # по id
        )
        row = result.first()  # строка или None
        if not row:  # не найден
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        information_about_user = UserCommonSchema(  # компактная схема
            user_id=row.id,  # id
            first_name=row.first_name or "",  # имя
            last_name=row.last_name or "",  # фамилия
            town_id=row.town_id,
            country=row.name_country or "",  # страна
            region=row.name_region or "",  # регион
            town=row.name_town or "",  # город
            location=row.location,  # адрес
        )
        return information_about_user  # UserCommonSchema

    except HTTPException:
        raise
    except Exception as e:  # ошибка
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")  # 403


def find_avatar_file(user_id: int) -> str | None:  # Legacy: ключ аватара в storage
    """Backward-compatible helper; returns storage key if avatar exists."""
    return find_avatar_key(user_id)  # делегируем в core.storage


async def get_profiles_executors_for_cards_user(  # Карточки исполнителей с фильтрами и пагинацией
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
        query = (  # Базовый SELECT исполнителей
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.town_id,
                UserProfile.bio,
                UserProfile.short_review_master,
                UserProfile.operating_mode,
                Country.name_country.label("country_name"),  # человекочитаемая страна
                Region.name_region.label("region_name"),  # регион
                Town.name_town.label("town_name"),  # город
            )
            .select_from(User)  # от User
            .outerjoin(UserProfile, User.id == UserProfile.user_id)  # профиль
            .join(
                CategoryWorkMaster, User.id == CategoryWorkMaster.master_id
            )  # только мастера
            .join(
                CategoryWork, CategoryWorkMaster.category_work_id == CategoryWork.id
            )  # категория работ
            .outerjoin(Town, User.town_id == Town.id)
            .outerjoin(Region, Town.region_id == Region.id)
            .outerjoin(Country, Region.country_id == Country.id)
            .where(
                and_(
                    (  # фильтр по slug категории, если задан
                        (CategoryWork.slug == category_work_slug)
                        if category_work_slug
                        else True
                    ),
                    (
                        Country.name_country.ilike(f"%{country}%")
                        if country
                        else True
                    ),  # страна
                    (
                        Region.name_region.ilike(f"%{region}%") if region else True
                    ),  # регион
                    (Town.name_town.ilike(f"%{town}%") if town else True),  # город
                    (
                        (CategoryWorkMaster.cost_hour <= max_cost) if max_cost else True
                    ),  # ставка
                )
            )
            .group_by(  # уникальные исполнители
                User.id,
                User.first_name,
                User.last_name,
                User.town_id,
                UserProfile.bio,
                UserProfile.short_review_master,
                UserProfile.operating_mode,
                Country.name_country,
                Region.name_region,
                Town.name_town,
            )
            .order_by(User.first_name)  # сортировка по имени
        )

        count_result = await db.execute(  # общее число записей
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one() or 0  # count или 0

        if total == 0:  # пустой результат
            return [], 0  # список и total

        offset = (page - 1) * page_size  # смещение страницы
        result = await db.execute(query.offset(offset).limit(page_size))  # страница
        profiles = result.all()  # строки результата
        print(f"🔥 Найдено профилей: {total}, страница {page}")  # отладка

        profiles_executors_for_cards = []  # DTO для фронта
        for profile in profiles:  # каждая строка
            (
                user_id,
                first_name,
                last_name,
                _town_id,
                bio,
                short_review,
                operating_mode,
                country_name,
                region_name,
                town_name,
            ) = profile  # распаковка

            avatar_url = None  # URL аватара по умолчанию
            try:
                if find_avatar_key(user_id):  # файл аватара есть
                    avatar_url = f"/avatar/{user_id}"  # публичный путь
            except:  # ошибка storage — без аватара
                pass

            profile_card = UserProfileForCardSchema(  # карточка исполнителя
                id=user_id,  # id
                first_name=first_name or "",  # имя
                last_name=last_name or "",  # фамилия
                town_id=_town_id,
                country=country_name or "Не указано",  # страна
                region=region_name or "Не указано",  # регион
                town=town_name or "Не указано",  # город
                bio=bio or "",  # био
                short_review_master=short_review or "",  # отзыв
                operating_mode=operating_mode or "Договорная",  # режим
                avatar_url=avatar_url,  # аватар
            )
            profiles_executors_for_cards.append(profile_card)  # в список

        return profiles_executors_for_cards, total  # карточки и total

    except Exception as e:  # серверная ошибка
        print(f"💥 ОШИБКА: {e}")  # отладка
        import traceback  # traceback для консоли

        traceback.print_exc()  # печать стека
        raise HTTPException(status_code=500, detail="Ошибка сервера")  # 500


async def add_user_business(
    db: AsyncSession, user_business: UserBusinessSchema
):  # Бизнес-настройки пользователя
    # Без выбранной ОПФ бизнес-блок не сохраняем — иначе срывается сохранение био/профиля.
    if not (user_business.business_form_name or "").strip():
        return None

    result = await db.execute(  # id формы бизнеса по названию
        select(BusinessForm.id).where(
            BusinessForm.name == user_business.business_form_name
        )
    )
    business_form_id = result.scalar_one_or_none()  # id или None
    if business_form_id is None:  # форма не найдена
        raise HTTPException(  # 400
            status_code=400, detail="Указанная форма бизнеса не найдена"
        )

    result = await db.execute(  # есть ли уже UserBusiness
        select(UserBusiness).where(UserBusiness.user_id == user_business.user_id)
    )
    existing_user_business = result.scalar_one_or_none()  # запись или None
    if existing_user_business:  # обновление
        if (  # данные не изменились
            existing_user_business.business_form_id == business_form_id
            and existing_user_business.registration_number
            == user_business.registration_number
            and existing_user_business.location == user_business.location
        ):
            return existing_user_business  # без commit
        existing_user_business.business_form_id = business_form_id  # форма
        existing_user_business.registration_number = (
            user_business.registration_number
        )  # ОГРН/ИНН

        existing_user_business.location = user_business.location  # адрес

        await db.commit()  # сохраняем
        await db.refresh(existing_user_business)  # актуальная запись
        return existing_user_business  # обновлённые настройки

    db_user_business = UserBusiness(  # новая запись бизнеса
        user_id=user_business.user_id,  # FK
        business_form_id=business_form_id,  # форма
        registration_number=user_business.registration_number,  # рег. номер
        location=user_business.location,  # адрес
    )

    db.add(db_user_business)  # INSERT
    await db.commit()  # commit
    await db.refresh(db_user_business)  # id

    return db_user_business  # созданный UserBusiness


async def add_business_form(
    db: AsyncSession, business_form_schema: BusinessFormSchema
):  # CRUD справочника форм бизнеса
    if business_form_schema.id is not None:  # обновление по id
        result = await db.execute(  # поиск по PK
            select(BusinessForm).where(BusinessForm.id == business_form_schema.id)
        )
        existing_by_id = result.scalar_one_or_none()  # запись или None
        if not existing_by_id:  # не найдена
            raise HTTPException(status_code=404, detail="Бизнес-форма не найдена")
        existing_by_id.name = business_form_schema.name  # имя
        existing_by_id.description = business_form_schema.description  # описание
        await db.commit()  # commit
        await db.refresh(existing_by_id)  # актуальная запись
        return existing_by_id  # обновлённая форма

    result = await db.execute(  # upsert по имени
        select(BusinessForm).where(BusinessForm.name == business_form_schema.name)
    )
    existing_business_form = result.scalar_one_or_none()  # существующая или None

    if existing_business_form is not None:  # обновляем описание
        existing_business_form.description = (
            business_form_schema.description
        )  # описание
        await db.commit()  # commit
        await db.refresh(existing_business_form)  # refresh
        return existing_business_form  # форма

    business_form = BusinessForm(  # новая форма
        name=business_form_schema.name,  # название
        description=business_form_schema.description,  # описание
    )

    db.add(business_form)  # INSERT
    await db.commit()  # commit
    await db.refresh(business_form)  # id
    return business_form  # созданная форма


async def get_business_form(db: AsyncSession):  # Список всех форм бизнеса
    try:
        list_business_form = []  # результат
        result = await db.execute(select(BusinessForm))  # все формы
        business_form_result = result.scalars().all()  # ORM-список
        if not business_form_result:  # пусто
            return []  # пустой список
        for business_form in business_form_result:  # каждая форма
            business_form_schema = BusinessFormSchema(  # DTO
                id=business_form.id,  # id
                name=business_form.name,  # имя
                description=business_form.description,  # описание
            )
            list_business_form.append(business_form_schema)  # в список
        return list_business_form  # список схем

    except Exception as e:  # ошибка
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")  # 403


async def get_user_business(
    db: AsyncSession, user_id: int
):  # Бизнес-данные пользователя для настроек
    try:
        result = await db.execute(  # форма + UserBusiness по user_id
            select(BusinessForm, UserBusiness)
            .outerjoin(UserBusiness, BusinessForm.id == UserBusiness.business_form_id)
            .outerjoin(User, User.id == UserBusiness.user_id)
            .filter(User.id == user_id)
        )
        user_business_result = result.first()  # первая строка
        if not user_business_result:  # нет данных
            raise HTTPException(  # 404
                status_code=404, detail="Данные пользователя не найдены"
            )

        business_form, user_business = user_business_result  # распаковка
        if not user_business:  # нет бизнес-записи
            raise HTTPException(  # 404
                status_code=404, detail="Форма бизнеса пользователя не найдена"
            )

        user_business_schema = UserBusinessReadSchema(  # DTO для фронта
            business_form_name=business_form.name,  # название формы
            description=business_form.description,  # описание формы
            registration_number=user_business.registration_number,  # рег. номер
            location=user_business.location,  # адрес
        )
        return user_business_schema  # схема

    except HTTPException:  # уже HTTP
        raise  # пробрасываем
    except Exception as e:  # прочие ошибки
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")  # 500


async def add_user_contact(
    db: AsyncSession, user_contact: UserContactSchema
):  # Добавление контакта пользователя
    result = await db.execute(  # проверка дубликата
        select(UserContact.id).where(
            and_(
                UserContact.user_id == user_contact.user_id,
                UserContact.name_contact == user_contact.name_contact,
                UserContact.contact == user_contact.contact,
            )
        )
    )
    user_contact_id = result.scalar_one_or_none()  # id если уже есть
    if user_contact_id is not None:  # дубликат
        raise HTTPException(status_code=400, detail="Такой контакт уже существует")

    db_user_contact = UserContact(  # новый контакт
        user_id=user_contact.user_id,  # FK
        name_contact=user_contact.name_contact,  # тип (телефон, telegram...)
        contact=user_contact.contact,  # значение
    )
    db.add(db_user_contact)  # INSERT
    await db.commit()  # commit
    await db.refresh(db_user_contact)  # id
    return db_user_contact  # созданный контакт


async def get_user_contacts(
    db: AsyncSession, user_id: int
):  # Список контактов пользователя
    try:
        user_contacts = []  # результат

        result = await db.execute(  # все контакты user_id
            select(UserContact).where(UserContact.user_id == user_id)
        )
        contacts = result.scalars().all()  # ORM-список

        user_contacts = [  # маппинг в схемы
            UserContactReadSchema(
                contact_id=contact.id,  # id
                name_contact=contact.name_contact,  # тип
                contact=contact.contact,  # значение
            )
            for contact in contacts
        ]

        return user_contacts  # [] если контактов нет

    except Exception as e:  # ошибка
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")  # 403


async def add_user_geography_execute_order(  # Добавить город в географию выполнения заказов
    db: AsyncSession, user_geography_execute_order: GeographyExecuteOrderSchema
):
    result_town_id = await db.execute(  # town_id по названиям страна/регион/город
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

    town_id = result_town_id.scalar_one_or_none()  # id города
    result = await db.execute(  # уже есть такая запись
        select(GeographyExecuteOrder.id).where(
            and_(
                GeographyExecuteOrder.user_id == user_geography_execute_order.user_id,
                GeographyExecuteOrder.town_id == town_id,
            )
        )
    )
    user_geography_execute_order_id = result.scalar_one_or_none()  # id или None
    if user_geography_execute_order_id is not None:  # дубликат
        raise HTTPException(  # 400
            status_code=400, detail="География выполнения заказа уже существует"
        )

    db_user_geography_execute_order = GeographyExecuteOrder(  # новая запись
        user_id=user_geography_execute_order.user_id,  # FK user
        town_id=town_id,  # FK town
    )

    db.add(db_user_geography_execute_order)  # INSERT
    await db.commit()  # commit
    await db.refresh(db_user_geography_execute_order)  # id


async def get_user_geography_execute_orders(
    db: AsyncSession, user_id: int
):  # Дерево стран/регионов/городов (joinedload)
    try:
        result = await db.execute(  # eager-load town → region → country
            select(GeographyExecuteOrder)
            .options(
                joinedload(GeographyExecuteOrder.town)
                .joinedload(Town.region)
                .joinedload(Region.country)
            )
            .where(GeographyExecuteOrder.user_id == user_id)
        )
        orders = result.scalars().all()  # список GeographyExecuteOrder

        if not orders:  # нет записей
            return {"countries": {}}  # пустая структура

        countries = {}  # вложенный dict для фронта
        for order in orders:  # каждая география
            town = order.town  # ORM Town
            if not town:  # без города — пропуск
                continue

            region = town.region  # Region
            country = region.country if region else None  # Country

            name_country = (
                country.name_country if country else "Неизвестно"
            )  # имя страны
            name_region = region.name_region if region else "Неизвестно"  # имя региона
            town_id = town.id  # id города
            name_town = town.name_town  # имя города

            if name_country not in countries:  # новая страна
                countries[name_country] = {"name_country": name_country, "regions": {}}

            if name_region not in countries[name_country]["regions"]:  # новый регион
                countries[name_country]["regions"][name_region] = {
                    "name_region": name_region,
                    "towns": [],
                }

            countries[name_country]["regions"][name_region][
                "towns"
            ].append(  # город в регион
                {"town_id": town_id, "name_town": name_town}
            )

        return {"countries": countries}  # иерархия для UI

    except HTTPException:  # HTTP-ошибка
        raise  # пробрасываем
    except Exception as e:  # прочее
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")  # 500


async def delete_town_user_geography_execute_orders(  # Удалить город из географии пользователя
    db: AsyncSession, user_id: int, town_id: int
):
    await db.execute(  # DELETE по user + town
        delete(GeographyExecuteOrder).where(
            and_(
                GeographyExecuteOrder.user_id == user_id,
                GeographyExecuteOrder.town_id == town_id,
            )
        )
    )

    await db.commit()  # commit


async def delete_contact_user(
    db: AsyncSession, contact_id: int
):  # Удалить контакт по id
    result = await db.execute(
        select(UserContact).where(UserContact.id == contact_id)
    )  # SELECT
    contact = result.scalars().first()  # контакт или None
    if not contact:  # не найден
        return False  # false = не удалено
    await db.delete(contact)  # DELETE ORM
    await db.commit()  # commit
    return True  # успех


async def add_project_portfolio_master(  # Добавить проект в портфолио мастера
    db: AsyncSession, portfolio_item: PortfolioItemSchema
):

    existing_portfolio_item = await db.execute(  # проверка дубликата
        select(PortfolioItem).filter(
            PortfolioItem.user_id == portfolio_item.user_id,
            PortfolioItem.title == portfolio_item.title,
            PortfolioItem.description == portfolio_item.description,
            PortfolioItem.category_id == portfolio_item.category_id,
        )
    )

    if existing_portfolio_item.scalar_one_or_none():  # уже есть
        raise HTTPException(  # 400
            status_code=400,
            detail="Такое портфолио для этого пользователя уже существует",
        )

    db_portfolio = PortfolioItem(  # новый проект
        user_id=portfolio_item.user_id,  # FK
        title=portfolio_item.title,  # заголовок
        description=portfolio_item.description,  # описание
        category_id=portfolio_item.category_id,  # категория работ
        created_at=portfolio_item.created_at,  # дата
    )

    db.add(db_portfolio)  # INSERT
    await db.commit()  # commit
    await db.refresh(db_portfolio)  # id

    return db_portfolio  # созданный PortfolioItem


async def get_projects_portfolio_master(
    db: AsyncSession, user_id: int
):  # Проекты портфолио для карточек
    try:
        projects_portfolio_master = []  # результат

        result = await db.execute(  # PortfolioItem + CategoryWork
            select(PortfolioItem, CategoryWork)
            .outerjoin(CategoryWork, PortfolioItem.category_id == CategoryWork.id)
            .where(PortfolioItem.user_id == user_id)
        )
        result_projects_portfolio_master = result.all()  # пары (item, category)

        projects_portfolio_master = [  # DTO
            PortfolioItemReadSchema(
                portfolio_item_id=project_portfolio_master.id,  # id
                title=project_portfolio_master.title,  # заголовок
                description=project_portfolio_master.description,  # описание
                category_work=category_work.name,  # название категории
                created_at=project_portfolio_master.created_at,  # дата
            )
            for project_portfolio_master, category_work in result_projects_portfolio_master
        ]

        return projects_portfolio_master  # [] если пусто

    except Exception as e:  # ошибка
        raise HTTPException(status_code=403, detail=f"Ошибка: {str(e)}")  # 403


async def get_users_for_admin(  # Список пользователей для админки с фильтрами
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
        base_query = (  # User + avatar_url
            select(User, UserProfile.avatar_url)
            .select_from(User)
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .outerjoin(UserBusiness, User.id == UserBusiness.user_id)
            .outerjoin(BusinessForm, UserBusiness.business_form_id == BusinessForm.id)
        )

        query = base_query  # рабочий запрос

        if role_user == "Исполнитель":  # только исполнители
            query = query.outerjoin(
                ExecutorOrder, User.id == ExecutorOrder.executor_id
            ).where(ExecutorOrder.executor_id.isnot(None))
        elif role_user == "Заказчик":  # только заказчики
            query = query.outerjoin(Order, User.id == Order.customer_id).where(
                Order.customer_id.isnot(None)
            )
        elif role_user == "Ни исполнитель, ни заказчик":  # без ролей
            query = (
                query.outerjoin(ExecutorOrder, User.id == ExecutorOrder.executor_id)
                .outerjoin(Order, User.id == Order.customer_id)
                .where(ExecutorOrder.executor_id.is_(None))
                .where(Order.customer_id.is_(None))
            )
        else:  # все — join для возможной фильтрации
            query = query.outerjoin(
                ExecutorOrder, User.id == ExecutorOrder.executor_id
            ).outerjoin(Order, User.id == Order.customer_id)

        if category_work_slug:  # фильтр по категории работ
            cat_subquery = (  # подзапрос user ids мастеров категории
                select(User.id)
                .select_from(User)
                .join(CategoryWorkMaster, User.id == CategoryWorkMaster.master_id)
                .join(
                    CategoryWork, CategoryWorkMaster.category_work_id == CategoryWork.id
                )
                .where(CategoryWork.slug == category_work_slug)
            )
            query = query.where(User.id.in_(cat_subquery))

        if country or region or town:
            query = (
                query.outerjoin(Town, User.town_id == Town.id)
                .outerjoin(Region, Town.region_id == Region.id)
                .outerjoin(Country, Region.country_id == Country.id)
            )
        if country:  # страна
            query = query.where(Country.name_country == country)
        if region:  # регион
            query = query.where(Region.name_region == region)
        if town:  # город
            query = query.where(Town.name_town == town)
        if business_form:  # форма бизнеса
            query = query.where(BusinessForm.name == business_form)
        if blocked is not None:  # блокировка
            query = query.where(User.blocked == blocked)

        if search and search.strip():  # поиск по ФИО/email
            pattern = f"%{search.strip()}%"  # ILIKE pattern
            query = query.where(
                or_(
                    User.first_name.ilike(pattern),
                    User.last_name.ilike(pattern),
                    User.email.ilike(pattern),
                )
            )

        distinct_query = query.distinct()  # без дублей от join
        ids_subq = distinct_query.with_only_columns(User.id).subquery()  # subquery id
        total = (  # count
            await db.execute(select(func.count()).select_from(ids_subq))
        ).scalar() or 0

        offset = max(page - 1, 0) * page_size  # смещение
        result = await db.execute(  # страница
            distinct_query.order_by(User.id.desc()).offset(offset).limit(page_size)
        )
        rows = result.all()  # (User, avatar_url)

        items = []
        for user, avatar_url in rows:
            country_name, region_name, town_name = await _geo_names_for_town_id(
                db, user.town_id
            )
            items.append(
                UserCardForAdminSchema(
                    id=user.id,  # id
                    first_name=user.first_name,  # имя
                    last_name=user.last_name,  # фамилия
                    email=user.email,  # email
                    country=country_name or None,
                    region=region_name or None,
                    town=town_name or None,
                    role=user.role,  # роль
                    avatar_url=avatar_url,  # аватар
                    blocked=user.blocked,  # блокировка
                    is_active=user.is_active,  # активность
                )
            )

        return items, total  # список и total

    except Exception as e:  # ошибка
        print(f"❌ Ошибка: {e}")  # отладка
        raise HTTPException(status_code=500, detail="Ошибка сервера")  # 500


async def get_user_profile_for_admin(
    db: AsyncSession, user_id: int
):  # Полный профиль пользователя для админки
    try:
        result = await db.execute(  # User + Profile + Business + Form
            select(User, UserProfile, UserBusiness, BusinessForm)
            .select_from(User)
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .outerjoin(UserBusiness, User.id == UserBusiness.user_id)
            .outerjoin(BusinessForm, UserBusiness.business_form_id == BusinessForm.id)
            .where(User.id == user_id)
            .distinct()
        )

        user_row = result.first()  # одна строка
        if not user_row:  # не найден
            return None  # null для API

        user, user_profile, user_business, business_form = user_row  # распаковка

        country_name, region_name, town_name = await _geo_names_for_town_id(
            db, user.town_id
        )

        user_profile_data = UserProfileForAdminSchema(  # DTO админки
            id=user.id,  # id
            first_name=user.first_name,  # имя
            last_name=user.last_name,  # фамилия
            country=country_name or None,
            region=region_name or None,
            town=town_name or None,
            blocked=user.blocked,  # блокировка
            email=user.email,  # email
            role=user.role,  # роль
            is_verified=user.is_verified,  # verified
            is_active=user.is_active,  # активен
            created_at=(
                user.created_at.isoformat() if user.created_at else None
            ),  # регистрация
            last_login=(
                user.last_login.isoformat() if user.last_login else None
            ),  # последний вход
            name_business_form=(
                business_form.name if business_form else None
            ),  # форма бизнеса
            registration_number=(  # ОГРН/ИНН
                user_business.registration_number if user_business else None
            ),
            name_business=(
                user_business.name if user_business else None
            ),  # название бизнеса
            location=user_business.location if user_business else None,  # адрес
            avatar_url=user_profile.avatar_url if user_profile else None,  # аватар
            bio=user_profile.bio if user_profile else None,  # био
            short_review_master=(  # краткий отзыв
                user_profile.short_review_master if user_profile else None
            ),
            operating_mode=(
                user_profile.operating_mode if user_profile else None
            ),  # режим работы
        )

        return user_profile_data  # схема профиля

    except Exception as e:  # ошибка
        print(f"❌ Ошибка: {e}")  # отладка
        raise HTTPException(status_code=500, detail="Ошибка сервера")  # 500


async def is_specialization_user(
    db: AsyncSession,
    user_id: int,
    category_work_id: int,
) -> UserCategoryWork:
    """
    Проверяет, есть ли у исполнителя специализация (категория работ).
    Если нет — 403. Если есть — возвращает master_id + category_work_id.
    """
    if not user_id or not category_work_id:
        raise HTTPException(
            status_code=400,
            detail="Не указан пользователь или категория работ",
        )

    result = await db.execute(
        select(CategoryWorkMaster).where(
            CategoryWorkMaster.master_id == user_id,
            CategoryWorkMaster.category_work_id == category_work_id,
        )
    )
    link = result.scalars().first()
    if not link:
        raise HTTPException(
            status_code=403,
            detail=(
                "Нельзя предложить услугу: у вас нет специализации "
                "по категории этого заказа"
            ),
        )

    return UserCategoryWork(
        master_id=user_id,
        category_work_id=category_work_id,
    )
