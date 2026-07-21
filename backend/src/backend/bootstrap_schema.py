"""Bootstrap empty Postgres for Docker when Alembic history has an empty initial revision."""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError

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


async def _get_or_create_country(session, name: str) -> tuple[Country, bool]:
    country = await session.scalar(
        select(Country).where(Country.name_country == name)
    )
    if country:
        return country, False
    try:
        async with session.begin_nested():
            country = Country(name_country=name)
            session.add(country)
            await session.flush()
        return country, True
    except IntegrityError:
        country = await session.scalar(
            select(Country).where(Country.name_country == name)
        )
        if not country:
            raise
        return country, False


async def _get_or_create_region(
    session, country_id: int, name: str
) -> tuple[Region, bool]:
    region = await session.scalar(
        select(Region).where(
            Region.country_id == country_id,
            Region.name_region == name,
        )
    )
    if region:
        return region, False
    try:
        async with session.begin_nested():
            region = Region(country_id=country_id, name_region=name)
            session.add(region)
            await session.flush()
        return region, True
    except IntegrityError:
        region = await session.scalar(
            select(Region).where(
                Region.country_id == country_id,
                Region.name_region == name,
            )
        )
        if not region:
            raise
        return region, False


async def _get_or_create_town(session, region_id: int, name: str) -> bool:
    town_id = await session.scalar(
        select(Town.id).where(
            Town.region_id == region_id,
            Town.name_town == name,
        )
    )
    if town_id:
        return False
    try:
        async with session.begin_nested():
            session.add(Town(region_id=region_id, name_town=name))
            await session.flush()
        return True
    except IntegrityError:
        return False


async def dedupe_geography() -> None:
    """Merge duplicate countries/regions/towns (safe if tables/constraints missing)."""
    async with async_session_maker() as session:
        await session.execute(
            text(
                """
                DO $$
                BEGIN
                  IF to_regclass('public.towns') IS NULL
                     OR to_regclass('public.regions') IS NULL
                     OR to_regclass('public.countries') IS NULL THEN
                    RETURN;
                  END IF;

                  IF to_regclass('public.geography_execute_orders') IS NOT NULL THEN
                    UPDATE geography_execute_orders geo
                    SET town_id = keep.keep_id
                    FROM (
                      SELECT t.id AS dup_id, m.keep_id
                      FROM towns t
                      JOIN (
                        SELECT region_id, name_town, MIN(id) AS keep_id
                        FROM towns
                        GROUP BY region_id, name_town
                        HAVING COUNT(*) > 1
                      ) m
                        ON t.region_id = m.region_id
                       AND t.name_town = m.name_town
                       AND t.id <> m.keep_id
                    ) keep
                    WHERE geo.town_id = keep.dup_id;
                  END IF;

                  DELETE FROM towns t
                  USING (
                    SELECT region_id, name_town, MIN(id) AS keep_id
                    FROM towns
                    GROUP BY region_id, name_town
                    HAVING COUNT(*) > 1
                  ) d
                  WHERE t.region_id = d.region_id
                    AND t.name_town = d.name_town
                    AND t.id <> d.keep_id;

                  UPDATE towns t
                  SET region_id = keep.keep_id
                  FROM (
                    SELECT r.id AS dup_id, m.keep_id
                    FROM regions r
                    JOIN (
                      SELECT country_id, name_region, MIN(id) AS keep_id
                      FROM regions
                      GROUP BY country_id, name_region
                      HAVING COUNT(*) > 1
                    ) m
                      ON r.country_id = m.country_id
                     AND r.name_region = m.name_region
                     AND r.id <> m.keep_id
                  ) keep
                  WHERE t.region_id = keep.dup_id;

                  DELETE FROM regions r
                  USING (
                    SELECT country_id, name_region, MIN(id) AS keep_id
                    FROM regions
                    GROUP BY country_id, name_region
                    HAVING COUNT(*) > 1
                  ) d
                  WHERE r.country_id = d.country_id
                    AND r.name_region = d.name_region
                    AND r.id <> d.keep_id;

                  UPDATE regions r
                  SET country_id = keep.keep_id
                  FROM (
                    SELECT c.id AS dup_id, m.keep_id
                    FROM countries c
                    JOIN (
                      SELECT name_country, MIN(id) AS keep_id
                      FROM countries
                      GROUP BY name_country
                      HAVING COUNT(*) > 1
                    ) m
                      ON c.name_country = m.name_country
                     AND c.id <> m.keep_id
                  ) keep
                  WHERE r.country_id = keep.dup_id;

                  DELETE FROM countries c
                  USING (
                    SELECT name_country, MIN(id) AS keep_id
                    FROM countries
                    GROUP BY name_country
                    HAVING COUNT(*) > 1
                  ) d
                  WHERE c.name_country = d.name_country
                    AND c.id <> d.keep_id;
                END $$;
                """
            )
        )
        await session.commit()


async def seed_default_geography() -> bool:
    """Ensure default countries/regions/towns exist without creating duplicates."""
    await dedupe_geography()

    changed = False
    async with async_session_maker() as session:
        for country_name, regions in DEFAULT_GEOGRAPHY.items():
            country, created = await _get_or_create_country(session, country_name)
            changed = changed or created

            for region_name, towns in regions.items():
                region, created = await _get_or_create_region(
                    session, country.id, region_name
                )
                changed = changed or created

                for town_name in towns:
                    created = await _get_or_create_town(session, region.id, town_name)
                    changed = changed or created

        if changed:
            await session.commit()
        else:
            await session.rollback()
        return changed


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
