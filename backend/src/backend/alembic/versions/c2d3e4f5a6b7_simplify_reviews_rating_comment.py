"""simplify reviews: keep rating and comment only

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-23 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.reviews') IS NULL THEN
            RETURN;
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'reviews' AND column_name = 'criteria_quality'
          ) THEN
            ALTER TABLE reviews DROP COLUMN criteria_quality;
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'reviews' AND column_name = 'criteria_timeliness'
          ) THEN
            ALTER TABLE reviews DROP COLUMN criteria_timeliness;
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'reviews' AND column_name = 'criteria_communication'
          ) THEN
            ALTER TABLE reviews DROP COLUMN criteria_communication;
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'reviews' AND column_name = 'criteria_price'
          ) THEN
            ALTER TABLE reviews DROP COLUMN criteria_price;
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'reviews' AND column_name = 'is_verified'
          ) THEN
            ALTER TABLE reviews DROP COLUMN is_verified;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.reviews') IS NULL THEN
            RETURN;
          END IF;

          ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS criteria_quality INTEGER,
            ADD COLUMN IF NOT EXISTS criteria_timeliness INTEGER,
            ADD COLUMN IF NOT EXISTS criteria_communication INTEGER,
            ADD COLUMN IF NOT EXISTS criteria_price INTEGER,
            ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
        END $$;
        """
    )
