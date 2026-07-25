"""create reviews table

Revision ID: b1c2d3e4f5a6
Revises: a8b9c0d1e2f3
Create Date: 2026-07-22 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.reviews') IS NOT NULL THEN
            RETURN;
          END IF;

          CREATE TABLE reviews (
            id SERIAL PRIMARY KEY,
            order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
            reviewer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reviewee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            rating INTEGER,
            comment TEXT,
            criteria_quality INTEGER,
            criteria_timeliness INTEGER,
            criteria_communication INTEGER,
            criteria_price INTEGER,
            is_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_order_reviewer
            ON reviews (order_id, reviewer_id);
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reviews CASCADE")
