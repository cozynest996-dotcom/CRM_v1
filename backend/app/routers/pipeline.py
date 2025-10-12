"""
Customer Pipeline API - 客户阶段管理系统
支持可拖拽的客户状态管理
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json

from app.db.database import get_db
from app.db.models import Customer, CustomerStage, AuditLog
from app.middleware.auth import get_current_user

router = APIRouter()

# 数据模型
class CustomerStageCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: str = "#3B82F6"
    order_index: int = 0
    is_default: bool = False
    card_display_fields: Optional[List[str]] = None

class CustomerStageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    order_index: Optional[int] = None
    is_default: Optional[bool] = None
    card_display_fields: Optional[List[str]] = None

class CustomerStageResponse(BaseModel):
    id: int
    name: str
    description: str
    color: str
    order_index: int
    is_default: bool
    card_display_fields: List[str] = []
    customer_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class CustomerMoveRequest(BaseModel):
    customer_id: str
    target_stage_id: int
    note: Optional[str] = ""

class PipelineCustomer(BaseModel):
    id: str
    name: str
    phone: str
    email: Optional[str]
    last_message: Optional[str]
    last_timestamp: Optional[datetime]
    unread_count: int
    photo_url: Optional[str]
    stage_id: Optional[int]
    updated_at: datetime

    class Config:
        from_attributes = True

class PipelineResponse(BaseModel):
    stages: List[CustomerStageResponse]
    customers_by_stage: dict  # stage_id -> List[PipelineCustomer]

# 获取用户的所有客户阶段
@router.get("/stages", response_model=List[CustomerStageResponse])
async def get_customer_stages(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取当前用户的所有客户阶段"""
    stages = db.query(CustomerStage).filter(
        CustomerStage.user_id == current_user.id
    ).order_by(CustomerStage.order_index).all()
    
    # 为每个阶段计算客户数量
    stage_responses = []
    for stage in stages:
        customer_count = db.query(Customer).filter(
            Customer.stage_id == stage.id,
            Customer.user_id == current_user.id
        ).count()
        
        stage_dict = stage.__dict__.copy()
        stage_dict['customer_count'] = customer_count
        stage_responses.append(CustomerStageResponse(**stage_dict))
    
    return stage_responses

