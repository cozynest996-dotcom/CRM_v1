import jwt
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.db.models import User, SubscriptionPlan
from app.core.config import get_settings

settings = get_settings()

class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.jwt_secret = settings.jwt_secret_key
        self.jwt_algorithm = "HS256"
        self.jwt_expire_hours = 24 * 7  # 7 days

    def create_access_token(self, user: User) -> str:
        """创建JWT访问令牌"""
        expire = datetime.utcnow() + timedelta(hours=self.jwt_expire_hours)
        # subscription_plan may be None if DB record missing relation; handle safely
        plan = getattr(user, 'subscription_plan', None)
        plan_name = plan.name if plan else ''
        payload = {
            "user_id": user.id,
            "email": user.email,
            "subscription_plan": plan_name,
            "exp": expire,
            "iat": datetime.utcnow()
        }
        return jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)

    def verify_token(self, token: str) -> Dict[str, Any]:
        """验证JWT令牌"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except jwt.JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

    def get_or_create_user(self, google_user_info: Dict[str, Any]) -> User:
        """根据Google用户信息获取或创建用户"""
        user = self.db.query(User).filter(
            User.google_id == google_user_info.get("id")
        ).first()

        if not user:
            # 检查邮箱是否已存在
            existing_user = self.db.query(User).filter(
                User.email == google_user_info.get("email")
            ).first()
            
            if existing_user:
                # 更新现有用户的Google ID
                existing_user.google_id = google_user_info.get("id")
                existing_user.avatar_url = google_user_info.get("picture")
                existing_user.last_login_at = datetime.utcnow()
                self.db.commit()
                return existing_user

            # 创建新用户，默认免费套餐
            free_plan = self.db.query(SubscriptionPlan).filter(
                SubscriptionPlan.name == "free"
            ).first()
            
            user = User(
                google_id=google_user_info.get("id"),
                email=google_user_info.get("email"),
                name=google_user_info.get("name"),
                avatar_url=google_user_info.get("picture"),
                subscription_plan_id=free_plan.id if free_plan else 1,
                subscription_status="active"
            )
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
        else:
            # 更新最后登录时间
            user.last_login_at = datetime.utcnow()
            self.db.commit()

        return user

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """根据ID获取用户"""
        return self.db.query(User).filter(User.id == user_id).first()

    def check_subscription_limits(self, user: User, resource_type: str, current_usage: int = 0) -> bool:
        """检查用户订阅限制"""
        plan = user.subscription_plan
        
        if user.subscription_status != "active":
            return False

        if resource_type == "customers":
            return plan.max_customers is None or current_usage < plan.max_customers
        elif resource_type == "messages":
            # 这里需要检查当月消息数量
            return plan.max_messages_per_month is None or current_usage < plan.max_messages_per_month
        
        return True

    def get_user_limits(self, user: User) -> Dict[str, Any]:
        """获取用户的使用限制"""
        plan = user.subscription_plan
        features = json.loads(plan.features) if plan.features else []
        
        return {
            "plan_name": plan.display_name,
            "max_customers": plan.max_customers,
            "max_messages_per_month": plan.max_messages_per_month,
            "max_whatsapp_accounts": plan.max_whatsapp_accounts,
            "storage_limit": plan.storage_limit,
            "features": features,
            "is_unlimited": plan.max_customers is None
        }
