"""Bootstrap empty Postgres for Docker when Alembic history has an empty initial revision."""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import func, inspect, select

from core.database import Base, async_session_maker, engine
from core.models_loader import load_all_models
from models.geography_models import Country, Region, Town

# Minimal directory so registration geography selects are not empty on first run.
DEFAULT_GEOGRAPHY = {
    "Беларусь": {
        "г. Минск": ["Минск"],
        "Минская область": ["Борисов", "Молодечно", "Жодино", "Солигорск"],
        "Брестская область": ["Брест", "Барановичи", "Пинск"],
        "Гродненская область": ["Гродно", "Лида"],
        "Витебская область": ["Витебск", "Орша", "Полоцк"],
        "Гомельская область": ["Гомель", "Мозырь"],
        "Могилёвская область": ["Могилёв", "Бобруйск"],
    }
}


def _needs_bootstrap(sync_conn) -> bool:
    inspector = inspect(sync_conn)
    return not inspector.has_table("user_profiles")


async def seed_default_geography() -> bool:
    """Insert default countries/regions/towns when the directory is empty."""
    async with async_session_maker() as session:
        count = await session.scalar(select(func.count()).select_from(Country))
        if count and count > 0:
            return False

        for country_name, regions in DEFAULT_GEOGRAPHY.items():
            country = Country(name_country=country_name)
            session.add(country)
            await session.flush()

            for region_name, towns in regions.items():
                region = Region(country_id=country.id, name_region=region_name)
                session.add(region)
                await session.flush()

                for town_name in towns:
                    session.add(Town(region_id=region.id, name_town=town_name))

        await session.commit()
        return True


async def main() -> int:
    load_all_models()
    created = False
    async with engine.begin() as conn:
        if await conn.run_sync(_needs_bootstrap):
            await conn.run_sync(Base.metadata.create_all)
            created = True

    seeded = await seed_default_geography()
    if seeded:
        print("geography_seeded", file=sys.stderr)

    print("created" if created else "exists")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as exc:  # noqa: BLE001
        print(f"bootstrap failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
