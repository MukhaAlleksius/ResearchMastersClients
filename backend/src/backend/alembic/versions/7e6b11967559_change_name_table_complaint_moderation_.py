"""change name table complaint_moderation_actions change columns into this table


Revision ID: 7e6b11967559
Revises: 1ad474910711
Create Date: 2026-04-06 18:58:39.999375


"""

from typing import Sequence, Union


from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "7e6b11967559"
down_revision: Union[str, Sequence[str], None] = "1ad474910711"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Создаём новую таблицу complaint_moderation_actions
    op.create_table(
        "complaint_moderation_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("complaint_id", sa.Integer(), nullable=False),
        sa.Column(
            "action_type",
            sa.Enum(
                "WARNING",
                "VERDICT_REFUND",
                "VERDICT_PAY",
                "VERDICT_SPLIT",
                "VERDICT_CLOSE",
                "BAN",
                name="actiontype",
            ),
            nullable=False,
        ),
        sa.Column("target_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "refund_amount_customer",
            sa.Numeric(precision=10, scale=2),
            nullable=True,
        ),
        sa.Column(
            "refund_amount_executor",
            sa.Numeric(precision=10, scale=2),
            nullable=True,
        ),
        sa.Column("comment", sa.String(length=1000), nullable=True),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["admin_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["complaint_id"],
            ["complaints_conversations.id"],
        ),
        sa.ForeignKeyConstraint(
            ["target_user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Индексы для новой таблицы
    op.create_index(
        op.f("ix_complaint_moderation_actions_action_type"),
        "complaint_moderation_actions",
        ["action_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_complaint_moderation_actions_complaint_id"),
        "complaint_moderation_actions",
        ["complaint_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_complaint_moderation_actions_id"),
        "complaint_moderation_actions",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_complaint_moderation_actions_target_user_id"),
        "complaint_moderation_actions",
        ["target_user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Восстанавливаем старую таблицу moderation_actions
    op.create_table(
        "moderation_actions",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("complaint_id", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column(
            "action_type",
            postgresql.ENUM(
                "WARNING",
                "VERDICT_REFUND",
                "VERDICT_PAY",
                "VERDICT_SPLIT",
                "VERDICT_CLOSE",
                "BAN",
                name="actiontype",
            ),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column("target_user_id", sa.INTEGER(), autoincrement=False, nullable=True),
        sa.Column(
            "amount_customer",
            sa.NUMERIC(precision=10, scale=2),
            autoincrement=False,
            nullable=True,
        ),
        sa.Column(
            "amount_executor",
            sa.NUMERIC(precision=10, scale=2),
            autoincrement=False,
            nullable=True,
        ),
        sa.Column(
            "comment",
            sa.VARCHAR(length=1000),
            autoincrement=False,
            nullable=True,
        ),
        sa.Column("admin_id", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["admin_id"], ["users.id"], name="moderation_actions_admin_id_fkey"
        ),
        sa.ForeignKeyConstraint(
            ["complaint_id"],
            ["complaints_conversations.id"],
            name="moderation_actions_complaint_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["target_user_id"],
            ["users.id"],
            name="moderation_actions_target_user_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="moderation_actions_pkey"),
    )

    # Восстанавливаем индексы для старой таблицы
    op.create_index(
        "ix_moderation_actions_target_user_id",
        "moderation_actions",
        ["target_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_moderation_actions_id",
        "moderation_actions",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_moderation_actions_complaint_id",
        "moderation_actions",
        ["complaint_id"],
        unique=False,
    )
    op.create_index(
        "ix_moderation_actions_action_type",
        "moderation_actions",
        ["action_type"],
        unique=False,
    )

    # Удаляем индексы новой таблицы
    op.drop_index(
        op.f("ix_complaint_moderation_actions_target_user_id"),
        table_name="complaint_moderation_actions",
    )
    op.drop_index(
        op.f("ix_complaint_moderation_actions_id"),
        table_name="complaint_moderation_actions",
    )
    op.drop_index(
        op.f("ix_complaint_moderation_actions_complaint_id"),
        table_name="complaint_moderation_actions",
    )

    # Удаляем новую таблицу
    op.drop_table("complaint_moderation_actions")
