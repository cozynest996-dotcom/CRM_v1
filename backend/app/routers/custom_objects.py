from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func # Added for JSON_EXTRACT
from fastapi.responses import StreamingResponse
import io
import csv

from app.db.database import get_db
from app.db.models import CustomEntityType, CustomField, CustomEntityRecord, User
from app.schemas.custom_objects import (
    CustomEntityTypeCreate, CustomEntityTypeUpdate, CustomEntityTypeOut,
    CustomFieldCreate, CustomFieldUpdate, CustomFieldOut,
    CustomEntityRecordCreate, CustomEntityRecordUpdate, CustomEntityRecordOut
)
from app.middleware.auth import get_current_user # Corrected import path
import json
from datetime import datetime # Added for date validation

router = APIRouter(tags=["Custom Objects"])

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

@router.post("/custom-objects/custom-entity-types", response_model=CustomEntityTypeOut, status_code=status.HTTP_201_CREATED)
@router.post("/custom-objects/custom-entity-types/", response_model=CustomEntityTypeOut, status_code=status.HTTP_201_CREATED, include_in_schema=False) # Allow trailing slash
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
    # db.refresh(db_entity_type, attribute_names=["fields"]) # Removed: as it causes InvalidRequestError for relationships

    return db_entity_type

@router.get("/custom-objects/custom-entity-types", response_model=List[CustomEntityTypeOut])
@router.get("/custom-objects/custom-entity-types/", response_model=List[CustomEntityTypeOut], include_in_schema=False) # Allow trailing slash
def get_custom_entity_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entity_types = db.query(CustomEntityType).filter(CustomEntityType.user_id == current_user.id).all()
    return entity_types

@router.get("/custom-objects/custom-entity-types/{entity_type_id}", response_model=CustomEntityTypeOut)
@router.get("/custom-objects/custom-entity-types/{entity_type_id}/", response_model=CustomEntityTypeOut, include_in_schema=False) # Allow trailing slash
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

@router.put("/custom-objects/custom-entity-types/{entity_type_id}", response_model=CustomEntityTypeOut)
@router.put("/custom-objects/custom-entity-types/{entity_type_id}/", response_model=CustomEntityTypeOut, include_in_schema=False) # Allow trailing slash
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
    return entity_type

