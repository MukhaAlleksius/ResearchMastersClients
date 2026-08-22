import logging  # Логгер модуля
import os  # Расширение файла аватара
from typing import List, Optional  # Типы для списков и опциональных параметров
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)  # FastAPI: роутер, DI, файлы, ошибки
from fastapi.responses import JSONResponse  # JSON-ответ с кодом статуса
from fastapi.security import HTTPAuthorizationCredentials  # Bearer для refresh
from sqlalchemy import select  # SELECT для профиля пользователя
from sqlalchemy.ext.asyncio import AsyncSession  # Асинхронная сессия БД

from google.auth.transport.requests import (
    Request as GoogleRequest,
)  # HTTP-запрос для проверки Google ID token
from google.oauth2 import (
    id_token as google_id_token,
)  # Верификация OAuth2 ID token Google

from core.auth import (  # Аутентификация и проверка прав
    ensure_same_user,  # Запрет действий от чужого user_id
    get_current_admin_user,  # Только admin/moderator
    get_current_user,  # Обязательный текущий пользователь
    refresh_scheme,  # Bearer для /refresh
)
from core.config import (  # Конфиг и зависимости
    PUBLIC_API_URL,  # Базовый URL API для публичных ссылок
    REQUIRE_EMAIL_VERIFICATION,  # Обязательна ли верификация email
    GOOGLE_CLIENT_ID,  # Client ID Google OAuth
    TOKEN_TYPE_EMAIL_VERIFY,  # Тип JWT для подтверждения email
    TOKEN_TYPE_REFRESH,  # Тип JWT refresh
    get_db,  # Dependency сессии БД
)
from core.email_verification import (
    issue_email_verification,
    verify_user_email,
)  # Выдача и проверка email-токена
from core.tokens import (
    create_access_token,
    create_refresh_token,
    decode_token,
)  # JWT access/refresh
from core.upload_validation import (  # Валидация загрузок изображений
    MAX_AVATAR_BYTES,  # Лимит размера аватара
    MAX_PORTFOLIO_BYTES,  # Лимит размера фото портфолио
    assert_allowed_image_extension,  # Разрешённые расширения
    sanitize_filename,  # Безопасное имя файла
    validate_image_bytes,  # Проверка magic bytes и размера
)
from core.access import (
    assert_user_not_blocked,
)  # Блокировка и просмотр профиля исполнителя
from models.users_models import PortfolioItem, User, UserProfile  # ORM пользователя и портфолио
from cruds.users_crud import (  # CRUD пользователей
    add_business_form,  # справочник ОПФ
    add_profile_user,  # профиль исполнителя
    add_project_portfolio_master,  # проект портфолио
    delete_project_portfolio_master,  # удалить проект портфолио
    add_user,
    is_specialization_user,  # проверка специализации исполнителя
    upsert_user_from_google,  # Google upsert
    add_user_business,  # ОПФ пользователя
    add_user_common,  # общие данные
    add_user_contact,  # контакт
    add_user_geography_execute_order,  # география исполнителя
    delete_contact_user,  # удалить контакт
    delete_town_user_geography_execute_orders,  # удалить город из географии
    get_business_form,  # справочник ОПФ read
    get_information_about_user,  # краткая инфо
    get_profile_user,  # профиль read
    get_profiles_executors_for_cards_user,  # каталог исполнителей
    get_projects_portfolio_master,  # проекты портфолио
    get_user,  # пользователь по email
    get_user_authentication,  # проверка пароля
    get_user_business,  # ОПФ read
    get_user_contacts,  # контакты
    get_user_geography_execute_orders,  # география
    get_user_profile_for_admin,  # профиль для админа
    get_users_for_admin,  # список для админки
)
from cruds.orders.read_orders import get_reviews_for_executor  # Отзывы об исполнителе
from schemas.pagination_schemas import PaginatedResponse  # Обёртка постраничного ответа
from schemas.orders_schemas import (
    ExecutorReviewsSummarySchema,
)  # Сводка отзывов исполнителя
from schemas.users_schemas import (  # Pydantic-схемы пользователей
    BusinessFormSchema,  # ОПФ
    GeographyExecuteOrderSchema,  # география write
    GeographySchema,  # дерево географии
    PortfolioItemReadSchema,  # проект read
    PortfolioItemSchema,  # проект write
    CurrentUserAccessSchema,  # роль и id
    Token,  # JWT пара
    GoogleLoginSchema,  # Google вход (существующий user)
    GoogleRegisterSchema,  # Google регистрация
    UserBusinessReadSchema,  # ОПФ read
    UserBusinessSchema,  # ОПФ write
    UserCardForAdminSchema,
    UserCategoryWork,  # карточка для админа
    UserCommonReadSchema,  # общие данные read
    UserCommonSchema,  # текущий пользователь
    UserContactReadSchema,  # контакт read
    UserContactSchema,  # контакт write
    UserLogin,  # логин
    UserProfileForAdminSchema,  # профиль для админа
    UserProfileForCardSchema,  # карточка исполнителя
    UserProfileReadSchema,  # профиль read
    UserProfileSchema,  # профиль write
    UserSchema,  # регистрация
)
from core.storage import (  # Хранилище файлов аватаров и портфолио
    delete_avatar_files,  # удалить старые аватары
    find_avatar_key,  # ключ файла
    get_avatar_storage,  # backend аватаров
    get_portfolio_storage,  # backend портфолио
)

