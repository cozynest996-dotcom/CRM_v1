
from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, field_serializer

class KnowledgeBaseBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    content: str
    tags: List[str] = []
    is_active: bool = True

class KnowledgeBaseCreate(KnowledgeBaseBase):
    pass

class KnowledgeBaseUpdate(KnowledgeBaseBase):
    name: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None

class KnowledgeBaseOut(KnowledgeBaseBase):
    id: UUID
    user_id: int
    created_at: datetime
    updated_at: datetime

    @field_serializer('id')
    def serialize_id(self, id: UUID) -> str:
        return str(id)

    class Config:
        from_attributes = True
