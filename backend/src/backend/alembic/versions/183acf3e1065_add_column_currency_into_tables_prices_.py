"""create tables prices_works_masters and prices_materials_masters

Revision ID: 183acf3e1065
Revises: a1b2c3d4e5f6
Create Date: 2026-06-06 22:18:04.509407

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "183acf3e1065"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prices_works_masters",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("work_id", sa.Integer(), nullable=True),
        sa.Column("price", sa.Numeric(), nullable=True),
        sa.Column("currency", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "prices_materials_masters",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("material_id", sa.Integer(), nullable=True),
        sa.Column("unit_measurement", sa.String(length=100), nullable=True),
        sa.Column("price", sa.Numeric(), nullable=True),
        sa.Column("currency", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("prices_materials_masters")
    op.drop_table("prices_works_masters")
