from pydantic import BaseModel, UUID4
from datetime import datetime
from typing import Optional
from uuid import UUID

class MessageBase(BaseModel):
    content: str

class MessageCreate(MessageBase):
    customer_id: str  # 支持UUID字符串

class MessageOut(MessageBase):
    id: str  # UUID string
    customer_id: str  # 支持UUID字符串
    direction: str
    timestamp: Optional[datetime]
    ack: Optional[int] = 0  # 添加消息状态

    class Config:
        from_attributes = True   # 代替 orm_mode
        # Allow arbitrary types for serialization by Pydantic
        arbitrary_types_allowed = True
        json_encoders = {
            UUID: str
        }
