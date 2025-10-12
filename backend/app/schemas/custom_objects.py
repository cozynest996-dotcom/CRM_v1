from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import List, Optional, Dict, Any
from datetime import datetime

class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

class CustomFieldBase(CamelCaseModel):
    name: str
    field_key: str
    field_type: str
    is_required: bool = False
    default_value: Optional[str] = None
    is_searchable: bool = False
    options: Optional[List[str]] = None # For select/multiselect
    reference_entity_type_id: Optional[int] = None # For 'reference' field_type

class CustomFieldCreate(CustomFieldBase):
    entity_type_id: Optional[int] = None # Add entity_type_id for creation

class CustomFieldUpdate(CustomFieldBase):
    name: Optional[str] = None
    field_key: Optional[str] = None
    field_type: Optional[str] = None
    is_required: Optional[bool] = None
    default_value: Optional[str] = None
    is_searchable: Optional[bool] = None
    options: Optional[List[str]] = None
    reference_entity_type_id: Optional[int] = None
    entity_type_id: Optional[int] = None # Allow entity_type_id to be updated (optional) but it's usually fixed

class CustomFieldOut(CustomFieldBase):
    id: int
    entity_type_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CustomEntityTypeBase(CamelCaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None

class CustomEntityTypeCreate(CustomEntityTypeBase):
    fields: List[CustomFieldCreate] = []

class CustomEntityTypeUpdate(CustomEntityTypeBase):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    fields: Optional[List[CustomFieldUpdate]] = None

class CustomEntityTypeOut(CustomEntityTypeBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    fields: List[CustomFieldOut] = [] # Include fields

    class Config:
        from_attributes = True

class CustomEntityRecordBase(CamelCaseModel):
    entity_type_id: int
    data: Dict[str, Any]

class CustomEntityRecordCreate(CustomEntityRecordBase):
    pass

class CustomEntityRecordUpdate(CustomEntityRecordBase):
    entity_type_id: Optional[int] = None # Make entity_type_id optional for updates
    data: Optional[Dict[str, Any]] = None

class CustomEntityRecordOut(CustomEntityRecordBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
