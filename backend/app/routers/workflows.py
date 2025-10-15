"""
Workflows Router

职责:
- 提供 RESTful API 用于创建、读取、更新、删除工作流（CRUD）。
- 提供触发/执行工作流的接口（包括通过消息触发和手动触发）。
- 保障每个操作的权限（使用 get_current_user 依赖注入），并将当前用户 ID 关联到创建的工作流或触发数据中。
- 提供用于获取工作流执行历史、激活/停用与发布模板工作流的便捷端点。

主要端点概览:
- GET /api/workflows - 列出用户的工作流
- POST /api/workflows - 创建工作流
- PUT /api/workflows/{id} - 更新工作流
- DELETE /api/workflows/{id} - 删除工作流
- POST /api/workflows/{id}/execute - 执行工作流（同步触发）
- POST /api/workflows/trigger/message - 批量通过消息触发匹配的工作流

注意事项:
- 所有涉及用户数据的操作均要求 Authorization header（Bearer token）。
- 创建或执行工作流时会在后台记录 WorkflowExecution 与 WorkflowStepExecution，用于调试与审计。
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.db.database import get_db
from app.db.models import Workflow, WorkflowExecution, WorkflowNodeTemplate
from app.middleware.auth import get_current_user
from app.services.workflow_engine import WorkflowEngine

router = APIRouter(tags=["workflows"])

# 工作流数据模型
class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None # 新增：支持节点上的命名源锚点
    targetHandle: Optional[str] = None # 新增：支持节点上的命名目标锚点

class WorkflowNode(BaseModel):
    id: str
    type: str
    description: Optional[str] = None
    config: Optional[dict] = None

class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    nodes: List[dict]  # 保持灵活性，允许任意节点配置
    edges: List[WorkflowEdge]  # 但边必须符合特定格式
    is_active: bool = False

class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    nodes: Optional[List[dict]] = None
    edges: Optional[List[WorkflowEdge]] = None
    is_active: Optional[bool] = None

class WorkflowResponse(BaseModel):
    id: int
    name: str
    description: str
    nodes: List[dict]
    edges: List[WorkflowEdge]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    user_id: int

    class Config:
        from_attributes = True

class WorkflowExecutionResponse(BaseModel):
    id: int
    workflow_id: int
    status: str
    triggered_by: str
    execution_data: dict
    started_at: datetime
    completed_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True

# 获取用户的所有工作流
@router.get("/workflows", response_model=List[WorkflowResponse])
async def get_workflows(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取当前用户的所有工作流"""
    workflows = db.query(Workflow).filter(
        Workflow.user_id == current_user.id,
        Workflow.is_deleted != True  # 过滤掉已删除的工作流
    ).all()
    return workflows

# 获取单个工作流
@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取指定的工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    return workflow

