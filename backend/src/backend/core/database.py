from sqlalchemy import select  # SQL-выражение SELECT
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # Асинхронный движок и фабрика сессий
from sqlalchemy.orm import declarative_base  # Базовый класс для ORM-моделей

from core import config  # Настройки приложения (URL БД и т.д.)

engine = create_async_engine(config.DATABASE_URL, echo=config.SQL_ECHO)  # Создаём async-движок SQLAlchemy
async_session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)  # Фабрика сессий БД
config.async_session_maker = async_session_maker  # Пробрасываем фабрику в config для get_db()

Base = declarative_base()  # База, от которой наследуются все модели


async def init_db():  # Создаёт таблицы по моделям (для dev / AUTO_CREATE_DB)
    async with engine.begin() as conn:  # Открываем транзакцию на соединении
        await conn.run_sync(Base.metadata.create_all)  # Синхронно создаём все таблицы из metadata


async def check_connection() -> bool:  # Проверка, что БД отвечает
    async with async_session_maker() as session:  # Берём сессию
        result = await session.execute(select(1))  # Простой запрос SELECT 1
        return result.scalar() == 1  # True, если получили 1
