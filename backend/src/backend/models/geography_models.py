from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from core.database import Base


class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name_country = Column(String(255))

    regions = relationship("Region", back_populates="country")


# для внесения изменений администратором
class Region(Base):
    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    country_id = Column(Integer, ForeignKey("countries.id"))
    name_region = Column(String(255))

    country = relationship("Country", back_populates="regions")
    towns = relationship("Town", back_populates="region")


# для внесения изменений администратором
class Town(Base):
    __tablename__ = "towns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    region_id = Column(Integer, ForeignKey("regions.id"))
    name_town = Column(String(255))

    region = relationship("Region", back_populates="towns")
