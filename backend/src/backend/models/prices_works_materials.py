from sqlalchemy.orm import relationship
from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from core.database import Base


class PriceWorkMaster(Base):
    __tablename__ = "prices_works_masters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    work_id = Column(Integer, ForeignKey("works.id"))
    price = Column(Numeric)
    currency = Column(String(100))

    user = relationship("User")
    work = relationship("Work")


class PriceMaterialMaster(Base):
    __tablename__ = "prices_materials_masters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    material_id = Column(Integer, ForeignKey("materials.id"))
    unit_measurement = Column(String(100))
    price = Column(Numeric)
    currency = Column(String(100))

    user = relationship("User")
    material = relationship("Material")
