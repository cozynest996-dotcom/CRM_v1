from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
import json
import uuid
from datetime import datetime

from app.db.database import SessionLocal
from app.db import models
from app.schemas.customer import CustomerBase, CustomerOut
from app.middleware.auth import get_current_user, get_optional_user
from app.services.settings import SettingsService

router = APIRouter(prefix="/api/customers", tags=["customers"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def trigger_db_workflows(customer_id: str, user_id: int, field_changes: list, table: str):
    """触发与数据库字段变化相关的工作流"""
    from app.services.workflow_engine import WorkflowEngine
    import asyncio
    
    db = SessionLocal()
    try:
        # 查找所有活跃的 DB Trigger 工作流
        workflows = db.query(models.Workflow).filter(
            models.Workflow.user_id == user_id,
            models.Workflow.is_active == True
        ).all()
        
        for workflow in workflows:
            try:
                # 获取工作流节点数据
                nodes = workflow.nodes if workflow.nodes else []
                
                # 查找 DB Trigger 节点
                for node in nodes:
                    if node.get('type') in ['DbTrigger', 'StatusTrigger']:
                        node_data = node.get('data', {})
                        config = node_data.get('config', {})
                        
                        # 检查是否匹配表名
                        if config.get('table', 'customers') != table:
                            continue
                        
                        # 检查字段变化是否匹配
                        trigger_field = config.get('field')
                        if not trigger_field:
                            continue
                        
                        # 查找匹配的字段变化
                        for change in field_changes:
                            if change['field'] == trigger_field:
                                # 构造触发数据
                                trigger_data = {
                                    "type": "db_change",
                                    "table": table,
                                    "field": trigger_field,
                                    "old_value": str(change['old_value']) if change['old_value'] is not None else "",
                                    "new_value": str(change['new_value']) if change['new_value'] is not None else "",
                                    "customer_id": str(customer_id),  # 转换 UUID 为字符串
                                    "user_id": user_id,
                                    "timestamp": datetime.utcnow().isoformat()
                                }
                                
                                print(f"🚀 触发 DB Trigger 工作流: {workflow.name}")
                                print(f"   字段: {trigger_field}")
                                print(f"   旧值: {change['old_value']} -> 新值: {change['new_value']}")
                                
                                # 执行工作流
                                engine = WorkflowEngine(db)
                                await engine.execute_workflow(workflow.id, trigger_data)
                                
                                break  # 每个节点只触发一次
                                
            except Exception as e:
                print(f"❌ 执行 DB Trigger 工作流失败: {workflow.name}, 错误: {e}")
                continue
                
    except Exception as e:
        print(f"❌ 触发 DB 工作流时发生错误: {e}")
    finally:
        db.close()

# 新增客户
@router.post("/", response_model=CustomerOut)
def create_customer(customer: CustomerBase, db: Session = Depends(get_db)):
    # 检查手机号是否已经存在
    existing = db.query(models.Customer).filter(models.Customer.phone == customer.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Phone already exists")

    db_customer = models.Customer(**customer.dict())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

# 获取客户列表（支持分页、字段选择、搜索与简单过滤）
@router.get("") # Changed from "/customers" to "" to correctly match /api/customers
def list_customers(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    fields: Optional[str] = Query(None, description="comma separated fields to return"),
    search: Optional[str] = Query(None, description="search in name/phone/email"),
    filters: Optional[str] = Query(None, description="json string of simple filters, e.g. {\"status\":\"new\"}"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """返回分页客户行。返回格式: { rows: [...], total: N, page, limit }
    fields: 可选，逗号分隔的字段名列表，默认返回基本字段。
    filters: JSON 字符串，只支持等值过滤（示例: {"status":"new"})
    """
    query = db.query(models.Customer).filter(models.Customer.user_id == current_user.id)

    # 简单搜索
    if search:
        like = f"%{search}%"
        query = query.filter(
            (models.Customer.name.ilike(like)) |
            (models.Customer.phone.ilike(like)) |
            (models.Customer.email.ilike(like))
        )

    # 简单 filters JSON
    if filters:
        try:
            filt = json.loads(filters)
            for k, v in filt.items():
                if hasattr(models.Customer, k):
                    query = query.filter(getattr(models.Customer, k) == v)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid filters JSON")

    total = query.count()

    offset = (page - 1) * limit
    rows = query.order_by(models.Customer.updated_at.desc()).offset(offset).limit(limit).all()

    # 选择字段
    field_list = None
    if fields:
        field_list = [f.strip() for f in fields.split(',') if f.strip()]

    def serialize_customer(c: models.Customer):
        # 基础字段
        base = {
            'id': c.id,
            'name': c.name,
            'phone': c.phone,
            'telegram_chat_id': c.telegram_chat_id,
            'email': c.email,
            'status': c.status,
            'stage_id': c.stage_id,
            'custom_fields': c.custom_fields,
            'photo_url': c.photo_url,
            'last_message': None,
            'last_timestamp': c.last_timestamp.isoformat() if c.last_timestamp else None,
            'unread_count': c.unread_count or 0,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None
        }

        # 获取 last_message 简要（若需要）
        last = (
            db.query(models.Message)
            .filter(models.Message.customer_id == c.id)
            .order_by(models.Message.timestamp.desc())
            .first()
        )
        if last and hasattr(last, 'content'):
            base['last_message'] = last.content

        def get_field_value(key: str):
            # direct base
            if key in base:
                return base.get(key)
            # 支持 custom_fields 取值路径 custom_fields.xxx
            if key.startswith('custom_fields'):
                parts = key.split('.')
                val = c.custom_fields or {}
                try:
                    for p in parts[1:]:
                        if isinstance(val, dict):
                            val = val.get(p)
                        else:
                            val = None
                            break
                    return val
                except Exception:
                    return None
            # fallback
            if hasattr(c, key):
                return getattr(c, key)
            return None

        if not field_list:
            return base

        result = {}
        for k in field_list:
            result[k] = get_field_value(k)
        return result

    return {
        'rows': [serialize_customer(c) for c in rows],
        'total': total,
        'page': page,
        'limit': limit
    }


@router.get('/stages')
def get_customer_stages(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """获取用户的客户阶段列表，用于条件构建器"""
    try:
        stages = db.query(models.CustomerStage).filter(
            models.CustomerStage.user_id == current_user.id
        ).order_by(models.CustomerStage.order_index).all()
        
        return [
            {
                'id': stage.id,
                'name': stage.name,
                'description': stage.description,
                'color': stage.color
            }
            for stage in stages
        ]
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error getting customer stages: {e}")
        return []


@router.get('/fields')
def get_customer_fields(db: Session = Depends(get_db), current_user: models.User = Depends(get_optional_user)):
    """返回客户表的所有列名（动态）并附加 custom_fields 内的键。
    为条件构建器返回带前缀的字段名。
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # 基础字段（带 db.customer 前缀）
        base_columns = [c.name for c in models.Customer.__table__.columns]
        # 过滤掉不需要的字段
        filtered_columns = [col for col in base_columns if col not in ['version']]
        db_fields = [f"db.customer.{col}" for col in filtered_columns]

        # 如果用户已认证，则附加 custom_fields 的键
        custom_fields_list = []
        if current_user:
            try:
                sample_rows = db.query(models.Customer.custom_fields).filter(
                    models.Customer.user_id == current_user.id,
                    models.Customer.custom_fields.isnot(None)
                ).limit(200).all()
                
                custom_keys = set()
                for row in sample_rows:
                    cf = row[0]
                    if not cf:
                        continue
                    try:
                        if isinstance(cf, str):
                            obj = json.loads(cf)
                        else:
                            obj = cf
                        if isinstance(obj, dict):
                            custom_keys.update(k for k in obj.keys() if isinstance(k, str))
                    except Exception:
                        continue

                custom_fields_list = [f"custom_fields.{k}" for k in sorted(custom_keys)]
                logger.info(f"Found {len(custom_fields_list)} custom field keys for user {current_user.id}")
            except Exception as e:
                logger.warning(f"Error fetching custom fields for user {current_user.id}: {e}")

        # 合并所有字段
        all_fields = db_fields + custom_fields_list
        logger.info(f"Returning {len(all_fields)} total fields for condition building")
        return all_fields

    except Exception as e:
        logger.error(f"Error getting customer fields: {e}")
        # 回退：返回基础字段
        return [
            'db.customer.id', 'db.customer.name', 'db.customer.phone', 
            'db.customer.email', 'db.customer.status', 'db.customer.stage_id'
        ]


@router.patch("/{customer_id}")
async def patch_customer(
    customer_id: str,
    updates: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """部分更新客户：仅允许白名单字段更新"""
    allowed = {'name', 'phone', 'telegram_chat_id', 'email', 'status', 'custom_fields', 'stage_id'}
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id, models.Customer.user_id == current_user.id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')

    # 记录更新前的值，用于 DB Trigger
    old_values = {}
    field_changes = []
    
    changed = False
    for k, v in updates.items():
        if k not in allowed:
            continue

        # 记录旧值
        old_value = getattr(customer, k, None)
        
        # stage_id 校验
        if k == 'stage_id':
            if v is None:
                if old_value is not None:
                    old_values[k] = old_value
                    field_changes.append({'field': k, 'old_value': old_value, 'new_value': None})
                setattr(customer, 'stage_id', None)
                changed = True
                continue
            stage = db.query(models.CustomerStage).filter(models.CustomerStage.id == v, models.CustomerStage.user_id == current_user.id).first()
            if not stage:
                raise HTTPException(status_code=400, detail='Invalid stage_id')
            if old_value != v:
                old_values[k] = old_value
                field_changes.append({'field': k, 'old_value': old_value, 'new_value': v})
            setattr(customer, 'stage_id', v)
            changed = True
            continue

        # custom_fields 合并
        if hasattr(customer, k):
            if k == 'custom_fields' and isinstance(v, dict) and isinstance(customer.custom_fields, dict):
                merged = {**customer.custom_fields, **v}
                if old_value != merged:
                    old_values[k] = old_value
                    field_changes.append({'field': k, 'old_value': old_value, 'new_value': merged})
                setattr(customer, 'custom_fields', merged)
            else:
                if old_value != v:
                    old_values[k] = old_value
                    field_changes.append({'field': k, 'old_value': old_value, 'new_value': v})
                setattr(customer, k, v)
            changed = True

    if changed:
        db.commit()
        db.refresh(customer)
        
        # 触发 DB Trigger 工作流（后台任务）
        if field_changes:
            background_tasks.add_task(
                trigger_db_workflows,
                customer_id=customer.id,
                user_id=current_user.id,
                field_changes=field_changes,
                table="customers"
            )

    return {
        'status': 'ok',
        'customer': {
            'id': customer.id,
            'name': customer.name,
            'phone': customer.phone,
            'telegram_chat_id': customer.telegram_chat_id,
            'email': customer.email,
            'status': customer.status,
            'stage_id': customer.stage_id,
            'custom_fields': customer.custom_fields
        }
    }


@router.get('/summary')
def list_customer_summaries(
    search: Optional[str] = Query(None, description="search in name/phone/email"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """简要客户摘要：最后一条消息、未读数，支持搜索"""
    query = db.query(models.Customer).filter(models.Customer.user_id == current_user.id)
    
    # 添加搜索功能
    if search:
        like = f"%{search}%"
        query = query.filter(
            (models.Customer.name.ilike(like)) |
            (models.Customer.phone.ilike(like)) |
            (models.Customer.email.ilike(like))
        )
    
    customers = query.all()
    out = []
    for c in customers:
        last = (
            db.query(models.Message)
            .filter(models.Message.customer_id == c.id)
            .order_by(models.Message.timestamp.desc())
            .first()
        )
        out.append({
            'id': c.id,
            'name': c.name,
            'phone': c.phone,
            'telegram_chat_id': c.telegram_chat_id,
            'email': c.email,
            'photo_url': c.photo_url,
            'status': c.status,
            'stage_id': c.stage_id,
            'custom_fields': c.custom_fields,
            'last_message': last.content if last and hasattr(last, 'content') else None,
            'last_timestamp': last.timestamp.isoformat() if last and last.timestamp else None,
            'unread_count': c.unread_count or 0,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            # 用于排序的时间戳（优先使用最后消息时间，否则使用更新时间）
            'sort_timestamp': last.timestamp.isoformat() if last and last.timestamp else (c.updated_at.isoformat() if c.updated_at else c.id)
        })
    
    # 按最新消息时间排序（最新的在前面）
    out.sort(key=lambda x: x['sort_timestamp'] if x['sort_timestamp'] else '', reverse=True)
    return out


# 更新客户头像
@router.post("/photo")
def update_customer_photo(data: dict, db: Session = Depends(get_db)):
    phone = data.get("phone")
    photo_url = data.get("photo_url")
    if not phone or not photo_url:
        raise HTTPException(status_code=400, detail="phone and photo_url required")
    customer = db.query(models.Customer).filter(models.Customer.phone == phone).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer.photo_url = photo_url
    db.commit()
    return {"status": "ok"}


@router.get("/{customer_id}")
def get_customer(customer_id: uuid.UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """返回完整客户信息"""
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id, models.Customer.user_id == current_user.id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')

    last = (
        db.query(models.Message)
        .filter(models.Message.customer_id == customer.id)
        .order_by(models.Message.timestamp.desc())
        .first()
    )

    base = {
        'id': customer.id,
        'name': customer.name,
        'phone': customer.phone,
        'telegram_chat_id': customer.telegram_chat_id,
        'email': customer.email,
        'status': customer.status,
        'stage_id': customer.stage_id,
        'custom_fields': customer.custom_fields,
        'photo_url': customer.photo_url,
        'last_message': last.content if last and hasattr(last, 'content') else None,
        'last_timestamp': last.timestamp.isoformat() if last and last.timestamp else None,
        'unread_count': customer.unread_count or 0,
        'updated_at': customer.updated_at.isoformat() if customer.updated_at else None
    }

    def get_field_value(key: str):
        if key in base:
            return base.get(key)
        if key.startswith('custom_fields'):
            parts = key.split('.')
            val = customer.custom_fields or {}
            try:
                for p in parts[1:]:
                    if isinstance(val, dict):
                        val = val.get(p)
                    else:
                        val = None
                        break
                return val
            except Exception:
                return None
        if hasattr(customer, key):
            return getattr(customer, key)
        return None

    try:
        settings_service = SettingsService(db)
        cfg = settings_service.get_customer_list_config(current_user.id) or {}
        cols = cfg.get('columns') if isinstance(cfg, dict) else None
        if cols and isinstance(cols, list):
            field_list = [c.get('key') for c in cols if c.get('visible', True) and c.get('key')]
        else:
            field_list = None
    except Exception:
        field_list = None

    if not field_list:
        return base

    result = {}
    for k in field_list:
        result[k] = get_field_value(k)
    for g in ('id', 'name', 'photo_url'):
        if g not in result:
            result[g] = get_field_value(g)
    return result

@router.get('/fields/detailed')
def get_customer_fields_detailed(db: Session = Depends(get_db), current_user: models.User = Depends(get_optional_user)):
    """返回客户表字段的详细信息，包括字段类型和描述，用于变量选择器"""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        result = {
            'basic_fields': [],
            'custom_fields': []
        }
        
        # 基础字段映射
        field_descriptions = {
            'name': {'label': '客户姓名', 'description': '客户的完整姓名'},
            'phone': {'label': '客户电话', 'description': '客户的联系电话'},
            'email': {'label': '客户邮箱', 'description': '客户的邮箱地址'},
            'status': {'label': '客户状态', 'description': '客户的当前状态'},
            'photo_url': {'label': '头像URL', 'description': '客户头像图片链接'},
            'last_message': {'label': '最后消息', 'description': '客户最后发送的消息'},
            'last_timestamp': {'label': '最后消息时间', 'description': '客户最后消息的时间戳'},
            'unread_count': {'label': '未读消息数', 'description': '未读消息的数量'},
            'stage_id': {'label': '销售阶段ID', 'description': '客户所在的销售阶段ID'},
        }
        
        # 获取基础字段
        base_columns = [c.name for c in models.Customer.__table__.columns]
        for col_name in base_columns:
            if col_name not in ['id', 'version', 'user_id', 'updated_at', 'custom_fields']:
                field_info = field_descriptions.get(col_name, {
                    'label': col_name.replace('_', ' ').title(),
                    'description': f'客户的{col_name}字段'
                })
                
                result['basic_fields'].append({
                    'name': col_name,
                    'label': field_info['label'],
                    'value': f"{{{{db.customer.{col_name}}}}}",
                    'description': field_info['description'],
                    'type': 'text'  # 简化类型处理
                })
        
        # 如果用户已认证，获取自定义字段
        if current_user:
            try:
                sample_rows = db.query(models.Customer.custom_fields).filter(
                    models.Customer.user_id == current_user.id,
                    models.Customer.custom_fields.isnot(None)
                ).limit(200).all()
                
                custom_keys = set()
                for row in sample_rows:
                    cf = row[0]
                    if not cf:
                        continue
                    try:
                        if isinstance(cf, str):
                            obj = json.loads(cf)
                        else:
                            obj = cf
                        if isinstance(obj, dict):
                            custom_keys.update(k for k in obj.keys() if isinstance(k, str))
                    except Exception:
                        continue
                
                for key in sorted(custom_keys):
                    result['custom_fields'].append({
                        'name': key,
                        'label': key.replace('_', ' ').title(),
                        'value': f"{{{{custom_fields.{key}}}}}",
                        'description': f'客户自定义字段: {key}',
                        'type': 'custom'
                    })
                    
                logger.info(f"Found {len(result['custom_fields'])} custom fields for user {current_user.id}")
            except Exception as e:
                logger.warning(f"Error fetching custom fields for user {current_user.id}: {e}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting detailed customer fields: {e}")
        return {'basic_fields': [], 'custom_fields': []}
