from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import inspect
from app.api.deps import get_db, get_current_user
from app.db.models import KnowledgeBase, User
from app.schemas.knowledge_base import KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeBaseOut

router = APIRouter()

@router.post("/knowledge-base", response_model=KnowledgeBaseOut, status_code=status.HTTP_201_CREATED)
@router.post("/knowledge-base/", response_model=KnowledgeBaseOut, status_code=status.HTTP_201_CREATED, include_in_schema=False) # Allow trailing slash
@router.post("/knowledge-bases", response_model=KnowledgeBaseOut, status_code=status.HTTP_201_CREATED, include_in_schema=False) # Allow non-trailing slash
@router.post("/knowledge-bases/", response_model=KnowledgeBaseOut, status_code=status.HTTP_201_CREATED, include_in_schema=False) # Allow trailing slash
def create_knowledge_base(
    kb_in: KnowledgeBaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new knowledge base.
    """
    db_kb = KnowledgeBase(**kb_in.model_dump(), user_id=current_user.id)
    db.add(db_kb)
    db.commit()
    db.refresh(db_kb)
    return db_kb

@router.get("/knowledge-base", response_model=List[KnowledgeBaseOut])
@router.get("/knowledge-base/", response_model=List[KnowledgeBaseOut], include_in_schema=False) # Allow trailing slash
@router.get("/knowledge-bases", response_model=List[KnowledgeBaseOut], include_in_schema=False) # Allow non-trailing slash
@router.get("/knowledge-bases/", response_model=List[KnowledgeBaseOut], include_in_schema=False) # Allow trailing slash
def read_knowledge_bases(
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = Query(None), # Add category as an optional query parameter
    is_active: Optional[bool] = Query(None), # Add is_active as an optional query parameter
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve multiple knowledge bases.
    """
    query = db.query(KnowledgeBase).filter(KnowledgeBase.user_id == current_user.id)
    if category:
        query = query.filter(KnowledgeBase.category == category)
    if is_active is not None:
        query = query.filter(KnowledgeBase.is_active == is_active)
    knowledge_bases = query.offset(skip).limit(limit).all()
    return knowledge_bases

@router.get("/knowledge-base/{kb_id}", response_model=KnowledgeBaseOut)
@router.get("/knowledge-base/{kb_id}/", response_model=KnowledgeBaseOut, include_in_schema=False) # Allow trailing slash
@router.get("/knowledge-bases/{kb_id}", response_model=KnowledgeBaseOut, include_in_schema=False) # Allow non-trailing slash
@router.get("/knowledge-bases/{kb_id}/", response_model=KnowledgeBaseOut, include_in_schema=False) # Allow trailing slash
def read_knowledge_base(
    kb_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve a single knowledge base by ID.
    """
    knowledge_base = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not knowledge_base:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge Base not found")
    return knowledge_base

@router.put("/knowledge-base/{kb_id}", response_model=KnowledgeBaseOut)
@router.put("/knowledge-base/{kb_id}/", response_model=KnowledgeBaseOut, include_in_schema=False) # Allow trailing slash
@router.put("/knowledge-bases/{kb_id}", response_model=KnowledgeBaseOut, include_in_schema=False) # Allow non-trailing slash
@router.put("/knowledge-bases/{kb_id}/", response_model=KnowledgeBaseOut, include_in_schema=False) # Allow trailing slash
def update_knowledge_base(
    kb_id: UUID,
    kb_in: KnowledgeBaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing knowledge base.
    """
    knowledge_base = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not knowledge_base:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge Base not found")

    for field, value in kb_in.model_dump(exclude_unset=True).items():
        setattr(knowledge_base, field, value)
    db.add(knowledge_base)
    db.commit()
    db.refresh(knowledge_base)
    return knowledge_base

@router.delete("/knowledge-base/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/knowledge-base/{kb_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False) # Allow trailing slash
@router.delete("/knowledge-bases/{kb_id}", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False) # Allow non-trailing slash
@router.delete("/knowledge-bases/{kb_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False) # Allow trailing slash
def delete_knowledge_base(
    kb_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a knowledge base.
    """
    knowledge_base = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not knowledge_base:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge Base not found")

    db.delete(knowledge_base)
    db.commit()
    return {"message": "Knowledge Base deleted successfully"}

@router.get("/knowledge-base/fields", response_model=List[dict])
@router.get("/knowledge-base/fields/", response_model=List[dict], include_in_schema=False) # Allow trailing slash
@router.get("/knowledge-bases/fields", response_model=List[dict], include_in_schema=False) # Allow non-trailing slash
@router.get("/knowledge-bases/fields/", response_model=List[dict], include_in_schema=False) # Allow trailing slash
def get_knowledge_base_fields(
    current_user: User = Depends(get_current_user) # Ensure user is authenticated
):
    """
    Retrieve a list of mappable fields for the KnowledgeBase model.
    """
    # Use SQLAlchemy inspect to get column names
    mapper = inspect(KnowledgeBase)
    fields = []
    for col in mapper.columns:
        # Exclude sensitive or internal fields that shouldn't be mapped directly
        if col.name not in ["id", "user_id", "created_at", "updated_at"]:
            label = col.name.replace("_", " ").title()
            if col.name == "name":
                label = "名称/标题"
            elif col.name == "description":
                label = "描述/摘要"
            elif col.name == "content":
                label = "内容"
            elif col.name == "tags":
                label = "标签 (逗号分隔)"
            elif col.name == "category":
                label = "分类"
            elif col.name == "is_active":
                label = "是否激活"
            fields.append({"label": label, "value": col.name})
    
    # Add 'id' back explicitly for mapping purposes if needed, e.g., for updates.
    # It's often a good practice to explicitly define the expected mapping fields
    # rather than relying solely on introspection if front-end has specific requirements.
    # For now, let's include it for completeness, but keep `user_id`, `created_at`, `updated_at` excluded.
    fields.insert(0, {"label": "ID", "value": "id"})

    return fields
