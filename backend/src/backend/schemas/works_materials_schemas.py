from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CategoryWorkSchema(BaseModel):
    category_work_id: Optional[int] = Field(None)
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None)
    icon_name: Optional[str] = Field(None, max_length=500)
    icon_color: Optional[str] = Field(None)
    access_users: Optional[bool] = None
    slug: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WorkReadSchema(BaseModel):
    work_id: Optional[int] = Field(None)
    name_work: str
    unit_measurement: str = Field(..., max_length=100)
    cost: float
    currency: Optional[str] = None
    category_work: Optional[str] = None


class WorkSchema(WorkReadSchema):
    user_id: int
    category_work_id: Optional[int] = None


class MaterialSchema(BaseModel):
    user_id: int
    name_material: str = Field(..., max_length=255)
    unit_measurement: str = Field(..., max_length=100)


class CategoryWorkMasterSchema(BaseModel):
    category_work_master_id: Optional[int] = Field(None)
    master_id: int
    category_work_id: int
    description: Optional[str] = Field(None)
    experience: float
    cost_hour: float

    model_config = ConfigDict(from_attributes=True)


class CategoryWorkMasterReadSchema(CategoryWorkSchema):
    category_work_master_id: Optional[int] = Field(None)
    description_master: Optional[str] = Field(None)
    experience: float
    cost_hour: float


class WorkMasterFromAdminReadSchema(BaseModel):
    work_master_from_admin_id: Optional[int] = Field(None)
    work_id: int
    name_work: str
    unit_measurement: str = Field(..., max_length=100)
    cost: float
    currency: Optional[str] = None


class WorkMasterFromAdminSchema(BaseModel):
    master_id: int
    work_id: int
    cost: Optional[float] = None
    currency: Optional[str] = None


class WorkMasterFromAdminUpdateSchema(BaseModel):
    work_master_from_admin_id: int
    master_id: int
    cost: float
    currency: Optional[str] = None


class WorkMasterMyselfReadSchema(BaseModel):
    work_master_myself_id: Optional[int] = Field(None)
    name_work: str
    unit_measurement: str = Field(..., max_length=100)
    cost: float
    currency: Optional[str] = None


class WorkMasterMyselfSchema(WorkMasterMyselfReadSchema):
    master_id: int
    category_work_id: int
