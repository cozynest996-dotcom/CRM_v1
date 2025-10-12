from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.db.database import get_db
from app.db.models import User, SubscriptionPlan, AdminAction
from app.services.auth import AuthService
from app.middleware.auth import get_current_user, admin_required
from pydantic import BaseModel

router = APIRouter()

# 响应模型
class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    avatar_url: Optional[str]
    subscription_plan_name: str
    subscription_status: str
    activated_by_admin: bool
    created_at: datetime
    last_login_at: Optional[datetime]
    customer_count: int
    message_count: int

    class Config:
        from_attributes = True

class PlanResponse(BaseModel):
    id: int
    name: str
    display_name: str
    price: float
    max_customers: Optional[int]
    max_messages_per_month: Optional[int]

class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    trial_users: int
    paid_users: int
    total_customers: int
    total_messages: int
    revenue_estimate: float

class UserUpdateRequest(BaseModel):
    subscription_plan_id: Optional[int] = None
    subscription_status: Optional[str] = None
    admin_notes: Optional[str] = None

@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    current_user: User = Depends(admin_required),
    db: Session = Depends(get_db)
):
    """获取管理员统计信息"""
    # 基础统计
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.subscription_status == "active").count()
    trial_users = db.query(User).filter(User.trial_ends_at.isnot(None)).count()
    paid_users = db.query(User).join(SubscriptionPlan).filter(SubscriptionPlan.price > 0).count()
    
    # 客户和消息统计
    from app.db.models import Customer, Message
    total_customers = db.query(Customer).count()
    total_messages = db.query(Message).count()
    
    # 收入估算（基于活跃付费用户）
    revenue_query = db.query(SubscriptionPlan.price).join(User).filter(
        User.subscription_status == "active",
        SubscriptionPlan.price > 0
    ).all()
    revenue_estimate = sum(price[0] for price in revenue_query)

    return AdminStatsResponse(
        total_users=total_users,
        active_users=active_users,
        trial_users=trial_users,
        paid_users=paid_users,
        total_customers=total_customers,
        total_messages=total_messages,
        revenue_estimate=float(revenue_estimate)
    )

@router.get("/users", response_model=List[UserResponse])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(admin_required),
    db: Session = Depends(get_db)
):
    """获取所有用户列表"""
    users = db.query(User).offset(skip).limit(limit).all()
    
    result = []
    for user in users:
        # 获取用户的客户和消息数量
        from app.db.models import Customer, Message
        customer_count = db.query(Customer).filter(Customer.user_id == user.id).count()
        message_count = db.query(Message).filter(Message.user_id == user.id).count()
        
        result.append(UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            avatar_url=user.avatar_url,
            subscription_plan_name=user.subscription_plan.display_name,
            subscription_status=user.subscription_status,
            activated_by_admin=user.activated_by_admin,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            customer_count=customer_count,
            message_count=message_count
        ))
    
    return result

@router.get("/plans", response_model=List[PlanResponse])
async def get_subscription_plans(
    current_user: User = Depends(admin_required),
    db: Session = Depends(get_db)
):
    """获取所有订阅套餐"""
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active == True).all()
    return [PlanResponse(
        id=plan.id,
        name=plan.name,
        display_name=plan.display_name,
        price=float(plan.price),
        max_customers=plan.max_customers,
        max_messages_per_month=plan.max_messages_per_month
    ) for plan in plans]

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    update_data: UserUpdateRequest,
    current_user: User = Depends(admin_required),
    db: Session = Depends(get_db)
):
    """更新用户信息（管理员操作）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_values = {
        "subscription_plan_id": user.subscription_plan_id,
        "subscription_status": user.subscription_status,
        "admin_notes": user.admin_notes
    }

    # 更新用户信息
    if update_data.subscription_plan_id is not None:
        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == update_data.subscription_plan_id
        ).first()
        if not plan:
            raise HTTPException(status_code=400, detail="Invalid subscription plan")
        user.subscription_plan_id = update_data.subscription_plan_id
        user.activated_by_admin = True

    if update_data.subscription_status is not None:
        user.subscription_status = update_data.subscription_status

    if update_data.admin_notes is not None:
        user.admin_notes = update_data.admin_notes

    user.updated_at = datetime.utcnow()

    # 记录管理员操作
    admin_action = AdminAction(
        admin_email=current_user.email,
        action_type="update_user",
        target_user_id=user_id,
        old_value=str(old_values),
        new_value=str(update_data.dict()),
        notes=f"Admin {current_user.email} updated user {user.email}"
    )
    db.add(admin_action)
    
    db.commit()
    
    return {"message": "User updated successfully"}

@router.post("/users/{user_id}/activate")
async def activate_user(
    user_id: int,
    plan_id: int,
    notes: Optional[str] = None,
    current_user: User = Depends(admin_required),
    db: Session = Depends(get_db)
):
    """激活用户付费套餐"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid subscription plan")

    # 更新用户订阅
    user.subscription_plan_id = plan_id
    user.subscription_status = "active"
    user.activated_by_admin = True
    if notes:
        user.admin_notes = notes

    # 记录管理员操作
    admin_action = AdminAction(
        admin_email=current_user.email,
        action_type="activate_user",
        target_user_id=user_id,
        old_value=f"Plan ID: {user.subscription_plan_id}",
        new_value=f"Plan ID: {plan_id}",
        notes=notes or f"Admin activated user to {plan.display_name}"
    )
    db.add(admin_action)
    
    db.commit()
    
    return {
        "message": f"User {user.email} activated with {plan.display_name} plan",
        "user_email": user.email,
        "plan_name": plan.display_name
    }
