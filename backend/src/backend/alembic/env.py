import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


import logging
from logging.config import fileConfig
from alembic import context
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from core.database import Base  # Import your Base and any other relevant models

# Импорт моделей
from models.geography_models import Country, Region, Town
from models.users_models import (
    User,
    BusinessForm,
    UserBusiness,
    UserProfile,
    UserContact,
    PortfolioItem,
    PortfolioImage,
    GeographyExecuteOrder,
)
from models.works_materials_models import (
    CategoryWork,
    Work,
    Material,
    CategoryWorkMaster,
)
from models.orders_models import (
    Order,
    OrderResponseExecutor,
    InformationAboutCustomer,
    InformationAboutExecutor,
    Review,
    Notification,
)
from models.estimate_graphic_works_models import WorkEstimate, GraphicWork
from models.conversations_models import Conversation, Message
from models.contracts_models import Contract
from models.payments_models import ExecutorBankAccount, Payment
from models.currency_models import CurrencyRate
from models.prices_works_materials import PriceWorkMaster, PriceMaterialMaster

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)
logging.getLogger("alembic").setLevel(logging.INFO)

logger = logging.getLogger()
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setLevel(logging.INFO)
logger.addHandler(handler)

# Конфигурация Alembic
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Использование метаданных моделей
target_metadata = Base.metadata

logging.info(f"Метаданные: {target_metadata.tables.keys()}")

from core.config import DATABASE_URL


async def run_migrations_online():
    """Запуск миграций в онлайн режиме"""
    connectable = create_async_engine(DATABASE_URL, echo=False)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def do_run_migrations(connection):
    """Синхронная функция миграций"""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


# Запуск
import asyncio

if context.is_offline_mode():
    raise Exception("Offline mode not supported")
else:
    asyncio.run(run_migrations_online())
