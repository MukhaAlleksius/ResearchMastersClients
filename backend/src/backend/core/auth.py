from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from core.access import assert_user_not_blocked, is_user_blocked
from core.config import TOKEN_TYPE_ACCESS, get_db
from core.tokens import decode_token
from core.public_reads import is_public_get
from cruds.users_crud import get_user
from models.users_models import User
from schemas.users_schemas import UserCommonSchema

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token", auto_error=True)
optional_bearer = HTTPBearer(auto_error=False)
refresh_scheme = HTTPBearer()

PUBLIC_POST_PATHS = {
    "/token",
    "/refresh",
    "/register",
    "/payment/callback",
}


def is_public_route(method: str, path: str) -> bool:
    if method == "OPTIONS":
        return True
    if method == "POST" and path in PUBLIC_POST_PATHS:
        return True
    if method != "GET":
        return False
    return is_public_get(path)


def user_to_schema(user_orm: User) -> UserCommonSchema:
    return UserCommonSchema(
        user_id=user_orm.id,
        first_name=user_orm.first_name,
        last_name=user_orm.last_name,
        country=user_orm.country,
        region=user_orm.region,
        town=user_orm.town,
    )


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> UserCommonSchema:
    try:
        payload = decode_token(token, expected_type=TOKEN_TYPE_ACCESS)
        email = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_orm: User = await get_user(db, email=email)
        if not user_orm:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        assert_user_not_blocked(user_orm)
        return user_to_schema(user_orm)
    except HTTPException:
        raise


async def get_optional_current_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(optional_bearer)
    ],
    db: AsyncSession = Depends(get_db),
) -> Optional[UserCommonSchema]:
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials, expected_type=TOKEN_TYPE_ACCESS)
        email = payload.get("sub")
        if email is None:
            return None
        user_orm = await get_user(db, email=email)
        if not user_orm or is_user_blocked(user_orm):
            return None
        return user_to_schema(user_orm)
    except HTTPException:
        return None


async def get_current_admin_user(
    current_user: UserCommonSchema = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserCommonSchema:
    user_orm = await db.get(User, current_user.user_id)
    if not user_orm or user_orm.role not in {"admin", "moderator"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуются права администратора или модератора",
        )
    return current_user


def ensure_same_user(current_user: UserCommonSchema, user_id: int) -> None:
    if current_user.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
