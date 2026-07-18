from typing import Optional
from pydantic import BaseModel, Field


class CountrySchema(BaseModel):
    country_id: Optional[int] = None
    name_country: str = Field(..., max_length=255, description="Название страны")


class RegionReadSchema(BaseModel):
    region_id: Optional[int] = None
    name_region: str = Field(..., max_length=255, description="Название области")


class RegionSchema(RegionReadSchema):
    country_id: int


class TownReadSchema(BaseModel):
    town_id: Optional[int] = None
    name_town: str = Field(..., max_length=255, description="Название города")


class TownSchema(TownReadSchema):
    region_id: int
