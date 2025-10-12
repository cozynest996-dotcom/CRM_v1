from pydantic import BaseModel
from typing import Dict, Any, Optional
from datetime import datetime # Import datetime

class TableBase(BaseModel):
    name: str
    description: Optional[str] = None
    fields: Dict[str, str] = {}   # e.g. {"name": "string", "phone": "string"}

class TableOut(TableBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None # Make updated_at optional

    class Config:
        from_attributes = True


class RecordBase(BaseModel):
    table_id: int
    data: Dict[str, Any]   # 动态数据

class RecordOut(RecordBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None # Make updated_at optional

    class Config:
        from_attributes = True
