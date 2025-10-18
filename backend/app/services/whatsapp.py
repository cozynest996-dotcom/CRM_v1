import requests
import logging
import json
from typing import Dict, Any, Optional
from app.core.config import settings
from app.db.models import Message

logger = logging.getLogger(__name__)

class WhatsAppService:
    """WhatsApp 服务类 - 支持工作流引擎"""
    
    def __init__(self):
        self.gateway_url = settings.WHATSAPP_GATEWAY_URL
    
    async def send_message(self, phone: str, message: str, user_id: int = None, media_url: Optional[str] = None, media_type: Optional[str] = None) -> Dict[str, Any]:
        """发送消息（异步版本，用于工作流引擎）"""
        if not user_id:
            logger.error("Cannot send WhatsApp message: user_id is required")
            raise ValueError("user_id is required for sending WhatsApp messages")
        
        # 為工作流生成 JWT token
        from app.services.auth import AuthService
        from app.db.database import SessionLocal
        from app.db.models import User
        
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise ValueError(f"User {user_id} not found")
            
            logger.info(f"Found user for JWT token generation: {user.email} (ID: {user.id})")
            
            auth_service = AuthService(db)
            jwt_token = auth_service.create_access_token(user)
            
            logger.info(f"Generated JWT token length: {len(jwt_token) if jwt_token else 0}")
            if jwt_token:
                logger.info(f"JWT token preview: {jwt_token[:50]}...")
            else:
                logger.error("JWT token is None or empty!")
                
        finally:
            db.close()
            
        payload = {
            "to": phone,
            "message": message
        }
        
        # 添加媒体信息（如果提供）
        if media_url and media_type:
            payload["media_url"] = media_url
            payload["media_type"] = media_type
        
        headers = {
            "Content-Type": "application/json"
        }
        
        # 添加 Authorization 头（如果有 JWT token）
        if jwt_token:
            headers["Authorization"] = f"Bearer {jwt_token}"
            logger.info(f"Added Authorization header with Bearer token")
        else:
            logger.error("No JWT token available, Authorization header not added!")
        
        url = f"{self.gateway_url}/send"
        media_info = f" with media ({media_type}: {media_url})" if media_url else ""
        logger.info(f"Sending WhatsApp message to {phone} for user {user_id}{media_info}")
        
        # 添加详细的请求日志
        logger.info(f"Request URL: {url}")
        logger.info(f"Request payload: {json.dumps(payload, indent=2)}")
        # 显示完整的 headers（包括 Authorization）用于调试
        headers_for_log = headers.copy()
        if 'Authorization' in headers_for_log:
            # 只显示 Authorization 头的前缀，保护完整 token
            auth_header = headers_for_log['Authorization']
            headers_for_log['Authorization'] = f"{auth_header[:20]}..." if len(auth_header) > 20 else auth_header
        logger.info(f"Request headers: {json.dumps(headers_for_log, indent=2)}")
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            logger.info(f"Response status: {response.status_code}")
            logger.info(f"Response content: {response.text[:500]}...")
            response.raise_for_status()
            
            data = response.json() if response.content else {}
            return {
                "success": True,
                "message_id": data.get("whatsapp_id", "sent"),
                "status": "sent"
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send WhatsApp message: {str(e)}")
            raise e
    
    async def get_status(self) -> Dict[str, Any]:
        """获取 WhatsApp 网关状态"""
        try:
            response = requests.get(f"{self.gateway_url}/status", timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get WhatsApp status: {str(e)}")
            return {"connected": False, "error": str(e)}
    
    async def send_typing(self, phone: str) -> bool:
        """发送正在输入状态"""
        try:
            payload = {"to": phone}
            response = requests.post(f"{self.gateway_url}/typing", json=payload, timeout=10)
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to send typing indicator: {str(e)}")
            return False


def send_whatsapp_message(msg: Message, phone: str):
    """发送 WhatsApp 消息，通过 gateway。记录更详细的日志并在失败时重试一次。
    gateway 返回 whatsapp_id 时会写回数据库；否则依赖 gateway 的 /messages/map 回调来映射 ID。
    """
    # 获取消息所属的用户ID
    from app.db.database import SessionLocal
    from app.services.auth import AuthService
    from app.db.models import User
    
    user_id = None
    db = SessionLocal()
    try:
        # 从消息中获取用户ID
        user_id = msg.user_id
        if not user_id:
            # 备用：通过客户关系获取用户ID
            if hasattr(msg, 'customer') and msg.customer:
                user_id = msg.customer.user_id
        
        if not user_id:
            logger.error(f"Cannot send WhatsApp message: no user_id found for message {msg.id}")
            return
        
        # 生成 JWT token 用於身份驗證
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.error(f"Cannot send WhatsApp message: user {user_id} not found")
            return
        
        auth_service = AuthService(db)
        jwt_token = auth_service.create_access_token(user)
        
    finally:
        db.close()
    
    payload = {
        "to": phone,
        "message": msg.content,
        "backend_message_id": str(msg.id)
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {jwt_token}"
    }

    url = f"{settings.WHATSAPP_GATEWAY_URL}/send"
    logger.info(f"Posting to WhatsApp gateway {url} for user {user_id}")

    for attempt in (1, 2):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            logger.info(f"Gateway response (attempt {attempt}): {response.status_code} {response.text}")
            response.raise_for_status()

            whatsapp_id = None
            try:
                data = response.json()
                if isinstance(data, dict):
                    whatsapp_id = data.get("whatsapp_id")
            except Exception:
                whatsapp_id = None

            if whatsapp_id:
                # 延迟导入 SessionLocal 以避免循环依赖
                from app.db.database import SessionLocal
                db = SessionLocal()
                try:
                    db_msg = db.query(Message).filter(Message.id == msg.id).first()
                    if db_msg:
                        db_msg.whatsapp_id = str(whatsapp_id)
                        db.commit()
                finally:
                    db.close()
            else:
                logger.warning("Gateway did not return whatsapp_id; relying on map/webhook for mapping")

            logger.info(f"WhatsApp gateway accepted message: {phone} -> {msg.content}")
            break

        except Exception as e:
            logger.error(f"Failed to post to WhatsApp gateway (attempt {attempt}): {e}")
            if attempt == 2:
                # Last attempt failed -> log and give up
                logger.exception("Giving up sending to WhatsApp gateway after retries")
            else:
                logger.info("Retrying send to WhatsApp gateway...")
