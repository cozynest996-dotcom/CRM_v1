from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.auth import AuthService
from app.db.models import User
from app.core.config import get_settings
from typing import Optional
import logging

security = HTTPBearer()
settings = get_settings()
logger = logging.getLogger(__name__)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """获取当前登录用户"""
    auth_service = AuthService(db)
    
    try:
        # 记录是否提供了 Authorization header（不记录 token 原文）
        has_auth = bool(credentials and getattr(credentials, 'credentials', None))
        logger.debug(f"get_current_user called; Authorization header present: {has_auth}")

        # 验证JWT令牌
        payload = auth_service.verify_token(credentials.credentials)
        user_id = payload.get("user_id")
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        # 获取用户信息
        user = auth_service.get_user_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        if user.subscription_status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account suspended"
            )
        
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"Token verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """获取可选的当前用户（用于公开API）"""
    if not credentials:
        return None
    
    try:
        auth_service = AuthService(db)
        payload = auth_service.verify_token(credentials.credentials)
        user_id = payload.get("user_id")
        
        if user_id:
            return auth_service.get_user_by_id(user_id)
    except:
        pass
    
    return None

def admin_required(current_user: User = Depends(get_current_user)) -> User:
    """要求管理员权限"""
    admin_emails = [email.strip() for email in settings.admin_emails.split(",")]
    
    if current_user.email not in admin_emails:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    
    return current_user

def check_subscription_limit(
    resource_type: str,
    current_user: User = Depends(get_current_user)
):
    """检查订阅限制的装饰器"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # 在这里可以添加使用量检查逻辑
            # 例如检查当前用户的客户数量、消息数量等
            return await func(*args, **kwargs)
        return wrapper
    return decorator
