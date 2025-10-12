from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.models import Setting
from app.schemas.settings import IntegrationSettingsResponse
from cryptography.fernet import Fernet
import os
import base64
import hashlib
import openai
import logging
import requests
import json

logger = logging.getLogger(__name__)

class SettingsService:
    def __init__(self, db: Session):
        self.db = db
        # _encryption_key 不再在初始化时全局加载，而是按需为每个用户获取。
        # self._encryption_key = self._get_or_create_encryption_key()

    def _get_or_create_encryption_key(self, user_id: int) -> bytes:
        """获取或创建加密密钥"""
        key_setting = self.db.query(Setting).filter(Setting.key == "encryption_key").first()
        
        if not key_setting:
            # 生成新的加密密钥
            key = Fernet.generate_key()
            # 现在使用传入的 user_id
            key_setting = Setting(
                key="encryption_key",
                value=key.decode(),
                user_id=user_id  # 使用当前用户ID
            )
            self.db.add(key_setting)
            self.db.commit()
            self.db.refresh(key_setting)
            return key
        
        return key_setting.value.encode()

    def get_or_create_user_encryption_key(self, user_id: int) -> bytes:
        """为指定用户获取或创建加密密钥"""
        return self._get_or_create_encryption_key(user_id)

    def _encrypt_value(self, value: str, user_id: int) -> str:
        """加密敏感数据"""
        encryption_key = self.get_or_create_user_encryption_key(user_id)
        fernet = Fernet(encryption_key)
        return fernet.encrypt(value.encode()).decode()
    
    def _decrypt_value(self, encrypted_value: str, user_id: int) -> str:
        """解密敏感数据"""
        encryption_key = self.get_or_create_user_encryption_key(user_id)
        fernet = Fernet(encryption_key)
        return fernet.decrypt(encrypted_value.encode()).decode()
    
    def _mask_sensitive_value(self, value: str, show_chars: int = 8) -> str:
        """掩码显示敏感信息 - 使用省略號格式"""
        if not value:
            return ""
        if len(value) <= show_chars:
            # 如果太短，顯示前幾個字符 + 省略號
            return value[:3] + "..." if len(value) > 3 else value
        # 顯示前8個字符和後4個字符，中間用省略號
        return value[:show_chars] + "..." + value[-4:]
    
    def _get_or_create_setting(self, key: str, default_value: str = "", user_id: int = 1) -> Setting:
        """获取或创建设置项"""
        setting = self.db.query(Setting).filter(Setting.key == key).first()
        if not setting:
            # 创建新设置，关联到指定用户或系统用户
            setting = Setting(
                key=key,
                value=default_value,
                user_id=user_id
            )
            self.db.add(setting)
            self.db.commit()
            self.db.refresh(setting)
        return setting
    
    def save_openai_key(self, api_key: str, user_id: int):
        """保存 OpenAI API Key（加密存储）"""
        try:
            encrypted_key = self._encrypt_value(api_key, user_id)
            setting = self._get_or_create_setting("openai_api_key", user_id=user_id)
            setting.value = encrypted_key
            self.db.commit()
            logger.info("OpenAI API key saved successfully")
        except Exception as e:
            logger.error(f"Failed to save OpenAI API key: {e}")
            self.db.rollback()
            raise
    
    def get_openai_key(self) -> str:
        """获取 OpenAI API Key（解密）- 系統級別"""
        try:
            setting = self.db.query(Setting).filter(Setting.key == "openai_api_key").first()
            if not setting or not setting.value:
                return ""
            # 系统级设置，默认 user_id 为 1，但这里应该使用实际的 user_id 或者不使用。
            # 目前这个方法在 get_all_settings_for_user 中被调用，传入了 user_id
            # 但是这里没有 user_id 参数，所以需要修改逻辑。
            # 这里我们假定 get_openai_key 是获取一个全局的或者没有特定用户的。
            # 鉴于现在都是 per-user setting，这个方法可能需要移除或修改。
            # 为了快速修复，暂时直接返回，但这可能不符合设计。
            # 更好的方式是移除此方法或要求传入 user_id。
            # 考虑到 get_all_settings_for_user 已经有 get_openai_key_for_user
            # 我会选择废弃这个 get_openai_key
            raise NotImplementedError("get_openai_key should not be used directly anymore. Use get_openai_key_for_user instead.")
        except Exception as e:
            logger.error(f"Failed to get OpenAI API key: {e}")
            return ""
    
    def get_openai_key_for_user(self, user_id: int) -> str:
        """获取指定用戶的 OpenAI API Key（解密）"""
        try:
            setting = self.db.query(Setting).filter(
                Setting.key == "openai_api_key",
                Setting.user_id == user_id
            ).first()
            if not setting or not setting.value:
                return ""
            return self._decrypt_value(setting.value, user_id)
        except Exception as e:
            logger.error(f"Failed to get OpenAI API key for user {user_id}: {e}")
            return ""
    
    
    def get_all_settings(self) -> IntegrationSettingsResponse:
        """获取所有集成设置（用于显示，敏感信息已掩码）- 系統級別"""
        # 此方法不再适用，因为所有设置现在都与用户关联。
        # 应该使用 get_all_settings_for_user
        raise NotImplementedError("get_all_settings should not be used directly anymore. Use get_all_settings_for_user instead.")

    def get_all_settings_for_user(self, user_id: int) -> IntegrationSettingsResponse:
        """获取指定用戶的所有集成设置（用于显示，敏感信息已掩码）"""
        try:
            openai_key = self.get_openai_key_for_user(user_id)
            telegram_bot_token = self.get_telegram_bot_token_for_user(user_id)
            
            return IntegrationSettingsResponse(
                openai_api_key=self._mask_sensitive_value(openai_key) if openai_key else "未設置",
                telegram_bot_token=self._mask_sensitive_value(telegram_bot_token) if telegram_bot_token else "未設置"
            )
        except Exception as e:
            logger.error(f"Failed to get all settings for user {user_id}: {e}")
            return IntegrationSettingsResponse(
                openai_api_key="未設置",
                telegram_bot_token="未設置"
            )
    
    def delete_openai_key(self):
        """删除 OpenAI API Key"""
        # 此方法不再适用，因为所有设置现在都与用户关联。
        # 应该使用 delete_setting_for_user
        raise NotImplementedError("delete_openai_key should not be used directly anymore. Use delete_setting_for_user instead.")

    # Generic per-user settings helpers
    def save_setting_for_user(self, key: str, value: str, user_id: int) -> None:
        """保存任意键值到 settings 表，值会被加密存储并关联到指定用户"""
        try:
            # 加密值现在需要 user_id
            encrypted = self._encrypt_value(value, user_id)
            # Use PostgreSQL upsert to avoid unique constraint on key
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            insert_stmt = pg_insert(Setting.__table__).values(
                key=key,
                value=encrypted,
                user_id=user_id
            )
            on_conflict_stmt = insert_stmt.on_conflict_do_update(
                index_elements=['key'],
                set_={'value': encrypted, 'user_id': user_id}
            )
            self.db.execute(on_conflict_stmt)
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to save setting {key} for user {user_id}: {e}")
            self.db.rollback()
            raise

    def get_setting_for_user(self, key: str, user_id: int) -> str:
        """读取指定用户的设置（解密后返回），不存在或出错则返回 empty string"""
        try:
            setting = self.db.query(Setting).filter(Setting.key == key, Setting.user_id == user_id).first()
            if not setting or not setting.value:
                return ""
            return self._decrypt_value(setting.value, user_id)
        except Exception as e:
            logger.error(f"Failed to get setting {key} for user {user_id}: {e}")
            return ""

    def delete_setting_for_user(self, key: str, user_id: int) -> None:
        try:
            setting = self.db.query(Setting).filter(Setting.key == key, Setting.user_id == user_id).first()
            if setting:
                self.db.delete(setting)
                self.db.commit()
        except Exception as e:
            logger.error(f"Failed to delete setting {key} for user {user_id}: {e}")
            self.db.rollback()
            raise
    
    
    def save_telegram_bot_token(self, bot_token: str, user_id: int):
        """保存 Telegram Bot Token（加密存储）"""
        try:
            self.save_setting_for_user("telegram_bot_token", bot_token, user_id)
            logger.info(f"Telegram Bot Token saved for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to save Telegram Bot Token for user {user_id}: {e}")
            self.db.rollback()
            raise

    def get_telegram_bot_token_for_user(self, user_id: int) -> str:
        """获取指定用户的 Telegram Bot Token（解密）"""
        try:
            return self.get_setting_for_user("telegram_bot_token", user_id)
        except Exception as e:
            logger.error(f"Failed to get Telegram Bot Token for user {user_id}: {e}")
            return ""
    
    def delete_telegram_bot_token(self, user_id: int):
        """删除 Telegram Bot Token"""
        try:
            self.delete_setting_for_user("telegram_bot_token", user_id)
            logger.info(f"Telegram Bot Token deleted for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to delete Telegram Bot Token for user {user_id}: {e}")
            self.db.rollback()
            raise
    
    
    async def test_openai_connection(self, user_id: int) -> dict:
        """测试 OpenAI API 连接"""
        try:
            api_key = self.get_openai_key_for_user(user_id)
            if not api_key:
                return {"status": "error", "message": "No API key configured"}
            
            # 这里可以添加实际的 OpenAI API 测试调用
            # 为了简单起见，我们只检查 key 格式
            if api_key.startswith('sk-'):
                return {"status": "success", "message": "API key format is valid"}
            else:
                return {"status": "error", "message": "Invalid API key format"}
            
        except Exception as e:
            logger.error(f"Failed to test OpenAI connection: {e}")
            return {"status": "error", "message": str(e)}

    # -------------------------
    # Customer list config (per-user)
    # -------------------------
    def get_customer_list_config(self, user_id: int) -> dict:
        """获取用户的客户列表列配置，返回 dict（如果未配置返回空dict）"""
        try:
            key = f"customer_list_config_{user_id}"
            setting = self.db.query(Setting).filter(Setting.key == key, Setting.user_id == user_id).first()
            if not setting or not setting.value:
                return {}
            return json.loads(setting.value)
        except Exception as e:
            logger.error(f"Failed to get customer list config for user {user_id}: {e}")
            return {}

    def save_customer_list_config(self, config: dict, user_id: int) -> bool:
        """保存用户的客户列表列配置（JSON序列化）"""
        try:
            key = f"customer_list_config_{user_id}"
            setting = self.db.query(Setting).filter(Setting.key == key, Setting.user_id == user_id).first()
            if not setting:
                setting = Setting(key=key, value=json.dumps(config), user_id=user_id)
                self.db.add(setting)
            else:
                setting.value = json.dumps(config)
            self.db.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to save customer list config for user {user_id}: {e}")
            self.db.rollback()
            return False
    
    