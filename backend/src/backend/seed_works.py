"""Idempotent seed of admin works catalog from data/works_dictionary.json."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from core.database import async_session_maker
from core.models_loader import load_all_models
from models.works_materials_models import CategoryWork, Work

logger = logging.getLogger(__name__)

DEFAULT_CURRENCY = "BYN"
_DICTIONARY_PATH = Path(__file__).resolve().parent / "data" / "works_dictionary.json"


def load_works_dictionary(path: Path | None = None) -> list[dict]:
    """Load categories + works from JSON dictionary file."""
    dict_path = path or _DICTIONARY_PATH
    if not dict_path.is_file():
        raise FileNotFoundError(f"Works dictionary not found: {dict_path}")
    with dict_path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError("Works dictionary must be a JSON array of categories")
    return data


async def _get_or_create_category(session, item: dict) -> tuple[CategoryWork, bool]:
    slug = (item.get("slug") or "").strip()
    name = (item.get("name") or "").strip()
    if not slug or not name:
        raise ValueError(f"Category requires name and slug: {item!r}")

    category = await session.scalar(
        select(CategoryWork).where(CategoryWork.slug == slug)
    )
    if category:
        return category, False

    try:
        async with session.begin_nested():
            category = CategoryWork(
                name=name,
                description=item.get("description") or "",
                icon_name=item.get("icon_name") or "Работа",
                icon_color=item.get("icon_color") or "#2c72dc",
                access_users=bool(item.get("access_users", True)),
                slug=slug,
            )
            session.add(category)
            await session.flush()
        return category, True
    except IntegrityError:
        category = await session.scalar(
            select(CategoryWork).where(CategoryWork.slug == slug)
        )
        if not category:
            raise
        return category, False


async def _get_or_create_work(
    session, category_id: int, work_item: dict
) -> bool:
    name_work = (work_item.get("name_work") or "").strip()
    if not name_work:
        return False

    existing_id = await session.scalar(
        select(Work.id).where(
            Work.category_work_id == category_id,
            Work.name_work == name_work,
        )
    )
    if existing_id:
        return False

    try:
        async with session.begin_nested():
            session.add(
                Work(
                    user_id=None,
                    name_work=name_work,
                    unit_measurement=work_item.get("unit_measurement") or "",
                    cost=work_item.get("cost"),
                    currency=work_item.get("currency") or DEFAULT_CURRENCY,
                    category_work_id=category_id,
                )
            )
            await session.flush()
        return True
    except IntegrityError:
        return False


async def seed_default_works(path: Path | None = None) -> bool:
    """
    Ensure catalog categories/works from the dictionary exist.
    Safe to call repeatedly: only inserts missing rows (by slug / name_work).
    Returns True if anything was inserted.
    """
    load_all_models()
    catalog = load_works_dictionary(path)

    changed = False
    async with async_session_maker() as session:
        for category_item in catalog:
            category, created = await _get_or_create_category(session, category_item)
            changed = changed or created

            for work_item in category_item.get("works") or []:
                created = await _get_or_create_work(session, category.id, work_item)
                changed = changed or created

        if changed:
            await session.commit()
            logger.info("Default works catalog seeded from %s", path or _DICTIONARY_PATH)
        else:
            await session.rollback()
            logger.debug("Default works catalog already present")
        return changed
