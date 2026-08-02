from typing import Optional
from pydantic import BaseModel, Field, field_validator
import re


# Заглавная кириллица в начале; далее кириллица, пробел или дефис.
_TOWN_NAME_RE = re.compile(
    r"^[А-ЯЁ][а-яё]*(?:[-\s][А-ЯЁа-яё]+)*$"
)


def normalize_town_name(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def validate_town_name_value(value: str) -> str:
    name = normalize_town_name(value)
    if not name:
        raise ValueError("Укажите название города")
    if len(name) > 255:
        raise ValueError("Название города слишком длинное")
    if not _TOWN_NAME_RE.fullmatch(name):
        raise ValueError(
            "Название города: с заглавной буквы, только кириллица "
            "(допустимы пробел и дефис), например: Минск"
        )
    return name


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
    source: Optional[str] = None
    is_verified: Optional[bool] = None


class TownSchema(TownReadSchema):
    region_id: int

    @field_validator("name_town")
    @classmethod
    def town_name_rules(cls, value: str) -> str:
        return validate_town_name_value(value)


class UserTownCreateSchema(BaseModel):
    region_id: int
    name_town: str = Field(..., max_length=255)

    @field_validator("name_town")
    @classmethod
    def town_name_rules(cls, value: str) -> str:
        return validate_town_name_value(value)
