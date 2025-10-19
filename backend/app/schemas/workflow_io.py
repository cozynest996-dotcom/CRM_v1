from pydantic import BaseModel
from typing import List, Any, Optional

class WorkflowExportSchema(BaseModel):
    name: str
    description: Optional[str] = ""
    nodes: List[Any]
    edges: List[Any]
    is_active: bool = False

class WorkflowImportSchema(BaseModel):
    name: str
    description: Optional[str] = ""
    nodes: List[Any]
    edges: List[Any]
    is_active: bool = False
