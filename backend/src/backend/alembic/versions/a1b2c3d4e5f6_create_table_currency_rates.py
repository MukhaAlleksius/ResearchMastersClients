"""create table currency_rates

Revision ID: a1b2c3d4e5f6
Revises: 884966b9b966
Create Date: 2026-06-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "884966b9b966"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "currency_rates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scale", sa.Integer(), nullable=False),
        sa.Column("official_rate", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("rate_per_unit", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", "rate_date", name="uq_currency_rates_code_rate_date"),
    )
    op.create_index(op.f("ix_currency_rates_code"), "currency_rates", ["code"], unique=False)
    op.create_index(op.f("ix_currency_rates_rate_date"), "currency_rates", ["rate_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_currency_rates_rate_date"), table_name="currency_rates")
    op.drop_index(op.f("ix_currency_rates_code"), table_name="currency_rates")
    op.drop_table("currency_rates")
