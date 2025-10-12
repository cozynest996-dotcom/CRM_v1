"""
Dashboard API - 仪表板统计数据
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import get_db
from app.db.models import Customer, Message, WorkflowExecution, WorkflowStepExecution, User, Workflow
from app.middleware.auth import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

router = APIRouter()

class WorkflowExecutionLog(BaseModel):
    id: int
    workflow_id: int
    workflow_name: str
    status: str
    triggered_by: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    error_message: Optional[str]
    trigger_data: Optional[dict]

class AutomationStats(BaseModel):
    total_executions: int
    successful_executions: int
    failed_executions: int
    success_rate: float
    avg_execution_time_ms: Optional[float]
    executions_today: int

class DashboardStats(BaseModel):
    customers_count: int
    messages_count: int
    storage_used: str
    plan_limits: dict
    recent_activity: list
    automation_stats: AutomationStats

class UserStats(BaseModel):
    id: int
    name: Optional[str]
    email: str
    avatar_url: Optional[str]
    subscription_plan: Optional[str]
    subscription_status: str
    created_at: datetime
    trial_ends_at: Optional[datetime]

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取用户的仪表板统计数据"""
    
    # 获取客户数量
    customers_count = db.query(Customer).filter(
        Customer.user_id == current_user.id
    ).count()
    
    # 获取本月消息数量
    start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    messages_count = db.query(Message).filter(
        Message.user_id == current_user.id,
        Message.timestamp >= start_of_month
    ).count()
    
    # 计算存储使用量（简化版，基于消息数量估算）
    storage_mb = max(1, messages_count * 0.05)  # 假设每条消息约50KB
    storage_used = f"{storage_mb:.1f}MB"
    
    # 获取订阅计划限制
    plan_limits = {
        "max_customers": 100,
        "max_messages_per_month": 2000,
        "storage_limit": "500MB"
    }
    
    # 获取订阅计划名称
    if current_user.subscription_plan:
        subscription_plan_name = current_user.subscription_plan.display_name
        plan_limits["max_customers"] = current_user.subscription_plan.max_customers or 100
        plan_limits["max_messages_per_month"] = current_user.subscription_plan.max_messages_per_month or 2000
    else:
        subscription_plan_name = "免费版"
    
    # 获取最近活动（最近10条消息和客户）
    recent_activity = []
    
    # 最近的消息
    recent_messages = db.query(Message).filter(
        Message.user_id == current_user.id
    ).order_by(Message.timestamp.desc()).limit(5).all()
    
    for msg in recent_messages:
        customer = db.query(Customer).filter(Customer.id == msg.customer_id).first()
        customer_name = customer.name if customer else "未知客户"
        activity_type = "message_sent" if msg.direction == "outbound" else "message_received"
        description = f"{'发送' if msg.direction == 'outbound' else '收到'}消息给客户{customer_name}"
        
        # 🕐 修復：改為返回 ISO 時間戳，讓前端處理時區轉換
        time_str = msg.timestamp.isoformat() if msg.timestamp else ""
        
        recent_activity.append({
            "id": len(recent_activity) + 1,
            "type": activity_type,
            "description": description,
            "time": time_str
        })
    
    # 最近的新客户
    recent_customers = db.query(Customer).filter(
        Customer.user_id == current_user.id
    ).order_by(Customer.updated_at.desc()).limit(3).all()
    
    for customer in recent_customers:
        # 🕐 修復：改為返回 ISO 時間戳，讓前端處理時區轉換
        time_str = customer.updated_at.isoformat() if customer.updated_at else ""
        
        recent_activity.append({
            "id": len(recent_activity) + 1,
            "type": "customer",
            "description": f"更新客户信息：{customer.name or customer.phone}",
            "time": time_str
        })
    
    # 按时间排序
    recent_activity.sort(key=lambda x: x["id"], reverse=True)
    recent_activity = recent_activity[:6]  # 只保留最近6条
    
    # 🤖 計算自動化統計數據
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 獲取用戶的工作流執行統計
    total_executions = db.query(WorkflowExecution).filter(
        WorkflowExecution.user_id == current_user.id
    ).count()
    
    successful_executions = db.query(WorkflowExecution).filter(
        WorkflowExecution.user_id == current_user.id,
        WorkflowExecution.status == "completed"
    ).count()
    
    failed_executions = db.query(WorkflowExecution).filter(
        WorkflowExecution.user_id == current_user.id,
        WorkflowExecution.status == "failed"
    ).count()
    
    executions_today = db.query(WorkflowExecution).filter(
        WorkflowExecution.user_id == current_user.id,
        WorkflowExecution.started_at >= today_start
    ).count()
    
    # 計算成功率和平均執行時間
    success_rate = (successful_executions / total_executions * 100) if total_executions > 0 else 0.0
    
    # 計算平均執行時間（毫秒）
    avg_execution_time = None
    completed_executions = db.query(WorkflowExecution).filter(
        WorkflowExecution.user_id == current_user.id,
        WorkflowExecution.status == "completed",
        WorkflowExecution.completed_at.isnot(None)
    ).all()
    
    if completed_executions:
        total_duration = 0
        for execution in completed_executions:
            if execution.completed_at and execution.started_at:
                duration = (execution.completed_at - execution.started_at).total_seconds() * 1000
                total_duration += duration
        avg_execution_time = total_duration / len(completed_executions)
    
    automation_stats = AutomationStats(
        total_executions=total_executions,
        successful_executions=successful_executions,
        failed_executions=failed_executions,
        success_rate=round(success_rate, 1),
        avg_execution_time_ms=round(avg_execution_time) if avg_execution_time else None,
        executions_today=executions_today
    )
    
    return DashboardStats(
        customers_count=customers_count,
        messages_count=messages_count,
        storage_used=storage_used,
        plan_limits=plan_limits,
        recent_activity=recent_activity,
        automation_stats=automation_stats
    )

