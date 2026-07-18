"""Email verification on registration."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import PUBLIC_API_URL, REQUIRE_EMAIL_VERIFICATION
from core.tokens import create_email_verification_token
from models.users_models import User

logger = logging.getLogger(__name__)


def verification_link(token: str) -> str:
    return f"{PUBLIC_API_URL}/verify-email?token={token}"


async def send_verification_email(*, email: str, token: str) -> None:
    link = verification_link(token)
    # SMTP can be wired later; in dev the link is logged for manual testing.
    logger.info("Email verification link for %s: %s", email, link)


async def issue_email_verification(db: AsyncSession, user: User) -> None:
    if user.is_verified or not REQUIRE_EMAIL_VERIFICATION:
        return
    token = create_email_verification_token(subject=user.email)
    await send_verification_email(email=user.email, token=token)


async def verify_user_email(db: AsyncSession, *, email: str) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")
    user.is_verified = True
    await db.commit()
    await db.refresh(user)
    return user
