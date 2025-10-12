from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
from sqlalchemy.dialects import postgresql # Import postgresql

class CustomEntityType(Base):
    __tablename__ = "custom_entity_types"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True) # Add icon field
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    fields = relationship("CustomField", back_populates="custom_entity_type", cascade="all, delete-orphan")

class CustomField(Base):
    __tablename__ = "custom_fields"

    id = Column(Integer, primary_key=True, index=True)
    entity_type_id = Column(Integer, ForeignKey("custom_entity_types.id"), nullable=False)
    name = Column(String(100), nullable=False)
    field_key = Column(String(100), nullable=False, unique=True) # Unique key for data storage, e.g., "product_name"
    field_type = Column(String(50), nullable=False) # e.g., 'string', 'integer', 'boolean', 'date'
    is_required = Column(Boolean, default=False)
    default_value = Column(Text, nullable=True)
    is_searchable = Column(Boolean, default=False)
    options = Column(postgresql.JSONB(astext_type=Text()), nullable=True) # Add options column
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    custom_entity_type = relationship("CustomEntityType", back_populates="fields")

class CustomEntityRecord(Base):
    __tablename__ = "custom_entity_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    entity_type_id = Column(Integer, ForeignKey("custom_entity_types.id"), nullable=False)
    data = Column(Text, nullable=False) # Store dynamic data as JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    custom_entity_type = relationship("CustomEntityType")
