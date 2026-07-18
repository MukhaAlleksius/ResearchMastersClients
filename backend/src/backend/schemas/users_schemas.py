from datetime import datetime
from typing import Dict, List, Optional
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class UserBaseSchema(BaseModel):
    first_name: str = Field(..., max_length=100)
    last_name: str = Field(..., max_length=100)
    country: str = Field(...)
    region: str = Field(...)
    town: str = Field(...)
    email: str = Field(..., max_length=255)
    created_at: datetime = Field(
        default_factory=datetime.now, description="Дата регистрации"
    )

    model_config = ConfigDict(from_attributes=True)


class UserSchema(UserBaseSchema):
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
        validation_alias=AliasChoices("password", "password_hash"),
    )


class UserReadSchema(UserBaseSchema):
    is_verified: bool
    is_active: bool
    last_login: datetime = Field(
        default_factory=datetime.now, description="Дата последнего входа в систему"
    )


# Общие настройки для профиля пользователя
class UserCommonReadSchema(BaseModel):
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    region: Optional[str] = Field(None, max_length=100)
    town: Optional[str] = Field(None, max_length=100)


class UserCommonSchema(UserCommonReadSchema):
    user_id: int


class BusinessFormSchema(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


# предоставляет на фронтенд данне о бизнесе пользователя
class UserBusinessReadSchema(BaseModel):
    business_form_name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None)
    registration_number: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=100)


class UserBusinessSchema(UserBusinessReadSchema):
    user_id: int


class UserProfileSchema(BaseModel):
    user_id: int
    avatar_url: str = Field(None, max_length=500)
    bio: Optional[str]
    short_review_master: Optional[str]
    operating_mode: str = Field(None, max_length=100)


# Контакты пользователя
class UserContactReadSchema(BaseModel):
    contact_id: Optional[int] = Field(None)
    name_contact: str = Field(..., max_length=100)
    contact: str = Field(..., max_length=100)


class UserContactSchema(UserContactReadSchema):
    user_id: int


class UserScillSchema(BaseModel):
    user_id: int
    scill_name: str = Field(..., max_length=100)
    experience_level: str = Field(..., max_length=20)


class PortfolioItemReadSchema(BaseModel):
    portfolio_item_id: Optional[int] = Field(None)
    title: str = Field(..., max_length=200)
    description: Optional[str]
    category_work: Optional[str] = Field(None)
    created_at: datetime = Field(
        default_factory=datetime.now, description="Дата создания портфолио"
    )

    model_config = ConfigDict(from_attributes=True)


class PortfolioItemSchema(PortfolioItemReadSchema):
    user_id: int
    category_id: int


class PortfolioImageSchema(BaseModel):
    portfolio_item_id: int
    image_url: str = Field(None, max_length=500)


class GeographyExecuteOrderReadSchema(BaseModel):
    country: str = Field(..., max_length=100)
    region: str = Field(..., max_length=100)
    town: str = Field(..., max_length=100)


class GeographyExecuteOrderSchema(GeographyExecuteOrderReadSchema):
    user_id: int


# Схемы для входа пользователя в приложение
class UserLogin(BaseModel):
    email: str
    password: str = Field(
        ...,
        min_length=1,
        max_length=128,
        validation_alias=AliasChoices("password", "password_hash"),
    )


class GoogleRegisterSchema(BaseModel):
    id_token: str
    country: str = Field(..., max_length=100)
    region: str = Field(..., max_length=100)
    town: str = Field(..., max_length=100)


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    role: str = "user"


class CurrentUserAccessSchema(BaseModel):
    user_id: int
    role: str = "user"


# Валидатор для предоставления информации на фронтенде в настройках пользователя
class UserProfileReadSchema(BaseModel):
    id: int
    first_name: Optional[str] = Field("", max_length=100)
    last_name: Optional[str] = Field("", max_length=100)
    country: Optional[str] = Field("", max_length=100)
    region: Optional[str] = Field("", max_length=100)
    town: Optional[str] = Field("", max_length=100)
    bio: Optional[str] = Field(None)
    short_review_master: Optional[str] = Field(None)
    operating_mode: Optional[str] = Field(None, max_length=100)


class UserProfileForCardSchema(UserProfileReadSchema):
    avatar_url: Optional[str] = Field(None)


class Town(BaseModel):
    town_id: int
    name_town: str


class Region(BaseModel):
    name_region: str
    towns: List[Town]


class Country(BaseModel):
    name_country: str
    regions: Dict[str, Region]


class GeographySchema(BaseModel):
    countries: Dict[str, Country]


class UserCardForAdminSchema(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    town: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None
    blocked: Optional[bool] = None
    is_active: Optional[bool] = None


class UserProfileForAdminSchema(UserCardForAdminSchema):
    email: Optional[str] = None
    role: Optional[str] = None
    is_verified: Optional[bool] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None
    last_login: Optional[str] = None
    name_business_form: Optional[str] = None
    registration_number: Optional[str] = None
    name_business: Optional[str] = None
    location: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    short_review_master: Optional[str] = None
    operating_mode: Optional[str] = None
    # mark_rating: Optional[str] = None
