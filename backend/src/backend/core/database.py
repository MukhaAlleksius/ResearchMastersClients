from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from core import config

engine = create_async_engine(config.DATABASE_URL, echo=config.SQL_ECHO)
async_session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)
config.async_session_maker = async_session_maker

Base = declarative_base()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def check_connection() -> bool:
    async with async_session_maker() as session:
        result = await session.execute(select(1))
        return result.scalar() == 1
