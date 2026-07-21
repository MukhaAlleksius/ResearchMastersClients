from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from core.database import Base


class Country(Base):
    __tablename__ = "countries"
    __table_args__ = (
        UniqueConstraint("name_country", name="uq_countries_name_country"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    name_country = Column(String(255), nullable=False)

    regions = relationship("Region", back_populates="country")


# для внесения изменений администратором
class Region(Base):
    __tablename__ = "regions"
    __table_args__ = (
        UniqueConstraint(
            "country_id",
            "name_region",
            name="uq_regions_country_id_name_region",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    country_id = Column(Integer, ForeignKey("countries.id"))
    name_region = Column(String(255), nullable=False)

    country = relationship("Country", back_populates="regions")
    towns = relationship("Town", back_populates="region")


# для внесения изменений администратором
class Town(Base):
    __tablename__ = "towns"
    __table_args__ = (
        UniqueConstraint(
            "region_id",
            "name_town",
            name="uq_towns_region_id_name_town",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    region_id = Column(Integer, ForeignKey("regions.id"))
    name_town = Column(String(255), nullable=False)

    region = relationship("Region", back_populates="towns")
