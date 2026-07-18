"""rename unit_maeasurement to unit_measurement in prices_materials_masters

Revision ID: b7c8d9e0f1a2
Revises: 183acf3e1065
Create Date: 2026-06-06 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "183acf3e1065"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'prices_materials_masters'
                  AND column_name = 'unit_maeasurement'
            ) THEN
                ALTER TABLE prices_materials_masters
                RENAME COLUMN unit_maeasurement TO unit_measurement;
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
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'prices_materials_masters'
                  AND column_name = 'unit_measurement'
            ) THEN
                ALTER TABLE prices_materials_masters
                RENAME COLUMN unit_measurement TO unit_maeasurement;
            END IF;
        END $$;
        """
    )
