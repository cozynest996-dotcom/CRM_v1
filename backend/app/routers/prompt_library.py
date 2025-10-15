from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Union
from pydantic import BaseModel, field_serializer
from datetime import datetime
import uuid

from app.db.database import get_db
from app.db.models import AIPrompt, User
from app.core.security import get_current_user

router = APIRouter()

# Pydantic 模型
class AIPromptBase(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt: Optional[str] = None

class AIPromptCreate(AIPromptBase):
    pass

class AIPromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt: Optional[str] = None

class AIPromptResponse(AIPromptBase):
    id: Union[str, uuid.UUID]
    user_id: int
    created_at: datetime
    updated_at: datetime

    @field_serializer('id')
    def serialize_id(self, value: Union[str, uuid.UUID]) -> str:
        if isinstance(value, uuid.UUID):
            return str(value)
        return value

    class Config:
        from_attributes = True

# API 端点
@router.get("/", response_model=List[AIPromptResponse])
@router.get("", response_model=List[AIPromptResponse]) # Added to handle /api/prompt-library without trailing slash
async def get_prompts(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取用户的所有 AI 提示词"""
    prompts = db.query(AIPrompt).filter(
        AIPrompt.user_id == current_user.id
    ).offset(skip).limit(limit).all()
    
    return prompts

@router.post("/", response_model=AIPromptResponse)
@router.post("", response_model=AIPromptResponse) # Added to handle /api/prompt-library without trailing slash
async def create_prompt(
    prompt: AIPromptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建新的 AI 提示词"""
    db_prompt = AIPrompt(
        user_id=current_user.id,
        name=prompt.name,
        description=prompt.description,
        system_prompt=prompt.system_prompt,
        user_prompt=prompt.user_prompt
    )
    
    db.add(db_prompt)
    db.commit()
    db.refresh(db_prompt)
    
    return db_prompt

@router.get("/{prompt_id}", response_model=AIPromptResponse)
async def get_prompt(
    prompt_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取特定的 AI 提示词"""
    prompt = db.query(AIPrompt).filter(
        AIPrompt.id == prompt_id,
        AIPrompt.user_id == current_user.id
    ).first()
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found"
        )
    
    return prompt

@router.put("/{prompt_id}", response_model=AIPromptResponse)
async def update_prompt(
    prompt_id: str,
    prompt_update: AIPromptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新 AI 提示词"""
    db_prompt = db.query(AIPrompt).filter(
        AIPrompt.id == prompt_id,
        AIPrompt.user_id == current_user.id
    ).first()
    
    if not db_prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found"
        )
    
    # 更新字段
    update_data = prompt_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_prompt, field, value)
    
    db.commit()
    db.refresh(db_prompt)
    
    return db_prompt

@router.delete("/{prompt_id}")
async def delete_prompt(
    prompt_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除 AI 提示词"""
    db_prompt = db.query(AIPrompt).filter(
        AIPrompt.id == prompt_id,
        AIPrompt.user_id == current_user.id
    ).first()
    
    if not db_prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found"
        )
    
    db.delete(db_prompt)
    db.commit()
    
    return {"message": "Prompt deleted successfully"}
