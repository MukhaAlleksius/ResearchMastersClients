from pydantic import BaseModel, Field


class PriceWorkMasterSchema(BaseModel):
    user_id: int
    work_id: int
    price: float


class PriceMaterialMasterSchema(BaseModel):
    user_id: int
    material_id: int
    unit_measurement: str = Field(..., max_length=100)
    price: float
