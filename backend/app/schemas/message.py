from pydantic import BaseModel, UUID4
from datetime import datetime
from typing import Optional
from uuid import UUID

class MessageBase(BaseModel):
    content: str

class MessageCreate(MessageBase):
    customer_id: str  # 支持UUID字符串
    channel: Optional[str] = "whatsapp" # 新增：指定消息发送渠道，默认为whatsapp
    media_base64: Optional[str] = None # 新增：媒体文件的Base64编码数据
    media_type: Optional[str] = None # 新增：媒体类型 (e.g., "audio/ogg")

class MessageOut(MessageBase):
    id: str  # UUID string
    customer_id: str  # 支持UUID字符串
    direction: str
    channel: Optional[str] # 新增：消息渠道
    timestamp: Optional[datetime]
    ack: Optional[int] = 0  # 添加消息状态
    media_type: Optional[str] = None # 新增：媒体类型
    transcription: Optional[str] = None # 新增：语音转文本结果

    class Config:
        from_attributes = True   # 代替 orm_mode
        # Allow arbitrary types for serialization by Pydantic
        arbitrary_types_allowed = True
        json_encoders = {
            UUID: str
        }