logger = logging.getLogger(__name__)  # Логгер роутера users

router = APIRouter(prefix="", tags=["users"])  # Роутер пользователей без префикса

_PORTFOLIO_IMAGE_SUFFIXES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
}  # Допустимые расширения фото портфолио
_PORTFOLIO_IMAGES_DIR = "файлы_изображений"  # Имя подпапки с изображениями проекта


def _portfolio_image_url(
    master_id: int, folder: str, filename: str
) -> str:  # Публичный URL файла портфолио
    return f"/portfolio/{master_id}/{folder}/{_PORTFOLIO_IMAGES_DIR}/{filename}"


async def _get_owned_portfolio_item(
    db: AsyncSession,
    *,
    master_id: int,
    portfolio_item_id: int,
) -> PortfolioItem:  # Проект портфолио, принадлежащий текущему пользователю
    result = await db.execute(
        select(PortfolioItem).where(
            PortfolioItem.id == portfolio_item_id,
            PortfolioItem.user_id == master_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Проект портфолио не найден")
    return item


async def _portfolio_projects(
    db: AsyncSession,
    master_id: int,
) -> list[dict]:  # Собрать изображения портфолио по id проекта (+ legacy по title)
    result = await db.execute(
        select(PortfolioItem)
        .where(PortfolioItem.user_id == master_id)
        .order_by(PortfolioItem.id.asc())
    )
    items = list(result.scalars().all())
    # Legacy folders named by title: bind only to the oldest project with that title
    legacy_title_to_id: dict[str, int] = {}
    for item in items:
        if item.title not in legacy_title_to_id:
            legacy_title_to_id[item.title] = item.id

    storage = get_portfolio_storage()
    keys = storage.list_keys(f"{master_id}/")
    by_id: dict[int, list[str]] = {item.id: [] for item in items}

    for key in keys:
        parts = key.replace("\\", "/").split("/")
        if len(parts) < 4:
            continue
        if parts[0] != str(master_id) or parts[2] != _PORTFOLIO_IMAGES_DIR:
            continue
        filename = parts[-1]
        if not any(
            filename.lower().endswith(ext) for ext in _PORTFOLIO_IMAGE_SUFFIXES
        ):
            continue

        folder = parts[1]
        portfolio_item_id: int | None = None
        if folder.isdigit():
            candidate_id = int(folder)
            if candidate_id in by_id:
                portfolio_item_id = candidate_id
        else:
            portfolio_item_id = legacy_title_to_id.get(folder)

        if portfolio_item_id is None:
            continue

        by_id[portfolio_item_id].append(
            _portfolio_image_url(master_id, folder, filename)
        )

    return [
        {
            "portfolio_item_id": item.id,
            "title": item.title,
            "images": by_id.get(item.id, []),
        }
        for item in items
    ]


@router.post("/register")  # Регистрация по email/паролю
async def register_user(
    user: UserSchema, db: AsyncSession = Depends(get_db)
):  # dependency: сессия БД
    try:  # обработка ошибок регистрации
        db_user = await add_user(db=db, user=user)  # Создание пользователя в БД
        await issue_email_verification(
            db, db_user
        )  # Отправка/логирование ссылки подтверждения
        if REQUIRE_EMAIL_VERIFICATION:  # Нужно подтвердить email
            return {  # ответ без JWT
                "message": "Аккаунт создан. Подтвердите email — ссылка отправлена (см. логи сервера в dev)."
            }
        return {
            "message": "Пользователь успешно зарегистрирован"
        }  # Без обязательной верификации
    except HTTPException:  # Ожидаемая HTTP-ошибка (дубликат email и т.д.)
        raise
    except Exception as e:  # Неожиданная ошибка
        logger.error("Register failed: %s", e, exc_info=True)  # Лог с traceback
        raise HTTPException(
            status_code=500, detail="Не удалось зарегистрировать пользователя"
        )


@router.post(
    "/auth/google/register", response_model=Token
)  # Регистрация/вход через Google ID token
async def google_register_user(
    payload: GoogleRegisterSchema,
    db: AsyncSession = Depends(get_db),  # dependency: сессия БД
):
    if not GOOGLE_CLIENT_ID:  # Google OAuth не настроен на сервере
        raise HTTPException(  # 500 конфигурации
            status_code=500,  # серверная ошибка
            detail="Вход через Google не настроен (GOOGLE_CLIENT_ID отсутствует)",  # текст
        )

    try:  # проверка Google token
        token_payload = google_id_token.verify_oauth2_token(  # Проверка подписи и audience Google token
            payload.id_token,  # ID token от клиента
            GoogleRequest(),  # HTTP transport
            audience=GOOGLE_CLIENT_ID,  # audience
        )
    except Exception as e:  # Невалидный или просроченный token
        logger.warning("Google token verification failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=401, detail="Недействительный токен Google"
        ) from e

    email = token_payload.get("email")  # Email из claims Google
    if not email:  # Без email нельзя создать аккаунт
        raise HTTPException(status_code=400, detail="В токене Google нет email")

    first_name = (token_payload.get("given_name") or "").strip() or email.split("@")[
        0
    ]  # Имя или часть email
    last_name = (
        token_payload.get("family_name") or ""
    ).strip() or "User"  # Фамилия или заглушка
    email_verified = bool(
        token_payload.get("email_verified")
    )  # Google подтвердил email?

    db_user = await upsert_user_from_google(  # Создать или обновить пользователя
        db,  # сессия
        email=email,  # email
        first_name=first_name,  # имя
        last_name=last_name,  # фамилия
        town_id=payload.town_id,
        email_verified=email_verified,  # флаг Google verified
    )

    assert_user_not_blocked(db_user)  # Заблокированным вход запрещён

    # Enforce verification rule for password-login too.
    if (
        REQUIRE_EMAIL_VERIFICATION and not db_user.is_verified
    ):  # Email ещё не подтверждён локально
        raise HTTPException(  # 403
            status_code=403, detail="Подтвердите email перед входом"  # текст
        )

    access_token = create_access_token(subject=email)  # Короткоживущий JWT
    refresh_token = create_refresh_token(subject=email)  # Refresh JWT
    return Token(  # пара токенов
        access_token=access_token,  # access
        refresh_token=refresh_token,  # refresh
        user_id=db_user.id,  # id пользователя
        role=db_user.role if db_user.role else "user",  # Роль по умолчанию user
    )


@router.get("/verify-email")  # Подтверждение email по ссылке из письма
async def verify_email_api(token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(
        token, expected_type=TOKEN_TYPE_EMAIL_VERIFY
    )  # Разбор verify JWT
    try:
        await verify_user_email(db, email=payload["sub"])  # Пометить is_verified в БД
    except ValueError as exc:  # Пользователь не найден
        raise HTTPException(status_code=404, detail="Пользователь не найден") from exc
    return {"message": "Email подтверждён. Теперь можно войти."}


@router.post("/token", response_model=Token)  # Логин email + password → JWT
async def login(
    user: UserLogin, db: AsyncSession = Depends(get_db)
):  # dependency: сессия БД
    try:  # обработка ошибок логина
        user_orm = await get_user_authentication(
            db, user.email, user.password
        )  # Проверка пароля
        if not user_orm:  # Неверные учётные данные
            raise HTTPException(
                status_code=401, detail="Неверный логин или пароль"
            )  # 401

        if (
            REQUIRE_EMAIL_VERIFICATION and not user_orm.is_verified
        ):  # Без подтверждения email вход запрещён
            raise HTTPException(  # 403
                status_code=403,  # forbidden
                detail="Подтвердите email перед входом",  # текст
            )

        access_token = create_access_token(subject=user.email)  # Access JWT
        refresh_token = create_refresh_token(subject=user.email)  # Refresh JWT

        return Token(  # пара токенов
            access_token=access_token,  # access
            refresh_token=refresh_token,  # refresh
            user_id=user_orm.id,  # id
            role=user_orm.role if user_orm.role else "user",  # роль
        )
    except HTTPException as http_exc:  # Логируем и пробрасываем HTTP-ошибки
        logger.warning(f"Ошибка аутентификации: {http_exc.detail}")
        raise http_exc
    except Exception as e:  # Прочие ошибки
        logger.error(f"Внутренняя ошибка сервера: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post(
    "/auth/google/login", response_model=Token
)  # Вход существующего пользователя через Google
async def user_enter_google(
    payload: GoogleLoginSchema,
    db: AsyncSession = Depends(get_db),  # только id_token, без гео
):
    """
    Проверяет Google id_token, ищет пользователя по email.
    404 → фронт открывает форму географии (регистрация).
    Успех → те же JWT, что и /token (пароль не нужен).
    """
    if not GOOGLE_CLIENT_ID:  # OAuth не настроен
        raise HTTPException(
            status_code=500,
            detail="Вход через Google не настроен (GOOGLE_CLIENT_ID отсутствует)",
        )

    try:  # проверка подписи и audience
        token_payload = google_id_token.verify_oauth2_token(
            payload.id_token,  # JWT-строка с клиента
            GoogleRequest(),
            audience=GOOGLE_CLIENT_ID,
        )
    except Exception as e:
        logger.warning("Google token verification failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=401, detail="Недействительный токен Google"
        ) from e

    email = token_payload.get("email")  # email из claims
    if not email:
        raise HTTPException(status_code=400, detail="В токене Google нет email")

    user = await get_user(db=db, email=email)  # уже регистрировался?
    if not user:  # новый — нужна geo-форма + /auth/google/register
        raise HTTPException(
            status_code=404,
            detail="Пользователь не найден. Завершите регистрацию через Google.",
        )

    assert_user_not_blocked(user)  # блокировка

    if REQUIRE_EMAIL_VERIFICATION and not user.is_verified:  # как у /token
        raise HTTPException(status_code=403, detail="Подтвердите email перед входом")

    # Google уже подтвердил личность — пароль не проверяем
    access_token = create_access_token(subject=user.email)
    refresh_token = create_refresh_token(subject=user.email)
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        role=user.role if user.role else "user",
    )


@router.post(
    "/refresh", response_model=Token
)  # Обновление пары access/refresh по refresh JWT
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(
        refresh_scheme
    ),  # Bearer refresh
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
) -> Token:
    try:  # обработка refresh
        payload = decode_token(
            credentials.credentials, expected_type=TOKEN_TYPE_REFRESH
        )  # Проверка refresh token
        email = payload["sub"]  # Email из subject

        user = await get_user(db=db, email=email)  # Пользователь должен существовать
        if not user:  # не найден
            raise HTTPException(status_code=403, detail="Invalid refresh token")  # 403
        assert_user_not_blocked(user)  # Заблокированным refresh запрещён

        if (
            REQUIRE_EMAIL_VERIFICATION and not user.is_verified
        ):  # Неподтверждённый email
            raise HTTPException(status_code=403, detail="Email не подтверждён")  # 403

        new_access_token = create_access_token(subject=email)  # Новый access
        new_refresh_token = create_refresh_token(subject=email)  # Ротация refresh

        return Token(  # новая пара
            access_token=new_access_token,  # access
            refresh_token=new_refresh_token,  # refresh
            user_id=user.id,  # id
            role=user.role or "user",  # роль
        )
    except HTTPException:  # Уже сформированная HTTP-ошибка
        raise
    except Exception:  # Любая ошибка декодирования/БД → invalid refresh
        raise HTTPException(status_code=403, detail="Invalid refresh token")  # 403


@router.get(
    "/users/me", response_model=CurrentUserAccessSchema
)  # Роль и id текущего пользователя
async def get_current_user_access_api(
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
):
    user = await db.get(User, current_user.user_id)  # Полная ORM-запись для role
    return CurrentUserAccessSchema(  # ответ API
        user_id=current_user.user_id,  # id
        role=user.role if user else "user",  # Fallback если запись не найдена
    )


@router.post(
    "/add_user_common", response_model=UserCommonReadSchema
)  # Общие данные пользователя (ФИО, география)
async def add_user_common_api(
    user: UserCommonSchema,
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT
):
    ensure_same_user(current_user, user.user_id)  # Только свой профиль
    try:  # CRUD
        user_common = await add_user_common(db=db, user=user)  # Upsert в БД
        return user_common  # результат
    except HTTPException as e:  # ошибка CRUD
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


@router.post("/add_profile")  # Профиль исполнителя (описание, категории и т.д.)
async def add_profile_user_api(
    user_profile: UserProfileSchema,
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT
):
    ensure_same_user(current_user, user_profile.user_id)  # Только свой user_id
    try:  # CRUD
        await add_profile_user(db=db, user_profile=user_profile)  # Сохранение профиля
    except HTTPException as e:  # ошибка CRUD
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


@router.get(
    "/profiles_executors_for_cards",
    response_model=PaginatedResponse[UserProfileForCardSchema],
)  # Каталог карточек исполнителей с фильтрами
async def get_profiles_executors_for_cards_api(
    category_work_slug: Optional[str] = Query(None, description="Слаг категории работ"),
    country: Optional[str] = Query(None, description="Название страны"),
    region: Optional[str] = Query(None, description="Название региона"),
    town: Optional[str] = Query(None, description="Название города"),
    # min_rating: Optional[float] = Query(None, ge=0, le=5, description="Минимальный рейтинг"),  # ✅ Закомментировано
    max_cost: Optional[float] = Query(None, ge=0, description="Максимальная цена/час"),
    page: int = Query(1, ge=1, description="Номер страницы"),  # page
    page_size: int = Query(
        12, ge=1, le=100, description="Размер страницы"
    ),  # page_size
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
):
    print(  # отладочный вывод параметров
        f"🚀 ENDPOINT: Параметры: category={category_work_slug}, country={country}, region={region}, town={town}, cost={max_cost}, page={page}, page_size={page_size}"
    )  # ✅ Убрали min_rating

    try:  # выборка каталога
        profiles_executors, total = (
            await get_profiles_executors_for_cards_user(  # Выборка и total count
                db=db,  # сессия
                category_work_slug=category_work_slug,  # категория
                country=country,  # страна
                region=region,  # регион
                town=town,  # город
                # min_rating=min_rating,  # ✅ Закомментировано
                max_cost=max_cost,  # бюджет
                page=page,  # страница
                page_size=page_size,  # размер
            )
        )
        print(
            f"🚀 ENDPOINT: УСПЕХ! {len(profiles_executors)} профилей из {total}"
        )  # Отладочный лог
        return PaginatedResponse.create(  # постраничный ответ
            profiles_executors, total, page, page_size  # данные и meta
        )  # Постраничный ответ
    except HTTPException:  # Пробрасываем HTTP-ошибки CRUD
        raise
    except Exception as e:  # Неожиданная ошибка
        print(f"💥 ENDPOINT: Exception: {type(e).__name__}: {str(e)}")  # Отладочный лог
        raise HTTPException(status_code=500, detail=f"Критическая ошибка сервера")


@router.get(
    "/profile", response_model=UserProfileReadSchema
)  # Профиль исполнителя по user_id
async def get_profile_api(
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
):
    try:  # чтение профиля
        user_profile = await get_profile_user(db=db, user_id=user_id)  # Чтение профиля
        return user_profile  # результат
    except HTTPException:  # Ошибки доступа/404 из CRUD
        raise  # пробрасываем
    except Exception as e:  # прочие ошибки
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


# информация о пользователе для предоставления в карточке заказа клиента или исполнителя
@router.get(
    "/information_about_user/{user_id}", response_model=UserCommonSchema
)  # Краткая информация для карточки заказа
async def get_information_about_user_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
):
    try:
        information_about_user = await get_information_about_user(  # ФИО и география
            db=db, user_id=user_id
        )
        return information_about_user
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_user_business")  # Организационно-правовая форма пользователя
async def add_user_business_api(
    user_business: UserBusinessSchema,
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    ensure_same_user(current_user, user_business.user_id)  # Только свой аккаунт
    try:
        await add_user_business(db=db, user_business=user_business)  # Сохранение ОПФ
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post(
    "/add_business_form", response_model=BusinessFormSchema
)  # Справочник ОПФ (только admin)
async def add_business_form_api(
    business_form_schema: BusinessFormSchema,
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff  # staff
):
    try:  # CRUD справочника
        business_form = await add_business_form(  # Создание записи справочника
            db=db, business_form_schema=business_form_schema  # аргументы
        )
        return BusinessFormSchema(  # Ответ с id новой записи
            id=business_form.id,  # pk
            name=business_form.name,  # название
            description=business_form.description,  # описание
        )
    except HTTPException:  # Конфликт/валидация
        raise  # пробрасываем
    except Exception as e:  # прочие ошибки
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")  # 400


@router.get(
    "/business_form", response_model=list[BusinessFormSchema]
)  # Список всех ОПФ
async def get_business_form_api(
    db: AsyncSession = Depends(get_db),  # сессия БД
):
    try:
        business_form = await get_business_form(db=db)  # Чтение справочника
        return business_form
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get(
    "/user_business", response_model=UserBusinessReadSchema
)  # ОПФ текущего пользователя
async def get_user_business_api(
    db: AsyncSession = Depends(get_db),  # сессия БД  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT  # JWT
):
    return await get_user_business(
        db=db, user_id=current_user.user_id
    )  # CRUD по user_id из JWT


@router.post("/add_user_contact")  # Добавление контакта (телефон, мессенджер и т.д.)
async def add_user_contact_api(
    user_contact: UserContactSchema,
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    ensure_same_user(current_user, user_contact.user_id)  # Только свои контакты
    try:  # upsert контакта
        await add_user_contact(db=db, user_contact=user_contact)  # Upsert контакта
    except HTTPException as e:  # ошибка CRUD
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


@router.get(
    "/contacts", response_model=list[UserContactReadSchema]
)  # Контакты текущего пользователя
async def get_user_contacts_api(
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    try:  # список контактов
        user_contacts = await get_user_contacts(
            db=db, user_id=current_user.user_id
        )  # Список контактов
        return user_contacts  # результат
    except HTTPException as e:  # ошибка CRUD
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


@router.get(
    "/users/{user_id}/contacts",
    response_model=list[UserContactReadSchema],
)  # Публичные контакты исполнителя (с проверкой доступа)
async def get_user_contacts_public_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
):
    try:  # публичные контакты
        return await get_user_contacts(db=db, user_id=user_id)  # Контакты по user_id
    except HTTPException:  # Ошибки CRUD
        raise  # пробрасываем
    except Exception as e:  # прочие ошибки
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


@router.get(
    "/users/{user_id}/reviews",
    response_model=ExecutorReviewsSummarySchema,
)  # Отзывы об исполнителе
async def get_user_reviews_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
):
    try:  # отзывы исполнителя
        return await get_reviews_for_executor(
            db=db, reviewee_id=user_id
        )  # Сводка и список отзывов
    except HTTPException:  # Пробрасываем HTTP-ошибки
        raise  # пробрасываем
    except Exception as e:  # Неожиданная ошибка
        logger.error(  # лог
            f"API error for get_user_reviews user_id={user_id}: {e}",  # сообщение
            exc_info=True,  # traceback
        )
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")  # 500


@router.delete("/delete_contact/{contact_id}")  # Удаление контакта по id
async def delete_contact_user_api(
    contact_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    try:  # удаление контакта
        await delete_contact_user(
            db=db, contact_id=contact_id
        )  # Удаление с проверкой владельца в CRUD
        return JSONResponse(  # успешный ответ
            content={"detail": "Удаление успешно"},
            status_code=status.HTTP_200_OK,  # 200
        )
    except HTTPException as e:  # ошибка CRUD
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


@router.post(
    "/add_user_geography_execute_order"
)  # География выполнения заказов исполнителя
async def add_user_geography_execute_order_api(
    user_geography_execute_orders: GeographyExecuteOrderSchema,
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    ensure_same_user(
        current_user, user_geography_execute_orders.user_id
    )  # Только своя география
    try:  # сохранение географии
        await add_user_geography_execute_order(  # Сохранение стран/регионов/городов
            db=db,
            user_geography_execute_order=user_geography_execute_orders,  # аргументы
        )
    except HTTPException as e:  # ошибка CRUD
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")  # 403


@router.get(
    "/geography_execute_orders", response_model=GeographySchema
)  # География текущего пользователя
async def get_user_geography_execute_orders_api(
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    return await get_user_geography_execute_orders(  # Дерево страна→регион→город
        db=db, user_id=current_user.user_id  # id пользователя
    )


@router.get(
    "/users/{user_id}/geography_execute_orders",
    response_model=GeographySchema,
)  # Публичная география исполнителя
async def get_user_geography_execute_orders_public_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
):
    return await get_user_geography_execute_orders(
        db=db, user_id=user_id
    )  # География по user_id


@router.delete(
    "/delete_town_geography_execute_orders"
)  # Удалить город из географии исполнителя
async def delete_town_user_geography_execute_orders_api(
    town_id: int = Query(...),
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    try:
        print(
            f"Deleting town_id={town_id} for user_id={current_user.user_id}"
        )  # Отладочный лог
        await delete_town_user_geography_execute_orders(  # Удаление связи user↔town
            db=db, user_id=current_user.user_id, town_id=town_id
        )
        return JSONResponse(
            content={"detail": "Удаление успешно"}, status_code=status.HTTP_200_OK
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/upload_avatar")  # Загрузка аватара текущего пользователя
async def upload_avatar_api(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    user_id = current_user.user_id  # id для пути и профиля

    if not file.filename:  # Пустой upload
        raise HTTPException(status_code=400, detail="Файл не выбран")

    safe_filename = sanitize_filename(file.filename)  # Безопасное имя
    assert_allowed_image_extension(safe_filename)  # jpg/png/...

    content = await file.read()  # Байты файла
    validate_image_bytes(
        content, max_bytes=MAX_AVATAR_BYTES, label="Аватар"
    )  # Magic bytes и лимит

    delete_avatar_files(user_id)  # Удалить старые файлы аватара

    # Stable ASCII key keeps Docker/local storage predictable across locales.
    ext = (
        os.path.splitext(safe_filename)[1].lower() or ".jpg"
    )  # Расширение для ключа storage
    filename = f"{user_id}_avatar{ext}"  # Детерминированное имя файла
    relative_url = f"/avatar/{user_id}"  # URL в API и БД
    try:
        storage = get_avatar_storage()  # Backend аватаров
        storage.save(filename, content)  # Запись файла

        result = await db.execute(  # Ищем профиль пользователя
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()  # Одна запись или None
        if profile:
            profile.avatar_url = relative_url  # Обновляем URL
        else:
            db.add(  # Создаём профиль только с avatar_url
                UserProfile(
                    user_id=user_id,
                    avatar_url=relative_url,
                )
            )
        await db.commit()  # Фиксируем изменения

        return {
            "avatar_url": relative_url,  # Относительный путь
            "public_avatar_url": f"{PUBLIC_API_URL}{relative_url}",  # Полный URL для фронта
        }
    except HTTPException:  # Ошибки валидации
        raise
    except Exception as e:  # Ошибка storage/БД
        logging.exception("upload_avatar failed for user_id=%s", user_id)
        raise HTTPException(
            status_code=500, detail=f"Не удалось сохранить аватар: {e}"
        ) from e


@router.get("/avatar/{user_id}")  # Отдача байтов аватара по user_id
async def get_avatar_api(user_id: int):
    from fastapi.responses import Response  # Локальный импорт бинарного ответа

    key = find_avatar_key(user_id)  # Ключ файла в storage
    if not key:  # Аватар не загружался
        raise HTTPException(status_code=404, detail="Фото не найдено")

    storage = get_avatar_storage()  # Backend аватаров
    content = storage.read(key)  # Чтение байтов
    if content is None:  # Файл пропал из storage
        raise HTTPException(status_code=404, detail="Фото не найдено")

    return Response(
        content=content, media_type=storage.guess_media_type(key)
    )  # image/jpeg и т.д.


@router.post(
    "/add_project_portfolio_master"
)  # Метаданные проекта портфолио (название и т.д.)
async def add_project_portfolio_master_api(
    project_portfolio_master: PortfolioItemSchema,
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    ensure_same_user(
        current_user, project_portfolio_master.user_id
    )  # Только своё портфолио
    try:
        await add_project_portfolio_master(  # Запись проекта в БД
            db=db, portfolio_item=project_portfolio_master
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# предоставление информации на фронтенде карточек с проектами портфолио мастера
@router.get(
    "/projects_portfolio_master/{user_id}", response_model=list[PortfolioItemReadSchema]
)  # Список проектов портфолио из БД
async def get_projects_portfolio_master_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
):
    try:
        projects_portfolio_master = await get_projects_portfolio_master(
            db=db, user_id=user_id
        )  # Проекты из БД
        return projects_portfolio_master
    except HTTPException as e:
        logging.error(f"HTTPException получена: {e.detail}")  # Лог HTTP-ошибки
        raise
    except Exception as e:
        logging.error(f"Неизвестная ошибка: {str(e)}")  # Лог неожиданной ошибки
        # Вернуть подробное сообщение об ошибке с кодом 500
        raise HTTPException(
            status_code=500, detail=f"Внутренняя ошибка сервера: {str(e)}"
        )


@router.post(
    "/upload_images_portfolio_master"
)  # Пакетная загрузка фото в проект портфолио
async def upload_images_portfolio_master_api(
    portfolio_item_id: int = Query(..., gt=0),
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    master_id = current_user.user_id  # Владелец портфолио
    await _get_owned_portfolio_item(
        db, master_id=master_id, portfolio_item_id=portfolio_item_id
    )
    storage = get_portfolio_storage()  # Backend портфолио
    project_folder = str(portfolio_item_id)

    saved_files = []  # Успешно сохранённые
    failed_files = []  # Ошибки по файлам

    for file in files:  # Каждый файл отдельно
        # Проверки безопасности файла
        if not file.filename:  # Нет имени
            failed_files.append({"name": "unknown", "error": "No filename"})
            continue

        try:
            safe_filename = sanitize_filename(file.filename)  # Безопасное имя
            assert_allowed_image_extension(safe_filename)  # Допустимое расширение
            storage_key = (
                f"{master_id}/{project_folder}/{_PORTFOLIO_IMAGES_DIR}/{safe_filename}"
            )
            content = await file.read()  # Байты изображения
            validate_image_bytes(
                content, max_bytes=MAX_PORTFOLIO_BYTES, label="Изображение"
            )  # Проверка содержимого

            storage.save(storage_key, content)  # Сохранение файла

            saved_files.append(  # Метаданные успешного upload
                {
                    "original_name": file.filename,
                    "saved_name": safe_filename,
                    "size": len(content),
                    "path": storage_key,
                    "url": _portfolio_image_url(
                        master_id, project_folder, safe_filename
                    ),
                }
            )

        except HTTPException as exc:  # Ошибка валидации FastAPI
            failed_files.append({"name": file.filename, "error": exc.detail})
        except Exception as e:  # Прочие ошибки storage
            failed_files.append({"name": file.filename, "error": str(e)})

    return JSONResponse(  # Итог по всем файлам
        content={
            "success": len(saved_files) > 0,  # Хотя бы один успешный
            "saved_files": saved_files,
            "failed_files": failed_files,
            "total_uploaded": len(files),
            "portfolio_item_id": portfolio_item_id,
        }
    )


@router.get(
    "/project_images_portfolio_master/{master_id}"
)  # Изображения проектов из storage, сгруппированные по id проекта
async def get_projects_images_portfolio_master_api(
    master_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
):
    return {
        "projects": await _portfolio_projects(db, master_id)
    }  # Группировка URL по portfolio_item_id


@router.delete(
    "/delete_image_portfolio_master"
)  # Удаление одного файла из проекта портфолио
async def delete_image_portfolio_master_api(
    portfolio_item_id: int = Query(..., gt=0),
    filename: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    master_id = current_user.user_id  # Только свои файлы
    await _get_owned_portfolio_item(
        db, master_id=master_id, portfolio_item_id=portfolio_item_id
    )
    storage = get_portfolio_storage()  # Backend портфолио

    if (
        ".." in filename or "/" in filename or "\\" in filename
    ):  # Защита от path traversal
        raise HTTPException(status_code=400, detail="Недопустимый путь к файлу")

    project_folder = str(portfolio_item_id)
    storage_key = (
        f"{master_id}/{project_folder}/{_PORTFOLIO_IMAGES_DIR}/{filename}"
    )

    # Legacy fallback: older uploads used project title as folder name
    if not storage.exists(storage_key):
        item = await _get_owned_portfolio_item(
            db, master_id=master_id, portfolio_item_id=portfolio_item_id
        )
        legacy_key = (
            f"{master_id}/{item.title}/{_PORTFOLIO_IMAGES_DIR}/{filename}"
        )
        if storage.exists(legacy_key):
            storage_key = legacy_key
        else:
            raise HTTPException(status_code=404, detail="Файл не найден")

    try:
        storage.delete(storage_key)  # Удаление из storage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка удаления файла: {str(e)}")

    return {"success": True, "deleted_file": storage_key}  # Подтверждение удаления


def _delete_portfolio_item_files(
    *,
    storage,
    master_id: int,
    portfolio_item_id: int,
    title: str | None,
    delete_legacy: bool,
) -> list[str]:  # Удалить файлы проекта из storage
    prefixes = [f"{master_id}/{portfolio_item_id}/"]
    if delete_legacy and title and not str(title).isdigit():
        prefixes.append(f"{master_id}/{title}/")

    deleted: list[str] = []
    for prefix in prefixes:
        for key in storage.list_keys(prefix):
            try:
                storage.delete(key)
                deleted.append(key)
            except Exception as exc:
                logger.warning(
                    "Failed to delete portfolio file %s: %s", key, exc
                )
    return deleted


@router.delete(
    "/delete_project_portfolio_master"
)  # Удаление проекта портфолио вместе с фотографиями
async def delete_project_portfolio_master_api(
    portfolio_item_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_user),  # JWT
):
    master_id = current_user.user_id  # Только свой проект
    item = await _get_owned_portfolio_item(
        db, master_id=master_id, portfolio_item_id=portfolio_item_id
    )
    title = item.title

    oldest_same_title = await db.execute(
        select(PortfolioItem.id)
        .where(
            PortfolioItem.user_id == master_id,
            PortfolioItem.title == title,
        )
        .order_by(PortfolioItem.id.asc())
        .limit(1)
    )
    oldest_id = oldest_same_title.scalar_one_or_none()
    delete_legacy = oldest_id == item.id

    storage = get_portfolio_storage()
    deleted_files = _delete_portfolio_item_files(
        storage=storage,
        master_id=master_id,
        portfolio_item_id=portfolio_item_id,
        title=title,
        delete_legacy=delete_legacy,
    )

    deleted = await delete_project_portfolio_master(
        db, user_id=master_id, portfolio_item_id=portfolio_item_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Проект портфолио не найден")

    return {
        "success": True,
        "portfolio_item_id": portfolio_item_id,
        "deleted_files": deleted_files,
    }


@router.get(
    "/users_for_admin", response_model=PaginatedResponse[UserCardForAdminSchema]
)  # Список пользователей для админки
async def get_users_for_admin_api(
    category_work_slug: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    town: Optional[str] = Query(None),
    business_form: Optional[str] = Query(None),
    role_user: Optional[str] = Query(None),
    blocked: Optional[bool] = Query(None),
    search: Optional[str] = Query(None, description="Поиск по имени или email"),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(
        get_current_admin_user
    ),  # staff  # Только staff
):
    try:
        users_for_admin, total = await get_users_for_admin(  # Фильтрация и пагинация
            db=db,
            category_work_slug=category_work_slug,
            country=country,
            region=region,
            town=town,
            business_form=business_form,
            blocked=blocked,
            role_user=role_user,
            search=search,
            page=page,
            page_size=page_size,
        )
        return PaginatedResponse.create(users_for_admin, total, page, page_size)

    except HTTPException:  # Пробрасываем HTTP-ошибки
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {e}")


@router.get(
    "/user_profile_for_admin/{user_id}", response_model=UserProfileForAdminSchema
)  # Полный профиль пользователя для админки
async def get_user_profile_for_admin_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # сессия БД
    current_user: UserCommonSchema = Depends(get_current_admin_user),  # staff
):
    try:
        user_profile = await get_user_profile_for_admin(
            db=db, user_id=user_id
        )  # Детальный профиль
        if not user_profile:  # Нет такого пользователя
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        return user_profile
    except HTTPException:  # 404 и прочие HTTP
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {e}")


@router.get(
    "/user_have_category_work/{user_id}/{category_work_id}",
    response_model=UserCategoryWork,
)
async def get_user_category_work_api(
    user_id: int,
    category_work_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    """Проверка: есть ли у текущего пользователя специализация по категории."""
    ensure_same_user(current_user, user_id)
    return await is_specialization_user(
        db=db,
        user_id=user_id,
        category_work_id=category_work_id,
    )
