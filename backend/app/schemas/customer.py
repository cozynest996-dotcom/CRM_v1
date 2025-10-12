from pydantic import BaseModel

class CustomerBase(BaseModel):
    name: str
    phone: str
    photo_url: str | None = None

class CustomerOut(CustomerBase):
    id: int
    status: str

    class Config:
        from_attributes = True   # Pydantic v2 写法
