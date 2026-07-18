"""add notification context and reaction columns

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-06-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "561553a867bf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'notifications'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'notifications' AND column_name = 'order_id'
                ) THEN
                    ALTER TABLE notifications ADD COLUMN order_id INTEGER;
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'notifications' AND column_name = 'order_title'
                ) THEN
                    ALTER TABLE notifications ADD COLUMN order_title VARCHAR(255);
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'notifications' AND column_name = 'executor_reaction'
                ) THEN
                    ALTER TABLE notifications ADD COLUMN executor_reaction VARCHAR(100);
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'notifications' AND column_name = 'acknowledged_at'
                ) THEN
                    ALTER TABLE notifications ADD COLUMN acknowledged_at TIMESTAMPTZ;
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'notifications' AND column_name = 'action_path'
                ) THEN
                    ALTER TABLE notifications ADD COLUMN action_path VARCHAR(255);
                END IF;
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
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'notifications'
            ) THEN
                ALTER TABLE notifications DROP COLUMN IF EXISTS acknowledged_at;
                ALTER TABLE notifications DROP COLUMN IF EXISTS action_path;
                ALTER TABLE notifications DROP COLUMN IF EXISTS executor_reaction;
                ALTER TABLE notifications DROP COLUMN IF EXISTS order_title;
                ALTER TABLE notifications DROP COLUMN IF EXISTS order_id;
            END IF;
        END $$;
        """
    )
