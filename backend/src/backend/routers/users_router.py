import logging
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token

from core.auth import (
    ensure_same_user,
    get_current_admin_user,
    get_current_user,
    get_optional_current_user,
    refresh_scheme,
)
from core.config import (
    PUBLIC_API_URL,
    REQUIRE_EMAIL_VERIFICATION,
    GOOGLE_CLIENT_ID,
    TOKEN_TYPE_EMAIL_VERIFY,
    TOKEN_TYPE_REFRESH,
    get_db,
)
from core.email_verification import issue_email_verification, verify_user_email
from core.tokens import create_access_token, create_refresh_token, decode_token
from core.upload_validation import (
    MAX_AVATAR_BYTES,
    MAX_PORTFOLIO_BYTES,
    assert_allowed_image_extension,
    sanitize_filename,
    validate_image_bytes,
)
from core.access import assert_user_not_blocked, assert_can_view_executor_profile
from models.users_models import User
from cruds.users_crud import (
    add_business_form,
    add_profile_user,
    add_project_portfolio_master,
    add_user,
    upsert_user_from_google,
    add_user_business,
    add_user_common,
    add_user_contact,
    add_user_geography_execute_order,
    delete_contact_user,
    delete_town_user_geography_execute_orders,
    get_business_form,
    get_information_about_user,
    get_profile_user,
    get_profiles_executors_for_cards_user,
    get_projects_portfolio_master,
    get_user,
    get_user_authentication,
    get_user_business,
    get_user_contacts,
    get_user_geography_execute_orders,
    get_user_profile_for_admin,
    get_users_for_admin,
)
from schemas.pagination_schemas import PaginatedResponse
from schemas.users_schemas import (
    BusinessFormSchema,
    GeographyExecuteOrderSchema,
    GeographySchema,
    PortfolioItemReadSchema,
    PortfolioItemSchema,
    CurrentUserAccessSchema,
    Token,
    GoogleRegisterSchema,
    UserBusinessReadSchema,
    UserBusinessSchema,
    UserCardForAdminSchema,
    UserCommonReadSchema,
    UserCommonSchema,
    UserContactReadSchema,
    UserContactSchema,
    UserLogin,
    UserProfileForAdminSchema,
    UserProfileForCardSchema,
    UserProfileReadSchema,
    UserProfileSchema,
    UserSchema,
)
from core.storage import (
    delete_avatar_files,
    find_avatar_key,
    get_avatar_storage,
    get_portfolio_storage,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["users"])

_PORTFOLIO_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
_PORTFOLIO_IMAGES_DIR = "файлы_изображений"


def _portfolio_projects(master_id: int) -> list[dict]:
    storage = get_portfolio_storage()
    prefix = f"{master_id}/"
    keys = storage.list_keys(prefix)
    by_project: dict[str, list[str]] = {}

    for key in keys:
        parts = key.replace("\\", "/").split("/")
        if len(parts) < 4:
            continue
        if parts[0] != str(master_id) or parts[2] != _PORTFOLIO_IMAGES_DIR:
            continue
        filename = parts[-1]
        if not any(filename.lower().endswith(ext) for ext in _PORTFOLIO_IMAGE_SUFFIXES):
            continue
        project_name = parts[1]
        url = f"/portfolio/{master_id}/{project_name}/{_PORTFOLIO_IMAGES_DIR}/{filename}"
        by_project.setdefault(project_name, []).append(url)

    return [{"title": title, "images": images} for title, images in by_project.items()]


@router.post("/register")
async def register_user(user: UserSchema, db: AsyncSession = Depends(get_db)):
    try:
        db_user = await add_user(db=db, user=user)
        await issue_email_verification(db, db_user)
        if REQUIRE_EMAIL_VERIFICATION:
            return {
                "message": "Аккаунт создан. Подтвердите email — ссылка отправлена (см. логи сервера в dev)."
            }
        return {"message": "Пользователь успешно зарегистрирован"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Register failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Не удалось зарегистрировать пользователя")


@router.post("/auth/google/register", response_model=Token)
async def google_register_user(
    payload: GoogleRegisterSchema, db: AsyncSession = Depends(get_db)
):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Google auth is not configured (GOOGLE_CLIENT_ID missing)",
        )

    try:
        token_payload = google_id_token.verify_oauth2_token(
            payload.id_token,
            GoogleRequest(),
            audience=GOOGLE_CLIENT_ID,
        )
    except Exception as e:
        logger.warning("Google token verification failed: %s", e, exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid Google token") from e

    email = token_payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google token has no email")

    first_name = (token_payload.get("given_name") or "").strip() or email.split("@")[0]
    last_name = (token_payload.get("family_name") or "").strip() or "User"
    email_verified = bool(token_payload.get("email_verified"))

    db_user = await upsert_user_from_google(
        db,
        email=email,
        first_name=first_name,
        last_name=last_name,
        country=payload.country,
        region=payload.region,
        town=payload.town,
        email_verified=email_verified,
    )

    assert_user_not_blocked(db_user)

    # Enforce verification rule for password-login too.
    if REQUIRE_EMAIL_VERIFICATION and not db_user.is_verified:
        raise HTTPException(
            status_code=403, detail="Подтвердите email перед входом"
        )

    access_token = create_access_token(subject=email)
    refresh_token = create_refresh_token(subject=email)
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=db_user.id,
        role=db_user.role if db_user.role else "user",
    )


