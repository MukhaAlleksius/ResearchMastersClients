"""dedupe geography and add unique constraints

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-20 22:35:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
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

    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.countries') IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM pg_constraint
               WHERE conname = 'uq_countries_name_country'
             ) THEN
            ALTER TABLE countries
              ADD CONSTRAINT uq_countries_name_country UNIQUE (name_country);
          END IF;

          IF to_regclass('public.regions') IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM pg_constraint
               WHERE conname = 'uq_regions_country_id_name_region'
             ) THEN
            ALTER TABLE regions
              ADD CONSTRAINT uq_regions_country_id_name_region
              UNIQUE (country_id, name_region);
          END IF;

          IF to_regclass('public.towns') IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM pg_constraint
               WHERE conname = 'uq_towns_region_id_name_town'
             ) THEN
            ALTER TABLE towns
              ADD CONSTRAINT uq_towns_region_id_name_town
              UNIQUE (region_id, name_town);
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'uq_towns_region_id_name_town'
          ) THEN
            ALTER TABLE towns DROP CONSTRAINT uq_towns_region_id_name_town;
          END IF;
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'uq_regions_country_id_name_region'
          ) THEN
            ALTER TABLE regions DROP CONSTRAINT uq_regions_country_id_name_region;
          END IF;
          IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'uq_countries_name_country'
          ) THEN
            ALTER TABLE countries DROP CONSTRAINT uq_countries_name_country;
          END IF;
        END $$;
        """
    )
