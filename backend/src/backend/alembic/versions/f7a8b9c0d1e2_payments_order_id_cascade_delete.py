"""payments order_id cascade delete

Revision ID: f7a8b9c0d1e2
Revises: d1e2f3a4b5c6
Create Date: 2026-07-05 20:38:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("payments_order_id_fkey", "payments", type_="foreignkey")
    op.create_foreign_key(
        "payments_order_id_fkey",
        "payments",
        "orders",
        ["order_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("payments_order_id_fkey", "payments", type_="foreignkey")
    op.create_foreign_key(
        "payments_order_id_fkey",
        "payments",
        "orders",
        ["order_id"],
        ["id"],
    )
