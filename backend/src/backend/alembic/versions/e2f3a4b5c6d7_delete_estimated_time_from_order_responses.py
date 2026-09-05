"""delete estimated_time from orders_responses_executors

Revision ID: e2f3a4b5c6d7
Revises: 0b19a865b1b2
Create Date: 2026-09-05 23:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "0b19a865b1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("orders_responses_executors", "estimated_time")


def downgrade() -> None:
    op.add_column(
        "orders_responses_executors",
        sa.Column("estimated_time", sa.String(length=100), nullable=True),
    )
