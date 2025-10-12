from fastapi import APIRouter, HTTPException, Depends
import traceback
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.middleware.auth import get_current_user
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
from app.services import telegram as telegram_service
from app.schemas.message import MessageCreate, MessageOut
from app.db import models
from typing import Dict

router = APIRouter(prefix="/telegram", tags=["telegram"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post('/send', response_model=Dict)
def send_telegram(msg: Dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Send a Telegram message via the gateway. msg: {chat_id, text, customer_id?}
    We persist an outbound message in the DB if customer_id provided and belongs to current user.
    """
    chat_id = msg.get('chat_id')
    text = msg.get('text')
    customer_id = msg.get('customer_id')

    if not chat_id or not text:
        raise HTTPException(status_code=400, detail='chat_id and text required')

    backend_message_id = None
    if customer_id:
        # validate ownership
        customer = db.query(models.Customer).filter(models.Customer.id == customer_id, models.Customer.user_id == current_user.id).first()
        if not customer:
            raise HTTPException(status_code=404, detail='Customer not found or access denied')
        # create outbound DB message
        db_msg = models.Message(customer_id=customer.id, user_id=current_user.id, content=text, direction='outbound')
        db.add(db_msg)
        db.commit()
        db.refresh(db_msg)
        backend_message_id = db_msg.id

    result = telegram_service.send_telegram_message_payload(chat_id, text, backend_message_id)
    return {"status": result.get('status'), "gateway": result}


@router.post('/webhook')
def telegram_webhook(payload: Dict, db: Session = Depends(get_db)):
    """Receive incoming Telegram webhook from the local gateway. Expected payload contains:
    { chat_id, text, from_id, message_id }
    We create inbound messages and trigger workflows similar to WhatsApp inbox.
    """
    try:
        # Log incoming webhook payload (truncated for safety)
        try:
            logger.info(f"Incoming telegram webhook payload keys: {list(payload.keys())}")
        except Exception:
            pass

        # Optional gateway secret verification
        gateway_secret = payload.get('gateway_secret')
        expected = getattr(settings, 'TELEGRAM_GATEWAY_SECRET', None)
        if expected:
            if not gateway_secret or gateway_secret != expected:
                logger.warning('Invalid gateway secret on telegram webhook')
                raise HTTPException(status_code=403, detail='Invalid gateway secret')

        chat_id = payload.get('chat_id')
        text = payload.get('text')
        from_id = payload.get('from_id')

        if not chat_id or text is None:
            raise HTTPException(status_code=400, detail='chat_id and text required')

        # Try to find customer by JSON field safely; some DB backends may not support JSON path queries
        customer = None
        try:
            customer = db.query(models.Customer).filter(models.Customer.custom_fields['telegram_chat_id'].astext == str(chat_id)).first()
        except Exception:
            # Fallback: scan customers in Python (safer albeit less efficient)
            for c in db.query(models.Customer).all():
                try:
                    cf = c.custom_fields or {}
                    if str(cf.get('telegram_chat_id')) == str(chat_id):
                        customer = c
                        break
                except Exception:
                    continue

        if not customer:
            # create a generic customer associated with fallback admin user
            admin_user = db.query(models.User).filter(models.User.email == 'admin@example.com').first()
            owner_user_id = admin_user.id if admin_user else 1
            customer = models.Customer(name=str(from_id), phone=str(from_id), user_id=owner_user_id)
            db.add(customer)
            db.commit()
            db.refresh(customer)

        # persist inbound message
        db_msg = models.Message(customer_id=customer.id, user_id=customer.user_id, content=text, direction='inbound')
        db.add(db_msg)
        db.commit()
        db.refresh(db_msg)

        # Trigger workflows for the owner
        from app.services.workflow_engine import WorkflowEngine
        workflow_engine = WorkflowEngine(db)
        trigger_data = {
            'trigger_type': 'message',
            'channel': 'telegram',
            'chat_id': chat_id,
            'from_id': from_id,
            'message': text,
            'user_id': customer.user_id
        }
        workflows = db.query(models.Workflow).filter(models.Workflow.is_active == True, models.Workflow.user_id == customer.user_id).all()
        for wf in workflows:
            try:
                # fire and forget
                import asyncio
                asyncio.create_task(workflow_engine.execute_workflow(wf.id, trigger_data))
            except Exception:
                pass

        return {"status": "ok", "message_id": db_msg.id}
    except Exception as exc:
        print("❌ Error in /api/telegram/webhook:")
        traceback.print_exc()
        # Return a clear error for debugging; in production you may want to hide details
        raise HTTPException(status_code=500, detail=str(exc))


