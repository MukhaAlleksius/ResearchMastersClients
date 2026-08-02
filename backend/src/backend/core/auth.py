from typing import Annotated, Optional  # Типы для Depends и optional user

from fastapi import Depends, HTTPException, status  # DI и HTTP-ошибки
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
    OAuth2PasswordBearer,
)  # Схемы Bearer/OAuth2
from sqlalchemy import func, select  # COUNT и SELECT для проверки staff
from sqlalchemy.ext.asyncio import AsyncSession  # Сессия БД

from core.access import assert_user_not_blocked, is_user_blocked  # Проверка блокировки
from core.config import OPEN_ADMIN_ACCESS, TOKEN_TYPE_ACCESS, get_db  # Конфиг и сессия
from core.tokens import decode_token  # Разбор JWT
from core.public_reads import is_public_get  # Публичные GET
from cruds.users_crud import get_user  # Поиск пользователя по email
from models.users_models import User  # ORM User
from schemas.users_schemas import (
    UserCommonSchema,
)  # Схема текущего пользователя для API

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/token", auto_error=True
)  # Обязательный Bearer для защищённых роутов
optional_bearer = HTTPBearer(auto_error=False)  # Опциональный Bearer (гость ок)
refresh_scheme = HTTPBearer()  # Bearer для refresh

PUBLIC_POST_PATHS = {  # POST без JWT
    "/token",  # Логин
    "/refresh",  # Обновление токена
    "/register",  # Регистрация
    "/auth/google/login",  # Google вход
    "/auth/google/register",  # Google регистрация
    "/payment/callback",  # Callback платёжки
    "/add_town_by_user",  # Добавление города при регистрации
}


def is_public_route(method: str, path: str) -> bool:  # Нужна ли авторизация на маршруте
    if method == "OPTIONS":  # CORS preflight
        return True  # Всегда публичный
    if method == "POST" and path in PUBLIC_POST_PATHS:  # Публичный POST
        return True
    if method != "GET":  # Остальные методы (PUT/DELETE/...) — не публичные здесь
        return False
    return is_public_get(path)  # Для GET — список из public_reads


def user_to_schema(
    user_orm: User,
) -> UserCommonSchema:  # ORM → компактная схема для Depends
    return UserCommonSchema(
        user_id=user_orm.id,  # id
        first_name=user_orm.first_name,  # имя
        last_name=user_orm.last_name,  # фамилия
        town_id=user_orm.town_id,
    )


async def get_current_user(  # Обязательный текущий пользователь из access JWT
    token: Annotated[str, Depends(oauth2_scheme)],  # Строка JWT из Authorization
    db: AsyncSession = Depends(get_db),  # Сессия БД
) -> UserCommonSchema:
    try:
        payload = decode_token(
            token, expected_type=TOKEN_TYPE_ACCESS
        )  # Декодируем access
        email = payload.get("sub")  # Email из subject
        if email is None:  # Нет subject
            raise HTTPException(  # 401
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_orm: User = await get_user(db, email=email)  # Ищем в БД
        if not user_orm:  # Не найден
            raise HTTPException(  # 401
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        assert_user_not_blocked(user_orm)  # Заблокированным нельзя
        return user_to_schema(user_orm)  # Отдаём схему
    except HTTPException:  # Уже HTTP-ошибка
        raise  # Пробрасываем


async def get_optional_current_user(  # Пользователь, если токен есть; иначе None (гость)
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(optional_bearer)
    ],
    db: AsyncSession = Depends(get_db),
) -> Optional[UserCommonSchema]:
    if not credentials:  # Заголовка нет
        return None  # Гость
    try:
        payload = decode_token(
            credentials.credentials, expected_type=TOKEN_TYPE_ACCESS
        )  # Пробуем access
        email = payload.get("sub")  # Email
        if email is None:  # Битый payload
            return None
        user_orm = await get_user(db, email=email)  # Ищем пользователя
        if not user_orm or is_user_blocked(user_orm):  # Нет или заблокирован
            return None  # Как гость
        return user_to_schema(user_orm)  # Авторизованный
    except HTTPException:  # Невалидный токен
        return None  # Тихо как гость


async def get_current_admin_user(  # Текущий пользователь с правами админа/модератора
    current_user: UserCommonSchema = Depends(get_current_user),  # Сначала обычный логин
    db: AsyncSession = Depends(get_db),
) -> UserCommonSchema:
    user_orm = await db.get(User, current_user.user_id)  # Полная запись из БД
    if not user_orm:  # Вдруг удалили
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if user_orm.role in {"admin", "moderator"}:  # Есть роль staff
        return current_user  # Пускаем

    # Тестирование / пустая БД: любой вошедший пользователь получает доступ
    # к админ-API, пока нет ни одного admin/moderator либо включён OPEN_ADMIN_ACCESS.
    if OPEN_ADMIN_ACCESS:  # Режим открытого админа (dev)
        return current_user  # Пускаем любого залогиненного

    staff_count = await db.scalar(  # Сколько уже есть admin/moderator
        select(func.count())
        .select_from(User)
        .where(User.role.in_(["admin", "moderator"]))
    )
    if not staff_count:  # Staff ещё никого нет — bootstrap
        return current_user  # Первый вошедший может в админку

    raise HTTPException(  # Иначе запрет
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Требуются права администратора или модератора",
    )


def ensure_same_user(
    current_user: UserCommonSchema, user_id: int
) -> None:  # Нельзя трогать чужой user_id
    if current_user.user_id != user_id:  # Id не совпал
        raise HTTPException(  # 403
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