# 创建工作流
@router.post("/workflows", response_model=WorkflowResponse)
async def create_workflow(
    workflow_data: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """创建新的工作流"""
    # 转换 WorkflowEdge 对象为字典格式
    edges_data = workflow_data.edges
    if isinstance(edges_data, list):
        edges_data = [
            edge.dict() if hasattr(edge, 'dict') else edge
            for edge in edges_data
        ]
    
    workflow = Workflow(
        name=workflow_data.name,
        description=workflow_data.description,
        nodes=workflow_data.nodes,
        edges=edges_data,
        is_active=workflow_data.is_active,
        user_id=current_user.id
    )
    
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    
    return workflow

# 更新工作流
@router.put("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: int,
    workflow_data: WorkflowUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """更新工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    # 更新字段
    if workflow_data.name is not None:
        workflow.name = workflow_data.name
    if workflow_data.description is not None:
        workflow.description = workflow_data.description
    if workflow_data.nodes is not None:
        workflow.nodes = workflow_data.nodes
    if workflow_data.edges is not None:
        # 转换 WorkflowEdge 对象为字典格式
        if isinstance(workflow_data.edges, list):
            workflow.edges = [
                edge.dict() if hasattr(edge, 'dict') else edge
                for edge in workflow_data.edges
            ]
        else:
            workflow.edges = workflow_data.edges
    if workflow_data.is_active is not None:
        workflow.is_active = workflow_data.is_active
    
    workflow.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(workflow)
    
    return workflow

# 部分更新工作流
@router.patch("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def patch_workflow(
    workflow_id: int,
    workflow_data: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """部分更新工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    # 更新字段
    for field, value in workflow_data.items():
        if hasattr(workflow, field):
            # 特殊处理 edges 字段
            if field == 'edges' and isinstance(value, list):
                # 转换 WorkflowEdge 对象为字典格式
                processed_edges = [
                    edge.dict() if hasattr(edge, 'dict') else edge
                    for edge in value
                ]
                setattr(workflow, field, processed_edges)
            else:
                setattr(workflow, field, value)
    
    workflow.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(workflow)
    
    return workflow

# 删除工作流
@router.delete("/workflows/{workflow_id}")
async def delete_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """删除工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    db.delete(workflow)
    db.commit()
    
    return {"message": "工作流已删除"}

# 激活工作流
@router.post("/workflows/{workflow_id}/activate")
async def activate_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """激活工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    workflow.is_active = True
    workflow.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "工作流已激活", "workflow_id": workflow_id}

# 停用工作流
@router.post("/workflows/{workflow_id}/deactivate")
async def deactivate_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """停用工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    workflow.is_active = False
    workflow.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "工作流已停用", "workflow_id": workflow_id}

# 执行工作流
@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: int,
    trigger_data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """执行工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id,
        Workflow.is_active == True
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在或未激活")
    
    # 添加用户信息到触发数据
    trigger_data["user_id"] = current_user.id
    
    # 使用新的工作流引擎执行
    try:
        engine = WorkflowEngine(db)
        execution = await engine.execute_workflow(workflow_id, trigger_data)
        
        return {
            "message": "工作流执行成功",
            "execution_id": execution.id,
            "status": execution.status
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"工作流执行失败: {str(e)}")

# 触发工作流（通过消息）
@router.post("/trigger/message", tags=["workflows"])
async def trigger_workflow_by_message(
    trigger_data: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """通过消息触发工作流"""
    # 查找激活的工作流（这里简化处理，实际可能需要更复杂的匹配逻辑）
    active_workflows = db.query(Workflow).filter(
        Workflow.is_active == True
    ).all()
    
    results = []
    
    for workflow in active_workflows:
        # 检查工作流是否包含 MessageTrigger 节点
        has_message_trigger = any(
            node.get("type") == "MessageTrigger" 
            for node in workflow.nodes
        )
        
        if has_message_trigger:
            try:
                engine = WorkflowEngine(db)
                execution = await engine.execute_workflow(workflow.id, trigger_data)
                results.append({
                    "workflow_id": workflow.id,
                    "execution_id": execution.id,
                    "status": execution.status
                })
            except Exception as e:
                results.append({
                    "workflow_id": workflow.id,
                    "error": str(e)
                })
    
    return {"triggered_workflows": results}

# 获取工作流执行历史
@router.get("/workflows/{workflow_id}/executions", response_model=List[WorkflowExecutionResponse])
async def get_workflow_executions(
    workflow_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取工作流的执行历史"""
    # 验证工作流所有权
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    executions = db.query(WorkflowExecution).filter(
        WorkflowExecution.workflow_id == workflow_id
    ).order_by(WorkflowExecution.started_at.desc()).limit(limit).all()
    
    return executions

# 激活/停用工作流
@router.patch("/workflows/{workflow_id}/toggle")
async def toggle_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """激活或停用工作流"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.user_id == current_user.id
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    workflow.is_active = not workflow.is_active
    workflow.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "message": f"工作流已{'激活' if workflow.is_active else '停用'}",
        "is_active": workflow.is_active
    }

# 创建 MVP 模板工作流
@router.post("/workflows/create-mvp-template")
async def create_mvp_template_workflow(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """创建基于 MVP 架构的模板工作流"""
    
    # MVP 模板定义（基于用户提供的 JSON）
    mvp_template = {
        "name": "Enterprise-CRM-MVP",
        "description": "基于 MVP 架构的自动化客户管理工作流",
        "nodes": [
            {
                "id": "n_trigger",
                "type": "MessageTrigger",
                "channel": "whatsapp",
                "match_key": "Phone",
                "position": {"x": 100, "y": 100}
            },
            {
                "id": "n_ai",
                "type": "AI",
                "model": {"name": "gpt-4o-mini", "temperature": 0.2, "max_tokens": 900},
                "data": {
                    "label": "AI 智能分析",
                    "description": "智能分析客户需求并可选更新客户信息/自动回复",
                    "enableUpdateInfo": True,
                    "enableAutoReply": True,
                    "selectedHeaders": ["Status", "Next_Follow_Up", "Remark"],
                    "requiredKeys": ["Phone"],
                    "autoReplyKey": "AutoReply",
                    "fallbackEnabled": True,
                    "fallbackModel": "gpt-3.5-turbo",
                    "repairJsonOnFail": True,
                    "maxAttempts": 2,
                    "saveRawResponse": True,
                    "createHandoffRecord": True,
                    "onSuccess": "n_update",
                    "onFail": "n_template",
                    "prompts": {
                        "system": "You are a CRM assistant. Output STRICT JSON with keys: analyze, reply, meta.",
                        "user_template": "Latest message:\n{last_message}\n\nKnown customer (normalized row):\n{row}\n\nAllowed schema:\n{schema_spec}\n\nTasks:\n1) analyze -> updates/uncertain/reason/confidence (only keys allowed; values normalized).\n2) provisional profile = row ⊕ updates.\n3) reply <=700 chars; '|||' to split; <=2 follow-ups.\n4) meta: {\\\"used_profile\\\":\\\"provisional\\\",\\\"separator\\\":\\\"|||\\\",\\\"safe_to_send_before_db_update\\\":false}.\nReturn JSON only."
                    }
                },
                "position": {"x": 300, "y": 100}
            },
            {
                "id": "n_update",
                "type": "UpdateDB",
                "table": "customers",
                "match_key": "Phone",
                    "ops": [
                    {"col": "move_in_date", "value": "{ai.analyze.updates['Move-In Date']}", "mode": "set"},
                    {"col": "custom_fields", "value": "{ai.analyze.updates['Custom:*']}", "mode": "merge_json"},
                    {"col": "last_follow_up_time", "mode": "now"}
                ],
                "optimistic_lock": {"enabled": True, "version_col": "version", "incoming_version": "{db.version}", "on_conflict": "prompt"},
                "skip_if_equal": True,
                "coerce": True,
                "audit_log": True,
                "position": {"x": 500, "y": 100}
            },
            {
                "id": "n_guard",
                "type": "GuardrailValidator",
                "checks": {"blocked_keywords": [], "url_whitelist": []},
                "on_fail": "goto:n_template",
                "position": {"x": 700, "y": 100}
            },
            {
                "id": "n_delay",
                "type": "Delay",
                "policy": {
                    "mode": "auto_window",
                    "work_hours": {"start": "09:30", "end": "21:30", "tz": "Asia/Kuala_Lumpur"},
                    "quiet_hours": {"start": "22:00", "end": "08:00"},
                    "max_per_day": 3,
                    "jitter_seconds": [3, 15]
                },
                "position": {"x": 900, "y": 100}
            },
            {
                "id": "n_send",
                "type": "SendWhatsAppMessage",
                "to": "{db.phone}",
                "message": "{ai.reply.reply_text}",
                "dedupe": {"window_minutes": 2, "hash_on": ["to", "message"]},
                "retries": {"max": 3, "backoff": [2, 5, 15]},
                "circuit_breaker": {"fail_threshold": 10, "open_secs": 60},
                "audit_log": True,
                "position": {"x": 1100, "y": 100}
            },
            {
                "id": "n_template",
                "type": "Template",
                "template": "Hi! We received your message and will follow up shortly.",
                "variables": {},
                "position": {"x": 700, "y": 300}
            }
        ],
        "edges": [
            ["n_trigger", "n_ai"],
            ["n_ai", "n_update"],
            ["n_update", "n_guard"],
            ["n_guard", "n_delay"],
            ["n_delay", "n_send"],
            ["n_guard", "n_template"],
            ["n_template", "n_send"]
        ]
    }
    
    # 创建工作流
    workflow = Workflow(
        name=mvp_template["name"],
        description=mvp_template["description"],
        nodes=mvp_template["nodes"],
        edges=mvp_template["edges"],
        is_active=True,
        user_id=current_user.id
    )
    
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    
    return {
        "message": "MVP 模板工作流创建成功",
        "workflow_id": workflow.id,
        "workflow": workflow
    }


@router.get("/workflows/node-templates")
async def get_node_templates(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """返回内置节点模板（供前端生成配置表单使用）"""
    # 尝试从数据库读取，如无则返回内存默认
    try:
        templates = db.query(WorkflowNodeTemplate).filter(WorkflowNodeTemplate.is_system == True).all()
        if templates:
            return [
                {
                    "node_type": t.node_type,
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                    "output_schema": t.output_schema,
                    "default_config": t.default_config
                }
                for t in templates
            ]
    except Exception:
        # 忽略 DB 错误，回退到默认定义
        pass

    # 默认 AI 节点模板
    ai_template = {
        "node_type": "AI",
        "name": "AI 智能分析",
        "description": "智能分析客户消息并返回结构化结果/回复",
        "default_config": {
            "label": "AI 智能分析",
            "description": "智能分析客户需求并可选更新客户信息/自动回复",
            "enableUpdateInfo": True,
            "enableAutoReply": True,
            "selectedHeaders": ["Status", "Next_Follow_Up", "Remark"],
            "requiredKeys": ["Phone"],
            "autoReplyKey": "AutoReply",
            "fallbackEnabled": True,
            "fallbackModel": "gpt-3.5-turbo",
            "repairJsonOnFail": True,
            "maxAttempts": 2,
            "saveRawResponse": True,
            "createHandoffRecord": True,
            "onSuccess": None,
            "onFail": None,
            "prompts": {
                "system": "You are a CRM assistant. Output STRICT JSON with keys: analyze, reply, meta.",
                "user_template": "Latest message:\n{last_message}\n\nKnown customer (normalized row):\n{row}\n\nAllowed schema:\n{schema_spec}\n\nTasks:\n1) analyze -> updates/uncertain/reason/confidence (only keys allowed; values normalized).\n2) provisional profile = row ⊕ updates.\n3) reply <=700 chars; '|||' to split; <=2 follow-ups.\n4) meta: {\"used_profile\":\"provisional\",\"separator\":\"|||\",\"safe_to_send_before_db_update\":false}.\nReturn JSON only."
            }
        }
    }

    return [ai_template]
