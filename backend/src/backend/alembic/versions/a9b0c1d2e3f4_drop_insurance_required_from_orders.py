"""drop insurance_required from orders

Revision ID: a9b0c1d2e3f4
Revises: e2f3a4b5c6d7
Create Date: 2026-09-19 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in sa.inspect(bind).get_columns("orders")}
    if "insurance_required" in columns:
        op.drop_column("orders", "insurance_required")


def downgrade() -> None:
    bind = op.get_bind()
    columns = {col["name"] for col in sa.inspect(bind).get_columns("orders")}
    if "insurance_required" not in columns:
        op.add_column(
            "orders",
            sa.Column(
                "insurance_required",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=True,
            ),
        )
