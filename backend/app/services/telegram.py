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
            "user_id": user_id
        }
        
        # 如果提供了 bot_token，添加到 payload 中
        if bot_token:
            payload["bot_token"] = bot_token
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {jwt_token}",
            "X-GATEWAY-SECRET": settings.TELEGRAM_GATEWAY_SECRET
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


def send_telegram_message(msg: Message, chat_id: str):
    """发送 Telegram 消息，通过 gateway。记录更详细的日志并在失败时重试一次。
    gateway 返回 telegram_message_id 时会写回数据库；否则依赖 gateway 的回调来映射 ID。
    """
    from app.db.database import SessionLocal
    from app.services.auth import AuthService
    from app.db.models import User
    
    user_id = None
    db = SessionLocal()
    try:
        user_id = msg.user_id
        if not user_id:
            if hasattr(msg, 'customer') and msg.customer:
                user_id = msg.customer.user_id
        
        if not user_id:
            logger.error(f"Cannot send Telegram message: no user_id found for message {msg.id}")
            return
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.error(f"Cannot send Telegram message: user {user_id} not found")
            return
        
        auth_service = AuthService(db)
        jwt_token = auth_service.create_access_token(user)
        
    finally:
        db.close()
    
    payload = {
        "chat_id": chat_id,
        "text": msg.content,
        "backend_message_id": str(msg.id),
        "user_id": user_id
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {jwt_token}",
        "X-GATEWAY-SECRET": settings.TELEGRAM_GATEWAY_SECRET
    }

    url = f"{settings.TELEGRAM_GATEWAY_URL}/send"
    logger.info(f"Posting to Telegram gateway {url} for user {user_id}")

    for attempt in (1, 2):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=settings.GATEWAY_TIMEOUT)
            logger.info(f"Gateway response (attempt {attempt}): {response.status_code} {response.text}")
            response.raise_for_status()

            telegram_message_id = None
            try:
                data = response.json()
                if isinstance(data, dict):
                    telegram_message_id = data.get("telegram_message_id")
            except Exception:
                telegram_message_id = None

            if telegram_message_id:
                from app.db.database import SessionLocal
                db = SessionLocal()
                try:
                    db_msg = db.query(Message).filter(Message.id == msg.id).first()
                    if db_msg:
                        db_msg.telegram_message_id = str(telegram_message_id) # 保存 Telegram 消息 ID
                        db.commit()
                finally:
                    db.close()
            else:
                logger.warning("Gateway did not return telegram_message_id; relying on webhook for mapping")

            logger.info(f"Telegram gateway accepted message: {chat_id} -> {msg.content}")
            break

        except Exception as e:
            logger.error(f"Failed to post to Telegram gateway (attempt {attempt}): {e}")
            if attempt == 2:
                logger.exception("Giving up sending to Telegram gateway after retries")
            else:
                logger.info("Retrying send to Telegram gateway...")


