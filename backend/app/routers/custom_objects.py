from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func # Added for JSON_EXTRACT
from fastapi.responses import StreamingResponse
import io
import csv

from app.db.database import get_db
from app.db.models import User
from app.models.custom_objects import CustomEntityType, CustomField, CustomEntityRecord
from app.schemas.custom_objects import (
    CustomEntityTypeCreate, CustomEntityTypeUpdate, CustomEntityTypeOut,
    CustomFieldCreate, CustomFieldUpdate, CustomFieldOut,
    CustomEntityRecordCreate, CustomEntityRecordUpdate, CustomEntityRecordOut
)
from app.middleware.auth import get_current_user # Corrected import path
import json
from datetime import datetime # Added for date validation

router = APIRouter(prefix="/custom-objects", tags=["Custom Objects"])

DEFAULT_ENTITY_TYPES = [
    {
        "name": "产品 (示例)",
        "description": "用于管理产品信息。",
        "icon": "🛍️",
        "fields": [
            {"name": "产品名称", "field_key": "product_name", "field_type": "text", "is_required": True},
            {"name": "价格", "field_key": "price", "field_type": "number", "is_required": True},
            {"name": "描述", "field_key": "description", "field_type": "textarea", "is_required": False},
            {"name": "库存", "field_key": "stock", "field_type": "number", "is_required": False},
            {"name": "上架", "field_key": "available", "field_type": "boolean", "is_required": False},
        ],
    },
    {
        "name": "服务 (示例)",
        "description": "用于管理服务信息。",
        "icon": "⚙️",
        "fields": [
            {"name": "服务名称", "field_key": "service_name", "field_type": "text", "is_required": True},
            {"name": "成本", "field_key": "cost", "field_type": "number", "is_required": True},
            {"name": "服务提供者", "field_key": "provider", "field_type": "text", "is_required": False},
            {"name": "持续时间 (小时)", "field_key": "duration_hours", "field_type": "number", "is_required": False},
            {"name": "可用性", "field_key": "availability", "field_type": "select", "is_required": False, "options": ["工作日", "周末", "全天"]},
        ],
    },
]

#region Helper Function
def _validate_reference_field(db: Session, user_id: int, field_type: str, reference_entity_type_id: Optional[int]):
    if field_type == "reference":
        if not reference_entity_type_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reference field type requires reference_entity_type_id.")
        referenced_type = db.query(CustomEntityType).filter(
            CustomEntityType.id == reference_entity_type_id,
            CustomEntityType.user_id == user_id
        ).first()
        if not referenced_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Referenced entity type not found or does not belong to the user.")
    elif reference_entity_type_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Non-reference field type cannot have reference_entity_type_id.")

#endregion

#region CustomEntityType Endpoints

@router.post("/custom-entity-types/", response_model=CustomEntityTypeOut, status_code=status.HTTP_201_CREATED)
def create_custom_entity_type(
    entity_type_in: CustomEntityTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.user_id == current_user.id,
        CustomEntityType.name == entity_type_in.name
    ).first()
    if existing_entity_type:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Entity type with this name already exists for the user.")

    db_entity_type = CustomEntityType(
        **entity_type_in.model_dump(exclude={'fields'}),
        user_id=current_user.id
    )
    db.add(db_entity_type)
    db.commit()
    db.refresh(db_entity_type)

    for field_data in entity_type_in.fields:
        _validate_reference_field(db, current_user.id, field_data.field_type, field_data.reference_entity_type_id)
        db_field = CustomField(
            **field_data.model_dump(exclude_none=True),
            entity_type_id=db_entity_type.id,
            options=json.dumps(field_data.options) if field_data.options else None
        )
        db.add(db_field)
    db.commit()
    db.refresh(db_entity_type)

    # 重新加载关系以包含字段
    db.refresh(db_entity_type, attribute_names=["fields"])

    return db_entity_type