# 创建客户阶段
@router.post("/stages", response_model=CustomerStageResponse)
async def create_customer_stage(
    stage_data: CustomerStageCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """创建新的客户阶段"""
    # 如果设置为默认阶段，先取消其他默认阶段
    if stage_data.is_default:
        db.query(CustomerStage).filter(
            CustomerStage.user_id == current_user.id,
            CustomerStage.is_default == True
        ).update({"is_default": False})
    
    stage = CustomerStage(
        name=stage_data.name,
        description=stage_data.description,
        color=stage_data.color,
        order_index=stage_data.order_index,
        is_default=stage_data.is_default,
        card_display_fields=stage_data.card_display_fields or ["name", "phone", "email"], # Set default if not provided
        user_id=current_user.id
    )
    
    db.add(stage)
    db.commit()
    db.refresh(stage)
    
    stage_dict = stage.__dict__.copy()
    stage_dict['customer_count'] = 0
    return CustomerStageResponse(**stage_dict)

# 更新客户阶段
@router.put("/stages/{stage_id}", response_model=CustomerStageResponse)
async def update_customer_stage(
    stage_id: int,
    stage_data: CustomerStageUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """更新客户阶段"""
    stage = db.query(CustomerStage).filter(
        CustomerStage.id == stage_id,
        CustomerStage.user_id == current_user.id
    ).first()
    
    if not stage:
        raise HTTPException(status_code=404, detail="客户阶段不存在")
    
    # 如果设置为默认阶段，先取消其他默认阶段
    if stage_data.is_default:
        db.query(CustomerStage).filter(
            CustomerStage.user_id == current_user.id,
            CustomerStage.is_default == True,
            CustomerStage.id != stage_id
        ).update({"is_default": False})
    
    # 更新字段
    update_data = stage_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(stage, field, value)
    
    stage.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(stage)
    
    customer_count = db.query(Customer).filter(
        Customer.stage_id == stage.id,
        Customer.user_id == current_user.id
    ).count()
    
    stage_dict = stage.__dict__.copy()
    stage_dict['customer_count'] = customer_count
    return CustomerStageResponse(**stage_dict)

# 删除客户阶段
@router.delete("/stages/{stage_id}")
async def delete_customer_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """删除客户阶段"""
    stage = db.query(CustomerStage).filter(
        CustomerStage.id == stage_id,
        CustomerStage.user_id == current_user.id
    ).first()
    
    if not stage:
        raise HTTPException(status_code=404, detail="客户阶段不存在")
    
    # 检查是否有客户在此阶段
    customer_count = db.query(Customer).filter(
        Customer.stage_id == stage_id,
        Customer.user_id == current_user.id
    ).count()
    
    if customer_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"无法删除阶段，还有 {customer_count} 个客户在此阶段"
        )
    
    db.delete(stage)
    db.commit()
    
    return {"message": "客户阶段已删除"}

# 获取完整的 pipeline 视图
@router.get("/", response_model=PipelineResponse)
async def get_pipeline(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取完整的客户 pipeline 视图"""
    # 获取所有阶段
    stages = db.query(CustomerStage).filter(
        CustomerStage.user_id == current_user.id
    ).order_by(CustomerStage.order_index).all()
    
    # 获取所有客户
    customers = db.query(Customer).filter(
        Customer.user_id == current_user.id
    ).all()
    
    # 按阶段分组客户
    customers_by_stage = {}
    
    for stage in stages:
        stage_customers = [
            PipelineCustomer(
                id=str(customer.id),
                name=customer.name or customer.phone,
                phone=customer.phone or "",
                email=customer.email,
                last_message=customer.last_message,
                last_timestamp=customer.last_timestamp,
                unread_count=customer.unread_count,
                photo_url=customer.photo_url,
                stage_id=customer.stage_id,
                updated_at=customer.updated_at
            )
            for customer in customers if customer.stage_id == stage.id
        ]
        customers_by_stage[str(stage.id)] = stage_customers
    
    # 处理没有阶段的客户
    customers_without_stage = []
    for customer in customers:
        if customer.stage_id is not None:
            continue

        customers_without_stage.append(
            PipelineCustomer(
                id=str(customer.id),
                name=customer.name or customer.phone,
                phone=customer.phone or "",
                email=customer.email,
                last_message=customer.last_message,
                last_timestamp=customer.last_timestamp,
                unread_count=customer.unread_count,
                photo_url=customer.photo_url,
                stage_id=customer.stage_id,
                updated_at=customer.updated_at
            )
        )
    customers_by_stage["null"] = customers_without_stage
    
    # 计算每个阶段的客户数量
    stage_responses = []
    for stage in stages:
        customer_count = len(customers_by_stage.get(str(stage.id), []))
        stage_dict = stage.__dict__.copy()
        stage_dict['customer_count'] = customer_count
        stage_responses.append(CustomerStageResponse(**stage_dict))
    
    return PipelineResponse(
        stages=stage_responses,
        customers_by_stage=customers_by_stage
    )

# 移动客户到不同阶段
@router.post("/move-customer")
async def move_customer(
    move_request: CustomerMoveRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """将客户移动到不同的阶段"""
    # 获取客户
    customer = db.query(Customer).filter(
        Customer.id == move_request.customer_id,
        Customer.user_id == current_user.id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    
    # 验证目标阶段
    target_stage = db.query(CustomerStage).filter(
        CustomerStage.id == move_request.target_stage_id,
        CustomerStage.user_id == current_user.id
    ).first()
    
    if not target_stage:
        raise HTTPException(status_code=404, detail="目标阶段不存在")
    
    # 记录旧阶段
    old_stage_id = customer.stage_id
    old_stage_name = None
    if old_stage_id:
        old_stage = db.query(CustomerStage).filter(CustomerStage.id == old_stage_id).first()
        old_stage_name = old_stage.name if old_stage else "未知阶段"
    
    # 更新客户阶段
    customer.stage_id = move_request.target_stage_id
    customer.updated_at = datetime.utcnow()
    customer.version += 1
    
    # 记录审计日志
    audit_log = AuditLog(
        entity_type="customer",
        entity_id=customer.id,
        action="stage_change",
        old_values={"stage_id": old_stage_id, "stage_name": old_stage_name},
        new_values={"stage_id": move_request.target_stage_id, "stage_name": target_stage.name},
        user_id=current_user.id,
        source="pipeline_drag"
    )
    db.add(audit_log)
    
    db.commit()
    
    return {
        "message": f"客户已移动到 '{target_stage.name}' 阶段",
        "customer_id": customer.id,
        "old_stage": old_stage_name,
        "new_stage": target_stage.name
    }

# 批量移动客户
@router.post("/batch-move")
async def batch_move_customers(
    customer_ids: List[str],
    target_stage_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """批量移动客户到指定阶段"""
    # 验证目标阶段
    target_stage = db.query(CustomerStage).filter(
        CustomerStage.id == target_stage_id,
        CustomerStage.user_id == current_user.id
    ).first()
    
    if not target_stage:
        raise HTTPException(status_code=404, detail="目标阶段不存在")
    
    # 获取要移动的客户
    customers = db.query(Customer).filter(
        Customer.id.in_(customer_ids),
        Customer.user_id == current_user.id
    ).all()
    
    if not customers:
        raise HTTPException(status_code=404, detail="没有找到要移动的客户")
    
    moved_count = 0
    for customer in customers:
        old_stage_id = customer.stage_id
        customer.stage_id = target_stage_id
        customer.updated_at = datetime.utcnow()
        customer.version += 1
        moved_count += 1
        
        # 记录审计日志
        audit_log = AuditLog(
            entity_type="customer",
            entity_id=customer.id,
            action="stage_change",
            old_values={"stage_id": old_stage_id},
            new_values={"stage_id": target_stage_id, "stage_name": target_stage.name},
            user_id=current_user.id,
            source="pipeline_batch"
        )
        db.add(audit_log)
    
    db.commit()
    
    return {
        "message": f"成功移动 {moved_count} 个客户到 '{target_stage.name}' 阶段",
        "moved_count": moved_count,
        "target_stage": target_stage.name
    }

# 初始化默认阶段
@router.post("/initialize-default-stages")
async def initialize_default_stages(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """为用户初始化默认的客户阶段"""
    # 检查用户是否已有阶段
    existing_stages = db.query(CustomerStage).filter(
        CustomerStage.user_id == current_user.id
    ).count()
    
    if existing_stages > 0:
        raise HTTPException(status_code=400, detail="用户已有客户阶段，无需初始化")
    
    # 创建默认阶段
    default_stages = [
        {"name": "新客户", "description": "刚刚接触的潜在客户", "color": "#EF4444", "order_index": 0, "is_default": True, "card_display_fields": ["name", "phone", "email"]},
        {"name": "跟进中", "description": "正在沟通的客户", "color": "#F59E0B", "order_index": 1, "is_default": False, "card_display_fields": ["name", "phone", "email"]},
        {"name": "有意向", "description": "表达购买意向的客户", "color": "#3B82F6", "order_index": 2, "is_default": False, "card_display_fields": ["name", "phone", "email"]},
        {"name": "已成交", "description": "完成交易的客户", "color": "#10B981", "order_index": 3, "is_default": False, "card_display_fields": ["name", "phone", "email"]},
        {"name": "已流失", "description": "失去联系或放弃的客户", "color": "#6B7280", "order_index": 4, "is_default": False, "card_display_fields": ["name", "phone", "email"]}
    ]
    
    created_stages = []
    for stage_data in default_stages:
        stage = CustomerStage(
            name=stage_data["name"],
            description=stage_data["description"],
            color=stage_data["color"],
            order_index=stage_data["order_index"],
            is_default=stage_data["is_default"],
            user_id=current_user.id
        )
        db.add(stage)
        created_stages.append(stage_data["name"])
    
    db.commit()
    
    return {
        "message": "默认客户阶段已初始化",
        "created_stages": created_stages
    }
