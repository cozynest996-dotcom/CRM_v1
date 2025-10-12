from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
import json

from app.db.database import SessionLocal
from app.db import models
from app.schemas.customer import CustomerBase, CustomerOut
from app.middleware.auth import get_current_user, get_optional_user
from app.services.settings import SettingsService

router = APIRouter(prefix="/customers", tags=["customers"])

def get_db():
    db = SessionLocal()
    try:
        yield db
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
@router.get("/")
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
def patch_customer(
    customer_id: str,
    updates: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """部分更新客户：仅允许白名单字段更新"""
    allowed = {'name', 'phone', 'email', 'status', 'custom_fields', 'stage_id'}
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id, models.Customer.user_id == current_user.id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')

    changed = False
    for k, v in updates.items():
        if k not in allowed:
            continue

        # stage_id 校验
        if k == 'stage_id':
            if v is None:
                setattr(customer, 'stage_id', None)
                changed = True
                continue
            stage = db.query(models.CustomerStage).filter(models.CustomerStage.id == v, models.CustomerStage.user_id == current_user.id).first()
            if not stage:
                raise HTTPException(status_code=400, detail='Invalid stage_id')
            setattr(customer, 'stage_id', v)
            changed = True
            continue

        # custom_fields 合并
        if hasattr(customer, k):
            if k == 'custom_fields' and isinstance(v, dict) and isinstance(customer.custom_fields, dict):
                merged = {**customer.custom_fields, **v}
                setattr(customer, 'custom_fields', merged)
            else:
                setattr(customer, k, v)
            changed = True

    if changed:
        db.commit()
        db.refresh(customer)

    return {
        'status': 'ok',
        'customer': {
            'id': customer.id,
            'name': customer.name,
            'phone': customer.phone,
            'email': customer.email,
            'status': customer.status,
            'stage_id': customer.stage_id,
            'custom_fields': customer.custom_fields
        }
    }


@router.get('/summary')
def list_customer_summaries(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """简要客户摘要：最后一条消息、未读数"""
    customers = db.query(models.Customer).filter(models.Customer.user_id == current_user.id).all()
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
            'photo_url': c.photo_url,
            'status': c.status,
            'last_message': last.content if last and hasattr(last, 'content') else None,
            'last_timestamp': last.timestamp.isoformat() if last and last.timestamp else None,
            'unread_count': c.unread_count or 0,
        })
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
def get_customer(customer_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