@router.delete("/custom-objects/custom-entity-types/{entity_type_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/custom-objects/custom-entity-types/{entity_type_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False) # Allow trailing slash
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

@router.post("/custom-objects/custom-entity-records", response_model=CustomEntityRecordOut, status_code=status.HTTP_201_CREATED)
@router.post("/custom-objects/custom-entity-records/", response_model=CustomEntityRecordOut, status_code=status.HTTP_201_CREATED, include_in_schema=False) # Allow trailing slash
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
        entity_type_id=record_in.entity_type_id,
        user_id=current_user.id,
        data=json.dumps(record_in.data) # Store as JSON string
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    # After creation, load data from the record for further processing (e.g., validation)
    db_record.data = json.loads(db_record.data) if isinstance(db_record.data, str) and db_record.data else db_record.data or {}
    # Return a validated Pydantic model to ensure response types match
    out_payload = {
        "id": db_record.id,
        "entity_type_id": db_record.entity_type_id,
        "user_id": db_record.user_id,
        "data": db_record.data,
        "created_at": db_record.created_at,
        "updated_at": db_record.updated_at,
    }
    return CustomEntityRecordOut.model_validate(out_payload)

@router.get("/custom-objects/custom-entity-records", response_model=List[CustomEntityRecordOut])
@router.get("/custom-objects/custom-entity-records/", response_model=List[CustomEntityRecordOut], include_in_schema=False) # Allow trailing slash
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
    
    # Normalize `record.data` for all records so Pydantic response validation receives a dict
    for record in records:
        data_value = record.data
        if isinstance(data_value, str):
            try:
                parsed = json.loads(data_value)
                # Handle double-encoded JSON strings
                if isinstance(parsed, str):
                    try:
                        parsed2 = json.loads(parsed)
                        record.data = parsed2 if isinstance(parsed2, dict) else {}
                    except Exception:
                        record.data = parsed if isinstance(parsed, dict) else {}
                elif isinstance(parsed, dict):
                    record.data = parsed
                else:
                    record.data = {}
            except Exception:
                record.data = {}
        elif data_value is None:
            record.data = {}
        elif not isinstance(data_value, dict):
            try:
                record.data = dict(data_value)
            except Exception:
                record.data = {}

    return records

@router.get("/custom-objects/{entity_type_id}/records", response_model=List[CustomEntityRecordOut])
@router.get("/custom-objects/{entity_type_id}/records/", response_model=List[CustomEntityRecordOut], include_in_schema=False) # Allow trailing slash
def get_custom_entity_records_by_entity_type(
    entity_type_id: int,
    search_query: Optional[str] = Query(None, description="Search query for records data."),
    sort_by: Optional[str] = Query(None, description="Field key to sort records by."),
    sort_order: Optional[str] = Query("asc", regex="^(asc|desc)$", description="Sort order: 'asc' or 'desc'."),
    include_related: bool = Query(False, description="Include related referenced records in the response."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(CustomEntityRecord).filter(
        CustomEntityRecord.user_id == current_user.id,
        CustomEntityRecord.entity_type_id == entity_type_id
    )

    if search_query:
        search_pattern = f"%{search_query.lower()}%"
        query = query.filter(func.lower(CustomEntityRecord.data).like(search_pattern))

    if sort_by:
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

        sort_expression = func.json_extract(CustomEntityRecord.data, f'$.{sort_by}')
        if sort_order == "desc":
            query = query.order_by(sort_expression.desc())
        else:
            query = query.order_by(sort_expression.asc())

    records = query.all()
    
    for record in records:
        data_value = record.data
        if isinstance(data_value, str):
            try:
                parsed = json.loads(data_value)
                if isinstance(parsed, str):
                    try:
                        parsed2 = json.loads(parsed)
                        record.data = parsed2 if isinstance(parsed2, dict) else {}
                    except Exception:
                        record.data = parsed if isinstance(parsed, dict) else {}
                elif isinstance(parsed, dict):
                    record.data = parsed
                else:
                    record.data = {}
            except Exception:
                record.data = {}
        elif data_value is None:
            record.data = {}
        elif not isinstance(data_value, dict):
            try:
                record.data = dict(data_value)
            except Exception:
                record.data = {}

    return records

@router.get("/custom-objects/custom-entity-records/export-csv", response_class=StreamingResponse)
@router.get("/custom-objects/custom-entity-records/export-csv/", response_class=StreamingResponse, include_in_schema=False) # Allow trailing slash
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

@router.get("/custom-objects/custom-entity-records/{record_id}", response_model=CustomEntityRecordOut)
@router.get("/custom-objects/custom-entity-records/{record_id}/", response_model=CustomEntityRecordOut, include_in_schema=False) # Allow trailing slash
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
            existing_data = json.loads(record.data) if record.data else {}
            existing_data[field_key] = value
        record.data = json.dumps(existing_data)

    db.add(record)
    db.commit()
    db.refresh(record)
    record.data = json.loads(record.data) # For Pydantic response
    return record

@router.put("/custom-objects/custom-entity-records/{record_id}", response_model=CustomEntityRecordOut)
@router.put("/custom-objects/custom-entity-records/{record_id}/", response_model=CustomEntityRecordOut, include_in_schema=False) # Allow trailing slash
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

    try:
        update_data = record_in.model_dump(exclude_unset=True)
        if "data" in update_data and update_data["data"] is not None:
            # Robustly parse existing record.data (handle string, double-encoded JSON, None)
            existing_raw = record.data
            current_data = {}
            if existing_raw:
                if isinstance(existing_raw, str):
                    try:
                        parsed = json.loads(existing_raw)
                        # Handle double-encoded JSON where parsed is still a string
                        if isinstance(parsed, str):
                            try:
                                parsed2 = json.loads(parsed)
                                current_data = parsed2 if isinstance(parsed2, dict) else {}
                            except Exception:
                                current_data = {}
                        elif isinstance(parsed, dict):
                            current_data = parsed
                        else:
                            current_data = {}
                    except Exception:
                        current_data = {}
                elif isinstance(existing_raw, dict):
                    current_data = existing_raw
                else:
                    try:
                        current_data = dict(existing_raw)
                    except Exception:
                        current_data = {}

            # Normalize incoming update payload to dict (handle string/double-encoded)
            incoming_update_data = update_data["data"]
            if isinstance(incoming_update_data, str):
                try:
                    incoming_update_data = json.loads(incoming_update_data)
                    if isinstance(incoming_update_data, str):
                        try:
                            incoming_update_data = json.loads(incoming_update_data)
                        except Exception:
                            incoming_update_data = {}
                except Exception:
                    incoming_update_data = {}
            if not isinstance(incoming_update_data, dict):
                incoming_update_data = {}

            current_data.update(incoming_update_data)
            record.data = json.dumps(current_data)

        for key, value in update_data.items():
            if key != "data": # data is handled separately
                setattr(record, key, value)

        db.add(record)
        db.commit()
        db.refresh(record)
        # After refresh, ensure record.data is a dict for Pydantic validation
        data_dict = json.loads(record.data) if isinstance(record.data, str) and record.data else record.data or {}
        out_payload = {
            "id": record.id,
            "entity_type_id": record.entity_type_id,
            "user_id": record.user_id,
            "data": data_dict,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        }
        return CustomEntityRecordOut.model_validate(out_payload)
    except Exception as e:
        # Log the full traceback for debugging
        print(f"Error updating custom entity record: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update custom entity record: {e}")

@router.delete("/custom-objects/custom-entity-records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/custom-objects/custom-entity-records/{record_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False) # Allow trailing slash
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

@router.post("/custom-objects/custom-fields", response_model=CustomFieldOut, status_code=status.HTTP_201_CREATED)
@router.post("/custom-objects/custom-fields/", response_model=CustomFieldOut, status_code=status.HTTP_201_CREATED, include_in_schema=False) # Allow trailing slash
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
        name=field_in.name,
        field_key=field_in.field_key,
        field_type=field_in.field_type,
        is_required=field_in.is_required,
        default_value=field_in.default_value,
        is_searchable=field_in.is_searchable,
        options=json.dumps(field_in.options) if field_in.options else None,
        reference_entity_type_id=field_in.reference_entity_type_id,
        entity_type_id=field_in.entity_type_id
    )
    db.add(db_field)
    db.commit()
    db.refresh(db_field)
    return db_field

@router.get("/custom-objects/custom-fields", response_model=List[CustomFieldOut])
@router.get("/custom-objects/custom-fields/", response_model=List[CustomFieldOut], include_in_schema=False) # Allow trailing slash
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

@router.get("/custom-objects/custom-fields/{field_id}", response_model=CustomFieldOut)
@router.get("/custom-objects/custom-fields/{field_id}/", response_model=CustomFieldOut, include_in_schema=False) # Allow trailing slash
def get_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    field = db.query(CustomField).join(CustomEntityType, CustomField.entity_type_id == CustomEntityType.id).filter(
        CustomField.id == field_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found or does not belong to the current user.")
    return field

@router.put("/custom-objects/custom-fields/{field_id}", response_model=CustomFieldOut)
@router.put("/custom-objects/custom-fields/{field_id}/", response_model=CustomFieldOut, include_in_schema=False) # Allow trailing slash
def update_custom_field(
    field_id: int,
    field_in: CustomFieldUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    field = db.query(CustomField).join(CustomEntityType, CustomField.entity_type_id == CustomEntityType.id).filter(
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

@router.delete("/custom-objects/custom-fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/custom-objects/custom-fields/{field_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False) # Allow trailing slash
def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    field = db.query(CustomField).join(CustomEntityType, CustomField.entity_type_id == CustomEntityType.id).filter(
        CustomField.id == field_id,
        CustomEntityType.user_id == current_user.id
    ).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found or does not belong to the current user.")
    
    db.delete(field)
    db.commit()
    return {"ok": True}

#endregion
