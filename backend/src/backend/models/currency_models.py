from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)

from core.database import Base


class CurrencyRate(Base):
    __tablename__ = "currency_rates"
    __table_args__ = (
        UniqueConstraint("code", "rate_date", name="uq_currency_rates_code_rate_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    scale = Column(Integer, nullable=False, default=1)
    official_rate = Column(Numeric(18, 6), nullable=False)
    rate_per_unit = Column(Numeric(18, 6), nullable=False)
    rate_date = Column(Date, nullable=False, index=True)
    source = Column(String(32), nullable=False, default="nbrb")
    fetched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
