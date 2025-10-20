"""
Workflow Engine - 基于用户提供的 MVP 架构实现
支持节点类型: MessageTrigger, AI, UpdateDB, Delay, SendWhatsAppMessage, Template, GuardrailValidator, CustomAPI

模块说明:
- 负责解析并执行工作流定义（nodes + edges），按顺序创建并调用对应的 NodeProcessor。
- 管理 `WorkflowContext`，在节点间传递 `trigger_data`、`ai.reply`、`ai.analyze`、`db` 等上下文信息。
- 将 AIService 和 WhatsAppService 集成到节点中：
  - AIProcessor 调用 AIService 以获取结构化结果并把 `ai.reply.reply_text` 写入上下文；
  - SendWhatsAppMessageProcessor 从上下文读取消息内容并调用 WhatsAppService 发送，同时记录消息到数据库；
  - UpdateDBProcessor 将 AI 分析结果应用到 `customers` 表并写审计日志。
- 提供错误捕获、步骤执行记录（WorkflowExecution / WorkflowStepExecution）与乐观锁/重试支持。

注意:
- 修改节点输入/输出 schema 或新增节点类型时，应同时更新本模块中的处理器映射 `self.processors` 与相关文档。
- AI 节点期望 `AIService.generate_combined_response` 返回结构化 JSON（analyze, reply, meta），模块会处理纯文本 fallback。

"""

import asyncio
import json
import logging
import random # 修复: 导入 random 模块
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Union
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from contextlib import asynccontextmanager
import traceback
from app.db.models import (
    Workflow, WorkflowExecution, WorkflowStepExecution, 
    Customer, Message, AIAnalysis, AuditLog, CustomEntityRecord # 导入 CustomEntityRecord
)
from app.services.ai_service import AIService
from app.services.whatsapp import WhatsAppService
import pytz
import re
from app.services.telegram import TelegramService
from app.services.settings import SettingsService
import uuid
import time
import base64
import tempfile
import os
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors.rpcerrorlist import RPCError
from fastapi import HTTPException
import httpx # 新增: 导入 httpx

logger = logging.getLogger(__name__)

