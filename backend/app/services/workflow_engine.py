"""
Workflow Engine - 基于用户提供的 MVP 架构实现
支持节点类型: MessageTrigger, AI, UpdateDB, Delay, SendWhatsAppMessage, Template, GuardrailValidator

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
from app.db.models import (
    Workflow, WorkflowExecution, WorkflowStepExecution, 
    Customer, Message, AIAnalysis, AuditLog, CustomEntityRecord # 导入 CustomEntityRecord
)
from app.services.ai_service import AIService
from app.services.whatsapp import WhatsAppService
import pytz
import re
from app.services.telegram import TelegramService
import uuid
import time

logger = logging.getLogger(__name__)

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

class MessageTriggerProcessor(NodeProcessor):
    """消息触发器节点"""
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """处理消息触发"""
        channel = node_config.get("channel", "whatsapp")
        match_key = node_config.get("match_key", "Phone")
        
        # 从触发数据中获取消息信息
        trigger_data = self.context.get("trigger_data", {})
        
        if channel == "whatsapp" and match_key == "Phone":
            phone = trigger_data.get("phone")
            message_content = trigger_data.get("message")
            
            # 🔒 從觸發數據獲取 user_id
            user_id = trigger_data.get("user_id")
            if not user_id:
                logger.error("Workflow trigger missing user_id")
                raise ValueError("Workflow trigger missing user_id")
            
            # 🔒 獲取屬於特定用戶的客戶信息
            customer = self.db.query(Customer).filter(
                Customer.phone == phone,
                Customer.user_id == user_id
            ).first()
            
            if not customer:
                # 🔒 創建新客戶時設置正確的 user_id
                customer = Customer(
                    phone=phone,
                    name=phone,  # 临时使用电话号码作为名字
                    status="active",
                    user_id=user_id
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
            self.context.actor["phone"] = phone
            self.context.db["customer"] = customer
            
            return {
                "ctx.chat.last_message": message_content,
                "ctx.chat.history": self.context.chat["history"],
                "ctx.actor.phone": phone
            }
        
        raise ValueError(f"Unsupported channel: {channel} or match_key: {match_key}")

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
            customer = self.context.db.get("customer")
            
            # 使用数据库中存储的 system_prompt 作为基础 prompt
            raw_system_prompt = node_data.get("system_prompt", node_config.get("system_prompt", "You are a professional AI assistant."))
            raw_user_prompt = node_data.get("user_prompt", node_config.get("user_prompt", "Please reply to the user's message."))
            
            # 🔧 解析 System Prompt 中的变量
            base_system_prompt = await self._resolve_prompt_variables(raw_system_prompt)
            user_prompt = await self._resolve_prompt_variables(raw_user_prompt)

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
            if not self.context.db.get("customer"):
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
                customer = self.context.db.get("customer")
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
                        import json
                        # print("--- 完整的LLM原始输出 (美化JSON) ---") # Remove verbose LLM output print
                        # print(json.dumps(llm_response, indent=2, ensure_ascii=False)) # Remove verbose LLM output print
                        # print("--- LLM原始输出结束 ---") # Remove verbose LLM output print
                    except Exception as e:
                        print(f"  ⚠️ 打印LLM原始输出失败: {e}")

                    # 提取 confidence
                    ai_confidence = llm_response.get("analyze", {}).get("confidence", 0.0)
                    
                    # 根据AI置信度进行Handoff判断，并设置分支
                    handoff_threshold = node_data.get("handoff_threshold", 0.6)
                    
                    should_handoff = enable_handoff and (ai_confidence <= handoff_threshold)
                    
                    # 更新 context.ai 并返回分支
                    self.context.ai['reply'] = llm_response.get("reply", {})
                    self.context.ai['analyze'] = llm_response.get("analyze", {})
                    self.context.ai['meta'] = llm_response.get("meta", {})
                    self.context.ai['prompt_used'] = {"system": system_prompt, "user": resolved_user_prompt}
                    self.context.ai['api_used'] = "openai"
                    
                    # 保存 AI 分析结果到数据库
                    customer = self.context.db.get("customer")
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

        支持变量: {{trigger.name}}, {{trigger.phone}}, {{trigger.content}}, {{trigger.timestamp}},
        以及 {{db.customer.<field>}}。
        """
        resolved_prompt = prompt or ""
        
        # print(f"  🔍 解析 Prompt 变量前: {resolved_prompt[:100]}...") # Remove verbose pre-resolution print

        try:
            # 获取触发器数据
            trigger_data = self.context.get("trigger_data", {}) or {}
            # print(f"  📎 触发器数据: {trigger_data}") # Remove verbose trigger data print

            # 修正字段映射：模板中使用 content，但触发器中为 message
            if "{{trigger.name}}" in resolved_prompt:
                name_value = str(trigger_data.get("name", ""))
                resolved_prompt = resolved_prompt.replace("{{trigger.name}}", name_value)
                # print(f"    - 替换 {{{{trigger.name}}}} -> '{name_value}'")
                
            if "{{trigger.phone}}" in resolved_prompt:
                phone_value = str(trigger_data.get("phone", ""))
                resolved_prompt = resolved_prompt.replace("{{trigger.phone}}", phone_value)
                # print(f"    - 替换 {{{{trigger.phone}}}} -> '{phone_value}'")
                
            if "{{trigger.content}}" in resolved_prompt:
                content_value = str(trigger_data.get("message", ""))
                resolved_prompt = resolved_prompt.replace("{{trigger.content}}", content_value)
                # print(f"    - 替换 {{{{trigger.content}}}} -> '{content_value}'")
                
            if "{{trigger.timestamp}}" in resolved_prompt:
                timestamp_value = str(trigger_data.get("timestamp", ""))
                resolved_prompt = resolved_prompt.replace("{{trigger.timestamp}}", timestamp_value)
                # print(f"    - 替换 {{{{trigger.timestamp}}}} -> '{timestamp_value}'")

            # 客户字段替换
            customer = self.context.db.get("customer")
            if customer:
                if "{{db.customer.name}}" in resolved_prompt:
                    customer_name = str(getattr(customer, "name", ""))
                    resolved_prompt = resolved_prompt.replace("{{db.customer.name}}", customer_name)
                    # print(f"    - 替换 {{{{db.customer.name}}}} -> '{customer_name}'")
                    
                if "{{db.customer.phone}}" in resolved_prompt:
                    customer_phone = str(getattr(customer, "phone", ""))
                    resolved_prompt = resolved_prompt.replace("{{db.customer.phone}}", customer_phone)
                    # print(f"    - 替换 {{{{db.customer.phone}}}} -> '{customer_phone}'")
                    
                if "{{db.customer.status}}" in resolved_prompt:
                    customer_status = str(getattr(customer, "status", ""))
                    resolved_prompt = resolved_prompt.replace("{{db.customer.status}}", customer_status)
                    # print(f"    - 替换 {{{{db.customer.status}}}} -> '{customer_status}'")
                    
                if "{{db.customer.email}}" in resolved_prompt:
                    customer_email = str(getattr(customer, "email", ""))
                    resolved_prompt = resolved_prompt.replace("{{db.customer.email}}", customer_email)
                    # print(f"    - 替换 {{{{db.customer.email}}}} -> '{customer_email}'")

        except Exception as err:
            print(f"  ⚠️ 解析 prompt 变量失败: {err}")

        print(f"  ✅ 解析 Prompt 变量后: {resolved_prompt[:100]}...")
        return resolved_prompt
    
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
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """更新数据库"""
        table = node_config.get("table", "customers")
        match_key = node_config.get("match_key", "Phone")
        ops = node_config.get("ops", [])
        optimistic_lock = node_config.get("optimistic_lock", {"enabled": True})
        skip_if_equal = node_config.get("skip_if_equal", True)
        
        if table != "customers":
            raise ValueError(f"Unsupported table: {table}")
        
        customer = self.context.db.get("customer")
        if not customer:
            raise ValueError("Customer not found in context")
        
        # 获取 AI 分析结果
        ai_analyze = self.context.get("ai.analyze", {})
        updates = ai_analyze.get("updates", {})
        
        if not updates and skip_if_equal:
            return {"db.updated_row": customer, "ctx.versions.db": customer.version}
        
        # 乐观锁检查
        if optimistic_lock.get("enabled", True):
            current_version = customer.version
            expected_version = optimistic_lock.get("incoming_version", current_version)
            
            if current_version != expected_version:
                conflict_strategy = optimistic_lock.get("on_conflict", "prompt")
                if conflict_strategy == "abort":
                    raise ValueError("Version conflict detected")
                # 其他冲突处理策略可以在这里实现
        
        # 记录旧值用于审计
        old_values = {
            "move_in_date": customer.move_in_date.isoformat() if customer.move_in_date else None,
            "custom_fields": customer.custom_fields.copy()
        }
        
        # 应用更新
        has_changes = False
        new_values = {}
        
        for op in ops:
            col = op.get("col")
            value = op.get("value")
            mode = op.get("mode", "set")
            
            if col == "move_in_date" and "Move-In Date" in updates:
                try:
                    new_val = datetime.strptime(updates["Move-In Date"], "%Y-%m-%d").date()
                    if customer.move_in_date != new_val:
                        customer.move_in_date = new_val
                        new_values["move_in_date"] = new_val.isoformat()
                        has_changes = True
                except ValueError:
                    logger.warning(f"Invalid date format: {updates['Move-In Date']}")
                    
            elif col == "custom_fields" and mode == "merge_json":
                # 合并自定义字段
                custom_updates = {k: v for k, v in updates.items() if k.startswith("Custom:")}
                if custom_updates:
                    current_custom = customer.custom_fields.copy()
                    current_custom.update(custom_updates)
                    customer.custom_fields = current_custom
                    new_values["custom_fields"] = custom_updates
                    has_changes = True
                    
            elif col == "last_follow_up_time" and mode == "now":
                customer.last_follow_up_time = datetime.utcnow()
                new_values["last_follow_up_time"] = datetime.utcnow().isoformat()
                has_changes = True
        
        if has_changes:
            # 更新版本号和时间戳
            customer.version += 1
            customer.updated_at = datetime.utcnow()
            
            # 记录审计日志
            audit_log = AuditLog(
                entity_type="customer",
                entity_id=customer.id,
                action="update",
                old_values=old_values,
                new_values=new_values,
                user_id=customer.user_id,
                source="workflow"
            )
            self.db.add(audit_log)
            
            self.db.commit()
            self.db.refresh(customer)
        
        return {
            "db.updated_row": customer,
            "ctx.versions.db": customer.version
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
        """发送 WhatsApp 消息"""
        # 🔧 修復：從 data 字段獲取配置，與其他節點保持一致
        node_data = node_config.get("data", {})
        
        to = node_data.get("to", "") or node_config.get("to", "")
        message = node_data.get("message", "") or node_config.get("message", "")
        dedupe = node_data.get("dedupe", node_config.get("dedupe", {"window_minutes": 1}))
        retries = node_data.get("retries", node_config.get("retries", {"max": 3, "backoff": [2, 5, 15]}))
        
        print(f"📤 SendWhatsApp 節點開始執行:")
        print(f"  初始配置 - to: '{to}', message: '{message}'")
        print(f"  node_data keys: {list(node_data.keys())}")
        # print(f"  context keys: {list(self.context.__dict__.keys())}") # Remove verbose context keys print
        
        # 解析变量和自动填充 'to' 字段
        send_mode = node_data.get("send_mode", "trigger_number")
        
        if send_mode == "specified_number":
            to = node_data.get("to_number", "")
            print(f"  使用指定号码发送: {to}")
        elif send_mode == "trigger_number":
            customer = self.context.db.get("customer")
            if customer:
                to = customer.phone
                print(f"  使用触发号码发送 (自动填充): {to}")
            else:
                print(f"  ❌ 找不到客户信息，无法自动填充收件人")
        else:
            # 回退到其他情况，例如如果 `to` 字段包含变量
            if not to or "{db.phone}" in to or "{trigger_ai.output.phone}" in to: # Add trigger_ai.output.phone to check
                customer = self.context.db.get("customer")
                if customer:
                    if not to:
                        to = customer.phone
                        print(f"  自動填充收件人: {to}")
                    else:
                        # Apply generic variable parsing for 'to' field
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
                customer = self.context.db.get("customer")
                trigger = self.context.get("trigger_data", {})
                # 优先使用 customer.user_id，没有则回退到 trigger 中的 user_id
                user_id = customer.user_id if customer else trigger.get("user_id")
                print(f"  用戶ID: {user_id}")
                
                if not user_id:
                    raise ValueError("Cannot send WhatsApp message: user_id is required")
                
                print(f"  調用 WhatsApp 服務...")
                
                # 检查是否有媒体需要发送
                ai_reply = self.context.ai.get("reply", {})
                media_uuids = ai_reply.get("media_uuids", [])
                folder_names = ai_reply.get("folder_names", [])
                media_settings = ai_reply.get("media_settings", {})
                
                print(f"  媒体信息: UUIDs={media_uuids}, Folders={folder_names}, Settings={media_settings}")
                
                # 根据 UUIDs 和 folder_names 获取实际的媒体 URL
                media_urls = []
                if media_uuids or folder_names:
                    media_urls = await self._get_media_urls_from_identifiers(media_uuids, folder_names, user_id)
                    print(f"  📎 获取到 {len(media_urls)} 个媒体文件URL")
                
                # 处理媒体发送
                if media_urls:
                    send_separately = media_settings.get("send_media_separately", False)
                    send_with_caption = media_settings.get("send_with_caption", True)
                    delay_between_media = media_settings.get("delay_between_media", False)
                    delay_seconds = media_settings.get("delay_seconds", 2)
                    
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
                        
                        # 所有媒体上传完成后，再发送文本消息
                        print(f"  📝 媒体上传完成，现在发送文本消息")
                        text_result = await self.whatsapp_service.send_message(to, message, user_id)
                        print(f"  ✅ 文本消息发送结果: {text_result}")
                        
                        result = text_result  # 使用文本消息的结果作为主要结果
                    else:
                        # 一起发送：媒体附带文本说明
                        if len(media_urls) == 1:
                            # 单个媒体文件，附带文本
                            caption = message if send_with_caption else ""
                            print(f"  🖼️📝 发送单个媒体附带文本: {media_urls[0]}")
                            result = await self.whatsapp_service.send_message(
                                to, caption, user_id, media_url=media_urls[0], media_type="image"
                            )
                        else:
                            # 多个媒体文件，先发送文本，再发送媒体
                            print(f"  📝 多媒体模式：先发送文本消息")
                            text_result = await self.whatsapp_service.send_message(to, message, user_id)
                            
                            for i, media_url in enumerate(media_urls):
                                if delay_between_media and i > 0:
                                    print(f"  ⏱️ 延迟 {delay_seconds} 秒...")
                                    await asyncio.sleep(delay_seconds)
                                
                                print(f"  🖼️ 发送媒体 {i+1}/{len(media_urls)}: {media_url}")
                                media_result = await self.whatsapp_service.send_message(
                                    to, "", user_id, media_url=media_url, media_type="image"
                                )
                                print(f"  ✅ 媒体 {i+1} 发送结果: {media_result}")
                            
                            result = text_result
                else:
                    # 没有媒体，只发送文本
                    result = await self.whatsapp_service.send_message(to, message, user_id)
                
                print(f"  ✅ 最终发送结果: {result}")
                
                # 记录消息到数据库
                customer = self.context.db.get("customer")
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
                customer_obj = self.context.db.get("customer")
                if customer_obj:
                    value = get_nested_value(customer_obj, var_path.split('.')[2:])
                    if value is not None:
                        print(f"    - Resolved from db.customer: {var_path} -> {value}")
                        return str(value)
            elif var_path == "customer.all":
                customer_obj = self.context.db.get("customer")
                if customer_obj:
                    # 将整个客户对象（包括 custom_fields）转换为 JSON 字符串
                    customer_data = customer_obj.__dict__.copy()
                    customer_data.pop('_s-instance_state', None)
                    
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

            # 6. 尝试通用变量 (self.context.variables)
            if var_path in self.context.variables:
                value = self.context.variables[var_path]
                print(f"    - Resolved from context.variables: {var_path} -> {value}")
                return str(value)
            
            # 7. 尝试解析特定节点输出变量，例如 AI_NODE_ID.output.reply_text
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
        """生成模板消息"""
        try:
            # 获取模板配置 - 从node的data字段中获取
            node_data = node_config.get("data", {})
            template_type = node_data.get("template_type", "text")
            template_name = node_data.get("template_name")
            template_language = node_data.get("template_language", "zh_CN")
            variables = node_data.get("variables", {})
            fallback_template = node_data.get("fallback_template", "您好！感谢您的咨询。")
            
            # print(f"🔍 Template节点数据结构检查:") # Remove verbose template node data check
            # print(f"  完整node_config keys: {list(node_config.keys())}") # Remove verbose template node data check
            # print(f"  node_data keys: {list(node_data.keys())}") # Remove verbose template node data check
            # print(f"  variables类型: {type(variables)}, 值: {variables}") # Remove verbose template node data check
            
            # 解析变量
            resolved_variables = {}
            # print(f"🔍 模板变量解析开始:") # Remove verbose template variable parsing start
            # print(f"  原始变量: {variables}") # Remove verbose original variables print
            for var_key, var_expression in variables.items():
                resolved_value = await self._resolve_variable(var_expression)
                resolved_variables[var_key] = resolved_value
                # print(f"  {var_key}: '{var_expression}' → '{resolved_value}'") # Remove verbose individual variable resolution print
            # print(f"  解析结果: {resolved_variables}") # Remove verbose resolved variables print
            
            # WhatsApp 模板消息
            if template_type == "whatsapp" and template_name:
                return {
                    "template_data": {
                        "template_name": template_name,
                        "template_language": template_language,
                        "variables": resolved_variables
                    },
                    "fallback_text": self._apply_template(fallback_template, resolved_variables),
                    "message_content": self._apply_template(fallback_template, resolved_variables),
                    "message_type": "template"
                }
            else:
                # 普通文本消息
                # print(f"📝 应用模板:") # Remove verbose template application start
                # print(f"  模板: '{fallback_template}'") # Remove verbose template print
                # print(f"  变量: {resolved_variables}") # Remove verbose variables print
                message_text = self._apply_template(fallback_template, resolved_variables)
                # print(f"  结果: '{message_text}'") # Remove verbose result print
                return {
                    "ai.reply.reply_text": message_text,
                    "message_content": message_text,
                    "message_type": "text"
                }
                
        except Exception as e:
            logger.error(f"模板处理失败: {e}")
            return {
                "ai.reply.reply_text": "抱歉，系统出现问题，请稍后再试。",
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
                customer = self.context.db.get("customer")
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
    
    async def execute(self, node_config: Dict[str, Any]) -> Dict[str, Any]:
        """发送 Telegram 消息"""
        node_data = node_config.get("data", {})
        
        send_mode = node_data.get("send_mode", "trigger_number")
        to = ""
        bot_token = node_data.get("bot_token")
        chat_id = node_data.get("chat_id") # For telegram_chat_id mode
        message = node_data.get("message", "") or node_config.get("message", "")
        
        print(f"📤 SendTelegram 節點開始執行:")
        print(f"  初始配置 - send_mode: '{send_mode}', message: '{message}'")
        
        if send_mode == "specified_number":
            to = node_data.get("to_number", "") # 这里实际上是 chat_id
            print(f"  使用指定号码发送 (Telegram Chat ID): {to}")
        elif send_mode == "telegram_chat_id":
            to = chat_id # 直接使用配置中的 chat_id
            print(f"  使用 Telegram Chat ID 发送: {to}")
        elif send_mode == "trigger_number":
            # 对于 Telegram，触发号码可能不是直接的 chat_id，需要额外逻辑或映射
            # 暂时假设 trigger_data.phone 可以作为 chat_id，但这可能不准确
            trigger_data = self.context.get("trigger_data", {})
            to = trigger_data.get("phone", "") # 假设触发器的 phone 可以作为 chat_id
            print(f"  使用触发号码发送 (假设为 Chat ID): {to}")
        
        # 解析消息变量
        if not message or "{ai.reply.reply_text}" in message:
            message_content = self.context.get("message_content", "")
            ai_reply_text = self.context.get("ai.reply.reply_text", "")
            
            ai_reply_obj = self.context.get("ai.reply", {})
            if isinstance(ai_reply_obj, dict):
                ai_reply_text = ai_reply_obj.get("reply_text", ai_reply_text)
            
            if not message:
                if ai_reply_text:
                    message = ai_reply_text
                elif message_content:
                    message = message_content
                else:
                    message = "Hi! We received your message."
            else:
                if ai_reply_text:
                    message = message.replace("{ai.reply.reply_text}", ai_reply_text)
        
        print(f"  最終參數 - to: '{to}', message: '{message}', bot_token: '{bot_token[:5]}...'")
        
        if not to or not bot_token:
            raise ValueError("Missing recipient (chat_id) or bot_token for Telegram message")
        
        # 獲取用戶ID用於身份驗證 (如果通过用户会话发送)
        customer = self.context.db.get("customer")
        trigger = self.context.get("trigger_data", {})
        user_id = customer.user_id if customer else trigger.get("user_id")
        
        # 发送消息
        print(f"🚀 開始發送 Telegram 消息...")
        try:
            result = await self.telegram_service.send_message(chat_id=to, message=message, user_id=user_id, bot_token=bot_token)
            print(f"  ✅ 發送結果: {result}")
            
            # 记录消息到数据库
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
            else:
                logger.info("Sent Telegram message but no customer in context; skipping DB insert")
            
            return {
                "ctx.message_id": result.get("telegram_message_id", "sent"),
                "ctx.sent_at": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")
            raise e

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

class WorkflowEngine:
    """工作流引擎"""
    
    def __init__(self, db: Session):
        self.db = db
        self.processors = {
            "MessageTrigger": MessageTriggerProcessor,
            "AI": AIProcessor,
            "Condition": ConditionProcessor,
            "UpdateDB": UpdateDBProcessor,
            "Delay": DelayProcessor,
            "SendWhatsAppMessage": SendWhatsAppMessageProcessor,
            "SendTelegramMessage": SendTelegramMessageProcessor, # 添加 Telegram 消息发送处理器
            "Template": TemplateProcessor,
            "GuardrailValidator": GuardrailValidatorProcessor
        }
    
    async def execute_workflow(self, workflow_id: int, trigger_data: Dict[str, Any]) -> WorkflowExecution:
        """执行工作流"""
        print(f"\n🔄 工作流執行開始 - ID: {workflow_id}")
        print(f"  觸發資料: {trigger_data}")
        
        # 获取工作流定义
        workflow = self.db.query(Workflow).filter(
            Workflow.id == workflow_id,
            Workflow.is_active == True
        ).first()
        
        if not workflow:
            print(f"  ❌ 工作流 {workflow_id} 未找到或未啟用")
            raise ValueError(f"Workflow {workflow_id} not found or not active")
        
        print(f"  ✅ 工作流找到: {workflow.name}")
        print(f"  節點數量: {len(workflow.nodes)}")
        print(f"  邊數量: {len(workflow.edges)}")
        
        # 创建执行记录
        execution = WorkflowExecution(
            workflow_id=workflow_id,
            status="running",
            triggered_by=trigger_data.get("trigger_type", "manual"),
            execution_data=trigger_data,
            user_id=workflow.user_id
        )
        self.db.add(execution)
        self.db.commit()
        self.db.refresh(execution)
        
        # 创建执行上下文
        context = WorkflowContext()
        context.set("trigger_data", trigger_data)
        
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
                
                if not next_nodes:
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

                selected_next = None
                if has_conditional_branch_edges:
                    # 仅在 branch_val 可用时尝试匹配条件分支
                    if branch_val is not None:
                        for e in outgoing_edges:
                            try:
                                # match by explicit sourceHandle for true/false branches
                                if isinstance(e, dict) and e.get('sourceHandle') in ['true', 'false']:
                                    if str(e.get('sourceHandle')).lower() == str(branch_val).lower():
                                        selected_next = e.get('target')
                                        break
                            except Exception:
                                continue
                    # 如果存在条件分支边但未找到匹配，则停止执行（不回退）
                    if not selected_next:
                        current_node_id = None
                    else:
                        current_node_id = selected_next
                else:
                    # 非条件分支：取第一个 target（包括 sourceHandle 为 "out" 等情况）
                    current_node_id = next_nodes[0] if next_nodes else None
            
            # 标记执行完成
            execution.status = "completed"
            execution.completed_at = datetime.utcnow()
            self.db.commit()
            
            return execution
            
        except Exception as e:
            execution.status = "failed"
            execution.error_message = str(e)
            execution.completed_at = datetime.utcnow()
            self.db.commit()
            logger.error(f"Workflow execution failed: {str(e)}")
            raise e
    
    async def _execute_node(self, execution: WorkflowExecution, node: Dict[str, Any], context: WorkflowContext):
        """执行单个节点"""
        node_id = node["id"]
        node_type = node["type"]
        
        print(f"\n  📦 執行節點 - ID: {node_id}, 類型: {node_type}")
        print(f"    節點配置: {node}")
        
        # 创建步骤执行记录
        step = WorkflowStepExecution(
            execution_id=execution.id,
            node_id=node_id,
            node_type=node_type,
            status="running",
            input_data=node
        )
        self.db.add(step)
        self.db.commit()
        self.db.refresh(step)
        
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
            step.status = "completed"
            step.output_data = output_data
            step.completed_at = end_time
            step.duration_ms = int((end_time - start_time).total_seconds() * 1000)
            
            # 记录分支信息（如果存在）
            branch_key = f"__branch__{node_id}"
            if context.get(branch_key):
                step.branch_taken = context.get(branch_key)

            self.db.commit()
            
        except Exception as e:
            step.status = "failed"
            step.error_message = str(e)
            step.completed_at = datetime.utcnow()
            self.db.commit()
            raise e
