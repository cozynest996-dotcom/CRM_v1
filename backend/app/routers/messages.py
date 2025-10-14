from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db import models
from app.schemas.message import MessageCreate, MessageOut
from app.services.whatsapp import send_whatsapp_message
from datetime import datetime
from typing import List
from app.metrics import metrics
from fastapi.responses import StreamingResponse
import json
import asyncio
from app.events import subscribers, publish_event
from app.middleware.auth import get_current_user
from app.core.config import settings
from uuid import UUID

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            return str(obj)
        return json.JSONEncoder.default(self, obj)

router = APIRouter(prefix="/messages", tags=["messages"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ✅ 收消息入口
@router.post("/inbox", response_model=MessageOut)
async def receive_message(data: dict, db: Session = Depends(get_db)):
    print(f"⏱️ {datetime.now()} - 收到消息推送: {data}")
    
    # 验证必要字段
    if not data.get("phone"):
        raise HTTPException(status_code=400, detail="Missing phone number")
    if not data.get("content"):
        raise HTTPException(status_code=400, detail="Missing message content")
        
    phone = data.get("phone")
    content = data.get("content")
    name = data.get("name", "Unknown")
    chat_history = data.get("chat_history", [])  # 新增聊天历史字段
    
    # 🔒 首先確定用戶ID
    owner_user_id = data.get("user_id")
    if owner_user_id is None:
        # 查找管理员用户（mingkun1999@gmail.com）
        admin_emails = settings.admin_emails.split(",")
        admin_user = db.query(models.User).filter(
            models.User.email.in_(admin_emails)
        ).first()
        owner_user_id = admin_user.id if admin_user else 1
    
    # 🔒 获取活动的工作流（僅限當前用戶的工作流）
    workflows = db.query(models.Workflow).filter(
        models.Workflow.is_active == True,
        models.Workflow.user_id == owner_user_id
    ).all()
    
    # 创建工作流引擎
    from app.services.workflow_engine import WorkflowEngine
    workflow_engine = WorkflowEngine(db)
    
    # 准备触发数据
    trigger_data = {
        "trigger_type": "message",
        "channel": "whatsapp",
        "phone": phone,
        "message": content,
        "name": name,
        "timestamp": datetime.utcnow().isoformat(),
        "user_id": owner_user_id,  # 🔒 包含用戶ID
        "chat_history": chat_history  # 新增聊天历史
    }

    try:
        # 1. 快速查找客户（使用 first() 而不是 all()）
        customer = db.query(models.Customer).filter(models.Customer.phone == phone).first()
        if not customer:
            # 🔒 创建新客户，使用已確定的 user_id
            customer = models.Customer(name=name, phone=phone, status="new", user_id=owner_user_id)
            db.add(customer)
            db.commit()
            db.refresh(customer)
            print(f"✨ 创建新客户: {name} ({phone}) 归属于用户 {owner_user_id}")
        elif name != "Unknown" and customer.name in ["Unknown", "Test User"]:
            # 如果有了真实名字，更新默认名字
            customer.name = name
            db.add(customer)
            db.commit()

        # 2. 存消息（使用已確定的 user_id）
        now = datetime.utcnow()
        db_msg = models.Message(
            customer_id=customer.id,
            user_id=owner_user_id,
            direction="inbound",
            content=content,
            timestamp=now,
        )
        customer.unread_count = (customer.unread_count or 0) + 1
        # 更新客户最近消息预览/时间，方便前端立即显示
        customer.last_message = content
        customer.last_timestamp = now
        db.add(db_msg)
        db.add(customer)
        db.commit()
        db.refresh(db_msg)

        print(f"✅ {datetime.now()} - 消息已存储")

        # 3. 立即发送 SSE 事件
        # 准备完整的客户信息
        customer_data = {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "photo_url": customer.photo_url,
            "status": customer.status,
            "last_message": db_msg.content,
            "last_timestamp": db_msg.timestamp.isoformat(),
            "unread_count": customer.unread_count or 0
        }

        # 准备SSE事件数据
        event_data = {
            "type": "inbound_message",
            "customer_id": customer.id,
            "message": {
                "id": db_msg.id,
                "content": db_msg.content,
                "timestamp": db_msg.timestamp.isoformat(),
                "direction": "inbound",
                "ack": db_msg.ack,
                "customer_id": customer.id
            },
            "customer": customer_data
        }

        # 🔒 在事件中包含用戶ID
        event_data["user_id"] = customer.user_id
        # 发送事件
        publish_event(event_data)
        print(f"📢 {datetime.now()} - 消息SSE事件已发送")
        
        # 检查是否是新客户的第一条消息
        is_first_message = not db.query(models.Message).filter(
            models.Message.customer_id == customer.id,
            models.Message.id != db_msg.id
        ).first()

        if is_first_message:
            # 这是该客户的第一条消息，发送新客户事件
            customer_data = {
                "id": customer.id,
                "name": customer.name,
                "phone": customer.phone,
                "photo_url": customer.photo_url,
                "status": customer.status,
                "last_message": db_msg.content,
                "last_timestamp": db_msg.timestamp.isoformat(),
                "unread_count": customer.unread_count or 0
            }
            publish_event({
                "type": "new_customer",
                "customer": customer_data,
                "user_id": customer.user_id  # 🔒 包含用戶ID用於前端過濾
            })
            print(f"📢 {datetime.now()} - 新客户SSE事件已发送")

        # 发送消息事件（并包含客户最新信息）
        event_data["customer"] = {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "photo_url": customer.photo_url,
            "status": customer.status,
            "last_message": customer.last_message,
            "last_timestamp": customer.last_timestamp.isoformat() if customer.last_timestamp else None,
            "unread_count": customer.unread_count or 0
        }
        # 🔒 在事件中包含用戶ID
        event_data["user_id"] = customer.user_id
        publish_event(event_data)
        print(f"📢 {datetime.now()} - 消息SSE事件已发送")

        # 对每条消息都触发工作流
        for workflow in workflows:
            try:
                print(f"🔄 {datetime.now()} - 触发工作流 {workflow.id}")
                await workflow_engine.execute_workflow(workflow.id, trigger_data)
            except Exception as e:
                print(f"❌ {datetime.now()} - 工作流 {workflow.id} 执行失败: {str(e)}")
                # 不要中断消息处理，继续执行其他工作流

        # 总是返回消息对象
        return MessageOut(
            id=str(db_msg.id),
            customer_id=str(db_msg.customer_id),
            direction=db_msg.direction,
            content=db_msg.content,
            timestamp=db_msg.timestamp,
            ack=db_msg.ack
        )
    except Exception as e:
        db.rollback()
        error_msg = f"❌ Error processing message: {str(e)}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)


# ✅ 发消息入口
@router.post("/send", response_model=MessageOut)
def send_message(
    msg: MessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """发送消息（需要登录）"""
    # 🔒 檢查客戶是否屬於當前用戶
    customer = db.query(models.Customer).filter(
        models.Customer.id == msg.customer_id,
        models.Customer.user_id == current_user.id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found or access denied")

    # 将消息归属于当前登录用户，避免 messages.user_id 为 NULL 导致的完整性错误
    db_msg = models.Message(
        customer_id=msg.customer_id,
        user_id=current_user.id,
        content=msg.content,
        direction="outbound",
        timestamp=datetime.utcnow(),
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)

    send_whatsapp_message(db_msg, customer.phone)
    return MessageOut(
        id=str(db_msg.id),
        customer_id=str(db_msg.customer_id),
        direction=db_msg.direction,
        content=db_msg.content,
        timestamp=db_msg.timestamp,
        ack=db_msg.ack
    )


# ✅ 标记客户所有未读消息为已读
@router.post("/{customer_id}/mark_read")
def mark_messages_read(customer_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 🔒 檢查客戶是否屬於當前用戶
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id,
        models.Customer.user_id == current_user.id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found or access denied")
    
    # 🔒 获取所有未读的入站消息（只限當前用戶）
    unread_messages = (
        db.query(models.Message)
        .filter(
            models.Message.customer_id == customer_id,
            models.Message.user_id == current_user.id,
            models.Message.direction == "inbound",
            models.Message.ack < 3  # 未读消息
        )
        .all()
    )
    
    # 标记消息为已读
    for msg in unread_messages:
        msg.ack = 3  # 已读状态
    
    # 重置未读计数
    customer.unread_count = 0
    
    # 保存更改
    db.commit()
    
    # 发送消息已读事件
    try:
        publish_event({
            "type": "messages_read",
            "customer_id": customer_id,
            "count": len(unread_messages),
            "user_id": current_user.id  # 🔒 包含用戶ID
        })
    except Exception:
        pass
    
    return {"status": "ok", "marked_count": len(unread_messages)}

# ✅ 获取某客户的聊天记录（统一接口，需要登录）
@router.get("/{customer_id}", response_model=List[MessageOut])
def get_chat_history(customer_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 🔒 檢查客戶是否屬於當前用戶
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id,
        models.Customer.user_id == current_user.id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found or access denied")

    # 🔒 只獲取屬於當前用戶的消息
    messages = (
        db.query(models.Message)
        .filter(
            models.Message.customer_id == customer_id,
            models.Message.user_id == current_user.id
        )
        .order_by(models.Message.timestamp.asc())
        .all()
    )
    # 将 UUID 转换为字符串，并将可能为 None 的 timestamp 转换为 ISO 格式字符串
    serialized_messages = []
    for msg in messages:
        serialized_messages.append(MessageOut(
            id=str(msg.id),
            customer_id=str(msg.customer_id),
            direction=msg.direction,
            content=msg.content,
            timestamp=msg.timestamp,
            ack=msg.ack
        ))
    return serialized_messages

@router.post("/map")
def map_whatsapp_id(data: dict, db: Session = Depends(get_db)):
    backend_id = data.get("backend_id")
    whatsapp_id = data.get("whatsapp_id")
    if not backend_id or not whatsapp_id:
        raise HTTPException(status_code=400, detail="backend_id and whatsapp_id required")
    msg = db.query(models.Message).filter(models.Message.id == backend_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.whatsapp_id = whatsapp_id
    db.commit()
    return {"status": "ok"}


# 新增 webhook 接收 seen 回调，供 gateway 在异步流程完成后调用
@router.post("/webhooks/whatsapp/seen")
def webhook_whatsapp_seen(data: dict, db: Session = Depends(get_db)):
    backend_id = data.get("backend_message_id")
    whatsapp_id = data.get("whatsapp_id")
    delay_ms = data.get("delay_ms")
    to = data.get("to")
    if not backend_id or not whatsapp_id:
        raise HTTPException(status_code=400, detail="backend_message_id and whatsapp_id required")

    msg = db.query(models.Message).filter(models.Message.id == backend_id).first()
    if not msg:
        # 尝试按 whatsapp_id 查找或创建映射
        raise HTTPException(status_code=404, detail="Message not found")

    # 更新映射与已读状态
    msg.whatsapp_id = whatsapp_id
    try:
        msg.ack = 3  # 标记为已读
        # 如果是入站消息被标记为已读，减少未读计数
        if msg.direction == "inbound":
            customer = db.query(models.Customer).filter(models.Customer.id == msg.customer_id).first()
            if customer and customer.unread_count > 0:
                customer.unread_count -= 1
    except Exception:
        pass
    db.commit()

    # 记录 metrics
    try:
        if isinstance(delay_ms, (int, float)):
            metrics.observe_hist('seen_delay_ms', float(delay_ms))
        metrics.increment('webhook_seen_calls')
    except Exception:
        pass

    print(f"🔔 Webhook seen received: backend_id={backend_id}, whatsapp_id={whatsapp_id}, delay_ms={delay_ms}, to={to}")
    try:
        publish_event({"type": "message_seen", "backend_id": backend_id, "whatsapp_id": whatsapp_id, "delay_ms": delay_ms})
    except Exception:
        pass
    return {"status": "ok"}


# ✅ 获取单条消息
@router.get("/message/{message_id}", response_model=MessageOut)
def get_message(message_id: str, db: Session = Depends(get_db)):
    message = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return message

@router.get('/events/stream')
def sse_events():
    async def event_generator(q: asyncio.Queue):
        try:
            while True:
                data = await q.get()
                yield f"data: {json.dumps(data, cls=UUIDEncoder)}\n\n"
        except asyncio.CancelledError:
            return

    q = asyncio.Queue()
    subscribers.append(q)
    return StreamingResponse(event_generator(q), media_type='text/event-stream')

# 重複的 ack 端點已刪除，使用下方的新版本

@router.post("/ack")
async def update_message_ack(data: dict, db: Session = Depends(get_db)):
    """接收 WhatsApp 消息狀態更新 (已發送/已送達/已讀)"""
    print(f"📱 {datetime.now()} - 收到消息狀態更新: {data}")
    
    message_id = data.get("message_id")
    ack = data.get("ack", 0)
    user_id = data.get("user_id")  # 🔒 WhatsApp Gateway 會包含 user_id
    
    if not message_id:
        raise HTTPException(status_code=400, detail="Missing message_id")
    
    # 🔒 查找屬於指定用戶的消息
    msg = db.query(models.Message).filter(
        models.Message.whatsapp_id == str(message_id),
        models.Message.user_id == user_id
    ).first()
    
    if not msg:
        # 嘗試部分匹配（某些情況下 message_id 可能不完全匹配）
        try:
            msg = db.query(models.Message).filter(
                models.Message.whatsapp_id.contains(str(message_id)),
                models.Message.user_id == user_id
            ).first()
        except Exception:
            msg = None
    
    if not msg:
        print(f"⚠️ 找不到消息 ID: {message_id} (用戶: {user_id})")
        raise HTTPException(status_code=404, detail="Message not found")
    
    # 更新狀態
    old_ack = msg.ack
    msg.ack = ack
    
    # 如果消息被標記為已讀(ack=3)且是入站消息，減少未讀計數
    if ack >= 3 and msg.direction == "inbound" and old_ack < 3:
        customer = db.query(models.Customer).filter(models.Customer.id == msg.customer_id).first()
        if customer and customer.unread_count > 0:
            customer.unread_count -= 1
            db.add(customer)
    
    db.add(msg)
    db.commit()
    
    print(f"✅ 消息狀態已更新: {message_id} → ack={ack}")
    
    return {"status": "ok", "message_id": message_id, "ack": ack}