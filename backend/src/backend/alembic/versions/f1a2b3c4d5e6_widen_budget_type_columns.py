"""widen orders budget_type columns for longer labels

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-08-12 17:20:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.orders') IS NOT NULL THEN
            ALTER TABLE orders
              ALTER COLUMN budget_type TYPE VARCHAR(50);
          END IF;

          IF to_regclass('public.orders_responses_executors') IS NOT NULL THEN
            ALTER TABLE orders_responses_executors
              ALTER COLUMN budget_type TYPE VARCHAR(50);
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.orders') IS NOT NULL THEN
            ALTER TABLE orders
              ALTER COLUMN budget_type TYPE VARCHAR(20);
          END IF;

          IF to_regclass('public.orders_responses_executors') IS NOT NULL THEN
            ALTER TABLE orders_responses_executors
              ALTER COLUMN budget_type TYPE VARCHAR(20);
          END IF;
        END $$;
        """
    )
