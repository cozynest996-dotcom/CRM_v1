import requests
import logging
import json
from typing import Dict, Any, Union
from app.core.config import settings
from app.db.models import Message

logger = logging.getLogger(__name__)

class TelegramService:
    """Telegram 服务类 - 支持工作流引擎"""
    
    def __init__(self):
        self.gateway_url = settings.TELEGRAM_GATEWAY_URL
    
    async def send_message(self, chat_id: Union[int, str], message: str, user_id: int = None, bot_token: str = None) -> Dict[str, Any]:
        """发送消息（异步版本，用于工作流引擎）"""
        if not user_id:
            logger.error("Cannot send Telegram message: user_id is required")
            raise ValueError("user_id is required for sending Telegram messages")

        if not bot_token:
            logger.error("Cannot send Telegram message: bot_token is required")
            raise ValueError("bot_token is required for sending Telegram messages")

        # 為工作流生成 JWT token
        from app.services.auth import AuthService
        from app.db.database import SessionLocal
        from app.db.models import User
        
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise ValueError(f"User {user_id} not found")
            
            auth_service = AuthService(db)
            jwt_token = auth_service.create_access_token(user)
        finally:
            db.close()
            
        payload = {
            "chat_id": chat_id,
            "text": message,
            "bot_token": bot_token
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {jwt_token}"
        }
        
        url = f"{self.gateway_url}/send"
        logger.info(f"Sending Telegram message to {chat_id} for user {user_id}")
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=settings.GATEWAY_TIMEOUT)
            response.raise_for_status()
            data = response.json()
            
            return {"status": "sent", "telegram_message_id": data.get("telegram_message_id")}
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Telegram message: {str(e)}")
            raise e