@router.get("/verify-email")
async def verify_email_api(token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(token, expected_type=TOKEN_TYPE_EMAIL_VERIFY)
    try:
        await verify_user_email(db, email=payload["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Пользователь не найден") from exc
    return {"message": "Email подтверждён. Теперь можно войти."}


@router.post("/token", response_model=Token)
async def login(user: UserLogin, db: AsyncSession = Depends(get_db)):
    try:
        user_orm = await get_user_authentication(db, user.email, user.password)
        if not user_orm:
            raise HTTPException(status_code=401, detail="Неверный логин или пароль")

        if REQUIRE_EMAIL_VERIFICATION and not user_orm.is_verified:
            raise HTTPException(
                status_code=403,
                detail="Подтвердите email перед входом",
            )

        access_token = create_access_token(subject=user.email)
        refresh_token = create_refresh_token(subject=user.email)

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            user_id=user_orm.id,
            role=user_orm.role if user_orm.role else "user",
        )
    except HTTPException as http_exc:
        logger.warning(f"Ошибка аутентификации: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"Внутренняя ошибка сервера: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/refresh", response_model=Token)
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(refresh_scheme),
    db: AsyncSession = Depends(get_db),
) -> Token:
    try:
        payload = decode_token(credentials.credentials, expected_type=TOKEN_TYPE_REFRESH)
        email = payload["sub"]

        user = await get_user(db=db, email=email)
        if not user:
            raise HTTPException(status_code=403, detail="Invalid refresh token")
        assert_user_not_blocked(user)

        if REQUIRE_EMAIL_VERIFICATION and not user.is_verified:
            raise HTTPException(status_code=403, detail="Email не подтверждён")

        new_access_token = create_access_token(subject=email)
        new_refresh_token = create_refresh_token(subject=email)

        return Token(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            user_id=user.id,
            role=user.role or "user",
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid refresh token")


@router.get("/users/me", response_model=CurrentUserAccessSchema)
async def get_current_user_access_api(
    current_user: UserCommonSchema = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, current_user.user_id)
    return CurrentUserAccessSchema(
        user_id=current_user.user_id,
        role=user.role if user else "user",
    )


@router.post("/add_user_common", response_model=UserCommonReadSchema)
async def add_user_common_api(
    user: UserCommonSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user.user_id)
    try:
        user_common = await add_user_common(db=db, user=user)
        return user_common
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_profile")
async def add_profile_user_api(
    user_profile: UserProfileSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_profile.user_id)
    try:
        await add_profile_user(db=db, user_profile=user_profile)
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get(
    "/profiles_executors_for_cards",
    response_model=PaginatedResponse[UserProfileForCardSchema],
)
async def get_profiles_executors_for_cards_api(
    category_work_slug: Optional[str] = Query(None, description="Слаг категории работ"),
    country: Optional[str] = Query(None, description="Название страны"),
    region: Optional[str] = Query(None, description="Название региона"),
    town: Optional[str] = Query(None, description="Название города"),
    # min_rating: Optional[float] = Query(None, ge=0, le=5, description="Минимальный рейтинг"),  # ✅ Закомментировано
    max_cost: Optional[float] = Query(None, ge=0, description="Максимальная цена/час"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(12, ge=1, le=100, description="Размер страницы"),
    db: AsyncSession = Depends(get_db),
):
    print(
        f"🚀 ENDPOINT: Параметры: category={category_work_slug}, country={country}, region={region}, town={town}, cost={max_cost}, page={page}, page_size={page_size}"
    )  # ✅ Убрали min_rating

    try:
        profiles_executors, total = await get_profiles_executors_for_cards_user(
            db=db,
            category_work_slug=category_work_slug,
            country=country,
            region=region,
            town=town,
            # min_rating=min_rating,  # ✅ Закомментировано
            max_cost=max_cost,
            page=page,
            page_size=page_size,
        )
        print(f"🚀 ENDPOINT: УСПЕХ! {len(profiles_executors)} профилей из {total}")
        return PaginatedResponse.create(
            profiles_executors, total, page, page_size
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"💥 ENDPOINT: Exception: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Критическая ошибка сервера")


@router.get("/profile", response_model=UserProfileReadSchema)
async def get_profile_api(
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=user_id, current_user=current_user
    )
    try:
        user_profile = await get_profile_user(db=db, user_id=user_id)
        return user_profile
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# информация о пользователе для предоставления в карточке заказа клиента или исполнителя
@router.get("/information_about_user/{user_id}", response_model=UserCommonSchema)
async def get_information_about_user_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    try:
        information_about_user = await get_information_about_user(
            db=db, user_id=user_id
        )
        return information_about_user
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_user_business")
async def add_user_business_api(
    user_business: UserBusinessSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_business.user_id)
    try:
        await add_user_business(db=db, user_business=user_business)
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_business_form", response_model=BusinessFormSchema)
async def add_business_form_api(
    business_form_schema: BusinessFormSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        business_form = await add_business_form(
            db=db, business_form_schema=business_form_schema
        )
        return BusinessFormSchema(
            id=business_form.id,
            name=business_form.name,
            description=business_form.description,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка: {str(e)}")


@router.get("/business_form", response_model=list[BusinessFormSchema])
async def get_business_form_api(
    db: AsyncSession = Depends(get_db),
):
    try:
        business_form = await get_business_form(db=db)
        return business_form
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/user_business", response_model=UserBusinessReadSchema)
async def get_user_business_api(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    return await get_user_business(db=db, user_id=current_user.user_id)


@router.post("/add_user_contact")
async def add_user_contact_api(
    user_contact: UserContactSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_contact.user_id)
    try:
        await add_user_contact(db=db, user_contact=user_contact)
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/contacts", response_model=list[UserContactReadSchema])
async def get_user_contacts_api(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        user_contacts = await get_user_contacts(db=db, user_id=current_user.user_id)
        return user_contacts
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get(
    "/users/{user_id}/contacts",
    response_model=list[UserContactReadSchema],
)
async def get_user_contacts_public_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=user_id, current_user=current_user
    )
    try:
        return await get_user_contacts(db=db, user_id=user_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.delete("/delete_contact/{contact_id}")
async def delete_contact_user_api(
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        await delete_contact_user(db=db, contact_id=contact_id)
        return JSONResponse(
            content={"detail": "Удаление успешно"}, status_code=status.HTTP_200_OK
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/add_user_geography_execute_order")
async def add_user_geography_execute_order_api(
    user_geography_execute_orders: GeographyExecuteOrderSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, user_geography_execute_orders.user_id)
    try:
        await add_user_geography_execute_order(
            db=db, user_geography_execute_order=user_geography_execute_orders
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.get("/geography_execute_orders", response_model=GeographySchema)
async def get_user_geography_execute_orders_api(
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    return await get_user_geography_execute_orders(
        db=db, user_id=current_user.user_id
    )


@router.get(
    "/users/{user_id}/geography_execute_orders",
    response_model=GeographySchema,
)
async def get_user_geography_execute_orders_public_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=user_id, current_user=current_user
    )
    return await get_user_geography_execute_orders(db=db, user_id=user_id)


@router.delete("/delete_town_geography_execute_orders")
async def delete_town_user_geography_execute_orders_api(
    town_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    try:
        print(f"Deleting town_id={town_id} for user_id={current_user.user_id}")
        await delete_town_user_geography_execute_orders(
            db=db, user_id=current_user.user_id, town_id=town_id
        )
        return JSONResponse(
            content={"detail": "Удаление успешно"}, status_code=status.HTTP_200_OK
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


@router.post("/upload_avatar")
async def upload_avatar_api(
    file: UploadFile = File(...),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    user_id = current_user.user_id

    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")

    safe_filename = sanitize_filename(file.filename)
    assert_allowed_image_extension(safe_filename)

    content = await file.read()
    validate_image_bytes(content, max_bytes=MAX_AVATAR_BYTES, label="Аватар")

    delete_avatar_files(user_id)

    filename = f"{user_id}_{safe_filename}"
    try:
        get_avatar_storage().save(filename, content)
        avatar_url = f"{PUBLIC_API_URL}/avatar/{user_id}"
        return {"avatar_url": avatar_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Не удалось сохранить аватар") from e


@router.get("/avatar/{user_id}")
async def get_avatar_api(user_id: int):
    from fastapi.responses import Response

    key = find_avatar_key(user_id)
    if not key:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    storage = get_avatar_storage()
    content = storage.read(key)
    if content is None:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    return Response(content=content, media_type=storage.guess_media_type(key))


@router.post("/add_project_portfolio_master")
async def add_project_portfolio_master_api(
    project_portfolio_master: PortfolioItemSchema,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    ensure_same_user(current_user, project_portfolio_master.user_id)
    try:
        await add_project_portfolio_master(
            db=db, portfolio_item=project_portfolio_master
        )
    except HTTPException as e:
        raise HTTPException(status_code=403, detail=f"Ошибка {e}")


# предоставление информации на фронтенде карточек с проектами портфолио мастера
@router.get(
    "/projects_portfolio_master/{user_id}", response_model=list[PortfolioItemReadSchema]
)
async def get_projects_portfolio_master_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=user_id, current_user=current_user
    )
    try:
        projects_portfolio_master = await get_projects_portfolio_master(
            db=db, user_id=user_id
        )
        return projects_portfolio_master
    except HTTPException as e:
        logging.error(f"HTTPException получена: {e.detail}")
        raise
    except Exception as e:
        logging.error(f"Неизвестная ошибка: {str(e)}")
        # Вернуть подробное сообщение об ошибке с кодом 500
        raise HTTPException(
            status_code=500, detail=f"Внутренняя ошибка сервера: {str(e)}"
        )


@router.post("/upload_images_portfolio_master/")
async def upload_images_portfolio_master_api(
    project_name: str = Query(..., min_length=3, max_length=100),
    files: List[UploadFile] = File(...),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    master_id = current_user.user_id
    storage = get_portfolio_storage()

    saved_files = []
    failed_files = []

    for file in files:
        # Проверки безопасности файла
        if not file.filename:
            failed_files.append({"name": "unknown", "error": "No filename"})
            continue

        try:
            safe_filename = sanitize_filename(file.filename)
            assert_allowed_image_extension(safe_filename)
            storage_key = f"{master_id}/{project_name}/{_PORTFOLIO_IMAGES_DIR}/{safe_filename}"
            content = await file.read()
            validate_image_bytes(content, max_bytes=MAX_PORTFOLIO_BYTES, label="Изображение")

            storage.save(storage_key, content)

            saved_files.append(
                {
                    "original_name": file.filename,
                    "saved_name": safe_filename,
                    "size": len(content),
                    "path": storage_key,
                }
            )

        except HTTPException as exc:
            failed_files.append({"name": file.filename, "error": exc.detail})
        except Exception as e:
            failed_files.append({"name": file.filename, "error": str(e)})

    return JSONResponse(
        content={
            "success": len(saved_files) > 0,
            "saved_files": saved_files,
            "failed_files": failed_files,
            "total_uploaded": len(files),
        }
    )


@router.get("/project_images_portfolio_master/{master_id}")
async def get_projects_images_portfolio_master_api(
    master_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema | None = Depends(get_optional_current_user),
):
    await assert_can_view_executor_profile(
        db, user_id=master_id, current_user=current_user
    )
    return {"projects": _portfolio_projects(master_id)}


@router.delete("/delete_image_portfolio_master/")
async def delete_image_portfolio_master_api(
    project_name: str = Query(..., min_length=3, max_length=100),
    filename: str = Query(..., min_length=1),
    current_user: UserCommonSchema = Depends(get_current_user),
):
    master_id = current_user.user_id
    storage = get_portfolio_storage()
    storage_key = f"{master_id}/{project_name}/{_PORTFOLIO_IMAGES_DIR}/{filename}"

    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Недопустимый путь к файлу")

    if not storage.exists(storage_key):
        raise HTTPException(status_code=404, detail="Файл не найден")

    try:
        storage.delete(storage_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка удаления файла: {str(e)}")

    return {"success": True, "deleted_file": storage_key}


@router.get("/users_for_admin", response_model=PaginatedResponse[UserCardForAdminSchema])
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
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        users_for_admin, total = await get_users_for_admin(
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

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {e}")


@router.get(
    "/user_profile_for_admin/{user_id}", response_model=UserProfileForAdminSchema
)
async def get_user_profile_for_admin_api(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserCommonSchema = Depends(get_current_admin_user),
):
    try:
        user_profile = await get_user_profile_for_admin(db=db, user_id=user_id)
        if not user_profile:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        return user_profile
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {e}")
