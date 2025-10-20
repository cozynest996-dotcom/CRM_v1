from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Date, BigInteger, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from sqlalchemy import Float, Text
import uuid
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import func
from app.core.config import settings
from app.db.database import Base
from sqlalchemy.orm import remote
from sqlalchemy.ext.mutable import MutableDict, MutableList # 导入 MutableDict

# 根据数据库类型选择 UUID 列类型
def get_uuid_column():
    if settings.db_url.startswith("postgresql"):
        return UUID(as_uuid=True)
    else:
        return String

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    google_id = Column(String, nullable=True)
    subscription_plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=True)
    subscription_status = Column(String, default="active")
    activated_by_admin = Column(Boolean, default=False)
    admin_notes = Column(Text, nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    workflows = relationship("Workflow", back_populates="user")
    workflow_executions = relationship("WorkflowExecution", back_populates="user")
    customer_stages = relationship("CustomerStage", backref="user")
    customers = relationship("Customer", backref="user")
    messages = relationship("Message", backref="user")
    ai_analyses = relationship("AIAnalysis", backref="user")
    audit_logs = relationship("AuditLog", backref="user")
    settings = relationship("Setting", backref="user")

class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    nodes = Column(JSON, nullable=False)  # 存储节点数据
    edges = Column(JSON, nullable=False)  # 存储边数据
    is_active = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)  # 软删除标志
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # 关系
    user = relationship("User", back_populates="workflows")
    executions = relationship("WorkflowExecution", back_populates="workflow")

class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    price = Column(Float, default=0.0)
    max_customers = Column(Integer, nullable=True)
    max_messages_per_month = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系（可选）
    users = relationship("User", backref="subscription_plan")

