from sqlalchemy.orm import relationship
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from core.database import Base


class WorkEstimate(Base):
    __tablename__ = "works_estimates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    name_work = Column(Text)
    unit_measurement = Column(String(100))
    quantity = Column(Numeric)
    cost_unit = Column(Numeric)
    currency = Column(String(100))

    user = relationship("User")
    order = relationship("Order")


class MaterialEstimate(Base):
    __tablename__ = "materials_estimates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    work_estimate_id = Column(
        Integer, ForeignKey("works_estimates.id", ondelete="CASCADE")
    )
    name_material = Column(Text)
    unit_measurement = Column(String(100))
    quantity = Column(Numeric)
    cost_unit = Column(Numeric)
    currency = Column(String(100))


class GraphicWork(Base):
    __tablename__ = "graphic_works"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    name_work = Column(Text, nullable=False)  # Название работы
    unit_measurement = Column(
        String(20), nullable=False
    )  # Ед. измерения (м, шт, кг...)
    quantity = Column(
        Numeric(10, 2), nullable=False
    )  # Количество (исправлена опечатка)
    work_date = Column(Date, nullable=False)  # Дата выполнения работы


# Связи
# user = relationship("User", back_populates="graphic_works")
# order = relationship("Order", back_populates="graphic_works")