@router.get("/user", response_model=UserStats)
async def get_user_info(
    current_user: User = Depends(get_current_user)
):
    """获取当前用户信息"""
    
    subscription_plan_name = "免费版"
    if current_user.subscription_plan:
        subscription_plan_name = current_user.subscription_plan.display_name
    
    return UserStats(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        avatar_url=current_user.avatar_url,
        subscription_plan=subscription_plan_name,
        subscription_status=current_user.subscription_status,
        created_at=current_user.created_at,
        trial_ends_at=current_user.trial_ends_at
    )

@router.get("/automation/logs", response_model=list[WorkflowExecutionLog])
async def get_automation_logs(
    limit: int = 20,
    offset: int = 0,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """獲取用戶的自動化執行日誌"""
    
    query = db.query(WorkflowExecution).filter(
        WorkflowExecution.user_id == current_user.id
    )
    
    # 狀態篩選
    if status:
        query = query.filter(WorkflowExecution.status == status)
    
    # 獲取執行記錄
    executions = query.order_by(
        WorkflowExecution.started_at.desc()
    ).offset(offset).limit(limit).all()
    
    # 轉換為響應格式
    logs = []
    for execution in executions:
        # 獲取工作流名稱
        workflow = db.query(Workflow).filter(Workflow.id == execution.workflow_id).first()
        workflow_name = workflow.name if workflow else f"工作流 {execution.workflow_id}"
        
        # 計算執行時間
        duration_ms = None
        if execution.completed_at and execution.started_at:
            duration_ms = int((execution.completed_at - execution.started_at).total_seconds() * 1000)
        
        logs.append(WorkflowExecutionLog(
            id=execution.id,
            workflow_id=execution.workflow_id,
            workflow_name=workflow_name,
            status=execution.status,
            triggered_by=execution.triggered_by,
            started_at=execution.started_at,
            completed_at=execution.completed_at,
            duration_ms=duration_ms,
            error_message=execution.error_message,
            trigger_data=execution.execution_data
        ))
    
    return logs