class AdminAction(Base):
    __tablename__ = "admin_actions"

    id = Column(Integer, primary_key=True, index=True)
    admin_email = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    target_user_id = Column(Integer, nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class WorkflowExecution(Base):
    __tablename__ = "workflow_executions"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"), nullable=False)
    status = Column(String, nullable=False)  # running, completed, failed
    triggered_by = Column(String, nullable=False)  # manual, keyword, time, etc.
    execution_data = Column(JSON, nullable=True)  # 触发数据
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # 关系
    workflow = relationship("Workflow", back_populates="executions")
    user = relationship("User", back_populates="workflow_executions")
    steps = relationship("WorkflowStepExecution", back_populates="execution")

# 客户阶段管理
class CustomerStage(Base):
    __tablename__ = "customer_stages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String, default="#3B82F6")  # 阶段颜色
    order_index = Column(Integer, default=0)  # 显示顺序
    is_default = Column(Boolean, default=False)  # 是否为默认阶段
    card_display_fields = Column(JSON, default=lambda: ["name", "phone", "email"]) # 客户卡片上显示的字段
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    customers = relationship("Customer", back_populates="stage")

# 扩展的客户模型 - 符合 MVP 架构
class Customer(Base):
    __tablename__ = "customers"

    id = Column(get_uuid_column(), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(Text, nullable=True)
    phone = Column(Text, nullable=True)
    email = Column(Text, nullable=True)
    status = Column(Text, nullable=True)  # 租户自定义状态
    custom_fields = Column(MutableDict.as_mutable(JSON), default=lambda: {})  # 统一存扩展数据
    photo_url = Column(String, nullable=True)
    last_message = Column(String, nullable=True)
    last_timestamp = Column(DateTime(timezone=True), nullable=True)
    telegram_chat_id = Column(Text, nullable=True) # 新增：用于存储Telegram用户的chat_id
    unread_count = Column(Integer, default=0)
    stage_id = Column(Integer, ForeignKey("customer_stages.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    version = Column(BigInteger, default=0)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 关系
    stage = relationship("CustomerStage", back_populates="customers")
    messages = relationship("Message", back_populates="customer")
    ai_analyses = relationship("AIAnalysis", back_populates="customer")


class Message(Base):
    __tablename__ = "messages"

    id = Column(get_uuid_column(), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    content = Column(Text, nullable=False)
    direction = Column(String, nullable=False)  # inbound, outbound
    channel = Column(String, nullable=True)  # 新增: 消息来源渠道 (e.g., 'whatsapp', 'telegram')
    whatsapp_id = Column(String, nullable=True, index=True)  # WhatsApp消息ID
    telegram_message_id = Column(String, nullable=True, index=True) # 新增: Telegram 消息ID
    media_type = Column(String, nullable=True) # 新增：媒体类型 (e.g., 'audio/ogg', 'image/jpeg')
    transcription = Column(Text, nullable=True) # 新增：语音消息转录文本
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    ack = Column(Integer, default=0)  # 0: sent, 1: delivered, 2: read, 3: read by recipient
    customer_id = Column(get_uuid_column(), ForeignKey("customers.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 关系
    customer = relationship("Customer", back_populates="messages")

# AI 分析结果存储
class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(get_uuid_column(), ForeignKey("customers.id"), nullable=False)
    message_id = Column(get_uuid_column(), ForeignKey("messages.id"), nullable=True)
    analysis_type = Column(String, nullable=False)  # 'extract', 'reply', 'sentiment', etc.
    input_data = Column(JSON, nullable=False)  # 输入的原始数据
    output_data = Column(JSON, nullable=False)  # AI 输出结果
    confidence = Column(Float, nullable=True)  # 置信度
    model_used = Column(String, nullable=True)  # 使用的 AI 模型
    handoff_triggered = Column(Boolean, default=False) # 新增：是否触发了人工处理
    handoff_reason = Column(Text, nullable=True) # 新增：人工处理的原因
    processing_time = Column(Float, nullable=True)  # 处理耗时（秒）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 关系
    customer = relationship("Customer", back_populates="ai_analyses")

# 工作流节点配置模板
class WorkflowNodeTemplate(Base):
    __tablename__ = "workflow_node_templates"

    id = Column(Integer, primary_key=True, index=True)
    node_type = Column(String, nullable=False)  # MessageTrigger, AI, UpdateDB, etc.
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    input_schema = Column(JSON, nullable=False)  # 输入参数 schema
    output_schema = Column(JSON, nullable=False)  # 输出参数 schema
    default_config = Column(JSON, nullable=False)  # 默认配置
    is_system = Column(Boolean, default=True)  # 是否为系统内置
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# 工作流执行步骤详情
class WorkflowStepExecution(Base):
    __tablename__ = "workflow_step_executions"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("workflow_executions.id"), nullable=False)
    node_id = Column(String, nullable=False)  # workflow 中的节点 ID
    node_type = Column(String, nullable=False)
    status = Column(String, nullable=False)  # pending, running, completed, failed, skipped
    branch_taken = Column(String, nullable=True) # 新增：记录条件节点或AI节点选择的分支
    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, nullable=True)

    # 关系
    execution = relationship("WorkflowExecution", back_populates="steps")

# 审计日志
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False)  # customer, message, workflow, etc.
    entity_id = Column(get_uuid_column(), nullable=False)
    action = Column(String, nullable=False)  # create, update, delete
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    source = Column(String, nullable=True)  # workflow, manual, api, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    __table_args__ = (
        UniqueConstraint('key', name='settings_key_key'),
    )

class WhatsAppSession(Base):
    __tablename__ = "whatsapp_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_key = Column(String, nullable=False, unique=True)
    qr = Column(Text, nullable=True)
    connected = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", backref="whatsapp_sessions")


class TelegramSession(Base):
    __tablename__ = "telegram_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_key = Column(String, nullable=False, unique=True)
    connected = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", backref="telegram_sessions")


class TelegramCode(Base):
    __tablename__ = "telegram_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    phone_code_hash = Column(String, nullable=True)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="telegram_codes")

# 新增：媒体文件模型
class MediaFile(Base):
    __tablename__ = "media_files"

    id = Column(get_uuid_column(), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False, unique=True)  # 在 Supabase Storage 中的完整路径 (例如: user_id/filename.jpg)
    file_url = Column(String, nullable=True)  # 可公开访问的 URL (如果 bucket 是 public，或者使用签名 URL)
    file_type = Column(String, nullable=True)  # 例如: 'image/jpeg', 'video/mp4'
    folder = Column(String, nullable=True, index=True)  # 自定义文件夹名称
    size = Column(Integer, nullable=True)  # 文件大小 (字节)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", backref="media_files")

# 新增：AI 提示词库模型
class AIPrompt(Base):
    __tablename__ = "ai_prompts"

    id = Column(get_uuid_column(), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=True)
    user_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", backref="ai_prompts")

# 新增：知识库模型
class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id = Column(get_uuid_column(), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)  # 'product', 'sales', 'support', 'policy', etc.
    content = Column(Text, nullable=False)
    tags = Column(JSON, default=lambda: [])  # 标签数组
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", backref="knowledge_bases")

# 新增：自定义实体类型 (CustomEntityType)
class CustomEntityType(Base):
    __tablename__ = "custom_entity_types"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False) # 例如: "房源", "公寓单元", "任务"
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True) # 例如: "🏠", "🏢", "✅"
    is_active = Column(Boolean, default=True, nullable=False) # 新增：是否激活
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", backref="custom_entity_types")
    fields = relationship("CustomField", back_populates="entity_type", cascade="all, delete-orphan", foreign_keys="CustomField.entity_type_id")
    records = relationship("CustomEntityRecord", back_populates="entity_type", cascade="all, delete-orphan")

# 新增：自定义字段 (CustomField)
class CustomField(Base):
    __tablename__ = "custom_fields"

    id = Column(Integer, primary_key=True, index=True)
    entity_type_id = Column(Integer, ForeignKey("custom_entity_types.id"), nullable=False, index=True)
    name = Column(String, nullable=False) # 显示名称, 例如: "产品名称"
    field_key = Column(String, nullable=False) # 唯一键, 例如: "product_name"
    field_type = Column(String, nullable=False) # "text", "number", "date", "select", "reference" 等
    is_required = Column(Boolean, default=False)
    default_value = Column(Text, nullable=True) # 新增：欄位的預設值
    is_searchable = Column(Boolean, default=False, nullable=False) # 新增：是否可搜索
    options = Column(JSON, nullable=True) # 对于 "select" 类型
    reference_entity_type_id = Column(Integer, ForeignKey("custom_entity_types.id"), nullable=True) # 对于 "reference" 类型
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    entity_type = relationship("CustomEntityType", back_populates="fields", foreign_keys=[entity_type_id])
    # 如果是引用字段，可以通过此关系获取被引用的实体类型
    referenced_entity_type = relationship("CustomEntityType", foreign_keys=[reference_entity_type_id], remote_side=lambda: CustomEntityType.id, post_update=True)

    __table_args__ = (UniqueConstraint('entity_type_id', 'field_key', name='_entity_type_field_key_uc'),)

# 新增：自定义实体记录 (CustomEntityRecord)
class CustomEntityRecord(Base):
    __tablename__ = "custom_entity_records"

    id = Column(Integer, primary_key=True, index=True)
    entity_type_id = Column(Integer, ForeignKey("custom_entity_types.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    data = Column(JSON, default=lambda: {}) # 存储实际的字段数据, 例如: {"product_name": "iPhone", "price": 999}
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    entity_type = relationship("CustomEntityType", back_populates="records")
    user = relationship("User", backref="custom_entity_records")

# 新增：DbTrigger 触发追踪表（用于防止重复触发）
class DbTriggerExecution(Base):
    __tablename__ = "db_trigger_executions"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"), nullable=False, index=True)
    customer_id = Column(String, nullable=False, index=True)  # 触发的客户ID
    trigger_config_hash = Column(String, nullable=False)  # 触发配置的哈希值（用于识别同一触发条件）
    executed_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    workflow = relationship("Workflow", backref="db_trigger_executions")
    
    __table_args__ = (
        # 复合索引，用于快速查询特定工作流+客户的最后触发时间
        UniqueConstraint('workflow_id', 'customer_id', 'trigger_config_hash', 'executed_at', name='_workflow_customer_trigger_time_uc'),
    )