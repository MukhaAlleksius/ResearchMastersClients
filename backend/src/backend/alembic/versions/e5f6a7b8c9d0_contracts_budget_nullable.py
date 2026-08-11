"""Make contracts.budget nullable for estimate-based deals

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-11 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "contracts",
        "budget",
        existing_type=sa.Numeric(precision=12, scale=2),
        nullable=True,
    )
    # Сметные договоры: сумму не храним (ещё может быть неизвестна)
    op.execute(
        """
        UPDATE contracts
        SET budget = NULL
        WHERE budget_type IS NOT NULL
          AND LOWER(budget_type) LIKE '%сметн%'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE contracts
        SET budget = 0
        WHERE budget IS NULL
        """
    )
    op.alter_column(
        "contracts",
        "budget",
        existing_type=sa.Numeric(precision=12, scale=2),
        nullable=False,
    )