def serialize_for_json(obj):
    """将对象序列化为 JSON 兼容的格式"""
    import uuid
    
    if obj is None:
        return None
    elif isinstance(obj, uuid.UUID):  # 处理 UUID 对象
        return str(obj)
    elif hasattr(obj, '__dict__'):
        # 数据库对象
        if hasattr(obj, '__tablename__'):
            # SQLAlchemy 模型对象
            result = {}
            for column in obj.__table__.columns:
                value = getattr(obj, column.name)
                if value is not None:
                    if hasattr(value, 'isoformat'):  # datetime 对象
                        result[column.name] = value.isoformat()
                    elif isinstance(value, uuid.UUID):  # UUID 对象
                        result[column.name] = str(value)
                    else:
                        result[column.name] = str(value)
                else:
                    result[column.name] = None
            return result
        else:
            # 普通对象
            result = obj.__dict__.copy()
            result.pop('_sa_instance_state', None)
            return {k: serialize_for_json(v) for k, v in result.items()}
    elif isinstance(obj, (list, tuple)):
        return [serialize_for_json(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    elif hasattr(obj, 'isoformat'):  # datetime 对象
        return obj.isoformat()
    else:
        return obj

def retry_on_failure(max_retries: int = 3, delay: float = 1.0, backoff_factor: float = 2.0):
    """重试装饰器，用于处理临时性错误"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except (SQLAlchemyError, ConnectionError, TimeoutError) as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        wait_time = delay * (backoff_factor ** attempt)
                        logger.warning(f"Attempt {attempt + 1} failed for {func.__name__}: {e}. Retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    else:
                        logger.error(f"All {max_retries} attempts failed for {func.__name__}: {e}")
                        raise last_exception
                except Exception as e:
                    # 对于非临时性错误，直接抛出
                    logger.error(f"Non-retryable error in {func.__name__}: {e}")
                    raise e
            raise last_exception
        return wrapper
    return decorator

@asynccontextmanager
async def safe_db_operation(db: Session, operation_name: str):
    """安全的数据库操作上下文管理器"""
    try:
        yield db
        db.commit()
    except SQLAlchemyError as e:
        logger.error(f"Database error in {operation_name}: {e}")
        db.rollback()
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in {operation_name}: {e}")
        db.rollback()
        raise e

async def _ensure_client_connect(client: TelegramClient, max_retries: int = 3, delay: float = 1.0):
    """确保 TelegramClient 连接，带重试机制"""
    for attempt in range(max_retries):
        try:
            if not client.is_connected():
                await client.connect()
            return
        except Exception as e:
            logger.warning(f"Client connect attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(delay)
            else:
                raise

class WorkflowContext:
    """工作流执行上下文"""
    def __init__(self):
        self.variables = {}
        self.chat = {}
        self.actor = {}
        self.db = {}
        self.versions = {}
        self.scheduled_at = None
        self.message_id = None
        self.sent_at = None
        self.ai = {} # 新增 ai 上下文

    def set(self, key: str, value: Any):
        self.variables[key] = value

    def get(self, key: str, default=None):
        return self.variables.get(key, default)

    def update_from_dict(self, data: Dict[str, Any]):
        self.variables.update(data)

    def to_dict(self) -> Dict[str, Any]:
        """返回上下文的字典表示"""
        return self.variables

class NodeProcessor:
    """节点处理器基类"""
    
    def __init__(self, db: Session, context: WorkflowContext):
        self.db = db
        self.context = context
        
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """执行节点并返回输出"""
        raise NotImplementedError

    def _resolve_variable_from_context(self, variable_path: str, default: Any = None) -> Any:
        """解析上下文中的变量"""
        # 支持: trigger.X, db.customer.field, ai.field, api.response.field, settings.field
        try:
            # 1. 直接访问 context.variables (最常用)
            if variable_path in self.context.variables:
                return self.context.variables.get(variable_path)

            # 2. 深度解析带点的路径 (如 'trigger.channel', 'ai.reply.reply_text')
            parts = variable_path.split('.')
            current_data = self.context.variables
            for part in parts:
                if isinstance(current_data, dict):
                    current_data = current_data.get(part)
                elif hasattr(current_data, part):
                    current_data = getattr(current_data, part)
                else:
                    return default # 路径不存在
            return current_data
        except Exception as e:
            logger.warning(f"解析变量 '{variable_path}' 失败: {e}")
            return default

    def _resolve_json_body_from_context(self, json_string: str) -> Any:
        """解析 JSON 字符串中的所有变量"""
        def replace_var(match):
            var_path = match.group(1)
            print(f"      🔍 JSON Body 中解析变量: {var_path}")
            
            # 使用与 _resolve_text_variables 相同的逻辑
            resolved_value = None
            
            # 1. 优先尝试 'trigger' 相关变量
            if var_path.startswith("trigger."):
                trigger_data = self.context.get("trigger_data", {})
                field_name = var_path.replace("trigger.", "")
                resolved_value = trigger_data.get(field_name)
                if resolved_value is not None:
                    print(f"        ✅ 从 trigger 解析: {var_path} -> {resolved_value}")
                else:
                    print(f"        ❌ trigger 中未找到: {var_path}")
            
            # 2. 尝试 'db.customer' 相关变量
            elif var_path.startswith("db.customer."):
                customer = self.context.db.get("customer")
                if customer:
                    field_name = var_path.replace("db.customer.", "")
                    if hasattr(customer, field_name):
                        resolved_value = getattr(customer, field_name)
                        print(f"        ✅ 从 db.customer 解析: {var_path} -> {resolved_value}")
                    else:
                        print(f"        ❌ customer 对象没有字段: {field_name}")
                else:
                    print(f"        ❌ 上下文中没有 customer 对象")
            
            # 3. 尝试 'custom_fields' 相关变量
            elif var_path.startswith("custom_fields."):
                customer = self.context.db.get("customer")
                if customer and hasattr(customer, 'custom_fields'):
                    field_name = var_path.replace("custom_fields.", "")
                    custom_fields = customer.custom_fields or {}
                    resolved_value = custom_fields.get(field_name)
                    if resolved_value is not None:
                        print(f"        ✅ 从 custom_fields 解析: {var_path} -> {resolved_value}")
                    else:
                        print(f"        ❌ custom_fields 中未找到: {field_name}")
                else:
                    print(f"        ❌ customer 对象没有 custom_fields")
            
            # 4. 尝试从 AI 输出中解析
            elif var_path.startswith("ai."):
                ai_data = self.context.ai
                field_name = var_path.replace("ai.", "")
                resolved_value = ai_data.get(field_name) if ai_data else None
                if resolved_value is not None:
                    print(f"        ✅ 从 ai 解析: {var_path} -> {resolved_value}")
                else:
                    print(f"        ❌ ai 中未找到: {var_path}")
            
            # 5. 尝试从 API 响应中解析
            elif var_path.startswith("api."):
                api_data = self.context.get("api.response", {})
                field_name = var_path.replace("api.", "")
                resolved_value = api_data.get(field_name) if api_data else None
                if resolved_value is not None:
                    print(f"        ✅ 从 api.response 解析: {var_path} -> {resolved_value}")
                else:
                    print(f"        ❌ api.response 中未找到: {var_path}")
            
            # 6. 尝试 'customer' 相关变量（兼容格式）
            elif var_path.startswith("customer."):
                customer = self.context.db.get("customer")
                if customer:
                    field_name = var_path.replace("customer.", "")
                    
                    # 特殊处理一些常见的字段映射
                    if field_name == "last_message":
                        # 获取最后一条消息内容
                        trigger_data = self.context.get("trigger_data", {})
                        resolved_value = trigger_data.get("message")
                        if resolved_value is not None:
                            print(f"        ✅ 从 customer.last_message (trigger) 解析: {var_path} -> {resolved_value}")
                        else:
                            print(f"        ❌ customer.last_message 未找到触发消息")
                    elif hasattr(customer, field_name):
                        resolved_value = getattr(customer, field_name)
                        print(f"        ✅ 从 customer 解析: {var_path} -> {resolved_value}")
                    else:
                        print(f"        ❌ customer 对象没有字段: {field_name}")
                else:
                    print(f"        ❌ 上下文中没有 customer 对象")
            
            # 7. 直接从上下文变量中查找
            else:
                resolved_value = self.context.get(var_path)
                if resolved_value is not None:
                    print(f"        ✅ 从 context 解析: {var_path} -> {resolved_value}")
                else:
                    print(f"        ❌ context 中未找到: {var_path}")
            
            # 对于 JSON 字符串中的变量替换，我们需要返回字符串内容而不是 JSON 值
            # 这样多个变量可以连接在一起形成一个完整的字符串
            if resolved_value is None:
                print(f"        ⚠️ 变量未解析，使用空字符串: {var_path}")
                return ""  # 返回空字符串，这样可以与其他字符串连接
            else:
                print(f"        📝 变量解析为字符串: {var_path} -> {resolved_value}")
                return str(resolved_value)  # 直接返回字符串值，不进行 JSON 编码

        # 首先进行变量替换，得到处理后的字符串
        processed_json_string = re.sub(r'\{\{([^}]+)\}\}', replace_var, json_string)
        print(f"    变量替换后的 JSON 字符串: {processed_json_string}")
        
        try:
            # 重新解析为 JSON 对象
            return json.loads(processed_json_string)
        except json.JSONDecodeError as e:
            logger.error(f"无法解析 JSON 请求体，可能包含无效变量或格式错误: {e}")
            logger.error(f"处理后的 JSON 字符串: {processed_json_string}")
            raise ValueError(f"无效的 JSON 请求体: {e}")

class MessageTriggerProcessor(NodeProcessor):
    """消息触发器节点"""
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """处理消息触发"""
        # 🔧 修复：正确获取节点配置中的渠道设置
        node_data = node_config.get("data", {})
        node_config_inner = node_data.get("config", {})
        
        # 优先从 data.config 获取，然后从 data 获取，最后回退到根级别
        channel = (node_config_inner.get("channel") or 
                  node_data.get("channel") or 
                  node_config.get("channel", "whatsapp"))
        
        match_key = (node_config_inner.get("match_key") or 
                    node_data.get("match_key") or 
                    node_config.get("match_key", "Phone"))
        
        # 从触发数据中获取消息信息
        trigger_data = self.context.get("trigger_data", {})
        
        # 🆕 添加渠道匹配验证：只有当触发渠道与节点配置渠道匹配时才继续执行
        trigger_channel = trigger_data.get("channel", "whatsapp")
        
        print(f"🔍 MessageTrigger 渠道匹配检查:")
        print(f"  节点配置渠道: {channel}")
        print(f"  触发数据渠道: {trigger_channel}")
        print(f"  节点配置详情:")
        print(f"    - data.config.channel: {node_config_inner.get('channel')}")
        print(f"    - data.channel: {node_data.get('channel')}")
        print(f"    - root.channel: {node_config.get('channel')}")
        
        if channel != trigger_channel:
            print(f"  ❌ 渠道不匹配，跳过此工作流")
            # 渠道不匹配，返回空结果，不继续执行工作流
            raise ValueError(f"Channel mismatch: trigger channel '{trigger_channel}' does not match node channel '{channel}'")
        
        print(f"  ✅ 渠道匹配，继续执行工作流")
        
        if channel in ("whatsapp", "telegram"):
            # normalize incoming trigger fields
            phone = trigger_data.get("phone")
            chat_id = trigger_data.get("chat_id") or trigger_data.get("telegram_chat_id")
            message_content = trigger_data.get("message") or trigger_data.get("content")

            # 🔒 從觸發數據獲取 user_id
            user_id = trigger_data.get("user_id")
            if not user_id:
                logger.error("Workflow trigger missing user_id")
                raise ValueError("Workflow trigger missing user_id")

            # 🔒 獲取屬於特定用戶的客戶信息
            # For Telegram prefer matching by telegram_chat_id (chat id) if available, else fall back to phone
            customer = None
            if channel == "telegram" and chat_id:
                customer = self.db.query(Customer).filter(
                    Customer.telegram_chat_id == str(chat_id),
                    Customer.user_id == user_id
                ).first()
            if not customer and phone:
                customer = self.db.query(Customer).filter(
                    Customer.phone == phone,
                    Customer.user_id == user_id
                ).first()

            if not customer:
                # 🔒 創建新客戶時設置正確的 user_id
                customer = Customer(
                    phone=phone or None,
                    name=phone or (chat_id and f"tg_{chat_id}") or "unknown",
                    status="active",
                    user_id=user_id,
                    telegram_chat_id=str(chat_id) if chat_id else None
                )
                self.db.add(customer)
                self.db.commit()
                self.db.refresh(customer)

            # 🔒 获取聊天历史（最近5条，僅限該用戶）
            chat_history = self.db.query(Message).filter(
                Message.customer_id == customer.id,
                Message.user_id == user_id
            ).order_by(Message.timestamp.desc()).limit(5).all()

            # 更新上下文
            self.context.chat["last_message"] = message_content
            self.context.chat["history"] = [
                {"content": msg.content, "direction": msg.direction}
                for msg in reversed(chat_history)
            ]
            # actor info: include both phone and chat_id when available
            if phone:
                self.context.actor["phone"] = phone
            if chat_id:
                self.context.actor["chat_id"] = chat_id
            self.context.db["customer"] = customer

            # 创建可序列化的客户信息
            customer_data = {
                "id": str(customer.id),
                "name": customer.name,
                "phone": customer.phone,
                "status": customer.status,
                "user_id": customer.user_id,
                "telegram_chat_id": customer.telegram_chat_id
            }
            
            result = {
                "ctx.chat.last_message": message_content,
                "ctx.chat.history": self.context.chat["history"],
                "ctx.db.customer": customer_data  # 使用可序列化的数据
            }
            if phone:
                result["ctx.actor.phone"] = phone
            if chat_id:
                result["ctx.actor.chat_id"] = chat_id
            return result
        
        raise ValueError(f"Unsupported channel: {channel} or match_key: {match_key}")

class DbTriggerProcessor(NodeProcessor):
    """数据库触发器节点 - 监听数据库字段变化"""
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """处理数据库触发"""
        node_data = node_config.get("data", {})
        node_config_inner = node_data.get("config", {})
        
        # 获取触发器配置
        table = node_config_inner.get("table", "customers")
        field = node_config_inner.get("field")
        condition = node_config_inner.get("condition", "equals")
        value = node_config_inner.get("value", "")
        frequency = node_config_inner.get("frequency", "immediate")
        trigger_platform = node_config_inner.get("trigger_platform", "whatsapp")
        
        print(f"🗄️ DbTrigger 配置:")
        print(f"  表: {table}")
        print(f"  字段: {field}")
        print(f"  条件: {condition}")
        print(f"  值: {value}")
        print(f"  频率: {frequency}")
        print(f"  触发平台: {trigger_platform}")
        
        if not field:
            raise ValueError("数据库触发器必须指定监听字段")
        
        # 从触发数据中获取数据库变化信息
        trigger_data = self.context.get("trigger_data", {})
        
        # 验证触发数据是否为数据库变化事件
        if trigger_data.get("type") != "db_change":
            raise ValueError(f"DbTrigger requires db_change trigger type, got: {trigger_data.get('type')}")
        
        # 验证表名匹配
        if trigger_data.get("table") != table:
            raise ValueError(f"Table mismatch: trigger table '{trigger_data.get('table')}' does not match node table '{table}'")
        
        # 验证字段匹配
        if trigger_data.get("field") != field:
            raise ValueError(f"Field mismatch: trigger field '{trigger_data.get('field')}' does not match node field '{field}'")
        
        # 获取字段的新值和旧值
        new_value = trigger_data.get("new_value", "")
        old_value = trigger_data.get("old_value", "")
        
        print(f"  触发数据:")
        print(f"    新值: {new_value}")
        print(f"    旧值: {old_value}")
        
        # 根据条件检查是否满足触发条件
        trigger_matched = self._check_condition(condition, new_value, value)
        
        if not trigger_matched:
            raise ValueError(f"Condition not met: {field} {condition} {value}, actual value: {new_value}")
        
        print(f"  ✅ 触发条件满足")
        
        # 获取完整的客户数据
        customer_id = trigger_data.get("customer_id")
        if customer_id:
            from app.db.models import Customer
            customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
            if customer:
                # 将客户数据添加到上下文
                customer_data = {
                    "id": customer.id,
                    "name": customer.name,
                    "phone": customer.phone,
                    "email": customer.email,
                    "status": customer.status,
                    "stage_id": customer.stage_id,
                    "telegram_chat_id": customer.telegram_chat_id,
                    "photo_url": customer.photo_url,
                    "last_message": customer.last_message,
                    "last_timestamp": customer.last_timestamp.isoformat() if customer.last_timestamp else None,
                    "unread_count": customer.unread_count,
                    "updated_at": customer.updated_at.isoformat() if customer.updated_at else None,
                    "version": customer.version,
                }
                
                # 添加所有自定义字段
                if hasattr(customer, 'custom_fields') and customer.custom_fields:
                    customer_data.update(customer.custom_fields)
                
                self.context.set("customer", customer_data)
                print(f"  📊 已加载客户数据: {customer.name} ({customer.phone})")
        
        # 返回触发结果
        result = {
            "trigger_type": "db_change",
            "table": table,
            "field": field,
            "condition": condition,
            "value": value,
            "new_value": new_value,
            "old_value": old_value,
            "customer_id": customer_id,
            "timestamp": trigger_data.get("timestamp"),
        }
        
        # 根据配置的平台添加客户联系信息，并更新上下文中的 trigger_data
        if customer_id:
            from app.db.models import Customer
            customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
            if customer:
                contact_info_added = False
                
                # 获取当前的 trigger_data
                current_trigger_data = self.context.get("trigger_data", {})
                
                if trigger_platform == "whatsapp" and customer.phone:
                    result["phone"] = customer.phone
                    result["channel"] = "whatsapp"
                    result["name"] = customer.name or customer.phone
                    
                    # 更新上下文中的 trigger_data
                    current_trigger_data.update({
                        "phone": customer.phone,
                        "channel": "whatsapp",
                        "name": customer.name or customer.phone
                    })
                    self.context.set("trigger_data", current_trigger_data)
                    
                    print(f"  📱 添加 WhatsApp 联系信息: {customer.phone} ({customer.name})")
                    contact_info_added = True
                    
                elif trigger_platform == "telegram" and customer.telegram_chat_id:
                    result["chat_id"] = customer.telegram_chat_id
                    result["telegram_chat_id"] = customer.telegram_chat_id
                    result["channel"] = "telegram"
                    result["name"] = customer.name or f"tg_{customer.telegram_chat_id}"
                    
                    # 更新上下文中的 trigger_data
                    current_trigger_data.update({
                        "chat_id": customer.telegram_chat_id,
                        "telegram_chat_id": customer.telegram_chat_id,
                        "channel": "telegram",
                        "name": customer.name or f"tg_{customer.telegram_chat_id}"
                    })
                    self.context.set("trigger_data", current_trigger_data)
                    
                    print(f"  💬 添加 Telegram 联系信息: {customer.telegram_chat_id} ({customer.name})")
                    contact_info_added = True
                    
                elif trigger_platform == "auto":
                    # 自动检测：优先 WhatsApp，回退到 Telegram
                    if customer.phone:
                        result["phone"] = customer.phone
                        result["channel"] = "whatsapp"
                        result["name"] = customer.name or customer.phone
                        
                        # 更新上下文中的 trigger_data
                        current_trigger_data.update({
                            "phone": customer.phone,
                            "channel": "whatsapp",
                            "name": customer.name or customer.phone
                        })
                        self.context.set("trigger_data", current_trigger_data)
                        
                        print(f"  🤖 自动选择 WhatsApp: {customer.phone} ({customer.name})")
                        contact_info_added = True
                    elif customer.telegram_chat_id:
                        result["chat_id"] = customer.telegram_chat_id
                        result["telegram_chat_id"] = customer.telegram_chat_id
                        result["channel"] = "telegram"
                        result["name"] = customer.name or f"tg_{customer.telegram_chat_id}"
                        
                        # 更新上下文中的 trigger_data
                        current_trigger_data.update({
                            "chat_id": customer.telegram_chat_id,
                            "telegram_chat_id": customer.telegram_chat_id,
                            "channel": "telegram",
                            "name": customer.name or f"tg_{customer.telegram_chat_id}"
                        })
                        self.context.set("trigger_data", current_trigger_data)
                        
                        print(f"  🤖 自动选择 Telegram: {customer.telegram_chat_id} ({customer.name})")
                        contact_info_added = True
                
                if not contact_info_added:
                    print(f"  ⚠️ 警告: 客户 {customer.name} 没有可用的联系方式 (平台: {trigger_platform})")
                    
                # 添加用户ID用于权限控制
                result["user_id"] = customer.user_id
        
        return result
    
    def _check_condition(self, condition: str, actual_value: str, expected_value: str) -> bool:
        """检查字段值是否满足触发条件"""
        actual_str = str(actual_value).strip()
        expected_str = str(expected_value).strip()
        
        if condition == "equals":
            return actual_str == expected_str
        elif condition == "not_equals":
            return actual_str != expected_str
        elif condition == "contains":
            return expected_str.lower() in actual_str.lower()
        elif condition == "not_contains":
            return expected_str.lower() not in actual_str.lower()
        elif condition == "starts_with":
            return actual_str.lower().startswith(expected_str.lower())
        elif condition == "ends_with":
            return actual_str.lower().endswith(expected_str.lower())
        elif condition == "is_empty":
            return actual_str == "" or actual_str is None
        elif condition == "is_not_empty":
            return actual_str != "" and actual_str is not None
        elif condition == "changed":
            # 对于 "changed" 条件，只要新值和旧值不同就触发
            return True
        else:
            return False

class AIProcessor(NodeProcessor):
    """AI 节点 - 集成分析和回复生成"""
    
    def __init__(self, db: Session, context: WorkflowContext):
        super().__init__(db, context)
        # 延迟初始化 AIService，先保留 db_session；在 execute 时根据上下文创建 ai_service
        self.db_session = db
        self.ai_service = None
    
    async def _get_chat_history(self, customer_id: str, message_count: int, include_timestamps: bool = False) -> str:
        """
        获取客户的聊天历史记录
        
        Args:
            customer_id: 客户ID
            message_count: 获取的消息条数
            include_timestamps: 是否包含时间戳
            
        Returns:
            格式化的聊天历史字符串
        """
        try:
            from app.db.models import Message
            from datetime import datetime
            
            # 获取最近的消息记录
            messages = self.db.query(Message).filter(
                Message.customer_id == customer_id
            ).order_by(Message.timestamp.desc()).limit(message_count).all()
            
            if not messages:
                return ""
            
            # 反转顺序，使最早的消息在前
            messages.reverse()
            
            # 格式化聊天历史
            history_lines = []
            for msg in messages:
                # 确定发送者
                sender = "客户" if msg.direction == "inbound" else "AI"
                
                # 格式化时间戳
                if include_timestamps:
                    timestamp = msg.timestamp.strftime("%Y-%m-%d %H:%M")
                    line = f"[{timestamp}] {sender}: {msg.content}"
                else:
                    line = f"{sender}: {msg.content}"
                
                history_lines.append(line)
            
            return "\n".join(history_lines)
            
        except Exception as e:
            logger.error(f"Failed to get chat history: {e}")
            return ""
    
    def _generate_data_update_prompt(self, update_fields: list) -> str:
        """根据配置的字段生成数据更新的 System Prompt 部分"""
        if not update_fields:
            return ""
        
        enabled_fields = [f for f in update_fields if f.get('enabled', True)]
        if not enabled_fields:
            return ""
        
        prompt_parts = ["请分析客户消息并提取以下信息：\n"]
        
        for i, field in enumerate(enabled_fields, 1):
            field_name = field.get('field_name', '')
            output_key = field.get('output_key', '')
            data_type = field.get('data_type', 'string')
            description = field.get('description', '')
            example = field.get('example', '')
            
            prompt_parts.append(f"{i}. {output_key} ({field_name}):")
            if description:
                prompt_parts.append(f"   {description}")
            prompt_parts.append(f"   数据类型: {data_type}")
            if example:
                prompt_parts.append(f"   示例: {example}")
            prompt_parts.append("")
        
        return "\n".join(prompt_parts)

    def _generate_reply_style_prompt(self, reply_config: dict) -> str:
        """根据回复配置生成回复风格的 System Prompt 部分"""
        if not reply_config.get('enable_auto_reply', False):
            return ""
        
        style_map = {
            'professional': '采用专业正式的语调',
            'friendly': '采用友好亲切的语调',
            'casual': '采用轻松随意的语调',
            'enthusiastic': '采用热情积极的语调'
        }
        
        style = reply_config.get('reply_style', 'professional')
        max_length = reply_config.get('reply_max_length', 700)
        
        prompt_parts = [
            f"回复要求：",
            f"- {style_map.get(style, '采用专业正式的语调')}",
            f"- 回复长度不超过 {max_length} 个字符",
            f"- 内容要有帮助且相关"
        ]
        
        return "\n".join(prompt_parts)

    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """执行 AI 分析和回复生成"""
        print(f"\n🤖 AI節點開始執行...")
        print(f"  節點配置: {node_config}")
        
        try:
            # 获取新的配置
            model_config = node_config.get("model", {
                "name": "gpt-4o-mini", 
                "temperature": 0.7, 
                "max_tokens": 500
            })
            
            # 🔧 修復：從 data 字段獲取 prompt 配置
            node_data = node_config.get("data", {})
            
            # 获取客户数据以确定阶段
            customer = self.context.db.get("customer", None)
            
            # 🆕 新的配置结构处理
            enable_data_update = node_data.get("enable_data_update", False)
            enable_auto_reply = node_data.get("enable_auto_reply", False)
            enable_handoff = node_data.get("enable_handoff", False)
            
            # 🆕 生成动态 System Prompt
            system_prompt_parts = []
            
            # 首先添加原始的 system_prompt（如果存在）
            original_system_prompt = node_data.get("system_prompt", "")
            if original_system_prompt:
                system_prompt_parts.append(original_system_prompt)
            else:
                system_prompt_parts.append("你是一个专业的客户服务 AI 助手。")
            
            # 添加数据更新指令
            if enable_data_update:
                update_fields = node_data.get("update_fields", [])
                data_update_prompt = self._generate_data_update_prompt(update_fields)
                if data_update_prompt:
                    system_prompt_parts.append(data_update_prompt)
            
            # 添加回复生成指令
            if enable_auto_reply:
                reply_prompt = self._generate_reply_style_prompt(node_data)
                if reply_prompt:
                    system_prompt_parts.append(reply_prompt)
                
                # 🆕 添加分句回复支持
                enable_split_reply = node_data.get("enable_split_reply", False)
                if enable_split_reply:
                    split_prompt = """
分句回复模式：
- 请将你的回复分成2-4个自然的短句
- 每个句子应该完整且有意义
- 在JSON的reply_text字段中，用 "||" 分隔每个句子
- 例如："感谢您的咨询！||我们会尽快为您处理。||如有其他问题请随时联系我们。"
"""
                    system_prompt_parts.append(split_prompt)
            
            # 🆕 构建 JSON 输出格式要求
            json_schema = {
                "analyze": {
                    "updates": {},
                    "confidence": 0.0,
                    "reason": "Brief explanation"
                },
                "reply": {
                    "reply_text": "Your response to customer" if enable_auto_reply else "",
                },
                "meta": {
                    "used_profile": "ai_assistant",
                    "safe_to_send_before_db_update": True
                }
            }
            
            # 添加 Handoff 配置
            if enable_handoff:
                json_schema["meta"]["handoff"] = {
                    "triggered": False,
                    "reason": None,
                    "confidence": 0.0
                }
                
                handoff_threshold = node_data.get("handoff_threshold", 0.6)
                system_prompt_parts.append(f"""
HANDOFF 规则：
- 当你的置信度低于 {handoff_threshold} 时，设置 "meta.handoff.triggered": true
- 在 "meta.handoff.reason" 中说明转接原因
- 始终在 "analyze.confidence" 中提供你的置信度评分 (0.0-1.0)
""")
            
            # 添加 JSON 格式要求
            system_prompt_parts.append(f"""
输出格式要求：
你必须返回有效的 JSON 格式，结构如下：
{json.dumps(json_schema, indent=2, ensure_ascii=False)}

重要：只返回 JSON，不要添加任何其他文本或 markdown 格式。
""")
            
            # 合并所有部分
            base_system_prompt = "\n\n".join(system_prompt_parts)
            
            # 🔧 解析 System Prompt 中的变量
            system_prompt = await self._resolve_prompt_variables(base_system_prompt)
            
            # 构建 User Prompt
            # 首先尝试使用配置的 user_prompt，如果没有则使用默认格式
            configured_user_prompt = node_data.get("user_prompt", "")
            if configured_user_prompt:
                user_prompt = configured_user_prompt
            else:
                trigger_data = self.context.get("trigger_data", {})
                trigger_content = trigger_data.get("message", trigger_data.get("content", ""))
                user_prompt = f"客户刚刚发送的最新消息：{trigger_content}\n\n请根据以上消息内容进行分析和回复。"

            # 🔧 处理聊天历史配置
            chat_history_config = node_data.get("chat_history", {})
            chat_history_text = ""
            
            if chat_history_config.get("enabled", False):
                # 优先使用来自 WhatsApp 网关的聊天历史
                trigger_data = self.context.get("trigger_data", {})
                gateway_chat_history = trigger_data.get("chat_history", [])
                
                if gateway_chat_history:
                    message_count = chat_history_config.get("message_count", 10)
                    include_timestamps = chat_history_config.get("include_timestamps", False)
                    
                    print(f"  📚 使用网关聊天历史: {len(gateway_chat_history)}条消息, 限制: {message_count}条, 时间戳: {include_timestamps}")
                    
                    # 限制消息数量
                    limited_history = gateway_chat_history[-message_count:] if message_count > 0 else gateway_chat_history
                    
                    # 格式化聊天历史
                    history_lines = []
                    for msg in limited_history:
                        sender = "客户" if msg.get("direction") == "inbound" else "AI"
                        content = msg.get("content", "")
                        
                        if include_timestamps and msg.get("timestamp"):
                            # 格式化时间戳
                            from datetime import datetime
                            try:
                                timestamp = datetime.fromisoformat(msg["timestamp"].replace("Z", "+00:00"))
                                time_str = timestamp.strftime("%Y-%m-%d %H:%M")
                                line = f"[{time_str}] {sender}: {content}"
                            except:
                                line = f"{sender}: {content}"
                        else:
                            line = f"{sender}: {content}"
                        
                        history_lines.append(line)
                    
                    chat_history_text = "\n".join(history_lines)
                    print(f"  ✅ 网关聊天历史处理成功: {len(history_lines)}行")
                
                elif customer:
                    # 回退到数据库查询（保持兼容性）
                    message_count = chat_history_config.get("message_count", 10)
                    include_timestamps = chat_history_config.get("include_timestamps", False)
                    
                    print(f"  📚 回退到数据库查询聊天历史: {message_count}条消息, 时间戳: {include_timestamps}")
                    chat_history_text = await self._get_chat_history(
                        customer.id, 
                        message_count, 
                        include_timestamps
                    )
                    
                    if chat_history_text:
                        print(f"  ✅ 数据库聊天历史获取成功: {len(chat_history_text.split(chr(10)))}行")
                    else:
                        print(f"  ⚠️ 未找到聊天历史记录")
                
                # 将聊天历史添加到 user_prompt
                if chat_history_text:
                    user_prompt = f"聊天历史记录:\n{chat_history_text}\n\n当前用户消息: {user_prompt}"

            # 动态拼接 system_prompt，如果 enableHandoff 为 true
            enable_handoff = node_data.get("enableHandoff", False)
            if enable_handoff:
                print("  ✅ Handoff enabled: Dynamically appending confidence and JSON instructions to system_prompt.")
                # 这里注入详细的 JSON 格式和 confidence 指导
                system_prompt = f"""{base_system_prompt} You MUST return ONLY valid JSON (no extra text before or after).

CRITICAL: Your response must be valid JSON following this exact schema:

{{
  "analyze": {{
    "updates": {{}},
    "uncertain": [],
    "reason": "Brief explanation for your confidence level (1-2 sentences)",
    "confidence": 0.0
  }},
  "reply": {{
    "reply_text": "Your helpful response to the customer",
    "followup_questions": [],
    "suggested_tags": []
  }},
  "meta": {{
    "used_profile": "ai_assistant",
    "separator": "|||",
    "safe_to_send_before_db_update": true,
    "handoff": {{
      "triggered": false,
      "reason": null,
      "confidence": 0.0
    }}
  }}
}}

CONFIDENCE SCORING (MANDATORY - DO NOT use 0.0 unless truly uncertain):
- 0.0-0.2: Cannot answer / No relevant information / Complete uncertainty
- 0.3-0.5: Some uncertainty / Partial information / Need clarification  
- 0.6-0.8: Good confidence / Clear information available
- 0.9-1.0: Very high confidence / Exact factual answer / Direct evidence

HANDOFF LOGIC:
- Set "handoff.triggered": true if you cannot provide a helpful answer
- Set "handoff.triggered": false if you can provide a useful response
- Always set "handoff.confidence" to match your "analyze.confidence"
- In "analyze.reason", briefly explain why you chose that confidence level

EXAMPLES:
- Real estate question with clear answer → confidence: 0.8-0.9, handoff: false
- Vague inquiry needing clarification → confidence: 0.4-0.6, handoff: false  
- Completely unrelated topic → confidence: 0.1-0.2, handoff: true
- Technical issue you cannot help with → confidence: 0.0-0.1, handoff: true

Remember: Return ONLY the JSON. No markdown, no explanations, just valid JSON."""
            else:
                system_prompt = base_system_prompt
                print("  ❌ Handoff not enabled: Using base system_prompt without confidence/JSON instructions.")

            print(f"  📝 最终 System Prompt: {system_prompt}")
            print(f"  📝 User Prompt: {user_prompt}")
            print(f"  Model Config: {model_config}")
            
            # 确保上下文中有 customer（容错：如果 MessageTrigger 没先运行）
            if not self.context.db.get("customer", None):
                trigger = self.context.get("trigger_data", {})
                phone = trigger.get("phone")
                user_id = trigger.get("user_id")
                if phone and user_id:
                    try:
                        cust = self.db.query(Customer).filter(Customer.phone == phone, Customer.user_id == user_id).first()
                        if cust:
                            self.context.db["customer"] = cust
                    except Exception:
                        pass

            # 初始化 ai_service（用最新的 user_id）
            if not self.ai_service:
                customer = self.context.db.get("customer", None)
                user_id = customer.user_id if customer else None
                self.ai_service = AIService(db_session=self.db_session, user_id=user_id)

            # 解析用户prompt中的变量
            resolved_user_prompt = await self._resolve_prompt_variables(user_prompt)
            # print(f"  解析後的 User Prompt: {resolved_user_prompt}") # Duplicate print
            
            # 🔧 修復：嘗試使用真正的 OpenAI API，如果失敗則使用模擬
            try:
                print(f"  🚀 嘗試調用 OpenAI API...")
                print(f"  API Key 可用: {bool(self.ai_service and self.ai_service.api_key)}")
                
                if self.ai_service and self.ai_service.api_key and self.ai_service.client:
                    print(f"  📡 發送請求到 OpenAI...")
                    # 获取媒体设置
                    media_settings = node_data.get("media_settings", {})
                    
                    # 调试：检查 system_prompt 中的媒体标记
                    import re
                    media_pattern = r'\[\[MEDIA:([a-f0-9\-]{36})\]\]'
                    media_matches = re.findall(media_pattern, system_prompt)
                    print(f"  🖼️ System Prompt 中发现媒体 UUID: {media_matches}")
                    
                    llm_response = await self.ai_service.generate_combined_response(
                        system_prompt=system_prompt,
                        user_prompt=resolved_user_prompt,
                        model=model_config.get("name", "gpt-4o-mini"),
                        temperature=model_config.get("temperature", 0.7),
                        max_tokens=model_config.get("max_tokens", 900),
                        media_settings=media_settings
                    )
                    print(f"  ✅ OpenAI API 回復: {llm_response.get('reply', {}).get('reply_text', '')}")
                    
                    # 美化并打印完整的LLM输出
                    try:
                        print("--- 🤖 AI 完整 JSON 响应开始 ---")
                        print(json.dumps(llm_response, indent=2, ensure_ascii=False))
                        print("--- 🤖 AI 完整 JSON 响应结束 ---")
                    except Exception as e:
                        print(f"  ⚠️ 打印LLM原始输出失败: {e}")

                    # 提取 confidence
                    ai_confidence = llm_response.get("analyze", {}).get("confidence", 0.0)
                    
                    # 根据AI置信度进行Handoff判断，并设置分支
                    handoff_threshold = node_data.get("handoff_threshold", 0.6)
                    
                    should_handoff = enable_handoff and (ai_confidence <= handoff_threshold)
                    
                    # 🆕 处理分句回复
                    reply_data = llm_response.get("reply", {})
                    reply_text = reply_data.get("reply_text", "")
                    
                    # 检查是否启用了分句回复并且回复中包含分隔符
                    enable_split_reply = node_data.get("enable_split_reply", False)
                    if enable_split_reply and "||" in reply_text:
                        # 分割回复为多条消息
                        split_messages = [msg.strip() for msg in reply_text.split("||") if msg.strip()]
                        print(f"  🔀 分句回复：将回复分割为 {len(split_messages)} 条消息")
                        
                        # 创建消息模板数组
                        message_templates = []
                        for i, msg in enumerate(split_messages):
                            message_templates.append({
                                "id": i + 1,
                                "content": msg
                            })
                        
                        # 将分句消息添加到回复数据中
                        reply_data["message_templates"] = message_templates
                        reply_data["split_messages"] = split_messages
                        
                        # 同时设置到上下文中供后续节点使用
                        self.context.variables["message_templates"] = message_templates
                        print(f"  📝 分句消息: {[msg['content'] for msg in message_templates]}")
                    
                    # 更新 context.ai 并返回分支
                    self.context.ai['reply'] = reply_data
                    self.context.ai['analyze'] = llm_response.get("analyze", {})
                    self.context.ai['meta'] = llm_response.get("meta", {})
                    self.context.ai['prompt_used'] = {"system": system_prompt, "user": resolved_user_prompt}
                    self.context.ai['api_used'] = "openai"
                    
                    # 保存 AI 分析结果到数据库
                    customer = self.context.db.get("customer", None)
                    message = self.db.query(Message).filter(Message.customer_id == customer.id).order_by(Message.timestamp.desc()).first()
                    
                    if customer: # 只有当有客户时才保存分析结果
                        ai_analysis = AIAnalysis(
                            customer_id=customer.id,
                            message_id=message.id if message else None, # 可以为空
                            analysis_type="extract_and_reply",
                            input_data={"system_prompt": system_prompt, "user_prompt": resolved_user_prompt},
                            output_data=llm_response,
                            confidence=ai_confidence,
                            model_used=model_config.get("name", "gpt-4o-mini"),
                            handoff_triggered=should_handoff, # 存储 handoff 状态
                            handoff_reason=llm_response.get("meta", {}).get("handoff", {}).get("reason", "") if should_handoff else None, # 存储 handoff 原因
                            user_id=customer.user_id # 确保 user_id 被设置
                        )
                        self.db.add(ai_analysis)
                        self.db.commit()
                        self.db.refresh(ai_analysis)

                    # 🔧 修復: handoff 觸發時走 false 分支到模板節點，不觸發時走 true 分支到 AI 回復節點
                    branch = "false" if should_handoff else "true"
                    self.context.set(f"__branch__{node_config['id']}", branch)
                    print(f"  Handoff enabled: {enable_handoff}, Confidence: {ai_confidence}, Threshold: {handoff_threshold}, Triggered: {should_handoff}, Branch: {branch}")
                    # Add the ai context to the variables dictionary for propagation
                    self.context.variables['ai'] = self.context.ai 

                    # Also store AI output under node ID for direct reference
                    self.context.variables[f'{node_config["id"]}.output'] = {
                        "reply_text": llm_response.get("reply", {}).get("reply_text", ""),
                        "analyze": llm_response.get("analyze", {}),
                        "meta": llm_response.get("meta", {})
                    }

                    return self.context.to_dict()
                else:
                    print(f"  ⚠️ 沒有可用的 OpenAI API Key 或客戶端未初始化，使用模擬回復")
                    # 模拟AI回复（如果真正的API不可用）
                    ai_reply_text = "抱歉，AI服务暂时不可用。"
                    llm_response = {
                        "analyze": {
                            "updates": {},
                            "uncertain": [],
                            "reason": "OpenAI API not available or client not initialized",
                            "confidence": random.uniform(0.3, 0.9) # 随机生成置信度
                        },
                        "reply": {
                            "reply_text": ai_reply_text,
                            "followup_questions": [],
                            "suggested_tags": []
                        },
                        "meta": {
                            "used_profile": "mock_ai_response",
                            "separator": "|||",
                            "safe_to_send_before_db_update": True
                        }
                    }
                    
                    # Determine if handoff should be triggered based on mock confidence
                    mock_confidence = llm_response["analyze"]["confidence"]
                    should_handoff = enable_handoff and (mock_confidence < handoff_threshold)
                    
                    # 🔧 修復: handoff 觸發時走 false 分支到模板節點，不觸發時走 true 分支到 AI 回復節點
                    branch = "false" if should_handoff else "true"
                    self.context.set(f"__branch__{node_config['id']}", branch)
                    print(f"  Handoff enabled: {enable_handoff}, Confidence: {mock_confidence}, Threshold: {handoff_threshold}, Triggered: {should_handoff}, Branch: {branch}")

                    # Update ai context with mock response
                    self.context.ai.update(**llm_response)
                    self.context.ai["prompt_used"] = {"system": system_prompt, "user": user_prompt}
                    self.context.ai["api_used"] = "mock_openai"
                    self.context.variables['ai'] = self.context.ai
                    self.context.variables[f'{node_config["id"]}.output'] = {
                        "reply_text": llm_response.get("reply", {}).get("reply_text", ""),
                        "analyze": llm_response.get("analyze", {}),
                        "meta": llm_response.get("meta", {})
                    }
                    return self.context.to_dict()
            except Exception as api_error:
                print(f"  ❌ OpenAI API 調用失敗: {api_error}")
                print(f"  錯誤類型: {type(api_error).__name__}")
                logger.error(f"OpenAI API call failed: {api_error}")
            
            # 模拟AI回复（如果真正的API不可用）
            ai_reply_text = "抱歉，AI服务暂时不可用。"
            llm_response = {
                "analyze": {
                    "updates": {},
                    "uncertain": [],
                    "reason": f"OpenAI API call failed: {type(api_error).__name__}",
                    "confidence": random.uniform(0.3, 0.9) # 随机生成置信度
                },
                "reply": {
                    "reply_text": ai_reply_text,
                    "followup_questions": [],
                    "suggested_tags": []
                },
                "meta": {
                    "used_profile": "error_fallback",
                    "separator": "|||",
                    "safe_to_send_before_db_update": True
                }
            }
            
            # Determine if handoff should be triggered based on fallback confidence
            fallback_confidence = llm_response["analyze"]["confidence"]
            should_handoff = enable_handoff and (fallback_confidence < handoff_threshold)
            
            # 🔧 修復: handoff 觸發時走 false 分支到模板節點，不觸發時走 true 分支到 AI 回復節點
            branch = "false" if should_handoff else "true"
            self.context.set(f"__branch__{node_config['id']}", branch)
            print(f"  Handoff enabled: {enable_handoff}, Confidence: {fallback_confidence}, Threshold: {handoff_threshold}, Triggered: {should_handoff}, Branch: {branch}")

            # Update ai context with fallback response
            self.context.ai.update(**llm_response)
            self.context.ai["prompt_used"] = {"system": system_prompt, "user": user_prompt}
            self.context.ai["api_used"] = "error_fallback"
            self.context.variables['ai'] = self.context.ai
            self.context.variables[f'{node_config["id"]}.output'] = {
                "reply_text": llm_response.get("reply", {}).get("reply_text", ""),
                "analyze": llm_response.get("analyze", {}),
                "meta": llm_response.get("meta", {})
            }
            return self.context.to_dict()
        except Exception as e:
            # 捕获 execute 方法中的任何未处理异常，确保方法有完整的 try/except 结构
            print(f"  ❌ AI 處理失敗: {e}")
            logger.error(f"AI processing failed: {e}")

            # 构造一个安全的回退 ai 上下文
            error_reply = {"reply_text": "抱歉，AI处理出现问题，我们会尽快回复您。", "followup_questions": [], "suggested_tags": []}
            error_analyze = {"updates": {}, "confidence": 0.0, "uncertain": [], "reason": f"AI处理失败: {e}"}
            error_meta = {"handoff": {"triggered": False, "reason": "AI处理错误", "confidence": 0}}

            try:
                self.context.ai['reply'] = error_reply
                self.context.ai['analyze'] = error_analyze
                self.context.ai['meta'] = error_meta
                # 保证 prompt_used 字段存在（如果在上文定义过 system_prompt/user_prompt 则使用）
                if 'system_prompt' in locals() and 'user_prompt' in locals():
                    self.context.ai['prompt_used'] = {"system": system_prompt, "user": user_prompt}
                self.context.ai['api_used'] = "error"
                self.context.variables['ai'] = self.context.ai
                self.context.variables[f'{node_config["id"]}.output'] = {
                    "reply_text": error_reply['reply_text'],
                    "analyze": error_analyze,
                    "meta": error_meta
                }
            except Exception:
                # 如果构建回退上下文失败，仍然返回一个最小结构，避免抛出二次异常
                return {
                    "ai.reply": error_reply,
                    "ai.analyze": error_analyze,
                    "ai.meta": error_meta,
                    f"__branch__{node_config.get('id')}": "false"
                }

            return self.context.to_dict()

    async def _resolve_prompt_variables(self, prompt: str) -> str:
        """解析 prompt 中的变量并返回解析后的字符串
        
        使用通用变量解析机制，支持 PromptFormModal 中定义的所有变量类型：
        - 触发器数据: {{trigger.name}}, {{trigger.phone}}, {{trigger.message}}, {{trigger.chat_id}}, {{trigger.timestamp}}, {{trigger.user_id}}, {{trigger.channel}}
        - 客户基础信息: {{customer.name}}, {{customer.phone}}, {{customer.email}}, {{customer.status}}, {{customer.last_message}}
        - 客户自定义字段: {{custom_fields.field_name}}
        - AI 输出: {{ai.reply.reply_text}}, {{ai.analyze}}, {{ai.analyze.confidence}}
        - API 响应: {{api.response.data}}, {{api.response.status_code}}
        - 数据库字段: {{db.customer.field_name}}
        """
        if not prompt:
            return ""
            
        print(f"  🔍 AI Prompt 变量解析开始...")
        print(f"    原始 Prompt: {prompt[:100]}...")
        
        try:
            # 使用正则表达式找到所有 {{variable}} 格式的变量
            import re
            pattern = r'\{\{([^}]+)\}\}'
            
            def replace_variable(match):
                var_path = match.group(1).strip()
                print(f"    🔍 解析变量: {var_path}")
                
                # 获取上下文数据
                trigger_data = self.context.get("trigger_data", {})
                customer = self.context.get("ctx.db.customer")
                ai_data = self.context.get("ai", {})
                api_data = self.context.get("api", {})
                
                # 1. 触发器变量
                if var_path.startswith("trigger."):
                    field = var_path[8:]  # 移除 "trigger." 前缀
                    
                    # 字段映射处理
                    if field == "content":
                        field = "message"  # content -> message
                    elif field == "user_id":
                        field = "user_id"
                    
                    value = trigger_data.get(field)
                    if value is not None:
                        print(f"      ✅ 从 trigger 解析: {var_path} -> {value}")
                        return str(value)
                    else:
                        print(f"      ❌ trigger 中未找到: {var_path}")
                
                # 2. 客户基础信息变量
                elif var_path.startswith("customer."):
                    field = var_path[9:]  # 移除 "customer." 前缀
                    
                    if customer:
                        # 特殊处理 last_message
                        if field == "last_message":
                            value = trigger_data.get("message", "")
                            print(f"      ✅ 客户最后消息: {var_path} -> {value}")
                            return str(value)
                        
                        # 标准客户字段
                        value = getattr(customer, field, None)
                        if value is not None:
                            print(f"      ✅ 从 customer 解析: {var_path} -> {value}")
                            return str(value)
                        
                        # 尝试从客户自定义字段中获取
                        if hasattr(customer, 'custom_fields') and customer.custom_fields:
                            custom_value = customer.custom_fields.get(field)
                            if custom_value is not None:
                                print(f"      ✅ 从客户自定义字段解析: {var_path} -> {custom_value}")
                                return str(custom_value)
                    
                    print(f"      ❌ customer 中未找到: {var_path}")
                
                # 3. 客户自定义字段变量
                elif var_path.startswith("custom_fields."):
                    field = var_path[14:]  # 移除 "custom_fields." 前缀
                    
                    if customer and hasattr(customer, 'custom_fields') and customer.custom_fields:
                        value = customer.custom_fields.get(field)
                        if value is not None:
                            print(f"      ✅ 从自定义字段解析: {var_path} -> {value}")
                            return str(value)
                    
                    print(f"      ❌ 自定义字段中未找到: {var_path}")
                
                # 4. 数据库客户字段变量 (兼容旧格式)
                elif var_path.startswith("db.customer."):
                    field = var_path[12:]  # 移除 "db.customer." 前缀
                    
                    if customer:
                        value = getattr(customer, field, None)
                        if value is not None:
                            print(f"      ✅ 从 db.customer 解析: {var_path} -> {value}")
                            return str(value)
                    
                    print(f"      ❌ db.customer 中未找到: {var_path}")
                
                # 5. AI 输出变量
                elif var_path.startswith("ai."):
                    path_parts = var_path.split('.')
                    current = ai_data
                    
                    try:
                        for part in path_parts[1:]:  # 跳过 "ai"
                            if isinstance(current, dict):
                                current = current[part]
                            else:
                                current = getattr(current, part)
                        
                        if current is not None:
                            print(f"      ✅ 从 AI 数据解析: {var_path} -> {current}")
                            return str(current)
                    except (KeyError, AttributeError):
                        pass
                    
                    print(f"      ❌ AI 数据中未找到: {var_path}")
                
                # 6. API 响应变量
                elif var_path.startswith("api."):
                    path_parts = var_path.split('.')
                    current = api_data
                    
                    try:
                        for part in path_parts[1:]:  # 跳过 "api"
                            if isinstance(current, dict):
                                current = current[part]
                            else:
                                current = getattr(current, part)
                        
                        if current is not None:
                            print(f"      ✅ 从 API 数据解析: {var_path} -> {current}")
                            return str(current)
                    except (KeyError, AttributeError):
                        pass
                    
                    print(f"      ❌ API 数据中未找到: {var_path}")
                
                # 7. 其他上下文变量
                else:
                    # 尝试直接从上下文获取
                    value = self.context.get(var_path)
                    if value is not None:
                        print(f"      ✅ 从上下文解析: {var_path} -> {value}")
                        return str(value)
                    
                    print(f"      ❌ 上下文中未找到: {var_path}")
                
                # 如果都找不到，返回原始变量
                print(f"      ⚠️ 变量未解析，保持原样: {var_path}")
                return f"{{{{{var_path}}}}}"
            
            # 执行变量替换
            resolved_prompt = re.sub(pattern, replace_variable, prompt)
            
            print(f"  ✅ AI Prompt 变量解析完成: {resolved_prompt[:100]}...")
            return resolved_prompt
            
        except Exception as err:
            print(f"  ⚠️ 解析 AI prompt 变量失败: {err}")
            return prompt
    
    async def _simulate_ai_response(self, system_prompt: str, user_prompt: str, model_config: dict) -> str:
        """模拟AI响应（实际应该调用OpenAI API）"""
        import random
        
        trigger_data = self.context.get("trigger_data", {})
        user_message = trigger_data.get("content", "")
        user_name = trigger_data.get("name", "客户")
        
        # 根据消息内容和system prompt生成相应的回复
        if "房地产" in system_prompt or "房源" in system_prompt:
            if "房" in user_message or "price" in user_message.lower():
                responses = [
                    f"您好{user_name}！感谢您对我们房源的关注。我们有多个优质项目，价格从几十万到几百万不等。请问您的预算范围和偏好区域是什么？我可以为您推荐最合适的房源。",
                    f"Hi {user_name}! 我们目前有很多热门房源。为了给您最精准的推荐，能告诉我您的购房预算和心仪区域吗？",
                    f"您好！很高兴为您服务。关于房源信息，我们有新盘和二手房两种选择。您更倾向于哪种类型呢？"
                ]
            elif "谢谢" in user_message or "thank" in user_message.lower():
                responses = [
                    f"不客气{user_name}！如果您还有其他房产问题，随时联系我们。",
                    f"很高兴能帮到您！有任何购房需求都可以找我们。",
                    f"您太客气了！这是我们应该做的，祝您早日找到心仪的房源。"
                ]
            else:
                responses = [
                    f"您好{user_name}！我是您的专属房产顾问。关于您的咨询，我会为您提供最专业的建议。请问您是想了解哪个区域的房源呢？",
                    f"Hi {user_name}！感谢您选择我们。我会根据您的需求为您推荐最合适的房产项目。",
                    f"您好！很高兴为您服务。作为专业的房产顾问，我会全力协助您找到理想的房源。"
                ]
        else:
            # 通用回复
            if "谢谢" in user_message or "thank" in user_message.lower():
                responses = [
                    f"不客气{user_name}！如果您还有其他问题，随时联系我们。",
                    f"很高兴能帮到您！有任何需要都可以找我们。",
                    f"您太客气了！这是我们应该做的。"
                ]
            else:
                responses = [
                    f"您好{user_name}！感谢您的咨询。我已经收到您的消息，会根据您的需求为您提供最适合的建议。",
                    f"Hi {user_name}！我们已经收到您的消息。为了更好地为您服务，请问您具体需要什么帮助呢？",
                    f"您好！很高兴为您服务。关于您提到的问题，我会尽快给您详细回复。"
                ]
        
        return random.choice(responses)

class UpdateDBProcessor(NodeProcessor):
    """数据库更新节点"""
    
    async def _resolve_match_value(self, match_value: str) -> str:
        """解析匹配值中的变量"""
        if not match_value:
            return ""
        
        resolved_value = match_value
        
        # 解析触发器变量
        trigger_data = self.context.get("trigger_data", {})
        if "{{trigger.phone}}" in resolved_value:
            phone_value = str(trigger_data.get("phone", ""))
            resolved_value = resolved_value.replace("{{trigger.phone}}", phone_value)
        
        if "{{trigger.chat_id}}" in resolved_value:
            chat_id_value = str(trigger_data.get("chat_id", ""))
            resolved_value = resolved_value.replace("{{trigger.chat_id}}", chat_id_value)
        
        return resolved_value

    async def _apply_smart_updates(self, customer, ai_updates: dict) -> tuple[bool, dict, dict]:
        """应用智能更新（AI 输出的 updates）"""
        has_changes = False
        old_values = {}
        new_values = {}
        
        for field_name, field_value in ai_updates.items():
            if field_value is None:
                continue
                
            # 记录旧值
            if hasattr(customer, field_name):
                old_value = getattr(customer, field_name)
                if old_value is not None:
                    if hasattr(old_value, 'isoformat'):  # datetime/date 对象
                        old_values[field_name] = old_value.isoformat()
                    else:
                        old_values[field_name] = old_value
                else:
                    old_values[field_name] = None
            elif field_name.startswith('custom_fields.') or field_name.startswith('customer.custom.'):
                # 处理自定义字段
                if field_name.startswith('customer.custom.'):
                    custom_field_key = field_name.replace('customer.custom.', '')
                else:
                    custom_field_key = field_name.replace('custom_fields.', '')
                current_custom_fields = customer.custom_fields or {}
                print(f"    🔍 调试 custom_fields 原始值: {current_custom_fields} (类型: {type(current_custom_fields)})")
                old_value = current_custom_fields.get(custom_field_key)
                old_values[field_name] = old_value
                print(f"    🔍 自定义字段 {field_name}: 当前值 = {old_value}, 新值 = {field_value}")
            
            # 应用新值
            try:
                if field_name.startswith('custom_fields.') or field_name.startswith('customer.custom.'):
                    # 更新自定义字段
                    if field_name.startswith('customer.custom.'):
                        custom_field_key = field_name.replace('customer.custom.', '')
                    else:
                        custom_field_key = field_name.replace('custom_fields.', '')
                    
                    if customer.custom_fields is None:
                        customer.custom_fields = {}
                        print(f"    🆕 初始化 custom_fields 为空字典")
                    
                    current_value = customer.custom_fields.get(custom_field_key)
                    print(f"    🔄 比较值: 当前 {current_value} ({type(current_value)}) vs 新值 {field_value} ({type(field_value)})")
                    
                    if current_value != field_value:
                        customer.custom_fields[custom_field_key] = field_value
                        new_values[field_name] = field_value
                        has_changes = True
                        print(f"    ✅ 更新 {field_name}: {current_value} -> {field_value}")
                    else:
                        print(f"    ⏭️ 跳过 {field_name}: 值相同 ({current_value})")
                        
                elif hasattr(customer, field_name):
                    # 更新基础字段
                    current_value = getattr(customer, field_name)
                    
                    # 类型转换
                    if field_name in ['move_in_date'] and isinstance(field_value, str):
                        try:
                            field_value = datetime.strptime(field_value, "%Y-%m-%d").date()
                        except ValueError:
                            logger.warning(f"Invalid date format for {field_name}: {field_value}")
                            continue
                    elif field_name in ['budget_min', 'budget_max'] and isinstance(field_value, str):
                        try:
                            field_value = float(field_value)
                        except ValueError:
                            logger.warning(f"Invalid number format for {field_name}: {field_value}")
                            continue
                    
                    if current_value != field_value:
                        setattr(customer, field_name, field_value)
                        if hasattr(field_value, 'isoformat'):
                            new_values[field_name] = field_value.isoformat()
                        else:
                            new_values[field_name] = field_value
                        has_changes = True
                        
            except Exception as e:
                logger.error(f"Error updating field {field_name}: {e}")
                continue
        
        return has_changes, old_values, new_values

    async def _apply_static_updates(self, customer, static_updates: list) -> tuple[bool, dict, dict]:
        """应用静态更新（硬性配置的字段更新）"""
        has_changes = False
        old_values = {}
        new_values = {}
        
        for update in static_updates:
            if not update.get('enabled', True):
                continue
                
            field_name = update.get('db_field')
            field_value = update.get('value')
            data_type = update.get('data_type', 'string')
            
            if not field_name or field_value is None:
                continue
            
            # 解析变量
            if isinstance(field_value, str):
                field_value = await self._resolve_match_value(field_value)
            
            # 类型转换
            try:
                if data_type == 'number':
                    field_value = float(field_value)
                elif data_type == 'date':
                    if isinstance(field_value, str):
                        field_value = datetime.strptime(field_value, "%Y-%m-%d").date()
                elif data_type == 'boolean':
                    field_value = str(field_value).lower() in ['true', '1', 'yes']
                elif data_type == 'current_timestamp':
                    field_value = datetime.utcnow()
            except (ValueError, TypeError) as e:
                logger.warning(f"Type conversion error for {field_name}: {e}")
                continue
            
            # 记录旧值并应用新值
            try:
                if field_name.startswith('custom_fields.'):
                    # 处理自定义字段
                    custom_field_key = field_name.replace('custom_fields.', '')
                    if customer.custom_fields is None:
                        customer.custom_fields = {}
                    
                    old_values[field_name] = customer.custom_fields.get(custom_field_key)
                    
                    if customer.custom_fields.get(custom_field_key) != field_value:
                        customer.custom_fields[custom_field_key] = field_value
                        new_values[field_name] = field_value
                    has_changes = True
                    
                elif hasattr(customer, field_name):
                    # 处理基础字段
                    current_value = getattr(customer, field_name)
                    old_values[field_name] = current_value.isoformat() if hasattr(current_value, 'isoformat') else current_value
                    
                    if current_value != field_value:
                        setattr(customer, field_name, field_value)
                        new_values[field_name] = field_value.isoformat() if hasattr(field_value, 'isoformat') else field_value
                has_changes = True
        
            except Exception as e:
                logger.error(f"Error applying static update for {field_name}: {e}")
                continue
        
        return has_changes, old_values, new_values

    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """执行数据库更新"""
        print(f"\n🔄 UpdateDB 节点开始执行...")
        print(f"  节点配置: {node_config}")
        
        try:
            # 获取配置
            node_data = node_config.get("data", {})
            update_mode = node_data.get("update_mode", "smart_update")
            
            # 安全选项
            optimistic_lock = node_data.get("optimistic_lock", False)
            skip_if_equal = node_data.get("skip_if_equal", True)
            audit_log_enabled = node_data.get("audit_log", True)
            error_strategy = node_data.get("error_strategy", "log_and_continue")
            
            print(f"  更新模式: {update_mode}")
            print(f"  目标表: customers (固定)")
            
            # 🆕 智能匹配客户记录 - 根据触发器类型自动选择匹配方式
            customer = None
            trigger_data = self.context.get("trigger_data", {})
            
            # 首先尝试从上下文获取客户（MessageTrigger 已经设置）
            customer = self.context.db.get("customer", None)
            
            if not customer:
                # 根据触发器数据智能匹配
                phone = trigger_data.get("phone")
                chat_id = trigger_data.get("chat_id")
                user_id = trigger_data.get("user_id")
                
                print(f"  触发器数据: phone={phone}, chat_id={chat_id}, user_id={user_id}")
                
                if phone and user_id:
                    # WhatsApp 触发器 - 使用手机号匹配
                    customer = self.db.query(Customer).filter(
                        Customer.phone == phone,
                        Customer.user_id == user_id
                    ).first()
                    print(f"  通过手机号匹配客户: {customer.name if customer else 'Not Found'}")
                    
                elif chat_id and user_id:
                    # Telegram 触发器 - 使用聊天ID匹配
                    customer = self.db.query(Customer).filter(
                        Customer.telegram_chat_id == str(chat_id),
                        Customer.user_id == user_id
                    ).first()
                    print(f"  通过聊天ID匹配客户: {customer.name if customer else 'Not Found'}")
                    
                elif user_id:
                    # 其他触发器 - 尝试通过用户ID获取最近的客户
                    customer = self.db.query(Customer).filter(
                        Customer.user_id == user_id
                    ).order_by(Customer.updated_at.desc()).first()
                    print(f"  通过用户ID匹配最近客户: {customer.name if customer else 'Not Found'}")
            
            if not customer:
                if error_strategy == "abort_on_error":
                    raise ValueError("Customer not found")
                else:
                    print(f"  ⚠️ 客户未找到，跳过更新")
                    return {"db.update_result": "customer_not_found"}
            
            print(f"  找到客户: {customer.name} (ID: {customer.id})")
            
            # 乐观锁检查
            if optimistic_lock and hasattr(customer, 'version'):
                current_version = customer.version
                print(f"  当前版本: {current_version}")
            
            # 收集所有更新
            total_has_changes = False
            total_old_values = {}
            total_new_values = {}
            
            # 智能更新（AI 输出）
            if update_mode in ["smart_update", "hybrid"]:
                # 从 context.ai 中获取分析结果
                ai_analyze = self.context.ai.get("analyze", {})
                ai_updates = ai_analyze.get("updates", {})
                
                if ai_updates:
                    print(f"  🤖 应用 AI 更新: {ai_updates}")
                    smart_changes, smart_old, smart_new = await self._apply_smart_updates(customer, ai_updates)
                    if smart_changes:
                        total_has_changes = True
                        total_old_values.update(smart_old)
                        total_new_values.update(smart_new)
            
            # 静态更新（硬性配置）
            if update_mode in ["static_update", "hybrid"]:
                static_updates = node_data.get("static_updates", [])
                
                if static_updates:
                    print(f"  ⚙️ 应用静态更新: {len(static_updates)} 个字段")
                    static_changes, static_old, static_new = await self._apply_static_updates(customer, static_updates)
                    if static_changes:
                        total_has_changes = True
                        total_old_values.update(static_old)
                        total_new_values.update(static_new)
            
            # 如果没有变更且设置了跳过相同值
            if not total_has_changes and skip_if_equal:
                print(f"  ✅ 无变更，跳过更新")
                return {
                    "db.update_result": "no_changes",
                    "db.updated_row": customer,
                    "ctx.versions.db": getattr(customer, 'version', 1)
                }
            
            # 提交变更
            if total_has_changes:
                # 更新版本号和时间戳
                if hasattr(customer, 'version'):
                    customer.version += 1
                customer.updated_at = datetime.utcnow()
                self.db.add(customer) # 显式标记 customer 对象变更，确保 custom_fields 变化被跟踪
                
                # 记录审计日志
                if audit_log_enabled:
                    audit_log = AuditLog(
                        entity_type="customer",
                        entity_id=customer.id,
                        action="update",
                        old_values=total_old_values,
                        new_values=total_new_values,
                        user_id=customer.user_id,
                        source="workflow"
                    )
                    self.db.add(audit_log)
            
            self.db.commit()
            print(f"  ✅ 数据库事务已提交。")
            self.db.refresh(customer)
            print(f"  ✅ 客户对象已从数据库刷新。最新 custom_fields: {customer.custom_fields}")
            
            print(f"  ✅ 更新完成，新版本: {getattr(customer, 'version', 1)}")
            
            return {
                "db.update_result": "success",
                "db.updated_row": customer,
                "db.changes_applied": total_new_values,
                "ctx.versions.db": getattr(customer, 'version', 1)
            }
            
        except Exception as e:
            error_msg = f"UpdateDB execution failed: {e}"
            logger.error(error_msg)
            
            # Get error_strategy from node_data, with default fallback
            node_data = node_config.get("data", {})
            error_strategy = node_data.get("error_strategy", "log_and_continue")
            
            if error_strategy == "abort_on_error":
                raise
            elif error_strategy == "rollback_on_error":
                self.db.rollback()
                raise
            else:  # log_and_continue
                return {
                    "db.update_result": "error",
                    "db.error_message": str(e)
                }

class DelayProcessor(NodeProcessor):
    """延迟节点 - 控制工作时段和限频"""
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """计算延迟时间"""
        policy = node_config.get("policy", {})
        mode = policy.get("mode", "auto_window")
        
        now = datetime.utcnow()
        kl_tz = pytz.timezone("Asia/Kuala_Lumpur")
        now_kl = now.replace(tzinfo=pytz.UTC).astimezone(kl_tz)
        
        if mode == "auto_window":
            work_hours = policy.get("work_hours", {"start": "09:30", "end": "21:30"})
            quiet_hours = policy.get("quiet_hours", {"start": "22:00", "end": "08:00"})
            
            start_time = datetime.strptime(work_hours["start"], "%H:%M").time()
            end_time = datetime.strptime(work_hours["end"], "%H:%M").time()
            
            current_time = now_kl.time()
            
            # 检查是否在工作时间内
            if start_time <= current_time <= end_time:
                # 在工作时间内，可以立即发送
                jitter = policy.get("jitter_seconds", [3, 15])
                import random
                delay_seconds = random.uniform(jitter[0], jitter[1])
                scheduled_at = now + timedelta(seconds=delay_seconds)
            else:
                # 不在工作时间内，延迟到下一个工作时段
                next_day = now_kl.replace(hour=int(start_time.hour), 
                                        minute=int(start_time.minute), 
                                        second=0, microsecond=0)
                if current_time > end_time:
                    next_day += timedelta(days=1)
                
                scheduled_at = next_day.astimezone(pytz.UTC).replace(tzinfo=None)
        
        elif mode == "relative":
            delay_minutes = policy.get("relative_minutes", 0)
            scheduled_at = now + timedelta(minutes=delay_minutes)
        
        else:
            scheduled_at = now  # 立即执行
        
        self.context.scheduled_at = scheduled_at
        
        return {"ctx.scheduled_at": scheduled_at.isoformat()}

class SendWhatsAppMessageProcessor(NodeProcessor):
    """WhatsApp 消息发送节点"""
    
    def __init__(self, db: Session, context: WorkflowContext):
        super().__init__(db, context)
        self.whatsapp_service = WhatsAppService()
    
    def _calculate_send_delay(self, message: str, delay_config: Dict[str, Any]) -> float:
        """
        计算发送延迟时间（秒）
        
        Args:
            message: 要发送的消息内容
            delay_config: 延迟配置
                - enable_smart_delay: 是否启用智能延迟 (默认: False)
                - base_delay: 基础延迟秒数 (默认: 1)
                - delay_per_char: 每字符增加的毫秒数 (默认: 50)
                - max_delay: 最大延迟秒数 (默认: 10)
        
        Returns:
            延迟时间（秒），如果未启用智能延迟则返回 0.0
        """
        if not delay_config.get("enable_smart_delay", False):
            return 0.0
        
        message_length = len(message) if message else 0
        base_delay_ms = delay_config.get("base_delay", 1) * 1000
        delay_per_char_ms = delay_config.get("delay_per_char", 50)
        max_delay_ms = delay_config.get("max_delay", 10) * 1000
        
        # 计算总延迟时间（毫秒）
        calculated_delay_ms = base_delay_ms + (message_length * delay_per_char_ms)
        
        # 限制最大延迟
        final_delay_ms = min(calculated_delay_ms, max_delay_ms)
        
        return final_delay_ms / 1000.0  # 转换为秒
    
    async def _get_media_urls_from_identifiers(self, media_uuids: List[str], folder_names: List[str], user_id: int) -> List[str]:
        """
        根据媒体UUID和文件夹名称获取媒体文件URL
        
        Args:
            media_uuids: 媒体文件UUID列表
            folder_names: 文件夹名称列表
            user_id: 用户ID
            
        Returns:
            List[str]: 媒体文件URL列表
        """
        try:
            from app.db.models import MediaFile
            from app.services import supabase as supabase_service
            from app.core.config import settings
            
            media_urls = []
            
            # 获取单个媒体文件
            if media_uuids:
                media_files = self.db.query(MediaFile).filter(
                    MediaFile.id.in_(media_uuids),
                    MediaFile.user_id == user_id
                ).all()
                
                for media_file in media_files:
                    # 生成签名URL
                    relative_path = media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
                    signed_url = await supabase_service.get_signed_url_for_file(relative_path)
                    if signed_url:
                        media_urls.append(signed_url)
                        print(f"    📎 添加媒体文件: {media_file.filename}")
            
            # 获取文件夹中的所有媒体文件
            if folder_names:
                for folder_name in folder_names:
                    folder_media = self.db.query(MediaFile).filter(
                        MediaFile.user_id == user_id,
                        MediaFile.folder == folder_name,
                        MediaFile.filename != ".keep"  # 排除.keep文件
                    ).all()
                    
                    for media_file in folder_media:
                        relative_path = media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
                        signed_url = await supabase_service.get_signed_url_for_file(relative_path)
                        if signed_url:
                            media_urls.append(signed_url)
                            print(f"    📁 添加文件夹媒体: {folder_name}/{media_file.filename}")
            
            return media_urls
            
        except Exception as e:
            logger.error(f"Failed to get media URLs from identifiers: {e}")
            return []
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """发送 WhatsApp 消息 - 支持动态路由到 Telegram"""
        
        # 检查是否为 Telegram 触发，如果是则转发给 SendTelegramMessageProcessor
        trigger_data = self.context.get("trigger_data", {})
        trigger_channel = trigger_data.get("channel", "whatsapp")
        
        if trigger_channel == "telegram":
            logger.info(f"📤 检测到 Telegram 触发，转发给 SendTelegramMessageProcessor")
            processor = SendTelegramMessageProcessor(self.db, self.context)
            # 确保 Telegram 节点配置正确 - 强制使用触发器的 chat_id
            node_data = node_config.get("data", {})
            node_data["send_mode"] = "trigger_number"  # 强制使用触发器的 chat_id，覆盖任何现有配置
            logger.info(f"📤 强制设置 send_mode 为 trigger_number，使用触发器 chat_id: {trigger_data.get('chat_id')}")
            return await processor.execute(node_config)
        
        # 否则继续 WhatsApp 处理逻辑
        # 🔧 修復：從 data 字段獲取配置，與其他節點保持一致
        node_data = node_config.get("data", {})
        
        to = node_data.get("to", "") or node_config.get("to", "")
        message = node_data.get("message", "") or node_config.get("message", "")
        dedupe = node_data.get("dedupe", node_config.get("dedupe", {"window_minutes": 1}))
        retries = node_data.get("retries", node_config.get("retries", {"max": 3, "backoff": [2, 5, 15]}))
        
        print(f"📤 SendWhatsApp 節點開始執行:")
        print(f"  初始配置 - to: '{to}', message: '{message}'")
        print(f"  node_data keys: {list(node_data.keys())}")
        
        # Debug: 检查上下文中的触发数据和客户数据
        trigger_data = self.context.get("trigger_data", {})
        customer = self.context.db.get("customer", None)
        print(f"  🔍 调试信息:")
        print(f"    trigger_data: {trigger_data}")
        print(f"    customer: {customer}")
        if customer:
            print(f"    customer.phone: {getattr(customer, 'phone', 'N/A')}")
        # print(f"  context keys: {list(self.context.__dict__.keys())}") # Remove verbose context keys print
        
        # 解析变量和自动填充 'to' 字段
        send_mode = node_data.get("send_mode", "smart_reply")
        number_source = node_data.get("number_source", "trigger_number")
        
        print(f"  发送模式: {send_mode}, 号码来源: {number_source}")
        
        if send_mode == "smart_reply":
            # 智能回复：根据触发器类型自动选择平台和标识符
            trigger_data = self.context.get("trigger_data", {})
            trigger_channel = trigger_data.get("channel", "")
            
            if trigger_channel == "whatsapp":
                to = trigger_data.get("phone", "")
                print(f"  智能回复 - WhatsApp: {to}")
            elif trigger_channel == "telegram":
                to = trigger_data.get("chat_id", "")
                print(f"  智能回复 - Telegram: {to}")
            else:
                # 回退到客户信息
                customer = self.context.db.get("customer", None)
                if customer:
                    to = customer.phone
                    print(f"  智能回复 - 回退到客户号码: {to}")
                else:
                    print(f"  ❌ 智能回复失败，找不到客户信息")
                    
        elif send_mode == "force_whatsapp":
            # 强制发送到 WhatsApp
            if number_source == "custom_number":
                to = node_data.get("to_number", "")
                print(f"  强制 WhatsApp - 自定义号码: {to}")
            else:  # trigger_number
                trigger_data = self.context.get("trigger_data", {})
                to = trigger_data.get("phone", "")
                if not to:
                    customer = self.context.db.get("customer", None)
                    if customer:
                        to = customer.phone
                print(f"  强制 WhatsApp - 触发号码: {to}")
                
        elif send_mode == "force_telegram":
            # 强制发送到 Telegram
            if number_source == "custom_number":
                to = node_data.get("telegram_chat_id", "")
                print(f"  强制 Telegram - 自定义 Chat ID: {to}")
            else:  # trigger_number
                trigger_data = self.context.get("trigger_data", {})
                to = trigger_data.get("chat_id", "")
                if not to:
                    customer = self.context.db.get("customer", None)
                    if customer and hasattr(customer, 'telegram_chat_id'):
                        to = customer.telegram_chat_id
                print(f"  强制 Telegram - 触发 Chat ID: {to}")
                
        else:
            # 兼容旧的配置方式
            if send_mode == "specified_number":
                to = node_data.get("to_number", "")
                print(f"  兼容模式 - 指定号码: {to}")
                
                # 如果指定号码为空，回退到触发号码
                if not to:
                    trigger_data = self.context.get("trigger_data", {})
                    to = trigger_data.get("phone", "")
                    if not to:
                        customer = self.context.db.get("customer", None)
                        if customer:
                            to = customer.phone
                    print(f"  兼容模式 - 指定号码为空，回退到: {to}")
                    
            elif send_mode == "trigger_number":
                customer = self.context.db.get("customer", None)
                if customer:
                    to = customer.phone
                    print(f"  兼容模式 - 触发号码: {to}")
                else:
                    print(f"  ❌ 兼容模式失败，找不到客户信息")
            else:
                # 回退到变量解析
                if not to or "{db.phone}" in to or "{trigger_ai.output.phone}" in to:
                    customer = self.context.db.get("customer", None)
                    if customer:
                        if not to:
                            to = customer.phone
                            print(f"  自動填充收件人: {to}")
                        else:
                            to = self._resolve_variable_from_context(to)
                            print(f"  替換變量收件人: {to}")
                    else:
                        print(f"  ❌ 找不到客戶信息，無法填充收件人")
        
        # 🔧 修復：改善 AI 回復文本的讀取邏輯
        # 统一使用新的变量解析函数来处理 message 字段
        # print(f"  🔍 解析消息变量前: '{message}'") # Remove verbose pre-resolution message print
        message = self._resolve_variable_from_context(message)
        # print(f"  🔍 解析消息变量后: '{message}'") # Remove verbose post-resolution message print
        
        # 如果 message 仍然为空或未解析，则按优先级从上下文获取
        if not message:
            # 优先从上下文的 message_content 获取，这是模板节点通常会设置的
            context_message_content = self.context.get("message_content", "")
            if context_message_content:
                message = context_message_content
                print(f"  ✅ 使用上下文 message_content: '{message}'")
            else:
                # 其次回退到 AI 节点的 reply_text
                ai_ctx = self.context.get("ai", {}) # Fallback to generic 'ai' context
                ai_reply_obj = ai_ctx.get("reply", {})
                ai_reply_text_fallback = ai_reply_obj.get("reply_text", "")

                if ai_reply_text_fallback:
                    message = ai_reply_text_fallback
                    print(f"  ✅ 使用 AI 回復 (fallback): '{message}'")
                else:
                    # 最終仍未找到消息，拋出錯誤而非使用默認回退
                    logger.error(f"Failed to resolve message content for SendWhatsAppMessage node {node_config.get('id')}")
                    raise ValueError("Message content cannot be resolved.")
        
        print(f"  最終參數 - to: '{to}', message: '{message}'")
        
        if not to:
            print(f"❌ 收件人为空，无法发送 WhatsApp 消息。")
            logger.error("Recipient 'to' field is empty, cannot send WhatsApp message.")
            return {"ctx.message_id": "failed", "ctx.sent_at": datetime.utcnow().isoformat(), "error": "Recipient is empty"}

        # 去重检查
        print(f"🔍 檢查去重...")
        should_dedupe = self._should_dedupe(to, message, dedupe)
        print(f"  去重結果: {'⚠️ 被去重' if should_dedupe else '✅ 可發送'}")
        
        if should_dedupe:
            print(f"❌ 消息被去重，不發送到 {to}")
            logger.info(f"Message deduplicated for {to}")
            return {"ctx.message_id": "deduplicated", "ctx.sent_at": datetime.utcnow().isoformat()}
        
        # 获取智能延迟配置
        delay_config = {
            "enable_smart_delay": node_data.get("enable_smart_delay", False),
            "base_delay": node_data.get("base_delay", 1),
            "delay_per_char": node_data.get("delay_per_char", 50),
            "max_delay": node_data.get("max_delay", 10)
        }
        
        # 计算发送延迟
        send_delay = self._calculate_send_delay(message, delay_config)
        if send_delay > 0:
            print(f"⏱️ 智能延迟: {send_delay:.2f}秒 (消息长度: {len(message)}字符)")
            await asyncio.sleep(send_delay)
        else:
            print(f"🚀 立即发送 (智能延迟未启用)")

        # 发送消息
        print(f"📤 開始發送 WhatsApp 消息...")
        for attempt in range(retries.get("max", 1)):
            try:
                print(f"  嘗試 {attempt + 1}/{retries.get('max', 1)}")
                
                # 獲取用戶ID用於身份驗證
                customer = self.context.db.get("customer", None)
                trigger = self.context.get("trigger_data", {})
                # 优先使用 customer.user_id，没有则回退到 trigger 中的 user_id
                user_id = customer.user_id if customer else trigger.get("user_id")
                print(f"  用戶ID: {user_id}")
                
                if not user_id:
                    raise ValueError("Cannot send WhatsApp message: user_id is required")
                
                print(f"  調用 WhatsApp 服務...")
                
                # 检查是否有媒体需要发送 - 优先从模板节点获取
                template_media_list = self.context.get("media_list", [])
                template_media_settings = self.context.get("media_settings", {})
                template_message_templates = self.context.get("message_templates", [])
                template_paired_items = self.context.get("paired_items", [])  # 新增：获取配对项目
                
                # 如果模板节点没有媒体，回退到AI节点
                if not template_media_list:
                    ai_reply = self.context.ai.get("reply", {})
                    media_uuids = ai_reply.get("media_uuids", [])
                    folder_names = ai_reply.get("folder_names", [])
                    media_settings = ai_reply.get("media_settings", {})
                else:
                    # 使用模板节点的媒体配置
                    media_uuids = [media.get("uuid") for media in template_media_list if media.get("uuid")]
                    folder_names = []  # 模板节点目前不支持文件夹
                    media_settings = template_media_settings
                
                print(f"  媒体信息: UUIDs={media_uuids}, Folders={folder_names}, Settings={media_settings}")
                print(f"  模板消息数量: {len(template_message_templates)}")
                print(f"  配对项目数量: {len(template_paired_items)}")
                
                # 根据 UUIDs 和 folder_names 获取实际的媒体 URL
                media_urls = []
                if media_uuids or folder_names:
                    media_urls = await self._get_media_urls_from_identifiers(media_uuids, folder_names, user_id)
                    print(f"  📎 获取到 {len(media_urls)} 个媒体文件URL")
                
                # 处理多条消息模板
                messages_to_send = []
                if template_message_templates:
                    # 使用模板节点的多条消息
                    for template in template_message_templates:
                        content = template.get("content", "")
                        if content:
                            messages_to_send.append(content)
                    print(f"  📝 从模板节点获取到 {len(messages_to_send)} 条消息")
                else:
                    # 使用单条消息
                    if message:
                        messages_to_send.append(message)
                    print(f"  📝 使用单条消息: '{message}'")
                
                if not messages_to_send:
                    messages_to_send = ["您好！感谢您的咨询。"]
                    print(f"  📝 使用默认消息")
                
                # 检查是否为配对发送模式
                if template_paired_items and media_settings.get("paired_sending", False):
                    print(f"  🔗 配对发送模式：处理 {len(template_paired_items)} 个配对项目")
                    
                    # 配对发送：逐个发送媒体-文本配对
                    for i, paired_item in enumerate(template_paired_items):
                        try:
                            print(f"  📦 处理配对项目 {i+1}/{len(template_paired_items)}")
                            
                            media_item = paired_item.get("media")
                            message_content = paired_item.get("message", "")
                            has_media = paired_item.get("has_media", False)
                            has_message = paired_item.get("has_message", False)
                            
                            if has_media and media_item:
                                # 获取媒体URL
                                media_uuid = media_item.get("uuid")
                                if media_uuid:
                                    paired_media_urls = await self._get_media_urls_from_identifiers([media_uuid], [], user_id)
                                    if paired_media_urls:
                                        media_url = paired_media_urls[0]
                                        print(f"  🖼️ 发送配对媒体+文本: {media_url} + '{message_content}'")
                                        
                                        # 发送媒体和文本一起
                                        result = await self.whatsapp_service.send_message(
                                            to, message_content, user_id, 
                                            media_url=media_url, media_type="image"
                                        )
                                        print(f"  ✅ 配对项目 {i+1} 发送成功: {result}")
                                    else:
                                        print(f"  ⚠️ 配对项目 {i+1} 媒体URL获取失败，只发送文本")
                                        if has_message and message_content:
                                            result = await self.whatsapp_service.send_message(to, message_content, user_id)
                                            print(f"  ✅ 配对项目 {i+1} 文本发送成功: {result}")
                                else:
                                    print(f"  ⚠️ 配对项目 {i+1} 没有有效的媒体UUID")
                                    if has_message and message_content:
                                        result = await self.whatsapp_service.send_message(to, message_content, user_id)
                                        print(f"  ✅ 配对项目 {i+1} 文本发送成功: {result}")
                            elif has_message and message_content:
                                # 只有文本，没有媒体
                                print(f"  📝 发送配对文本: '{message_content}'")
                                result = await self.whatsapp_service.send_message(to, message_content, user_id)
                                print(f"  ✅ 配对项目 {i+1} 文本发送成功: {result}")
                            else:
                                print(f"  ⚠️ 配对项目 {i+1} 既没有媒体也没有文本，跳过")
                            
                            # 配对项目之间的延迟
                            if i < len(template_paired_items) - 1:
                                await asyncio.sleep(0.5)  # 配对项目间短暂延迟
                                
                        except Exception as e:
                            print(f"  ❌ 配对项目 {i+1} 发送失败: {e}")
                            continue
                    
                    # 配对发送完成，返回结果
                    print(f"  🎉 配对发送完成，共处理 {len(template_paired_items)} 个项目")
                    return {
                        "ctx.message_id": "paired_sent",
                        "ctx.sent_at": datetime.utcnow().isoformat(),
                        "paired_items_count": len(template_paired_items)
                    }
                
                # 处理媒体发送 - 模板消息默认先发送媒体再发送文本（与LLM节点逻辑一致）
                elif media_urls:
                    # 对于模板节点，默认采用分开发送模式（先媒体后文本）
                    send_separately = media_settings.get("send_media_separately", True)  # 默认改为True
                    send_with_caption = media_settings.get("send_with_caption", True)
                    use_first_media_only = media_settings.get("use_first_media_only", False)
                    delay_between_media = media_settings.get("delay_between_media", False)
                    delay_seconds = media_settings.get("delay_seconds", 2)
                    
                    print(f"  📋 模板消息媒体发送配置: 分开发送={send_separately}, 附带说明={send_with_caption}, 只用第一张={use_first_media_only}")
                    
                    # 如果设置为只使用第一张媒体，则只取第一个URL
                    if use_first_media_only and media_urls:
                        media_urls = [media_urls[0]]
                        print(f"  📎 只使用第一张媒体: {media_urls[0]}")
                    
                    if send_separately:
                        # 分开发送：先发送媒体，再发送文本（确保媒体完全上传后再发送文字说明）
                        print(f"  🖼️ 分开发送模式：先发送所有媒体文件")
                        
                        # 先发送每个媒体文件
                        media_success_count = 0
                        for i, media_url in enumerate(media_urls):
                            try:
                                if delay_between_media and i > 0:
                                    print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                    await asyncio.sleep(delay_seconds)
                                
                                print(f"  🖼️ 发送媒体 {i+1}/{len(media_urls)}: {media_url}")
                                media_result = await self.whatsapp_service.send_message(
                                    to, "", user_id, media_url=media_url, media_type="image"
                                )
                                print(f"  ✅ 媒体 {i+1} 发送请求已提交: {media_result}")
                                
                                # 等待媒体上传完成（根据文件大小估算上传时间）
                                upload_wait_time = 3 + (i * 2)  # 基础3秒 + 每个文件额外2秒
                                print(f"  ⏳ 等待媒体 {i+1} 上传完成 ({upload_wait_time}秒)...")
                                await asyncio.sleep(upload_wait_time)
                                
                                media_success_count += 1
                            except Exception as media_error:
                                print(f"  ❌ 媒体 {i+1} 发送失败: {media_error}")
                                # 继续发送下一个媒体，不中断整个流程
                        
                        print(f"  📊 媒体发送结果: {media_success_count}/{len(media_urls)} 成功")
                        
                        # 额外等待时间确保所有媒体完全上传
                        final_wait_time = 5  # 最终等待5秒
                        print(f"  ⏳ 最终等待 {final_wait_time} 秒确保所有媒体上传完成...")
                        await asyncio.sleep(final_wait_time)
                        
                        # 所有媒体上传完成后，再发送多条文本消息
                        print(f"  📝 媒体上传完成，现在发送 {len(messages_to_send)} 条文本消息")
                        for i, msg in enumerate(messages_to_send):
                            if i > 0:
                                await asyncio.sleep(2)  # 消息间延迟
                            print(f"  📝 发送消息 {i+1}/{len(messages_to_send)}: '{msg}'")
                            text_result = await self.whatsapp_service.send_message(to, msg, user_id)
                            print(f"  ✅ 消息 {i+1} 发送结果: {text_result}")
                        
                        result = {"success": True, "message_id": "sent", "status": "sent"}
                    else:
                        # 一起发送：媒体附带文本说明
                        if len(media_urls) == 1 and len(messages_to_send) == 1:
                            # 单个媒体文件，附带单条文本
                            caption = messages_to_send[0] if send_with_caption else ""
                            print(f"  🖼️📝 发送单个媒体附带文本: {media_urls[0]}")
                            result = await self.whatsapp_service.send_message(
                                to, caption, user_id, media_url=media_urls[0], media_type="image"
                            )
                        else:
                            # 多个媒体或多条消息的一起发送模式
                            print(f"  🖼️📝 多媒体/多消息一起发送模式")
                            
                            if use_first_media_only and media_urls:
                                # 只使用第一张媒体 + 第一条文本，然后发送剩余文本
                                media_url = media_urls[0]
                                caption = messages_to_send[0] if messages_to_send and send_with_caption else ""
                                print(f"  🖼️📝 发送第一张媒体附带第一条文本: {media_url}")
                                result = await self.whatsapp_service.send_message(
                                    to, caption, user_id, media_url=media_url, media_type="image"
                                )
                                
                                # 发送剩余的文本消息（如果有的话）
                                if len(messages_to_send) > 1:
                                    remaining_messages = messages_to_send[1:] if send_with_caption else messages_to_send
                                    for i, msg in enumerate(remaining_messages):
                                        await asyncio.sleep(1)  # 短暂延迟
                                        print(f"  📝 发送剩余文本消息 {i+1}/{len(remaining_messages)}: '{msg}'")
                                        text_result = await self.whatsapp_service.send_message(to, msg, user_id)
                                        print(f"  ✅ 剩余文本消息 {i+1} 发送结果: {text_result}")
                                elif not send_with_caption and messages_to_send:
                                    # 如果不带说明，需要发送所有文本消息
                                    for i, msg in enumerate(messages_to_send):
                                        await asyncio.sleep(1)  # 短暂延迟
                                        print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{msg}'")
                                        text_result = await self.whatsapp_service.send_message(to, msg, user_id)
                                        print(f"  ✅ 文本消息 {i+1} 发送结果: {text_result}")
                            elif len(media_urls) == 1 and len(messages_to_send) > 1:
                                # 一个媒体 + 多条文本
                                if send_with_caption:
                                    # 第一条文本作为媒体说明，其余文本单独发送
                                    caption = messages_to_send[0]
                                    print(f"  🖼️📝 发送媒体附带第一条消息: {media_urls[0]} + '{caption}'")
                                    result = await self.whatsapp_service.send_message(
                                        to, caption, user_id, media_url=media_urls[0], media_type="image"
                                    )
                                    
                                    # 发送剩余的文本消息
                                    for i, msg in enumerate(messages_to_send[1:], 1):
                                        await asyncio.sleep(1)  # 短暂延迟
                                        print(f"  📝 发送剩余消息 {i+1}/{len(messages_to_send)}: '{msg}'")
                                        text_result = await self.whatsapp_service.send_message(to, msg, user_id)
                                        print(f"  ✅ 剩余消息 {i+1} 发送结果: {text_result}")
                                else:
                                    # 不带说明：先发送媒体，再发送所有文本消息
                                    print(f"  🖼️ 先发送媒体（不带说明）: {media_urls[0]}")
                                    result = await self.whatsapp_service.send_message(
                                        to, "", user_id, media_url=media_urls[0], media_type="image"
                                    )
                                    
                                    # 然后发送所有文本消息
                                    for i, msg in enumerate(messages_to_send):
                                        await asyncio.sleep(1)  # 短暂延迟
                                        print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{msg}'")
                                        text_result = await self.whatsapp_service.send_message(to, msg, user_id)
                                        print(f"  ✅ 文本消息 {i+1} 发送结果: {text_result}")
                            else:
                                # 多个媒体的情况：每个媒体都不带说明发送，然后发送所有文本
                                print(f"  🖼️ 先发送 {len(media_urls)} 个媒体文件（不带说明）")
                                for i, media_url in enumerate(media_urls):
                                    if i > 0:
                                        await asyncio.sleep(1)
                                    print(f"  🖼️ 发送媒体 {i+1}/{len(media_urls)}: {media_url}")
                                    media_result = await self.whatsapp_service.send_message(
                                        to, "", user_id, media_url=media_url, media_type="image"
                                    )
                                    print(f"  ✅ 媒体 {i+1} 发送结果: {media_result}")
                                
                                # 然后发送所有文本消息
                                print(f"  📝 然后发送 {len(messages_to_send)} 条文本消息")
                                for i, msg in enumerate(messages_to_send):
                                    await asyncio.sleep(1)
                                    print(f"  📝 发送消息 {i+1}/{len(messages_to_send)}: '{msg}'")
                                    text_result = await self.whatsapp_service.send_message(to, msg, user_id)
                                    print(f"  ✅ 消息 {i+1} 发送结果: {text_result}")
                            
                            result = {"success": True, "message_id": "sent", "status": "sent"}
                else:
                    # 没有媒体，只发送多条文本消息
                    print(f"  📝 发送 {len(messages_to_send)} 条纯文本消息")
                    for i, msg in enumerate(messages_to_send):
                        if i > 0:
                            await asyncio.sleep(2)  # 消息间延迟
                        print(f"  📝 发送消息 {i+1}/{len(messages_to_send)}: '{msg}'")
                        text_result = await self.whatsapp_service.send_message(to, msg, user_id)
                        print(f"  ✅ 消息 {i+1} 发送结果: {text_result}")
                    
                    result = {"success": True, "message_id": "sent", "status": "sent"}
                
                print(f"  ✅ 最终发送结果: {result}")
                
                # 记录消息到数据库
                customer = self.context.db.get("customer", None)
                if customer:
                    msg = Message(
                        content=message,
                        direction="outbound",
                        customer_id=customer.id,
                        user_id=customer.user_id,
                        ack=0  # 已发送
                    )
                    self.db.add(msg)
                    self.db.commit()
                    self.db.refresh(msg)
                    
                    # 🆕 保存 whatsapp_id
                    if result.get("whatsapp_id"):  # Check if whatsapp_id is present in the result
                        msg.whatsapp_id = result["whatsapp_id"]
                        self.db.add(msg)
                        self.db.commit()
                else:
                    # 没有 customer 时，仍返回成功但不写入 messages 表
                    logger.info("Sent message but no customer in context; skipping DB insert")
                
                return {
                    "ctx.message_id": result.get("message_id", "sent"),
                    "ctx.sent_at": datetime.utcnow().isoformat()
                }
                
            except Exception as e:
                print(f"  ❌ 發送失敗: {str(e)}")
                print(f"  錯誤類型: {type(e).__name__}")
                if attempt < retries.get("max", 1) - 1:
                    backoff_time = retries.get("backoff", [2, 5, 15])[attempt]
                    print(f"  等待 {backoff_time} 秒後重試...")
                    await asyncio.sleep(backoff_time)
                    continue
                else:
                    print(f"  🚫 所有重試失敗，拋出錯誤")
                    raise e
    
    def _should_dedupe(self, to: str, message: str, dedupe_config: Dict) -> bool:
        """检查是否应该去重"""
        window_minutes = dedupe_config.get("window_minutes", 1)  # 🔧 減少到1分鐘
        cutoff_time = datetime.utcnow() - timedelta(minutes=window_minutes)
        
        # 🔧 改進去重邏輯：考慮觸發消息的差異
        trigger_data = self.context.get("trigger_data", {})
        trigger_message = trigger_data.get("message", "")
        
        # 查找最近的相同回覆且觸發消息也相同的情況
        recent_messages = self.db.query(Message).filter(
            Message.content == message,
            Message.direction == "outbound",
            Message.timestamp >= cutoff_time
        ).join(Customer).filter(Customer.phone == to).all()
        
        # 🎯 只有在最近有完全相同的回覆時才去重
        # 如果觸發消息不同，允許相同的回覆
        for recent_msg in recent_messages:
            # 修正去重逻辑：只在消息内容完全一致且在去重窗口内才去重
            # 移除长度判断，因为这会导致所有长消息都被去重
            return True  # 发现相同消息，去重
        
        return False  # 允许发送

    def _resolve_variable_from_context(self, text: str) -> str:
        """解析文本中的所有 {{variable_path}} 和 {variable_path} 变量"""
        if not isinstance(text, str): # Ensure text is a string
            return str(text)

        def get_nested_value(data, path_parts):
            current = data
            for part in path_parts:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                elif isinstance(current, object) and hasattr(current, part):
                    current = getattr(current, part)
                else:
                    return None
            return current

        def replace_match(match):
            var_path = match.group(1).strip() # Extract path inside {{}} or {}
            print(f"  🔍 Resolving variable path: {var_path}") # Debug print

            # 尝试从各种上下文中解析变量
            # 优先级：trigger_data, actor, db.customer, ai.reply, 通用变量, 其他节点输出

            # 1. 优先尝试 'trigger' 相关变量
            if var_path.startswith("trigger."):
                trigger_data = self.context.get("trigger_data", {})
                value = get_nested_value(trigger_data, var_path.split('.')[1:])
                if value is not None:
                    print(f"    - Resolved from trigger: {var_path} -> {value}")
                    return str(value)

            # 2. 尝试 'actor' 相关变量
            if var_path.startswith("actor."):
                actor_data = self.context.get("actor", {})
                value = get_nested_value(actor_data, var_path.split('.')[1:])
                if value is not None:
                    print(f"    - Resolved from actor: {var_path} -> {value}")
                    return str(value)

            # 3. 尝试 'db.customer' 相关变量或 'customer.all'
            if var_path.startswith("db.customer."):
                customer_obj = self.context.db.get("customer", None)
                if customer_obj:
                    value = get_nested_value(customer_obj, var_path.split('.')[2:])
                    if value is not None:
                        print(f"    - Resolved from db.customer: {var_path} -> {value}")
                        return str(value)
            elif var_path == "customer.all":
                customer_obj = self.context.db.get("customer", None)
                if customer_obj:
                    # 将整个客户对象（包括 custom_fields）转换为 JSON 字符串
                    customer_data = customer_obj.__dict__.copy()
                    customer_data.pop('_sa_instance_state', None)
                    
                    # 如果 custom_fields 是字符串，尝试解析为字典
                    if isinstance(customer_data.get('custom_fields'), str):
                        try:
                            customer_data['custom_fields'] = json.loads(customer_data['custom_fields'])
                        except json.JSONDecodeError:
                            pass # 保持原样，如果不是有效 JSON

                    return json.dumps(customer_data, ensure_ascii=False, indent=2)
                return "{}"

            # 4. 尝试 'custom_object' 相关变量
            custom_object_match_field = re.match(r"custom_object\.(\d+)\.(\d+)\.([a-zA-Z0-9_.]+)", var_path)
            custom_object_match_all = re.match(r"custom_object\.(\d+)\.all", var_path)

            if custom_object_match_field:
                entity_type_id = int(custom_object_match_field.group(1))
                record_id = int(custom_object_match_field.group(2))
                field_key = custom_object_match_field.group(3)
                
                record_obj = self.db.query(CustomEntityRecord).filter(
                    CustomEntityRecord.entity_type_id == entity_type_id,
                    CustomEntityRecord.id == record_id
                ).first()

                if record_obj and record_obj.data and field_key in record_obj.data:
                    value = get_nested_value(record_obj.data, field_key.split('.'))
                    if value is not None:
                        print(f"    - Resolved from custom_object field: {var_path} -> {value}")
                        return str(value)
            elif custom_object_match_all:
                entity_type_id = int(custom_object_match_all.group(1))
                # 从上下文中获取选中的记录ID，如果存在的话
                selected_record_id = self.context.get(f"selectedCustomEntityRecordId_{entity_type_id}")
                
                if selected_record_id:
                    record_obj = self.db.query(CustomEntityRecord).filter(
                        CustomEntityRecord.entity_type_id == entity_type_id,
                        CustomEntityRecord.id == selected_record_id
                    ).first()
                    if record_obj:
                        record_data = record_obj.data.copy() if record_obj.data else {}
                        print(f"    - Resolved from custom_object all: {var_path} -> {record_data}")
                        return json.dumps(record_data, ensure_ascii=False, indent=2)
                print(f"    - Failed to resolve custom_object.all for entity type {entity_type_id}. Record not found or not selected.")
                return "{}"

            # 5. 尝试 'ai.reply' 相关变量
            if var_path.startswith("ai.reply."):
                ai_reply = self.context.ai.get("reply", {})
                value = get_nested_value(ai_reply, var_path.split('.')[2:])
                if value is not None:
                    print(f"    - Resolved from ai.reply: {var_path} -> {value}")
                    return str(value)

            # 6. 尝试 'customer' 相关变量（兼容格式）
            if var_path.startswith("customer."):
                customer_obj = self.context.db.get("customer", None)
                if customer_obj:
                    field_name = var_path.replace("customer.", "")
                    
                    # 特殊处理一些常见的字段映射
                    if field_name == "last_message":
                        # 获取最后一条消息内容
                        trigger_data = self.context.get("trigger_data", {})
                        value = trigger_data.get("message")
                        if value is not None:
                            print(f"    - Resolved from customer.last_message (trigger): {var_path} -> {value}")
                            return str(value)
                        else:
                            print(f"    - customer.last_message not found in trigger")
                    elif hasattr(customer_obj, field_name):
                        value = getattr(customer_obj, field_name)
                        if value is not None:
                            print(f"    - Resolved from customer: {var_path} -> {value}")
                            return str(value)
                    else:
                        print(f"    - customer object has no field: {field_name}")
                else:
                    print(f"    - No customer object in context")

            # 7. 尝试通用变量 (self.context.variables)
            if var_path in self.context.variables:
                value = self.context.variables[var_path]
                print(f"    - Resolved from context.variables: {var_path} -> {value}")
                return str(value)
            
            # 8. 尝试解析特定节点输出变量，例如 AI_NODE_ID.output.reply_text
            parts = var_path.split('.')
            if len(parts) >= 2:
                node_id = parts[0]
                output_key = parts[1]
                # 检查是否是合法的节点输出路径，例如 AI_123.output
                if output_key == "output" and node_id in self.context.variables:
                    node_output = self.context.variables[node_id]
                    nested_path = parts[2:] # 进一步的嵌套路径，例如 reply_text
                    value = get_nested_value(node_output, nested_path)
                    if value is not None:
                        print(f"    - Resolved from node output: {var_path} -> {value}")
                        return str(value)

            # 如果所有尝试都失败，返回原始的变量占位符
            print(f"    - Failed to resolve: {var_path}")
            return match.group(0) # Return original {{variable}} or {variable} including braces

        # Handle both {{variable}} and {variable} patterns
        text = re.sub(r'''\{\{(.*?)\}\}''', replace_match, text)
        text = re.sub(r'''\{([^{}]*)\}''', replace_match, text)
        return text

class TemplateProcessor(NodeProcessor):
    """模板消息节点 - 支持数据库变量查询"""
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """生成模板消息 - 支持多条消息和媒体"""
        try:
            # 获取模板配置 - 从node的data字段中获取
            node_data = node_config.get("data", {})
            
            # 新的多消息模板支持
            message_templates = node_data.get("message_templates", [])
            
            # 媒体配置
            media_list = node_data.get("media_list", [])
            media_send_mode = node_data.get("media_send_mode", "together_with_caption")
            media_settings = node_data.get("media_settings", {})
            
            # 兼容旧版本的单模板
            if not message_templates:
                # 如果没有新的消息模板，尝试使用旧的字段
                old_template = node_data.get("template", "")
                fallback_template = node_data.get("fallback_template", "您好！感谢您的咨询。")
                
                if old_template:
                    message_templates = [{"id": 1, "content": old_template}]
                elif fallback_template:
                    message_templates = [{"id": 1, "content": fallback_template}]
            
            print(f"🔍 Template节点配置:")
            print(f"  消息模板数量: {len(message_templates)}")
            print(f"  媒体文件数量: {len(media_list)}")
            print(f"  媒体发送模式: {media_send_mode}")
            
            # 处理多条消息模板
            processed_messages = []
            for i, template in enumerate(message_templates):
                template_content = template.get("content", "")
                if template_content:
                    # 应用变量替换
                    processed_content = self._apply_template_variables(template_content)
                    processed_messages.append({
                        "index": i,
                        "content": processed_content,
                        "original": template_content
                    })
                    print(f"  消息 #{i+1}: '{processed_content}'")
            
            # 如果没有有效的消息模板，使用默认消息
            if not processed_messages:
                processed_messages = [{
                    "index": 0,
                    "content": "您好！感谢您的咨询。",
                    "original": "您好！感谢您的咨询。"
                }]
            
            # 构建返回结果 - 设置默认的媒体发送配置（与LLM节点一致）
            if media_list and not media_settings:
                # 如果有媒体但没有设置，使用默认配置：先发送媒体，再发送文本
                media_settings = {
                    "send_media_separately": True,  # 默认分开发送
                    "send_with_caption": True,      # 默认附带说明
                    "delay_between_media": False,   # 默认不延迟
                    "delay_seconds": 2              # 默认延迟2秒
                }
                print(f"  🔧 设置默认媒体发送配置: {media_settings}")
            
            # 根据媒体发送模式处理配对逻辑
            if media_settings.get("paired_sending", False) and media_list and processed_messages:
                # 配对发送模式：创建媒体-文本配对
                paired_items = []
                max_items = max(len(media_list), len(processed_messages))
                
                for i in range(max_items):
                    media_item = media_list[i] if i < len(media_list) else None
                    message_item = processed_messages[i] if i < len(processed_messages) else None
                    
                    paired_items.append({
                        "index": i,
                        "media": media_item,
                        "message": message_item["content"] if message_item else "",
                        "has_media": media_item is not None,
                        "has_message": message_item is not None
                    })
                
                print(f"  🔗 配对发送模式：创建了 {len(paired_items)} 个媒体-文本配对")
                
                result = {
                    "message_templates": processed_messages,
                    "message_content": processed_messages[0]["content"] if processed_messages else "您好！感谢您的咨询。",
                    "message_type": "template",
                    "media_list": media_list,
                    "media_send_mode": media_send_mode,
                    "media_settings": media_settings,
                    "paired_items": paired_items  # 新增配对项目
                }
            else:
                # 非配对模式：保持原有逻辑
                result = {
                    "message_templates": processed_messages,
                    "message_content": processed_messages[0]["content"] if processed_messages else "您好！感谢您的咨询。",
                    "message_type": "template",
                    "media_list": media_list,
                    "media_send_mode": media_send_mode,
                    "media_settings": media_settings
                }
            
            print(f"  ✅ 模板处理完成，返回 {len(processed_messages)} 条消息")
            return result
                
        except Exception as e:
            logger.error(f"模板处理失败: {e}")
            return {
                "message_content": "抱歉，系统出现问题，请稍后再试。",
                "message_type": "text"
            }
    
    async def _resolve_variable(self, expression: str) -> str:
        """解析变量表达式"""
        if not expression or not isinstance(expression, str):
            return str(expression)
        
        # 移除双花括号
        if expression.startswith("{{") and expression.endswith("}}"):
            expression = expression[2:-2].strip()
        
        # 解析不同类型的变量
        if expression.startswith("trigger."):
            return self._resolve_trigger_variable(expression[8:])
        elif expression.startswith("db."):
            return await self._resolve_db_variable(expression[3:])
        elif expression.startswith("ai."):
            return self._resolve_ai_variable(expression[3:])
        else:
            # 直接返回字面值
            return expression
    
    def _resolve_trigger_variable(self, field: str) -> str:
        """解析触发器变量"""
        trigger_data = self.context.get("trigger_data", {})
        
        # 🔧 修復變量映射問題
        if field == "content":
            # trigger_data 中使用 "message"，但模板期望 "content"
            return str(trigger_data.get("message", ""))
        elif field == "name":
            return str(trigger_data.get("name", ""))
        elif field == "phone":
            return str(trigger_data.get("phone", ""))
        elif field == "timestamp":
            return str(trigger_data.get("timestamp", ""))
        else:
            # 回退到原始邏輯
            return str(trigger_data.get(field, ""))
    
    async def _resolve_db_variable(self, path: str) -> str:
        """解析数据库变量"""
        try:
            # 解析路径 例如: "customer.name" 或 "customer.phone"
            parts = path.split(".")
            if len(parts) < 2:
                return ""
            
            table_name = parts[0]
            field_name = parts[1]
            
            if table_name == "customer":
                customer = self.context.db.get("customer", None)
                if customer and hasattr(customer, field_name):
                    value = getattr(customer, field_name)
                    return str(value) if value is not None else ""
            
            return ""
        except Exception as e:
            logger.error(f"数据库变量解析失败: {e}")
            return ""
    
    def _resolve_ai_variable(self, field: str) -> str:
        """解析AI变量"""
        ai_data = self.context.get("ai", {})
        return str(ai_data.get(field, ""))
    
    def _apply_template_variables(self, template: str) -> str:
        """应用模板变量替换 - 新版本"""
        if not template:
            return ""
        
        import re
        
        def replace_variable(match):
            var_expr = match.group(0)  # 完整的 {{trigger.name}} 表达式
            try:
                # 去掉 {{ }}
                inner_expr = var_expr[2:-2].strip()
                
                if inner_expr.startswith("trigger."):
                    field = inner_expr[8:]  # 去掉 "trigger."
                    trigger_data = self.context.get("trigger_data", {})
                    
                    # 字段映射
                    if field == "content":
                        value = str(trigger_data.get("message", ""))
                    elif field == "message":
                        value = str(trigger_data.get("message", ""))
                    elif field == "name":
                        value = str(trigger_data.get("name", ""))
                    elif field == "phone":
                        value = str(trigger_data.get("phone", ""))
                    else:
                        value = str(trigger_data.get(field, ""))
                    
                    return value
                    
                elif inner_expr.startswith("db.customer."):
                    # 数据库客户字段
                    field = inner_expr[12:]  # 去掉 "db.customer."
                    customer_data = self.context.get("customer", {})
                    if hasattr(customer_data, field):
                        value = getattr(customer_data, field)
                        return str(value) if value is not None else ""
                    return ""
                    
                elif inner_expr.startswith("company."):
                    # 公司信息字段
                    field = inner_expr[8:]  # 去掉 "company."
                    # 这里可以添加公司信息的获取逻辑
                    return ""
                
                # 如果不能解析，保持原样
                return var_expr
                
            except Exception as e:
                print(f"    变量替换失败 {var_expr}: {e}")
                return var_expr
        
        # 使用正则表达式替换所有 {{...}} 表达式
        result = re.sub(r'''\{\{(.*?)\}\}''', replace_variable, template)
        return result

    def _apply_template(self, template: str, resolved_variables: dict) -> str:
        """应用变量到模板 - resolved_variables应该是解析后的实际值"""
        result = template
        
        # print(f"🔧 模板替换详情:") # Remove verbose template replacement details
        # print(f"  原始模板: '{template}'") # Remove verbose template replacement details
        # print(f"  解析后变量: {resolved_variables}") # Remove verbose template replacement details
        
        # resolved_variables的格式应该是: {'1': 'Debug User', '2': '601168208639', '3': '再次测试变量'}
        # 但是模板中的占位符是: {{trigger.name}}, {{trigger.content}} 等
        # 
        # 这里有一个设计问题：我们需要知道哪个key对应哪个原始变量表达式
        # 
        # 当前的解决方案：先尝试一种更直接的方式 - 直接解析模板中的变量表达式
        
        # 使用正则表达式找到模板中的所有 {{...}} 占位符并逐一替换
        import re
        
        def replace_variable(match):
            var_expr = match.group(0)  # 完整的 {{trigger.name}} 表达式
            # 解析这个变量表达式
            try:
                # 去掉 {{ }}
                inner_expr = var_expr[2:-2].strip()
                if inner_expr.startswith("trigger."):
                    field = inner_expr[8:]  # 去掉 "trigger."
                    trigger_data = self.context.get("trigger_data", {})
                    
                    # 🔧 修復字段映射
                    if field == "content":
                        value = str(trigger_data.get("message", ""))  # message 而不是 content
                    else:
                        value = str(trigger_data.get(field, ""))
                    
                    # print(f"    替换 {var_expr} → '{value}'") # Remove verbose individual variable replacement print
                    return value
                # 可以扩展支持其他类型的变量
                return var_expr  # 如果不能解析，保持原样
            except Exception as e:
                print(f"    替换失败 {var_expr}: {e}")
                return var_expr
        
        # 使用正则表达式替换所有 {{...}} 表达式
        result = re.sub(r'''\{\{(.*?)\}\}''', replace_variable, template)
        
        # print(f"  最终结果: '{result}'") # Remove verbose final result print
        
        return result

class SendTelegramMessageProcessor(NodeProcessor):
    """Telegram 消息发送节点"""
    
    def __init__(self, db: Session, context: WorkflowContext):
        super().__init__(db, context)
        self.telegram_service = TelegramService()
    
    async def _get_media_urls_from_identifiers(self, media_uuids: List[str], folder_names: List[str], user_id: int) -> List[str]:
        """
        根据媒体UUID和文件夹名称获取媒体文件URL
        
        Args:
            media_uuids: 媒体文件UUID列表
            folder_names: 文件夹名称列表
            user_id: 用户ID
            
        Returns:
            List[str]: 媒体文件URL列表
        """
        try:
            from app.db.models import MediaFile
            from app.services import supabase as supabase_service
            from app.core.config import settings
            
            media_urls = []
            
            # 获取单个媒体文件
            if media_uuids:
                media_files = self.db.query(MediaFile).filter(
                    MediaFile.id.in_(media_uuids),
                    MediaFile.user_id == user_id
                ).all()
                
                for media_file in media_files:
                    # 生成签名URL
                    relative_path = media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
                    signed_url = await supabase_service.get_signed_url_for_file(relative_path)
                    if signed_url:
                        media_urls.append(signed_url)
                        print(f"    📎 添加 Telegram 媒体文件: {media_file.filename}")
            
            # 获取文件夹中的所有媒体文件
            if folder_names:
                for folder_name in folder_names:
                    folder_media = self.db.query(MediaFile).filter(
                        MediaFile.user_id == user_id,
                        MediaFile.folder == folder_name,
                        MediaFile.filename != ".keep"  # 排除.keep文件
                    ).all()
                    
                    for media_file in folder_media:
                        relative_path = media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
                        signed_url = await supabase_service.get_signed_url_for_file(relative_path)
                        if signed_url:
                            media_urls.append(signed_url)
                            print(f"    📁 添加 Telegram 文件夹媒体: {folder_name}/{media_file.filename}")
            
            return media_urls
            
        except Exception as e:
            logger.error(f"Failed to get media URLs from identifiers for Telegram: {e}")
            return []
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """发送 Telegram 消息"""
        node_data = node_config.get("data", {})
        
        send_mode = node_data.get("send_mode", "smart_reply")
        number_source = node_data.get("number_source", "trigger_number")
        to = ""
        bot_token = node_data.get("telegram_bot_token") # 从 node_data 获取 bot_token
        message_template = node_data.get("template") # 从 node_data 获取模板
        
        print(f"📤 SendTelegram 節點開始執行:")
        print(f"  初始配置 - send_mode: '{send_mode}', number_source: '{number_source}', message_template: '{message_template}'")
        
        # 确定接收方 (to)
        if send_mode == "smart_reply":
            # 智能回复：使用触发器的 chat_id
            trigger_data = self.context.get("trigger_data", {})
            to = trigger_data.get("chat_id", "")
            print(f"  智能回复 - 使用触发器 Chat ID: {to}")
        elif send_mode == "force_telegram":
            # 强制发送到 Telegram
            if number_source == "custom_number":
                to = node_data.get("telegram_chat_id", "")
                print(f"  强制 Telegram - 自定义 Chat ID: {to}")
            else:  # trigger_number
                trigger_data = self.context.get("trigger_data", {})
                to = trigger_data.get("chat_id", "")
                print(f"  强制 Telegram - 触发器 Chat ID: {to}")
        elif send_mode == "telegram_chat_id":
            # 兼容旧的配置方式
            to = node_data.get("telegram_chat_id", "")
            print(f"  兼容模式 - 使用指定 Chat ID: {to}")
        elif send_mode == "trigger_number":
            # 兼容旧的配置方式
            trigger_data = self.context.get("trigger_data", {})
            to = trigger_data.get("chat_id", trigger_data.get("phone", "")) # 优先使用 chat_id，其次 phone
            print(f"  兼容模式 - 使用触发器 Chat ID/Phone: {to}")
        else:
            # 如果 send_mode 未知或为空，默认为智能回复
            trigger_data = self.context.get("trigger_data", {})
            to = trigger_data.get("chat_id", trigger_data.get("phone", ""))
            print(f"  未知模式，默认使用触发器 (Chat ID/Phone): {to}")

        # 解析消息内容 - 支持多条消息
        messages_to_send = []
        
        # 优先使用节点配置中的模板
        if message_template:
            resolved_message = self._resolve_variable_from_context(message_template)
            messages_to_send.append(resolved_message)
            print(f"  ✅ 使用节点模板消息: '{resolved_message}'")
        
        # 如果节点模板为空，尝试从上下文中获取消息内容（模板处理器或其他处理器的输出）
        if not messages_to_send:
            # 调试：打印完整的上下文信息
            print(f"  🔍 调试上下文信息:")
            print(f"    - 完整上下文键: {list(self.context.variables.keys())}")
            
            # 1. 优先从模板处理器输出获取多条消息 (message_templates)
            template_messages = self.context.variables.get("message_templates", [])
            if template_messages and isinstance(template_messages, list):
                for msg_obj in template_messages:
                    if isinstance(msg_obj, dict) and msg_obj.get("content"):
                        messages_to_send.append(msg_obj["content"])
                print(f"  ✅ 使用模板处理器多条消息输出: {len(messages_to_send)} 条消息")
            
            # 2. 如果没有多条消息，尝试单条消息 (message_content)
            if not messages_to_send:
                template_message = self.context.variables.get("message_content")
                if template_message:
                    messages_to_send.append(template_message)
                    print(f"  ✅ 使用模板处理器单条消息输出: '{template_message}'")
            
            # 3. 如果没有模板输出，尝试从 AI 回复中获取
            if not messages_to_send:
                ai_data = self.context.variables.get("ai")
                print(f"    - ai 对象: {ai_data}")
                print(f"    - ai 对象类型: {type(ai_data)}")
                
                if ai_data and isinstance(ai_data, dict):
                    reply_obj = ai_data.get("reply")
                    print(f"    - ai.reply 对象: {reply_obj}")
                    print(f"    - ai.reply 类型: {type(reply_obj)}")
                    
                    if reply_obj and isinstance(reply_obj, dict):
                        ai_message = reply_obj.get("reply_text")
                        if ai_message:
                            messages_to_send.append(ai_message)
                            print(f"  ✅ 使用 AI 回复: '{ai_message}'")
                
                # 备用方法：尝试直接从 context.ai 获取（如果 variables 复制失败）
                if not messages_to_send and hasattr(self.context, 'ai'):
                    reply_obj = self.context.ai.get("reply", {})
                    print(f"    - 备用：从 context.ai.reply 获取: {reply_obj}")
                    if reply_obj and isinstance(reply_obj, dict):
                        ai_message = reply_obj.get("reply_text")
                        if ai_message:
                            messages_to_send.append(ai_message)
                            print(f"  ✅ 备用方式使用 AI 回复: '{ai_message}'")
            
            # 4. 最终fallback，使用默认消息
            if not messages_to_send:
                default_message = self.context.get("chat.last_message", "Hi! We received your message.")
                messages_to_send.append(default_message)
                print(f"  ⚠️ 使用默认消息 (无其他消息源): '{default_message}'")

        print(f"  最终接收方 (to): '{to}'")
        print(f"  最终消息数量: {len(messages_to_send)} 条")
        print(f"  最终消息内容: {messages_to_send}")

        if not to:
            raise ValueError("Recipient (chat_id) for Telegram message is empty.")

        # 获取用户专属的 API ID 和 API Hash
        settings_service = SettingsService(self.db)
        customer = self.context.db.get("customer", None)
        if not customer:
            raise ValueError("Customer not found in context, cannot retrieve Telegram API credentials.")
        user_id = customer.user_id # 从客户中获取 user_id

        # 处理媒体文件 - 从节点配置、模板处理器和 AI 回复中获取
        media_uuids = node_data.get("media_uuids", [])
        folder_names = node_data.get("folder_names", [])
        
        # 从模板处理器获取媒体文件和设置
        media_settings = {}
        template_media_list = self.context.variables.get("media_list", [])
        template_media_settings = self.context.variables.get("media_settings", {})
        
        if template_media_list:
            # 从模板媒体列表中提取 UUID
            template_media_uuids = [media.get("uuid") for media in template_media_list if media.get("uuid")]
            media_uuids.extend(template_media_uuids)
            media_settings.update(template_media_settings)
            print(f"  📋 从模板处理器获取媒体 - 数量: {len(template_media_uuids)}")
        
        # 从 AI 回复中获取媒体文件和媒体设置
        ai_data = self.context.variables.get("ai")
        if ai_data and isinstance(ai_data, dict):
            ai_reply = ai_data.get("reply", {})
            if ai_reply and isinstance(ai_reply, dict):
                ai_media_uuids = ai_reply.get("media_uuids", [])
                ai_folder_names = ai_reply.get("folder_names", [])
                ai_media_settings = ai_reply.get("media_settings", {})
                
                # 合并 AI 回复中的媒体文件和设置
                media_uuids.extend(ai_media_uuids)
                folder_names.extend(ai_folder_names)
                media_settings.update(ai_media_settings)
                
                if ai_media_uuids or ai_folder_names:
                    print(f"  🤖 从 AI 回复获取媒体 - UUIDs: {len(ai_media_uuids)}, 文件夹: {len(ai_folder_names)}")
        
        media_urls = []
        if media_uuids or folder_names:
            print(f"  📎 总媒体配置 - UUIDs: {len(media_uuids)}, 文件夹: {len(folder_names)}")
            media_urls = await self._get_media_urls_from_identifiers(media_uuids, folder_names, user_id)
            print(f"  📎 获取到 {len(media_urls)} 个媒体文件")

        print(f"  媒体文件数量: {len(media_urls)}")
        print(f"  媒体设置: {media_settings}")

        if not messages_to_send and not media_urls:
            raise ValueError("Message content and media files for Telegram message are both empty.")
        api_id = settings_service.get_setting_for_user('telegram_api_id', user_id)
        api_hash = settings_service.get_setting_for_user('telegram_api_hash', user_id)

        if not api_id or not api_hash:
            raise HTTPException(status_code=400, detail="Telegram API credentials not configured for user.")

        api_id = int(api_id)

        # 检查是否提供了 bot_token
        if bot_token:
            # 如果提供了 bot_token，使用 Bot 模式发送
            print(f"  使用 Telegram Bot 发送消息到 {to}")
            try:
                async with TelegramClient(StringSession(), api_id, api_hash) as bot_client:
                    # Bot 客户端也需要 connect
                    await _ensure_client_connect(bot_client)
                    await bot_client.start(bot_token=bot_token)
                    
                    # 处理 chat_id 转换
                    try:
                        # 尝试将 chat_id 转换为整数
                        chat_id_int = int(to)
                        entity = chat_id_int  # 直接使用整数 chat_id
                        print(f"  Bot 模式使用整数 chat_id: {entity}")
                    except ValueError:
                        # 如果不是数字，尝试作为用户名或实体获取
                        entity = await bot_client.get_entity(to)
                        print(f"  Bot 模式通过 get_entity 获取实体: {entity}")
                    
                    # 发送消息和媒体文件
                    if media_urls:
                        # 获取媒体发送配置
                        send_separately = media_settings.get("send_media_separately", False)
                        send_with_caption = media_settings.get("send_with_caption", True)
                        delay_between_media = media_settings.get("delay_between_media", False)
                        delay_seconds = media_settings.get("delay_seconds", 2)
                        
                        # 检查媒体发送模式
                        media_send_mode = media_settings.get("media_send_mode", "together_with_caption")
                        
                        print(f"  📋 Telegram Bot 媒体发送配置:")
                        print(f"    - 发送模式: {media_send_mode}")
                        print(f"    - 分开发送: {send_separately}")
                        print(f"    - 附带说明: {send_with_caption}")
                        print(f"    - 延迟发送: {delay_between_media} ({delay_seconds}秒)")
                        
                        if media_send_mode == "separately" or send_separately:
                            # 分开发送：先发送媒体，再发送文本
                            print(f"  🖼️ Telegram Bot 分开发送模式：先发送所有媒体文件")
                            
                            # 先发送每个媒体文件
                            for i, media_url in enumerate(media_urls):
                                if delay_between_media and i > 0:
                                    print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                    await asyncio.sleep(delay_seconds)
                                
                                print(f"  🖼️ 发送媒体文件 {i+1}/{len(media_urls)}: {media_url}")
                                await bot_client.send_message(entity=entity, message="", file=media_url)
                            
                            # 所有媒体发送完成后，再发送文本消息
                            if messages_to_send:
                                print(f"  📝 媒体发送完成，现在发送 {len(messages_to_send)} 条文本消息")
                                for i, message in enumerate(messages_to_send):
                                    if i > 0:
                                        await asyncio.sleep(1)  # 消息间延迟1秒
                                    print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                    await bot_client.send_message(entity=entity, message=message)
                                
                        elif media_send_mode == "together_with_caption":
                            # 一起发送模式：媒体附带文本说明
                            if len(media_urls) == 1 and messages_to_send and send_with_caption:
                                # 单个媒体文件，带第一条文本
                                first_message = messages_to_send[0]
                                print(f"  📤 发送带文本的单个媒体文件: '{first_message}'")
                                await bot_client.send_message(entity=entity, message=first_message, file=media_urls[0])
                                
                                # 发送剩余的文本消息
                                for i, message in enumerate(messages_to_send[1:], 1):
                                    await asyncio.sleep(1)  # 消息间延迟1秒
                                    print(f"  📝 发送剩余文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                    await bot_client.send_message(entity=entity, message=message)
                            else:
                                # 多个媒体文件：第一个带文本，其余单独发送
                                for i, media_url in enumerate(media_urls):
                                    if delay_between_media and i > 0:
                                        print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                        await asyncio.sleep(delay_seconds)
                                    
                                    if i == 0 and messages_to_send and send_with_caption:
                                        # 第一个媒体文件带第一条文本
                                        first_message = messages_to_send[0]
                                        print(f"  🖼️📝 发送带文本的媒体文件 {i+1}/{len(media_urls)}: '{first_message}'")
                                        await bot_client.send_message(entity=entity, message=first_message, file=media_url)
                                    else:
                                        # 其余媒体文件单独发送
                                        print(f"  🖼️ 发送媒体文件 {i+1}/{len(media_urls)}: {media_url}")
                                        await bot_client.send_message(entity=entity, message="", file=media_url)
                                
                                # 发送剩余的文本消息（如果有多条消息）
                                if len(messages_to_send) > 1:
                                    print(f"  📝 发送剩余的 {len(messages_to_send)-1} 条文本消息")
                                    for i, message in enumerate(messages_to_send[1:], 1):
                                        await asyncio.sleep(1)  # 消息间延迟1秒
                                        print(f"  📝 发送剩余文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                        await bot_client.send_message(entity=entity, message=message)
                        else:  # media_only 或其他模式
                            # 只发送媒体文件
                            print(f"  🖼️ 只发送媒体文件模式")
                            for i, media_url in enumerate(media_urls):
                                if delay_between_media and i > 0:
                                    print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                    await asyncio.sleep(delay_seconds)
                                
                                print(f"  🖼️ 发送媒体文件 {i+1}/{len(media_urls)}: {media_url}")
                                await bot_client.send_message(entity=entity, message="", file=media_url)
                            
                            # 如果是 media_only 模式但仍有文本，单独发送文本
                            if messages_to_send and media_send_mode != "media_only":
                                print(f"  📝 发送 {len(messages_to_send)} 条文本消息")
                                for i, message in enumerate(messages_to_send):
                                    if i > 0:
                                        await asyncio.sleep(1)  # 消息间延迟1秒
                                    print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                    await bot_client.send_message(entity=entity, message=message)
                    else:
                        # 只发送文本消息
                        print(f"  📝 只发送 {len(messages_to_send)} 条文本消息")
                        for i, message in enumerate(messages_to_send):
                            if i > 0:
                                await asyncio.sleep(1)  # 消息间延迟1秒
                            print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                            await bot_client.send_message(entity=entity, message=message)
                    
                    print(f"✅ Telegram Bot 消息发送成功到 {to}")
            except Exception as e:
                logger.error(f"❌ Telegram Bot 消息发送失败到 {to}: {e}")
                raise
        else:
            # 否则，使用用户会话模式发送
            # 获取用户的 string_session 或 session_file_b64
            string_sess = settings_service.get_setting_for_user('telegram_string_session', user_id)
            session_file_b64 = settings_service.get_setting_for_user('telegram_session_file', user_id)

            session_param: Any = None
            temp_session_file_path: Optional[str] = None

            if string_sess:
                session_param = StringSession(string_sess)
                print(f"  使用 StringSession 发送消息...")
            elif session_file_b64:
                try:
                    # 更健壮的 base64 解码
                    cleaned_session_file = session_file_b64.strip().replace(' ', '')
                    padding_needed = -len(cleaned_session_file) % 4
                    if padding_needed != 0: # 仅在需要时添加填充
                        cleaned_session_file += '=' * padding_needed

                    data = base64.b64decode(cleaned_session_file, validate=True)
                    temp_session_file = tempfile.NamedTemporaryFile(delete=False, suffix=".session")
                    temp_session_file.write(data)
                    temp_session_file.close()
                    temp_session_file_path = temp_session_file.name
                    session_param = temp_session_file_path
                    print(f"  使用临时 session 文件 '{temp_session_file_path}' 发送消息...")
                except Exception as e:
                    logger.error(f"❌ 解码或写入临时会话文件失败: {e}")
                    # 如果会话文件损坏，清除它
                    settings_service.delete_setting_for_user('telegram_session_file', user_id)
                    raise HTTPException(status_code=500, detail="Invalid Telegram session file, please re-login.")

            if not session_param:
                raise HTTPException(status_code=400, detail="Telegram session not found. Please log in to Telegram.")

            client: Optional[TelegramClient] = None
            try:
                client = TelegramClient(session_param, api_id, api_hash)
                await _ensure_client_connect(client)
                
                # 获取目标实体 - 处理 chat_id 转换
                try:
                    # 尝试将 chat_id 转换为整数
                    chat_id_int = int(to)
                    entity = chat_id_int  # 直接使用整数 chat_id
                    print(f"  使用整数 chat_id: {entity}")
                except ValueError:
                    # 如果不是数字，尝试作为用户名或实体获取
                    entity = await client.get_entity(to)
                    print(f"  通过 get_entity 获取实体: {entity}")

                # 发送消息和媒体文件
                if media_urls:
                    # 获取媒体发送配置
                    send_separately = media_settings.get("send_media_separately", False)
                    send_with_caption = media_settings.get("send_with_caption", True)
                    delay_between_media = media_settings.get("delay_between_media", False)
                    delay_seconds = media_settings.get("delay_seconds", 2)
                    
                    # 检查媒体发送模式
                    media_send_mode = media_settings.get("media_send_mode", "together_with_caption")
                    
                    print(f"  📋 Telegram 用户会话媒体发送配置:")
                    print(f"    - 发送模式: {media_send_mode}")
                    print(f"    - 分开发送: {send_separately}")
                    print(f"    - 附带说明: {send_with_caption}")
                    print(f"    - 延迟发送: {delay_between_media} ({delay_seconds}秒)")
                    
                    if media_send_mode == "separately" or send_separately:
                        # 分开发送：先发送媒体，再发送文本
                        print(f"  🖼️ Telegram 用户会话分开发送模式：先发送所有媒体文件")
                        
                        # 先发送每个媒体文件
                        for i, media_url in enumerate(media_urls):
                            if delay_between_media and i > 0:
                                print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                await asyncio.sleep(delay_seconds)
                            
                            print(f"  🖼️ 发送媒体文件 {i+1}/{len(media_urls)}: {media_url}")
                            await client.send_message(entity=entity, message="", file=media_url)
                        
                        # 所有媒体发送完成后，再发送文本消息
                        if messages_to_send:
                            print(f"  📝 媒体发送完成，现在发送 {len(messages_to_send)} 条文本消息")
                            for i, message in enumerate(messages_to_send):
                                if i > 0:
                                    await asyncio.sleep(1)  # 消息间延迟1秒
                                print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                await client.send_message(entity=entity, message=message)
                            
                    elif media_send_mode == "together_with_caption":
                        # 一起发送模式：媒体附带文本说明
                        if len(media_urls) == 1 and messages_to_send and send_with_caption:
                            # 单个媒体文件，带第一条文本
                            first_message = messages_to_send[0]
                            print(f"  📤 发送带文本的单个媒体文件: '{first_message}'")
                            await client.send_message(entity=entity, message=first_message, file=media_urls[0])
                            
                            # 发送剩余的文本消息
                            for i, message in enumerate(messages_to_send[1:], 1):
                                await asyncio.sleep(1)  # 消息间延迟1秒
                                print(f"  📝 发送剩余文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                await client.send_message(entity=entity, message=message)
                        else:
                            # 多个媒体文件：第一个带文本，其余单独发送
                            for i, media_url in enumerate(media_urls):
                                if delay_between_media and i > 0:
                                    print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                    await asyncio.sleep(delay_seconds)
                                
                                if i == 0 and messages_to_send and send_with_caption:
                                    # 第一个媒体文件带第一条文本
                                    first_message = messages_to_send[0]
                                    print(f"  🖼️📝 发送带文本的媒体文件 {i+1}/{len(media_urls)}: '{first_message}'")
                                    await client.send_message(entity=entity, message=first_message, file=media_url)
                                else:
                                    # 其余媒体文件单独发送
                                    print(f"  🖼️ 发送媒体文件 {i+1}/{len(media_urls)}: {media_url}")
                                    await client.send_message(entity=entity, message="", file=media_url)
                            
                            # 发送剩余的文本消息（如果有多条消息）
                            if len(messages_to_send) > 1:
                                print(f"  📝 发送剩余的 {len(messages_to_send)-1} 条文本消息")
                                for i, message in enumerate(messages_to_send[1:], 1):
                                    await asyncio.sleep(1)  # 消息间延迟1秒
                                    print(f"  📝 发送剩余文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                    await client.send_message(entity=entity, message=message)
                                    
                    else:  # media_only 或其他模式
                        # 只发送媒体文件
                        print(f"  🖼️ 只发送媒体文件模式")
                        for i, media_url in enumerate(media_urls):
                            if delay_between_media and i > 0:
                                print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                await asyncio.sleep(delay_seconds)
                            
                            print(f"  🖼️ 发送媒体文件 {i+1}/{len(media_urls)}: {media_url}")
                            await client.send_message(entity=entity, message="", file=media_url)
                        
                        # 如果是 media_only 模式但仍有文本，单独发送文本
                        if messages_to_send and media_send_mode != "media_only":
                            print(f"  📝 发送 {len(messages_to_send)} 条文本消息")
                            for i, message in enumerate(messages_to_send):
                                if i > 0:
                                    await asyncio.sleep(1)  # 消息间延迟1秒
                                print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                                await client.send_message(entity=entity, message=message)
                else:
                    # 只发送文本消息
                    print(f"  📝 只发送 {len(messages_to_send)} 条文本消息")
                    for i, message in enumerate(messages_to_send):
                        if i > 0:
                            await asyncio.sleep(1)  # 消息间延迟1秒
                        print(f"  📝 发送文本消息 {i+1}/{len(messages_to_send)}: '{message}'")
                        await client.send_message(entity=entity, message=message)
                
                print(f"✅ Telegram 用户会话消息发送成功到 {to}")
            except Exception as e:
                logger.error(f"❌ Telegram 用户会话消息发送失败到 {to}: {e}", exc_info=True)
                raise
            finally:
                if client and client.is_connected():
                    await client.disconnect()
                if temp_session_file_path and os.path.exists(temp_session_file_path):
                    os.remove(temp_session_file_path)
                    print(f"  清理临时会话文件: {temp_session_file_path}")

        return {
            "status": "success",
            "message": "Telegram message sent successfully",
            "to": to,
            "content": messages_to_send,
            "message_count": len(messages_to_send)
        }

    def _resolve_variable_from_context(self, text: str) -> str:
        """解析文本中的所有 {{variable_path}} 和 {variable_path} 变量"""
        if not isinstance(text, str): # Ensure text is a string
            return str(text)

        def get_nested_value(data, path_parts):
            current = data
            for part in path_parts:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                elif isinstance(current, object) and hasattr(current, part):
                    current = getattr(current, part)
                else:
                    return None
            return current

        def replace_match(match):
            var_path = match.group(1).strip() # Extract path inside {{}} or {}
            print(f"  🔍 Resolving variable path: {var_path}") # Debug print

            # 尝试从各种上下文中解析变量
            # 优先级：trigger_data, actor, db.customer, ai.reply, 通用变量, 其他节点输出

            # 1. 优先尝试 'trigger' 相关变量
            if var_path.startswith("trigger."):
                trigger_data = self.context.get("trigger_data", {})
                value = get_nested_value(trigger_data, var_path.split('.')[1:])
                if value is not None:
                    print(f"    - Resolved from trigger: {var_path} -> {value}")
                    return str(value)

            # 2. 尝试 'actor' 相关变量
            if var_path.startswith("actor."):
                actor_data = self.context.get("actor", {})
                value = get_nested_value(actor_data, var_path.split('.')[1:])
                if value is not None:
                    print(f"    - Resolved from actor: {var_path} -> {value}")
                    return str(value)

            # 3. 尝试 'db.customer' 相关变量或 'customer.all'
            if var_path.startswith("db.customer."):
                customer_obj = self.context.db.get("customer", None)
                if customer_obj:
                    value = get_nested_value(customer_obj, var_path.split('.')[2:])
                    if value is not None:
                        print(f"    - Resolved from db.customer: {var_path} -> {value}")
                        return str(value)
            elif var_path == "customer.all":
                customer_obj = self.context.db.get("customer", None)
                if customer_obj:
                    # 将整个客户对象（包括 custom_fields）转换为 JSON 字符串
                    customer_data = customer_obj.__dict__.copy()
                    customer_data.pop('_sa_instance_state', None)
                    
                    # 如果 custom_fields 是字符串，尝试解析为字典
                    if isinstance(customer_data.get('custom_fields'), str):
                        try:
                            customer_data['custom_fields'] = json.loads(customer_data['custom_fields'])
                        except json.JSONDecodeError:
                            pass # 保持原样，如果不是有效 JSON

                    return json.dumps(customer_data, ensure_ascii=False, indent=2)
                return "{}"

            # 4. 尝试 'custom_object' 相关变量
            custom_object_match_field = re.match(r"custom_object\.(\d+)\.(\d+)\.([a-zA-Z0-9_.]+)", var_path)
            custom_object_match_all = re.match(r"custom_object\.(\d+)\.all", var_path)

            if custom_object_match_field:
                entity_type_id = int(custom_object_match_field.group(1))
                record_id = int(custom_object_match_field.group(2))
                field_key = custom_object_match_field.group(3)
                
                record_obj = self.db.query(CustomEntityRecord).filter(
                    CustomEntityRecord.entity_type_id == entity_type_id,
                    CustomEntityRecord.id == record_id
                ).first()

                if record_obj and record_obj.data and field_key in record_obj.data:
                    value = get_nested_value(record_obj.data, field_key.split('.'))
                    if value is not None:
                        print(f"    - Resolved from custom_object field: {var_path} -> {value}")
                        return str(value)
            elif custom_object_match_all:
                entity_type_id = int(custom_object_match_all.group(1))
                # 从上下文中获取选中的记录ID，如果存在的话
                selected_record_id = self.context.get(f"selectedCustomEntityRecordId_{entity_type_id}")
                
                if selected_record_id:
                    record_obj = self.db.query(CustomEntityRecord).filter(
                        CustomEntityRecord.entity_type_id == entity_type_id,
                        CustomEntityRecord.id == selected_record_id
                    ).first()
                    if record_obj:
                        record_data = record_obj.data.copy() if record_obj.data else {}
                        print(f"    - Resolved from custom_object all: {var_path} -> {record_data}")
                        return json.dumps(record_data, ensure_ascii=False, indent=2)
                print(f"    - Failed to resolve custom_object.all for entity type {entity_type_id}. Record not found or not selected.")
                return "{}"

            # 5. 尝试 'ai.reply' 相关变量
            if var_path.startswith("ai.reply."):
                ai_reply = self.context.ai.get("reply", {})
                value = get_nested_value(ai_reply, var_path.split('.')[2:])
                if value is not None:
                    print(f"    - Resolved from ai.reply: {var_path} -> {value}")
                    return str(value)

            # 6. 尝试 'customer' 相关变量（兼容格式）
            if var_path.startswith("customer."):
                customer_obj = self.context.db.get("customer", None)
                if customer_obj:
                    field_name = var_path.replace("customer.", "")
                    
                    # 特殊处理一些常见的字段映射
                    if field_name == "last_message":
                        # 获取最后一条消息内容
                        trigger_data = self.context.get("trigger_data", {})
                        value = trigger_data.get("message")
                        if value is not None:
                            print(f"    - Resolved from customer.last_message (trigger): {var_path} -> {value}")
                            return str(value)
                        else:
                            print(f"    - customer.last_message not found in trigger")
                    elif hasattr(customer_obj, field_name):
                        value = getattr(customer_obj, field_name)
                        if value is not None:
                            print(f"    - Resolved from customer: {var_path} -> {value}")
                            return str(value)
                    else:
                        print(f"    - customer object has no field: {field_name}")
                else:
                    print(f"    - No customer object in context")

            # 7. 尝试通用变量 (self.context.variables)
            if var_path in self.context.variables:
                value = self.context.variables[var_path]
                print(f"    - Resolved from context.variables: {var_path} -> {value}")
                return str(value)
            
            # 如果所有尝试都失败，返回原始的变量占位符
            print(f"    - Failed to resolve: {var_path}")
            return match.group(0) # Return original {{variable}} or {variable} including braces

        # Handle both {{variable}} and {variable} patterns
        text = re.sub(r'''\{\{(.*?)\}\}''', replace_match, text)
        text = re.sub(r'''\{([^{}]*)\}''', replace_match, text)
        return text

class GuardrailValidatorProcessor(NodeProcessor):
    """合规检查节点"""
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """执行合规检查"""
        checks = node_config.get("checks", {})
        blocked_keywords = checks.get("blocked_keywords", [])
        url_whitelist = checks.get("url_whitelist", [])
        
        # 获取要检查的内容
        ai_reply = self.context.get("ai.reply", {})
        reply_text = ai_reply.get("reply_text", "")
        
        # 关键词检查
        for keyword in blocked_keywords:
            if keyword.lower() in reply_text.lower():
                return {"pass_or_fail_branch": "fail"}
        
        # URL 检查（如果有的话）
        import re
        urls = re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', reply_text)
        if urls and url_whitelist:
            for url in urls:
                if not any(allowed in url for allowed in url_whitelist):
                    return {"pass_or_fail_branch": "fail"}
        
        return {"pass_or_fail_branch": "pass"}


def _get_var_value_from_context(context: WorkflowContext, var_path: str):
    # 支持: trigger.X, db.customer.field, ai.field
    try:
        if var_path.startswith('trigger.'):
            return context.get('trigger_data', {}).get(var_path.split('.', 1)[1])
        if var_path.startswith('db.customer.'):
            customer = context.db.get('customer')
            if customer:
                return getattr(customer, var_path.split('.', 2)[2], None)
            return None
        if var_path.startswith('ai.'):
            return context.get('ai', {}).get(var_path.split('.', 1)[1])
        # fallback to variables
        return context.get(var_path)
    except Exception:
        return None


def evaluate_jsonlogic(expression: dict, context_vars: dict) -> bool:
    # minimal jsonlogic subset
    if not isinstance(expression, dict):
        return bool(expression)
    if '==' in expression:
        a, b = expression['==']
        if isinstance(a, dict) and 'var' in a:
            a = context_vars.get(a['var'])
        if isinstance(b, dict) and 'var' in b:
            b = context_vars.get(b['var'])
        return a == b
    if '!=' in expression:
        a, b = expression['!=']
        if isinstance(a, dict) and 'var' in a:
            a = context_vars.get(a['var'])
        if isinstance(b, dict) and 'var' in b:
            b = context_vars.get(b['var'])
        return a != b
    if 'and' in expression:
        return all(evaluate_jsonlogic(e, context_vars) for e in expression['and'])
    if 'or' in expression:
        return any(evaluate_jsonlogic(e, context_vars) for e in expression['or'])
    if 'var' in expression:
        return context_vars.get(expression['var'])
    return False


class ConditionProcessor(NodeProcessor):
    """Condition 节点，支持可视化条件构建器或 JSONLogic"""
    
    def _get_field_value(self, field_path: str, customer=None):
        """获取字段值，支持 db.customer.* 和 custom_fields.*"""
        if field_path.startswith('db.customer.'):
            field_name = field_path.replace('db.customer.', '')
            if customer:
                if field_name == 'custom_fields':
                    return customer.custom_fields or {}
                else:
                    return getattr(customer, field_name, None)
        elif field_path.startswith('custom_fields.'):
            field_key = field_path.replace('custom_fields.', '')
            if customer and customer.custom_fields:
                custom_fields = customer.custom_fields if isinstance(customer.custom_fields, dict) else json.loads(customer.custom_fields or '{}')
                return custom_fields.get(field_key)
        elif field_path.startswith('trigger.'):
            field_name = field_path.replace('trigger.', '')
            trigger = self.context.get('trigger_data', {})
            return trigger.get(field_name)
        elif field_path.startswith('ai.'):
            field_name = field_path.replace('ai.', '')
            ai_ctx = self.context.get('ai', {}) or {}
            return ai_ctx.get(field_name)
        return None
    
    def _evaluate_condition(self, condition: Dict[str, Any], customer=None) -> bool:
        """评估单个条件"""
        field = condition.get('field', '')
        operator = condition.get('operator', '==')
        value = condition.get('value', '')
        
        if not field:
            return False
            
        actual_value = self._get_field_value(field, customer)
        
        try:
            # 处理不同的操作符
            if operator == '==':
                return str(actual_value) == str(value)
            elif operator == '!=':
                return str(actual_value) != str(value)
            elif operator == '>':
                return float(actual_value or 0) > float(value or 0)
            elif operator == '>=':
                return float(actual_value or 0) >= float(value or 0)
            elif operator == '<':
                return float(actual_value or 0) < float(value or 0)
            elif operator == '<=':
                return float(actual_value or 0) <= float(value or 0)
            elif operator == 'contains':
                return str(value).lower() in str(actual_value or '').lower()
            elif operator == 'starts_with':
                return str(actual_value or '').lower().startswith(str(value).lower())
            elif operator == 'ends_with':
                return str(actual_value or '').lower().endswith(str(value).lower())
            elif operator == 'is_empty':
                return not actual_value or str(actual_value).strip() == ''
            elif operator == 'is_not_empty':
                return actual_value and str(actual_value).strip() != ''
            elif operator == 'between':
                if ',' in str(value):
                    min_val, max_val = str(value).split(',', 1)
                    actual_num = float(actual_value or 0)
                    return float(min_val.strip() or 0) <= actual_num <= float(max_val.strip() or 0)
                return False
            elif operator == 'days_ago':
                if actual_value:
                    from datetime import datetime, timedelta
                    try:
                        if isinstance(actual_value, str):
                            actual_date = datetime.fromisoformat(actual_value.replace('Z', '+00:00'))
                        else:
                            actual_date = actual_value
                        days_diff = (datetime.utcnow() - actual_date).days
                        return days_diff == int(value or 0)
                    except:
                        return False
                return False
            elif operator == 'days_from_now':
                if actual_value:
                    from datetime import datetime, timedelta
                    try:
                        if isinstance(actual_value, str):
                            actual_date = datetime.fromisoformat(actual_value.replace('Z', '+00:00'))
                        else:
                            actual_date = actual_value
                        days_diff = (actual_date - datetime.utcnow()).days
                        return days_diff == int(value or 0)
                    except:
                        return False
                return False
            else:
                return False
        except (ValueError, TypeError) as e:
            logger.warning(f"Condition evaluation error for {field} {operator} {value}: {e}")
            return False
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        node_data = node_config.get('data', {})
        mode = node_data.get('mode', 'visual')
        # fallback_output: 当条件评估发生异常或出现不可预期错误时的回退值。
        # - 'false' (默认)：在评估异常时视为条件不成立，不沿 true 分支执行。
        # - 'true'：在评估异常时视为条件成立，沿 true 分支执行。
        # 注意：正常的 true/false 判定不会使用该回退字段，只有在评估抛异常或引擎无法计算结果时才会用到。
        fallback_output = node_data.get('fallback_output', 'false')
        
        customer = self.context.db.get('customer')
        result = False
        
        try:
            if mode == 'jsonlogic':
                # JSONLogic 模式 - 保持原有逻辑
                expr_raw = node_data.get('jsonlogic') or node_data.get('json_logic')
                if isinstance(expr_raw, str):
                    expr = json.loads(expr_raw)
                else:
                    expr = expr_raw or {}
                
                # 构建上下文变量
                ctx_vars = {}
                trigger = self.context.get('trigger_data', {})
                for k, v in trigger.items():
                    ctx_vars[f'trigger.{k}'] = v
                
                if customer:
                    for attr in ['id', 'name', 'phone', 'email', 'status', 'stage_id', 'budget_min', 'budget_max', 'preferred_location', 'move_in_date', 'unread_count', 'updated_at', 'last_timestamp', 'last_follow_up_time']:
                        ctx_vars[f'db.customer.{attr}'] = getattr(customer, attr, None)
                    
                    # 添加 custom_fields 支持
                    if customer.custom_fields:
                        custom_fields = customer.custom_fields if isinstance(customer.custom_fields, dict) else json.loads(customer.custom_fields or '{}')
                        for key, value in custom_fields.items():
                            ctx_vars[f'custom_fields.{key}'] = value
                
                ai_ctx = self.context.get('ai', {}) or {}
                for k, v in ai_ctx.items():
                    ctx_vars[f'ai.{k}'] = v
                
                result = evaluate_jsonlogic(expr, ctx_vars)
            else:
                # 可视化条件构建器模式
                conditions = node_data.get('conditions', [])
                logic_operator = node_data.get('logicOperator', 'AND')
                
                if not conditions:
                    result = False
                else:
                    condition_results = []
                    for condition in conditions:
                        condition_result = self._evaluate_condition(condition, customer)
                        condition_results.append(condition_result)
                        logger.info(f"Condition {condition.get('field')} {condition.get('operator')} {condition.get('value')} = {condition_result}")
                    
                    # 根据逻辑操作符组合结果
                    if logic_operator == 'OR':
                        result = any(condition_results)
                    else:  # AND
                        result = all(condition_results)
                    
                    logger.info(f"Final condition result ({logic_operator}): {result}")
                        
        except Exception as e:
            logger.exception(f'Condition evaluation error: {e}')
            result = fallback_output == 'true'
        
        branch = 'true' if result else 'false'
        logger.info(f"Condition node {node_config.get('id', 'unknown')} evaluated to: {branch}")
        
        # namespaced branch key so multiple condition nodes don't conflict
        return {f'__branch__{node_config.get("id")}': branch}

class SendMessageProcessor(NodeProcessor):
    """通用消息发送节点 - 根据触发渠道自动选择发送方式"""
    
    def __init__(self, db: Session, context: WorkflowContext):
        super().__init__(db, context)
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """根据触发渠道自动选择发送方式"""
        
        # 获取触发数据中的渠道信息
        trigger_data = self.context.get("trigger_data", {})
        trigger_channel = trigger_data.get("channel", "whatsapp")  # 默认 WhatsApp
        
        # 检查节点配置中的发送模式
        node_data = node_config.get("data", {})
        send_mode = node_data.get("send_mode", "smart_reply")
        specified_channel = node_data.get("channel")
        
        logger.info(f"📤 通用发送节点 - 发送模式: {send_mode}, 触发渠道: {trigger_channel}, 指定渠道: {specified_channel}")
        
        # 根据发送模式确定最终渠道
        if send_mode == "smart_reply":
            # 智能回复：使用触发渠道
            channel = trigger_channel
            logger.info(f"  智能回复模式 - 使用触发渠道: {channel}")
        elif send_mode == "force_whatsapp":
            # 强制发送到 WhatsApp
            channel = "whatsapp"
            logger.info(f"  强制 WhatsApp 模式")
        elif send_mode == "force_telegram":
            # 强制发送到 Telegram
            channel = "telegram"
            logger.info(f"  强制 Telegram 模式")
        else:
            # 兼容旧的配置方式：优先使用节点配置中指定的渠道，否则使用触发渠道
            channel = specified_channel if specified_channel else trigger_channel
            logger.info(f"  兼容模式 - 最终渠道: {channel}")
        
        # 根据渠道选择对应的处理器
        if channel == "telegram":
            processor = SendTelegramMessageProcessor(self.db, self.context)
            # 确保 Telegram 节点配置正确
            if not node_data.get("send_mode") or send_mode == "smart_reply":
                node_data["send_mode"] = "smart_reply"  # 使用智能回复模式
        elif channel == "whatsapp":
            processor = SendWhatsAppMessageProcessor(self.db, self.context)
            # 确保 WhatsApp 节点配置正确
            if not node_data.get("send_mode") or send_mode == "smart_reply":
                node_data["send_mode"] = "smart_reply"  # 使用智能回复模式
        else:
            raise ValueError(f"Unsupported channel: {channel}")
        
        # 执行对应的处理器
        return await processor.execute(node_config)

class CustomAPIProcessor(NodeProcessor):
    """自定义 API 调用节点"""

    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        print(f"\n🔧 CustomAPI 节点开始执行...")
        
        user_id = self.context.get("trigger_data", {}).get("user_id")
        if not user_id:
            raise ValueError("User ID not found in workflow context.")

        node_data = node_config.get("data", {})
        method = node_data.get("method", "GET").upper()
        url_template = node_data.get("url")
        headers_template = node_data.get("headers", {})
        body_template = node_data.get("body")
        auth_config = node_data.get("auth", {})
        timeout = node_data.get("timeout", 30)
        retry_count = node_data.get("retry_count", 0)
        response_mapping = node_data.get("response_mapping", {})

        print(f"  📋 节点配置:")
        print(f"    - Method: {method}")
        print(f"    - URL Template: {url_template}")
        print(f"    - Headers Template: {headers_template}")
        print(f"    - Body Template: {body_template}")
        print(f"    - Auth Config: {auth_config}")
        print(f"    - Timeout: {timeout}s")
        print(f"    - Retry Count: {retry_count}")
        print(f"    - Response Mapping: {response_mapping}")

        if not url_template:
            raise ValueError("API URL is required for CustomAPI node.")

        print(f"\n  🔍 开始变量替换...")
        print(f"    当前上下文变量: {list(self.context.variables.keys())}")
        
        # 打印触发数据和客户信息用于调试
        trigger_data = self.context.get("trigger_data", {})
        customer = self.context.db.get("customer")
        ai_data = self.context.get("ai", {})
        
        print(f"    触发数据: {trigger_data}")
        if customer:
            print(f"    客户信息: ID={customer.id}, Name={customer.name}, Phone={customer.phone}")
            if hasattr(customer, 'custom_fields') and customer.custom_fields:
                print(f"    客户自定义字段: {customer.custom_fields}")
        if ai_data:
            print(f"    AI 数据: {ai_data}")

        # 1. 变量替换
        print(f"\n  🔄 URL 变量替换:")
        print(f"    原始 URL: {url_template}")
        url = self._resolve_text_variables(url_template) if url_template else None
        print(f"    替换后 URL: {url}")
        
        print(f"\n  🔄 Headers 变量替换:")
        headers = {}
        for k, v in headers_template.items():
            print(f"    原始 Header {k}: {v}")
            resolved_value = self._resolve_text_variables(v)
            headers[k] = resolved_value
            print(f"    替换后 Header {k}: {resolved_value}")
        
        # 处理智能变量
        print(f"\n  🧠 处理智能变量:")
        smart_variables = node_data.get("smart_variables", {})
        processed_smart_vars = {}
        
        if smart_variables:
            print(f"    找到 {len(smart_variables)} 个智能变量")
            for var_name, var_config in smart_variables.items():
                source = var_config.get("source", "")
                transformer = var_config.get("transformer", "None")
                
                if source:
                    print(f"    处理变量: {var_name}")
                    print(f"      数据源: {source}")
                    print(f"      转换器: {transformer}")
                    
                    # 解析数据源
                    resolved_value = self._resolve_text_variables(source)
                    print(f"      解析后值: {resolved_value}")
                    
                    # 应用转换器
                    if transformer and transformer != "None" and resolved_value:
                        transformed_value = self._apply_transformer(str(resolved_value), transformer)
                        print(f"      转换后值: {transformed_value}")
                        processed_smart_vars[var_name] = transformed_value
                    else:
                        processed_smart_vars[var_name] = resolved_value
                else:
                    print(f"    跳过变量 {var_name}: 无数据源")
            
            print(f"    处理完成的智能变量: {processed_smart_vars}")
        else:
            print(f"    无智能变量配置")
        
        print(f"\n  🔄 Body 变量替换:")
        body = None
        if body_template:
            print(f"    原始 Body: {body_template}")
            # 先替换智能变量，再替换其他变量
            body_with_smart_vars = body_template
            for var_name, var_value in processed_smart_vars.items():
                placeholder = f"{{{{{var_name}}}}}"
                if placeholder in body_with_smart_vars:
                    print(f"      替换智能变量: {placeholder} -> {var_value}")
                    body_with_smart_vars = body_with_smart_vars.replace(placeholder, str(var_value))
            
            print(f"    智能变量替换后: {body_with_smart_vars}")
            body = self._resolve_json_body_from_context(body_with_smart_vars)
            print(f"    最终 Body: {body}")
        else:
            print(f"    无 Body 模板")

        # 2. 认证处理
        print(f"\n  🔐 认证处理:")
        auth_header = None
        if auth_config.get("type") == "bearer":
            token = auth_config.get("token")
            if token:
                auth_header = {"Authorization": f"Bearer {token}"}
                print(f"    Bearer 认证: {token[:10]}..." if len(token) > 10 else f"    Bearer 认证: {token}")
        elif auth_config.get("type") == "api_key":
            api_key = auth_config.get("api_key")
            header_name = auth_config.get("api_key_header", "X-API-Key")
            if api_key and header_name:
                auth_header = {header_name: api_key}
                print(f"    API Key 认证: {header_name} = {api_key[:10]}..." if len(api_key) > 10 else f"    API Key 认证: {header_name} = {api_key}")
        elif auth_config.get("type") == "basic":
            username = auth_config.get("username")
            password = auth_config.get("password")
            if username and password:
                credentials = f"{username}:{password}".encode("ascii")
                encoded_credentials = base64.b64encode(credentials).decode("ascii")
                auth_header = {"Authorization": f"Basic {encoded_credentials}"}
                print(f"    Basic 认证: {username}:{'*' * len(password)}")
        else:
            print(f"    无认证配置")

        if auth_header:
            headers.update(auth_header)
            print(f"    认证头已添加到请求头中")
        
        print(f"\n  📤 最终请求参数:")
        print(f"    Method: {method}")
        print(f"    URL: {url}")
        print(f"    Headers: {headers}")
        print(f"    Body: {body}")

        # 3. 发送HTTP请求与重试
        async def make_request():
            async with httpx.AsyncClient(timeout=timeout) as client:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                elif method == "POST":
                    response = await client.post(url, headers=headers, json=body)
                elif method == "PUT":
                    response = await client.put(url, headers=headers, json=body)
                elif method == "DELETE":
                    response = await client.delete(url, headers=headers)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
                response.raise_for_status() # Raises HTTPStatusError for bad responses (4xx, 5xx)
                return response

        print(f"\n  🚀 开始发送 HTTP 请求...")
        response = None
        last_exception = None
        for attempt in range(retry_count + 1):
            try:
                print(f"    尝试 {attempt + 1}/{retry_count + 1}")
                response = await make_request()
                print(f"    ✅ 请求成功! 状态码: {response.status_code}")
                print(f"    响应头: {dict(response.headers)}")
                break
            except httpx.HTTPStatusError as e:
                print(f"    ❌ HTTP 状态错误: {e.response.status_code}")
                print(f"    错误响应: {e.response.text}")
                logger.warning(f"API request failed with status {e.response.status_code}: {e.response.text}. Attempt {attempt + 1}/{retry_count + 1}")
                last_exception = e
            except httpx.RequestError as e:
                print(f"    ❌ 请求错误: {e}")
                logger.warning(f"API request error: {e}. Attempt {attempt + 1}/{retry_count + 1}")
                last_exception = e
            except Exception as e:
                print(f"    ❌ 未知错误: {e}")
                logger.warning(f"Unexpected API error: {e}. Attempt {attempt + 1}/{retry_count + 1}")
                last_exception = e
            
            if attempt < retry_count:
                wait_time = 2 ** attempt
                print(f"    ⏱️ 等待 {wait_time} 秒后重试...")
                await asyncio.sleep(wait_time) # Exponential backoff
            else:
                print(f"    🚫 所有重试失败，抛出异常")
                raise last_exception # Re-raise if all retries fail

        if not response:
            raise ValueError("API request failed after all retries.")

        # 4. 响应处理
        print(f"\n  📥 处理 API 响应...")
        try:
            response_json = response.json()
            print(f"    响应 JSON: {response_json}")
        except Exception as e:
            print(f"    ❌ 解析响应 JSON 失败: {e}")
            print(f"    原始响应文本: {response.text}")
            response_json = {"error": "Failed to parse JSON", "raw_text": response.text}
        
        output_data = {"status_code": response.status_code, "headers": dict(response.headers)}

        if response_mapping.get("data_field"):
            data_field_path = response_mapping["data_field"].split('.')
            print(f"    🎯 提取数据字段: {response_mapping['data_field']} -> {data_field_path}")
            current_data = response_json
            try:
                for field in data_field_path:
                    print(f"      访问字段: {field}")
                    current_data = current_data[field]
                    print(f"      当前数据: {current_data}")
                output_data["data"] = current_data
                print(f"    ✅ 成功提取数据字段: {current_data}")
            except (KeyError, TypeError) as e:
                print(f"    ❌ 提取数据字段失败: {e}")
                logger.warning(f"Could not extract data_field '{response_mapping.get('data_field')}' from API response: {e}")
                output_data["data"] = response_json # Fallback to full response
                print(f"    🔄 回退到完整响应")
        else:
            output_data["data"] = response_json
            print(f"    📋 使用完整响应作为数据")

        print(f"\n  💾 保存到上下文...")
        print(f"    输出数据: {output_data}")
        
        # 保存到上下文，以便后续节点使用
        self.context.set("api.response", output_data)
        print(f"    ✅ 已保存到 context['api.response']")

        print(f"\n  🎉 CustomAPI 节点执行完成!")
        return output_data

    def _resolve_text_variables(self, text: str) -> str:
        """解析文本中的所有 {{variable_path}} 变量"""
        if not isinstance(text, str):
            return str(text)

        def get_nested_value(data, path_parts):
            current = data
            for part in path_parts:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                elif isinstance(current, object) and hasattr(current, part):
                    current = getattr(current, part)
                else:
                    return None
            return current

        def replace_match(match):
            var_path = match.group(1).strip()
            print(f"      🔍 解析变量: {var_path}")
            
            # 尝试从各种上下文中解析变量
            # 1. 优先尝试 'trigger' 相关变量
            if var_path.startswith("trigger."):
                trigger_data = self.context.get("trigger_data", {})
                value = get_nested_value(trigger_data, var_path.split('.')[1:])
                if value is not None:
                    print(f"        ✅ 从 trigger 解析: {var_path} -> {value}")
                    return str(value)
                else:
                    print(f"        ❌ trigger 中未找到: {var_path}")
            
            # 2. 尝试 'db.customer' 相关变量
            elif var_path.startswith("db.customer."):
                customer = self.context.db.get("customer")
                if customer:
                    field_name = var_path.replace("db.customer.", "")
                    if hasattr(customer, field_name):
                        value = getattr(customer, field_name)
                        print(f"        ✅ 从 db.customer 解析: {var_path} -> {value}")
                        return str(value) if value is not None else ""
                    else:
                        print(f"        ❌ customer 对象没有字段: {field_name}")
                else:
                    print(f"        ❌ 上下文中没有 customer 对象")
            
            # 3. 尝试 'custom_fields' 相关变量
            elif var_path.startswith("custom_fields."):
                customer = self.context.db.get("customer")
                if customer and hasattr(customer, 'custom_fields'):
                    field_name = var_path.replace("custom_fields.", "")
                    custom_fields = customer.custom_fields or {}
                    value = custom_fields.get(field_name)
                    if value is not None:
                        print(f"        ✅ 从 custom_fields 解析: {var_path} -> {value}")
                        return str(value)
                    else:
                        print(f"        ❌ custom_fields 中未找到: {field_name}")
                else:
                    print(f"        ❌ customer 对象没有 custom_fields")
            
            # 4. 尝试从 AI 输出中解析
            elif var_path.startswith("ai."):
                ai_data = self.context.ai
                value = get_nested_value(ai_data, var_path.split('.')[1:])
                if value is not None:
                    print(f"        ✅ 从 ai 解析: {var_path} -> {value}")
                    return str(value)
                else:
                    print(f"        ❌ ai 中未找到: {var_path}")
            
            # 5. 尝试从 API 响应中解析
            elif var_path.startswith("api."):
                api_data = self.context.get("api.response", {})
                value = get_nested_value(api_data, var_path.split('.')[1:])
                if value is not None:
                    print(f"        ✅ 从 api.response 解析: {var_path} -> {value}")
                    return str(value)
                else:
                    print(f"        ❌ api.response 中未找到: {var_path}")
            
            # 6. 直接从上下文变量中查找
            else:
                value = self.context.get(var_path)
                if value is not None:
                    print(f"        ✅ 从 context 解析: {var_path} -> {value}")
                    return str(value)
                else:
                    print(f"        ❌ context 中未找到: {var_path}")
            
            # 如果找不到变量，返回原始文本
            print(f"        ⚠️ 变量未解析，保持原样: {var_path}")
            return f"{{{{{var_path}}}}}"

        # 使用正则表达式替换所有 {{variable}} 格式的变量
        import re
        result = re.sub(r'\{\{([^}]+)\}\}', replace_match, text)
        return result


class WorkflowEngine:
    """工作流引擎"""
    
    def __init__(self, db: Session):
        self.db = db
        self.processors = {
            "MessageTrigger": MessageTriggerProcessor,
            "DbTrigger": DbTriggerProcessor,  # 新增：数据库触发器处理器
            "StatusTrigger": DbTriggerProcessor,  # 向后兼容：旧的StatusTrigger使用DbTrigger处理器
            "AI": AIProcessor,
            "Condition": ConditionProcessor,
            "UpdateDB": UpdateDBProcessor,
            "Delay": DelayProcessor,
            "SendWhatsAppMessage": SendWhatsAppMessageProcessor,
            "SendTelegramMessage": SendTelegramMessageProcessor, # 添加 Telegram 消息发送处理器
            "SendMessage": SendMessageProcessor,  # 添加通用消息发送处理器
            "Template": TemplateProcessor,
            "GuardrailValidator": GuardrailValidatorProcessor,
            "CustomAPI": CustomAPIProcessor # 新增：自定义API处理器
        }
    
    @retry_on_failure(max_retries=3, delay=1.0)
    async def execute_workflow(self, workflow_id: int, trigger_data: Dict[str, Any]) -> WorkflowExecution:
        """执行工作流"""
        execution_start_time = datetime.utcnow()
        logger.info(f"🔄 工作流執行開始 - ID: {workflow_id}, 觸發資料: {trigger_data}")
        
        # 获取工作流定义（使用优化的查询）
        try:
            workflow = self.db.query(Workflow).filter(
                Workflow.id == workflow_id,
                Workflow.is_active == True
            ).first()
            
            if not workflow:
                logger.error(f"工作流 {workflow_id} 未找到或未啟用")
                raise ValueError(f"Workflow {workflow_id} not found or not active")
            
            logger.info(f"✅ 工作流找到: {workflow.name} (節點數: {len(workflow.nodes)}, 邊數: {len(workflow.edges)})")
            
        except SQLAlchemyError as e:
            logger.error(f"数据库查询工作流失败: {e}")
            raise e
        
        # 创建执行记录（使用安全的数据库操作）
        execution = None
        try:
            async with safe_db_operation(self.db, "create_workflow_execution"):
                execution = WorkflowExecution(
                    workflow_id=workflow_id,
                    status="running",
                    triggered_by=trigger_data.get("trigger_type", "manual"),
                    execution_data=serialize_for_json(trigger_data),  # 序列化触发数据
                    user_id=workflow.user_id,
                    started_at=execution_start_time
                )
                self.db.add(execution)
                self.db.flush()  # 获取 ID 但不提交
                execution_id = execution.id
                
            # 刷新执行记录
            execution = self.db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
            
        except Exception as e:
            logger.error(f"创建工作流执行记录失败: {e}")
            raise e
        
        # 创建执行上下文
        context = WorkflowContext()
        context.set("trigger_data", trigger_data)
        context.set("workflow_id", workflow_id)
        context.set("execution_id", execution.id)
        
        try:
            # 按照 edges 定义的顺序执行节点
            nodes_dict = {node["id"]: node for node in workflow.nodes}
            edges = workflow.edges
            
            # 找到起始节点（通常是第一个 edge 的源节点）
            if not edges:
                raise ValueError("Workflow has no edges defined")
            
            # 处理 edges 列表，构建 edge_map 并选择合适的起始节点
            edge_map = {}
            incoming_count = {}
            # 统一处理两种 edges 格式（dict 列表或数组对）
            for edge in edges:
                if isinstance(edge, dict):
                    source = edge.get('source')
                    target = edge.get('target')
                else:
                    # 旧格式: [source, target, ...]
                    if len(edge) < 2:
                        continue
                    source, target = edge[0], edge[1]

                if source is None or target is None:
                    continue

                edge_map.setdefault(source, []).append(target)
                incoming_count[target] = incoming_count.get(target, 0) + 1
                incoming_count.setdefault(source, incoming_count.get(source, 0))

            # 首先尝试找到 MessageTrigger 类型的节点作为入口
            start_node_id = None
            for n in workflow.nodes:
                if n.get('type') == 'MessageTrigger':
                    start_node_id = n.get('id')
                    break

            # 如果没有 MessageTrigger，则选入度为 0 的节点
            if not start_node_id:
                for nid in nodes_dict.keys():
                    if incoming_count.get(nid, 0) == 0:
                        start_node_id = nid
                        break

            # 最后回退到第一个 edge 的 source（兼容）
            if not start_node_id:
                first_edge = edges[0]
                if isinstance(first_edge, dict):
                    start_node_id = first_edge.get('source')
                else:
                    start_node_id = first_edge[0] if len(first_edge) > 0 else None

            current_node_id = start_node_id
            
            # 执行节点序列
            while current_node_id:
                if current_node_id not in nodes_dict:
                    break
                
                node = nodes_dict[current_node_id]
                await self._execute_node(execution, node, context)
                
                # 根据节点类型和结果决定下一个节点
                next_nodes = edge_map.get(current_node_id, [])
                
                # Debug: 打印边连接信息
                print(f"  🔍 节点 {current_node_id} 的下一个节点: {next_nodes}")
                print(f"  🔍 完整边映射: {edge_map}")
                
                if not next_nodes:
                    print(f"  ⚠️ 节点 {current_node_id} 没有下一个节点，工作流结束")
                    break
                
                # 支持基于 Condition 的 true/false 分支路由：
                # - 如果当前节点有显式分支化的 outgoing edges（edge id 包含 true/false 或 edge dict 有 sourceHandle），
                #   则只在能找到与当前分支匹配的 edge 时继续执行对应目标；否则停止执行（不回退到第一个 target）。
                # - 如果没有任何分支化的 outgoing edges，则保留兼容行为，取第一个 target。
                branch_key = f'__branch__{current_node_id}'
                branch_val = context.get(branch_key)

                # 查找该节点的所有 outgoing edge 对象（使用原始 edges 列表以获取元信息）
                outgoing_edges = []
                if edges and isinstance(edges, list):
                    for e in edges:
                        try:
                            if isinstance(e, dict):
                                if e.get('source') == current_node_id:
                                    outgoing_edges.append(e)
                            else:
                                # 兼容旧格式数组 [source, target]
                                if len(e) >= 2 and e[0] == current_node_id:
                                    outgoing_edges.append({'source': e[0], 'target': e[1], 'sourceHandle': e[2] if len(e) > 2 else None}) # 确保兼容旧格式并获取 sourceHandle
                        except Exception:
                            continue

                # 判断是否存在真正的分支化 edge（通过 sourceHandle 为 true/false 标识）
                has_conditional_branch_edges = any(
                    isinstance(e, dict) and e.get('sourceHandle') in ['true', 'false']
                    for e in outgoing_edges
                )

                selected_next_nodes = []
                if has_conditional_branch_edges:
                    # 仅在 branch_val 可用时尝试匹配条件分支
                    if branch_val is not None:
                        for e in outgoing_edges:
                            try:
                                # match by explicit sourceHandle for true/false branches
                                if isinstance(e, dict) and e.get('sourceHandle') in ['true', 'false']:
                                    if str(e.get('sourceHandle')).lower() == str(branch_val).lower():
                                        selected_next_nodes.append(e.get('target'))
                            except Exception:
                                continue
                    
                    # 如果存在条件分支边但未找到匹配，则停止执行（不回退）
                    if not selected_next_nodes:
                        print(f"  ⚠️ 条件分支节点 {current_node_id} 没有找到匹配的分支 '{branch_val}'，工作流结束")
                        current_node_id = None
                    else:
                        # 如果有多个匹配的分支，需要并行执行
                        if len(selected_next_nodes) > 1:
                            print(f"  🔀 节点 {current_node_id} 有多个分支需要并行执行: {selected_next_nodes}")
                            # 并行执行所有匹配的分支节点
                            for next_node_id in selected_next_nodes[1:]:  # 从第二个开始并行执行
                                if next_node_id in nodes_dict:
                                    print(f"  🚀 并行执行分支节点: {next_node_id}")
                                    await self._execute_node(execution, nodes_dict[next_node_id], context)
                        # 继续执行第一个分支
                        current_node_id = selected_next_nodes[0]
                else:
                    # 非条件分支：检查是否有多个并行的输出节点
                    if len(next_nodes) > 1:
                        print(f"  🔀 节点 {current_node_id} 有多个并行输出: {next_nodes}")
                        # 并行执行除第一个外的所有节点
                        for next_node_id in next_nodes[1:]:
                            if next_node_id in nodes_dict:
                                print(f"  🚀 并行执行节点: {next_node_id}")
                                await self._execute_node(execution, nodes_dict[next_node_id], context)
                    # 继续执行第一个节点
                    current_node_id = next_nodes[0] if next_nodes else None
            
            # 标记执行完成
            execution_end_time = datetime.utcnow()
            execution_duration = (execution_end_time - execution_start_time).total_seconds()
            
            try:
                async with safe_db_operation(self.db, "complete_workflow_execution"):
                    execution.status = "completed"
                    execution.completed_at = execution_end_time
                    execution.duration_seconds = execution_duration
                    
                logger.info(f"✅ 工作流執行完成 - ID: {workflow_id}, 耗時: {execution_duration:.2f}秒")
                return execution
                
            except Exception as db_error:
                logger.error(f"更新工作流完成状态失败: {db_error}")
                # 即使数据库更新失败，工作流实际上已经成功执行
                return execution
            
        except Exception as e:
            # 更新执行状态为失败
            execution_end_time = datetime.utcnow()
            execution_duration = (execution_end_time - execution_start_time).total_seconds()
            error_details = {
                "error": str(e),
                "type": type(e).__name__,
                "traceback": traceback.format_exc()
            }
            
            try:
                async with safe_db_operation(self.db, "fail_workflow_execution"):
                    execution.status = "failed"
                    execution.error_message = str(e)
                    execution.completed_at = execution_end_time
                    execution.duration_seconds = execution_duration
                    # 存储详细错误信息到 execution_data
                    if execution.execution_data:
                        execution.execution_data["error_details"] = error_details
                    else:
                        execution.execution_data = {"error_details": error_details}
                        
            except Exception as db_error:
                logger.error(f"更新工作流失败状态时出错: {db_error}")
            
            logger.error(f"❌ 工作流執行失敗 - ID: {workflow_id}, 耗時: {execution_duration:.2f}秒, 錯誤: {str(e)}")
            logger.debug(f"工作流执行失败详细信息: {error_details}")
            raise e
    
    @retry_on_failure(max_retries=2, delay=0.5)
    async def _execute_node(self, execution: WorkflowExecution, node: Dict[str, Any], context: WorkflowContext):
        """执行单个节点"""
        node_id = node["id"]
        node_type = node["type"]
        
        logger.info(f"📦 執行節點 - ID: {node_id}, 類型: {node_type}")
        logger.debug(f"節點配置: {node}")
        
        # 创建步骤执行记录（使用安全的数据库操作）
        step = None
        try:
            async with safe_db_operation(self.db, "create_step_execution"):
                step = WorkflowStepExecution(
                    execution_id=execution.id,
                    node_id=node_id,
                    node_type=node_type,
                    status="running",
                    input_data=node,
                    started_at=datetime.utcnow()
                )
                self.db.add(step)
                self.db.flush()  # 获取 ID 但不提交
                step_id = step.id
                
            # 刷新步骤记录
            step = self.db.query(WorkflowStepExecution).filter(WorkflowStepExecution.id == step_id).first()
            
        except Exception as e:
            logger.error(f"创建节点执行记录失败: {e}")
            raise e
        
        try:
            start_time = datetime.utcnow()
            
            # 获取处理器类
            processor_class = self.processors.get(node_type)
            if not processor_class:
                # 根据 channel 动态选择处理器
                if node_type == "SendMessage" and node.get("data", {}).get("channel") == "telegram":
                    processor_class = SendTelegramMessageProcessor
                elif node_type == "SendMessage" and node.get("data", {}).get("channel") == "whatsapp":
                    processor_class = SendWhatsAppMessageProcessor
                else:
                    print(f"    ❌ 不支援的節點類型: {node_type}")
                    raise ValueError(f"Unsupported node type: {node_type}")
            
            print(f"    🚀 創建處理器: {processor_class.__name__}")
            
            # 创建处理器并执行
            processor = processor_class(self.db, context)
            print(f"    ⏳ 開始執行節點...")
            output_data = await processor.execute(node)
            # print(f"    ✅ 節點執行完成，輸出: {output_data}")
            
            # 更新上下文
            context.update_from_dict(output_data)
            print(f"    📝 上下文已更新")
            
            # 记录执行结果
            end_time = datetime.utcnow()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            
            try:
                async with safe_db_operation(self.db, "complete_step_execution"):
                    step.status = "completed"
                    step.output_data = serialize_for_json(output_data)  # 使用序列化函数
                    step.completed_at = end_time
                    step.duration_ms = duration_ms
                    
                    # 记录分支信息（如果存在）
                    branch_key = f"__branch__{node_id}"
                    if context.get(branch_key):
                        step.branch_taken = context.get(branch_key)
                        
                logger.info(f"✅ 節點執行完成 - ID: {node_id}, 耗時: {duration_ms}ms")
                
            except Exception as db_error:
                logger.error(f"更新节点完成状态失败: {db_error}")
                # 继续执行，不因为数据库更新失败而中断工作流
            
        except Exception as e:
            # 记录节点执行失败
            end_time = datetime.utcnow()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            error_details = {
                "error": str(e),
                "type": type(e).__name__,
                "traceback": traceback.format_exc(),
                "node_config": node
            }
            
            try:
                async with safe_db_operation(self.db, "fail_step_execution"):
                    step.status = "failed"
                    step.error_message = str(e)
                    step.completed_at = end_time
                    step.duration_ms = duration_ms
                    # 存储详细错误信息
                    step.output_data = serialize_for_json({"error_details": error_details})
                    
            except Exception as db_error:
                logger.error(f"更新节点失败状态时出错: {db_error}")
            
            logger.error(f"❌ 節點執行失敗 - ID: {node_id}, 類型: {node_type}, 耗時: {duration_ms}ms, 錯誤: {str(e)}")
            logger.debug(f"节点执行失败详细信息: {error_details}")
            raise e

    def _resolve_variable_from_context(self, variable_path: str, default: Any = None) -> Any:
        # 支持: trigger.X, db.customer.field, ai.field
        try:
            if variable_path.startswith('trigger.'):
                return self.context.get('trigger_data', {}).get(variable_path.split('.', 1)[1])
            if variable_path.startswith('db.customer.'):
                customer = self.context.db.get('customer')
                if customer:
                    return getattr(customer, variable_path.split('.', 2)[2], None)
                return None
            if variable_path.startswith('ai.'):
                return self.context.get('ai', {}).get(variable_path.split('.', 1)[1])
            # fallback to variables
            return self.context.get(variable_path)
        except Exception:
            return default
