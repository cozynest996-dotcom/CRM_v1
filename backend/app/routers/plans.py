from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.db.models import SubscriptionPlan
from pydantic import BaseModel
import json

router = APIRouter()

class PlanResponse(BaseModel):
    id: int
    name: str
    display_name: str
    price: float
    max_customers: int | None
    max_messages_per_month: int | None
    max_whatsapp_accounts: int
    storage_limit: str
    features: List[str]

    class Config:
        from_attributes = True

@router.get("/plans", response_model=List[PlanResponse])
async def get_subscription_plans(db: Session = Depends(get_db)):
    """获取所有订阅套餐（公开API）"""
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active == True).all()
    
    result = []
    for plan in plans:
        features = json.loads(plan.features) if plan.features else []
        result.append(PlanResponse(
            id=plan.id,
            name=plan.name,
            display_name=plan.display_name,
            price=float(plan.price),
            max_customers=plan.max_customers,
            max_messages_per_month=plan.max_messages_per_month,
            max_whatsapp_accounts=plan.max_whatsapp_accounts,
            storage_limit=plan.storage_limit,
            features=features
        ))
    
    return result

@router.get("/plans/test")
async def test_plans():
    """简单的测试端点"""
    return {"message": "Plans API is working!", "status": "ok"}
