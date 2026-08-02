"""towns source verified columns

Revision ID: d4e5f6a7b8c9
Revises: 9f0659bf4a65
Create Date: 2026-08-02 18:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "9f0659bf4a65"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "towns",
        sa.Column("source", sa.String(length=20), server_default="admin", nullable=False),
    )
    op.add_column(
        "towns",
        sa.Column("is_verified", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "towns",
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "towns",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_towns_created_by_user_id_users",
        "towns",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_towns_created_by_user_id_users", "towns", type_="foreignkey")
    op.drop_column("towns", "created_at")
    op.drop_column("towns", "created_by_user_id")
    op.drop_column("towns", "is_verified")
    op.drop_column("towns", "source")