@router.get("/custom-entity-types/", response_model=List[CustomEntityTypeOut])
def get_custom_entity_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_types = db.query(CustomEntityType).filter(CustomEntityType.user_id == current_user.id).all()

    if not entity_types:
        # If no entity types exist for the user, create default ones
        for default_type_data in DEFAULT_ENTITY_TYPES:
            entity_type_create = CustomEntityTypeCreate(**default_type_data)
            
            db_entity_type = CustomEntityType(
                **entity_type_create.model_dump(exclude={'fields'}),
                user_id=current_user.id
            )
            db.add(db_entity_type)
            db.commit()
            db.refresh(db_entity_type)

            for field_data in entity_type_create.fields:
                _validate_reference_field(db, current_user.id, field_data.field_type, field_data.reference_entity_type_id)
                db_field = CustomField(
                    **field_data.model_dump(exclude_none=True),
                    entity_type_id=db_entity_type.id,
                    options=json.dumps(field_data.options) if field_data.options else None
                )
                db.add(db_field)
            db.commit()
            db.refresh(db_entity_type)
            db.refresh(db_entity_type, attribute_names=["fields"])
        
        # Re-query to get all newly created default entity types
        entity_types = db.query(CustomEntityType).filter(CustomEntityType.user_id == current_user.id).all()

    return entity_types

@router.get("/custom-entity-types/{entity_type_id}", response_model=CustomEntityTypeOut)
def get_custom_entity_type(
    entity_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.id == entity_type_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not entity_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found.")
    return entity_type

@router.put("/custom-entity-types/{entity_type_id}", response_model=CustomEntityTypeOut)
def update_custom_entity_type(
    entity_type_id: int,
    entity_type_in: CustomEntityTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.id == entity_type_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not entity_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found.")

    for field_name, value in entity_type_in.model_dump(exclude_unset=True, exclude={'fields'}).items():
        setattr(entity_type, field_name, value)
    
    # Handle nested fields update
    if entity_type_in.fields is not None:
        # Simple approach: delete all existing fields and recreate them
        # A more robust solution would involve diffing and updating existing fields
        db.query(CustomField).filter(CustomField.entity_type_id == entity_type.id).delete()
        db.flush() # Ensure deletions are processed before new insertions

        for field_data in entity_type_in.fields:
            _validate_reference_field(db, current_user.id, field_data.field_type, field_data.reference_entity_type_id)
            db_field = CustomField(
                **field_data.model_dump(exclude_none=True),
                entity_type_id=entity_type.id,
                options=json.dumps(field_data.options) if field_data.options else None
            )
            db.add(db_field)

    db.add(entity_type)
    db.commit()
    db.refresh(entity_type)
    db.refresh(entity_type, attribute_names=["fields"])
    return entity_type

@router.delete("/custom-entity-types/{entity_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_entity_type(
    entity_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.id == entity_type_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not entity_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found.")
    
    db.delete(entity_type)
    db.commit()
    return {"ok": True}

#endregion

#region CustomEntityRecord Endpoints

@router.post("/custom-entity-records/", response_model=CustomEntityRecordOut, status_code=status.HTTP_201_CREATED)
def create_custom_entity_record(
    record_in: CustomEntityRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.id == record_in.entity_type_id,
        CustomEntityType.user_id == current_user.id
    ).options(joinedload(CustomEntityType.fields)).first() # Eager load fields for validation
    if not entity_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found or does not belong to the current user.")

    # Validate data against the CustomFields of the CustomEntityType
    defined_field_keys = {field.field_key: field for field in entity_type.fields}

    # First, ensure all required fields are present and not empty
    for field_definition in entity_type.fields:
        if field_definition.is_required:
            if field_definition.field_key not in record_in.data:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Required field '{field_definition.name}' ({field_definition.field_key}) is missing.")
            
            value = record_in.data[field_definition.field_key]
            # Handle empty string for required fields (frontend often sends empty string instead of null)
            if value is None or (isinstance(value, str) and value.strip() == ""):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Required field '{field_definition.name}' ({field_definition.field_key}) cannot be empty.")

    for field_key, value in record_in.data.items():
        custom_field = defined_field_keys.get(field_key)
        if not custom_field:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' is not defined for this entity type.")
        
        # Validate data types and specific field logic
        if custom_field.field_type == "text" or custom_field.field_type == "textarea" or custom_field.field_type == "image_url":
            if not isinstance(value, str):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a string value.")
        elif custom_field.field_type == "number":
            if not isinstance(value, (int, float)):
                try:
                    # Attempt conversion for flexibility
                    record_in.data[field_key] = float(value) if isinstance(value, str) and '.' in value else int(value)
                except (ValueError, TypeError):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a number value.")
        elif custom_field.field_type == "boolean":
            if not isinstance(value, bool):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a boolean value (true/false).")
        elif custom_field.field_type == "date":
            if not isinstance(value, str):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a date string (YYYY-MM-DD).")
            try:
                datetime.strptime(value, "%Y-%m-%d") # Simple date format validation
            except ValueError:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' has an invalid date format. Expected YYYY-MM-DD.")
        elif custom_field.field_type == "select":
            options_list = json.loads(custom_field.options) if custom_field.options else []
            if not isinstance(value, str) or value not in options_list:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' value '{value}' is not a valid option. Valid options are: {', '.join(options_list)}.")
        elif custom_field.field_type == "multiselect":
            options_list = json.loads(custom_field.options) if custom_field.options else []
            if not isinstance(value, list) or not all(isinstance(item, str) and item in options_list for item in value):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a list of valid options. Valid options are: {', '.join(options_list)}.")
        elif custom_field.field_type == "reference":
            if not isinstance(value, int):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reference field '{field_key}' must be an integer (ID of the referenced record).")
            referenced_entity_type_id = custom_field.reference_entity_type_id
            if not referenced_entity_type_id:
                 raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reference field '{field_key}' is missing reference_entity_type_id in its definition.")

            referenced_record = db.query(CustomEntityRecord).filter(
                CustomEntityRecord.id == value,
                CustomEntityRecord.entity_type_id == referenced_entity_type_id,
                CustomEntityRecord.user_id == current_user.id
            ).first()
            if not referenced_record:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Referenced record with ID {value} not found for entity type with ID {referenced_entity_type_id}.")

    db_record = CustomEntityRecord(
        user_id=current_user.id,
        entity_type_id=record_in.entity_type_id,
        data=json.dumps(record_in.data)
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record

@router.get("/custom-entity-records/", response_model=List[CustomEntityRecordOut])
def get_custom_entity_records(
    entity_type_id: Optional[int] = None,
    filter_by_parent_field_key: Optional[str] = None,
    filter_by_parent_record_id: Optional[int] = None,
    search_query: Optional[str] = Query(None, description="Search query for records data."),
    sort_by: Optional[str] = Query(None, description="Field key to sort records by."),
    sort_order: Optional[str] = Query("asc", regex="^(asc|desc)$", description="Sort order: 'asc' or 'desc'."),
    include_related: bool = Query(False, description="Include related referenced records in the response."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(CustomEntityRecord).filter(CustomEntityRecord.user_id == current_user.id)

    if entity_type_id:
        query = query.filter(CustomEntityRecord.entity_type_id == entity_type_id)

    if filter_by_parent_field_key and filter_by_parent_record_id:
        # Find the CustomField that references the parent
        parent_ref_field = db.query(CustomField).filter(
            CustomField.entity_type_id == entity_type_id,
            CustomField.field_key == filter_by_parent_field_key,
            CustomField.field_type == "reference"
        ).first()
        if not parent_ref_field:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reference field '{filter_by_parent_field_key}' not found for this entity type.")
        
        # Filter records where the data JSON contains the parent reference
        # For SQLite, we can use JSON_EXTRACT to query inside the JSON string
        query = query.filter(func.json_extract(CustomEntityRecord.data, f'$.{filter_by_parent_field_key}') == filter_by_parent_record_id)
    
    # Implement general search query
    if search_query:
        search_pattern = f"%{search_query.lower()}%"
        # Search across all values in the JSON data field
        query = query.filter(func.lower(CustomEntityRecord.data).like(search_pattern))

    # Implement sorting
    if sort_by:
        # Ensure the field exists for the entity type to avoid errors or unexpected behavior
        entity_type = db.query(CustomEntityType).filter(
            CustomEntityType.id == entity_type_id,
            CustomEntityType.user_id == current_user.id
        ).first()
        if not entity_type:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found or does not belong to the current user.")

        sort_field = db.query(CustomField).filter(
            CustomField.entity_type_id == entity_type_id,
            CustomField.field_key == sort_by
        ).first()

        if not sort_field:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Sort field '{sort_by}' not found for this entity type.")

        # Extract the field value from JSON data for sorting
        sort_expression = func.json_extract(CustomEntityRecord.data, f'$.{sort_by}')
        if sort_order == "desc":
            query = query.order_by(sort_expression.desc())
        else:
            query = query.order_by(sort_expression.asc())

    records = query.all()
    
    # Optionally include related data
    if include_related:
        for record in records:
            record_data = json.loads(record.data)
            for field_key, value in record_data.items():
                custom_field = db.query(CustomField).filter(
                    CustomField.entity_type_id == record.entity_type_id,
                    CustomField.field_key == field_key
                ).first()
                
                if custom_field and custom_field.field_type == "reference" and isinstance(value, int):
                    referenced_record = db.query(CustomEntityRecord).filter(
                        CustomEntityRecord.id == value,
                        CustomEntityRecord.entity_type_id == custom_field.reference_entity_type_id
                    ).first()
                    if referenced_record:
                        # Replace the ID with the full referenced record data (parsed JSON)
                        record_data[field_key] = CustomEntityRecordOut.model_validate(referenced_record).model_dump()
                        record_data[field_key]['data'] = json.loads(referenced_record.data) # Ensure nested data is also parsed
            record.data = record_data # Update record.data with expanded data

    for record in records:
        # record.data = json.loads(record.data) # Removed this line
        pass # Keep this if any other logic is needed for each record in the loop
    return records

@router.get("/custom-entity-records/export-csv/", response_class=StreamingResponse)
def export_custom_entity_records_to_csv(
    entity_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.id == entity_type_id,
        CustomEntityType.user_id == current_user.id
    ).options(joinedload(CustomEntityType.fields)).first()
    if not entity_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found or does not belong to the current user.")

    records = db.query(CustomEntityRecord).filter(
        CustomEntityRecord.entity_type_id == entity_type_id,
        CustomEntityRecord.user_id == current_user.id
    ).all()

    # Dynamically generate headers from CustomFields
    field_names = [field.name for field in entity_type.fields]
    field_keys = [field.field_key for field in entity_type.fields]

    # Include 'id' and 'created_at', 'updated_at' from the record itself
    headers = ["id", "created_at", "updated_at"] + field_names

    def generate():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(headers)

        for record in records:
            row = [
                record.id,
                record.created_at.isoformat() if record.created_at else "",
                record.updated_at.isoformat() if record.updated_at else "",
            ]
            record_data = json.loads(record.data)
            for key in field_keys:
                row.append(record_data.get(key, ""))
            writer.writerow(row)
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    return StreamingResponse(generate(), headers={
        "Content-Disposition": f"attachment; filename={entity_type.name.lower()}_records.csv"
    })

@router.get("/custom-entity-records/{record_id}", response_model=CustomEntityRecordOut)
def get_custom_entity_record(
    record_id: int,
    include_related: bool = Query(False, description="Include related referenced records in the response."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    record = db.query(CustomEntityRecord).filter(
        CustomEntityRecord.id == record_id,
        CustomEntityRecord.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity record not found.")
    
    record_data = json.loads(record.data)

    if include_related:
        for field_key, value in record_data.items():
            custom_field = db.query(CustomField).filter(
                CustomField.entity_type_id == record.entity_type_id,
                CustomField.field_key == field_key
            ).first()
            
            if custom_field and custom_field.field_type == "reference" and isinstance(value, int):
                referenced_record = db.query(CustomEntityRecord).filter(
                    CustomEntityRecord.id == value,
                    CustomEntityRecord.entity_type_id == custom_field.reference_entity_type_id
                ).first()
                if not referenced_record:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Referenced record with ID {value} not found for entity type {custom_field.referenced_entity_type.name}.")
            
            # TODO: Add more robust type validation for other field types based on custom_field.field_type
            existing_data[field_key] = value
        record.data = json.dumps(existing_data)

    db.add(record)
    db.commit()
    db.refresh(record)
    record.data = json.loads(record.data) # For Pydantic response
    return record

@router.put("/custom-entity-records/{record_id}", response_model=CustomEntityRecordOut)
def update_custom_entity_record(
    record_id: int,
    record_in: CustomEntityRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    record = db.query(CustomEntityRecord).filter(
        CustomEntityRecord.id == record_id,
        CustomEntityRecord.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity record not found.")

    update_data = record_in.model_dump(exclude_unset=True)
    
    if "entity_type_id" in update_data and update_data["entity_type_id"] != record.entity_type_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change entity_type_id of an existing record.")

    if "data" in update_data and update_data["data"] is not None:
        entity_type = db.query(CustomEntityType).filter(
            CustomEntityType.id == record.entity_type_id,
            CustomEntityType.user_id == current_user.id
        ).options(joinedload(CustomEntityType.fields)).first() # Eager load fields for validation
        if not entity_type:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found or does not belong to the current user.")
        
        defined_field_keys = {field.field_key: field for field in entity_type.fields}
        # print("Backend DEBUG: Defined field keys for entity type", record.entity_type_id, ":", defined_field_keys.keys())
        # print("Backend DEBUG: Incoming update_data['data'] for record", record.id, ":", update_data["data"])

        existing_data = json.loads(record.data) if isinstance(record.data, str) else record.data
        
        # Filter incoming data to only include fields defined for this entity type
        filtered_incoming_data = {
            k: v for k, v in update_data["data"].items() if k in defined_field_keys
        }
        
        # Merge incoming data with existing data
        for field_key, value in filtered_incoming_data.items():
            custom_field = defined_field_keys.get(field_key)
            # The check for 'if not custom_field' is no longer strictly needed here
            # because filtered_incoming_data ensures only defined fields are processed.
            
            # Validate data types and specific field logic
            if custom_field.is_required and (value is None or (isinstance(value, str) and value.strip() == "")):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Required field '{custom_field.name}' ({field_key}) cannot be empty.")

            if custom_field.field_type == "text" or custom_field.field_type == "textarea" or custom_field.field_type == "image_url":
                if not isinstance(value, str):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a string value.")
            elif custom_field.field_type == "number":
                if not isinstance(value, (int, float)):
                    try:
                        # Update the value in filtered_incoming_data for consistent type in existing_data merge
                        filtered_incoming_data[field_key] = float(value) if isinstance(value, str) and '.' in value else int(value)
                    except (ValueError, TypeError):
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a number value.")
            elif custom_field.field_type == "boolean":
                if not isinstance(value, bool):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a boolean value (true/false).")
            elif custom_field.field_type == "date":
                if not isinstance(value, str):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a date string (YYYY-MM-DD).")
                try:
                    datetime.strptime(value, "%Y-%m-%d")
                except ValueError:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' has an invalid date format. Expected YYYY-MM-DD.")
            elif custom_field.field_type == "select":
                options_list = json.loads(custom_field.options) if custom_field.options else []
                if not isinstance(value, str) or value not in options_list:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' value '{value}' is not a valid option. Valid options are: {', '.join(options_list)}.")
            elif custom_field.field_type == "multiselect":
                options_list = json.loads(custom_field.options) if custom_field.options else []
                if not isinstance(value, list) or not all(isinstance(item, str) and item in options_list for item in value):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field_key}' expects a list of valid options. Valid options are: {', '.join(options_list)}.")
            elif custom_field.field_type == "reference":
                if not isinstance(value, int):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reference field '{field_key}' must be an integer (ID of the referenced record).")
                referenced_entity_type_id = custom_field.reference_entity_type_id
                if not referenced_entity_type_id:
                     raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reference field '{field_key}' is missing reference_entity_type_id in its definition.")

                referenced_record = db.query(CustomEntityRecord).filter(
                    CustomEntityRecord.id == value,
                    CustomEntityRecord.entity_type_id == referenced_entity_type_id,
                    CustomEntityRecord.user_id == current_user.id
                ).first()
                if not referenced_record:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Referenced record with ID {value} not found for entity type with ID {referenced_entity_type_id}.")

            existing_data[field_key] = filtered_incoming_data[field_key] if custom_field.field_type == "number" else value
        
        # Remove any fields from existing_data that are no longer defined for the entity type
        keys_to_remove = [k for k in existing_data.keys() if k not in defined_field_keys]
        for k in keys_to_remove:
            del existing_data[k]
            
        record.data = json.dumps(existing_data)

    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@router.delete("/custom-entity-records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_entity_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    record = db.query(CustomEntityRecord).filter(
        CustomEntityRecord.id == record_id,
        CustomEntityRecord.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity record not found.")
    
    db.delete(record)
    db.commit()
    return {"ok": True}

#endregion

#region CustomField Endpoints

@router.post("/custom-fields/", response_model=CustomFieldOut, status_code=status.HTTP_201_CREATED)
def create_custom_field(
    field_in: CustomFieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.id == field_in.entity_type_id, # This is the line that caused the AttributeError
        CustomEntityType.user_id == current_user.id
    ).first()
    if not entity_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found or does not belong to the current user.")

    _validate_reference_field(db, current_user.id, field_in.field_type, field_in.reference_entity_type_id)

    db_field = CustomField(
        **field_in.model_dump(exclude={"entity_type_id"}, exclude_none=True),
        entity_type_id=field_in.entity_type_id,
        options=json.dumps(field_in.options) if field_in.options else None
    )
    db.add(db_field)
    db.commit()
    db.refresh(db_field)
    return db_field

@router.get("/custom-fields/", response_model=List[CustomFieldOut])
def get_custom_fields(
    entity_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_type = db.query(CustomEntityType).filter(
        CustomEntityType.id == entity_type_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not entity_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom entity type not found.")
    
    return db.query(CustomField).filter(CustomField.entity_type_id == entity_type_id).all()

@router.get("/custom-fields/{field_id}", response_model=CustomFieldOut)
def get_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    field = db.query(CustomField).join(CustomEntityType).filter(
        CustomField.id == field_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found or does not belong to the current user.")
    return field

@router.put("/custom-fields/{field_id}", response_model=CustomFieldOut)
def update_custom_field(
    field_id: int,
    field_in: CustomFieldUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    field = db.query(CustomField).join(CustomEntityType).filter(
        CustomField.id == field_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found or does not belong to the current user.")

    update_data = field_in.model_dump(exclude_unset=True)
    
    if "entity_type_id" in update_data and update_data["entity_type_id"] != field.entity_type_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change entity_type_id of an existing field.")

    if "field_type" in update_data and update_data["field_type"] == "reference":
        if "reference_entity_type_id" not in update_data or update_data["reference_entity_type_id"] is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reference field type requires reference_entity_type_id.")
        _validate_reference_field(db, current_user.id, update_data["field_type"], update_data["reference_entity_type_id"])
    elif "reference_entity_type_id" in update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Non-reference field type cannot have reference_entity_type_id.")

    for field_name, value in update_data.items():
        setattr(field, field_name, value)
    
    field.options = json.dumps(field_in.options) if field_in.options else None

    db.add(field)
    db.commit()
    db.refresh(field)
    return field

@router.delete("/custom-fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    field = db.query(CustomField).join(CustomEntityType).filter(
        CustomField.id == field_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found or does not belong to the current user.")
    
    db.delete(field)
    db.commit()
    return {"ok": True}

#endregion
