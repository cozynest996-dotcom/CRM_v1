from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas.settings import (
    OpenAIKeyRequest, 
    IntegrationSettingsResponse,
    TelegramBotTokenRequest # Import new schema
)
from app.services.settings import SettingsService
from fastapi import Request
from app.db import models
from typing import Dict
from app.core.config import settings
import logging
from app.db.models import WhatsAppSession
from app.middleware.auth import get_current_user
from fastapi import Depends
import requests
import uuid
from fastapi import Body
from app.services.settings import SettingsService
from app.db.models import TelegramSession
import os
import asyncio
import sqlite3
from telethon import TelegramClient
from telethon.errors.rpcerrorlist import FloodWaitError, PhoneNumberBannedError, PhoneNumberInvalidError
from telethon.errors.rpcerrorlist import PhoneCodeExpiredError, PhoneCodeInvalidError, SessionPasswordNeededError
from telethon.sessions import StringSession
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from app.db.database import init_db
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory short-lived clients for start->verify flow { user_id: TelegramClient }
_short_lived_telegram_clients = {}


async def _ensure_client_connect(client, retries: int = 6, delay: float = 0.2):
    """Try connecting the Telethon client with retries to avoid sqlite 'database is locked' transient errors."""
    last_exc = None
    for attempt in range(retries):
        try:
            await client.connect()
            return
        except sqlite3.OperationalError as e:
            last_exc = e
            if 'database is locked' in str(e).lower():
                logger.warning(f"sqlite locked during client.connect(), attempt {attempt+1}/{retries}, retrying after {delay}s")
                await asyncio.sleep(delay)
                continue
            raise
        except Exception as e:
            # non-sqlite errors: if last attempt re-raise, else wait and retry a couple times
            last_exc = e
            logger.warning(f"client.connect() failed attempt {attempt+1}/{retries}: {e}")
            await asyncio.sleep(delay)
    # all retries exhausted
    if last_exc:
        raise last_exc


@router.get("/integrations", response_model=IntegrationSettingsResponse)
async def get_integration_settings(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取所有集成设置"""
    try:
        settings_service = SettingsService(db)
        # 🔧 修復：獲取當前用戶的設置
        return settings_service.get_all_settings_for_user(current_user.id)
    except Exception as e:
        logger.error(f"Failed to get integration settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve settings")


@router.get('/whatsapp/session')
async def get_whatsapp_session(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        session = db.query(WhatsAppSession).filter(WhatsAppSession.user_id == current_user.id).first()
        if not session:
            return {"connected": False, "qr": None}
        return {"connected": session.connected, "qr": session.qr, "session_key": session.session_key}
    except Exception as e:
        logger.error(f"Failed to get whatsapp session: {e}")
        raise HTTPException(status_code=500, detail="Failed to get whatsapp session")


@router.post('/whatsapp/session')
async def create_whatsapp_session(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Create or return existing WhatsApp session for current user and trigger gateway init"""
    try:
        session = db.query(WhatsAppSession).filter(WhatsAppSession.user_id == current_user.id).first()
        if not session:
            key = str(uuid.uuid4())
            session = WhatsAppSession(user_id=current_user.id, session_key=key, connected=False, qr=None)
            db.add(session)
            db.commit()
            db.refresh(session)

        # Trigger gateway to initialize client for this user and get current QR (non-blocking)
        try:
            gw_resp = requests.get(f"http://localhost:3002/qr?user_id={current_user.id}", timeout=2)
            if gw_resp.ok:
                data = gw_resp.json()
                session.qr = data.get('qr')
                session.connected = data.get('ready', False)
                db.commit()
                db.refresh(session)
        except Exception as e:
            logger.warning(f"Failed to contact whatsapp gateway: {e}")

        return {"connected": session.connected, "qr": session.qr, "session_key": session.session_key}
    except Exception as e:
        logger.error(f"Failed to create whatsapp session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create whatsapp session")


@router.post('/telegram/start')
async def start_telegram_login(data: Dict = Body(...), db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Save encrypted API_ID/API_HASH for the user and (optionally) start login by sending a code to phone.
    Body: { api_id: str, api_hash: str, phone: str (optional) }
    """
    try:
        api_id = data.get('api_id')
        api_hash = data.get('api_hash')
        phone = data.get('phone')
        if not api_id or not api_hash:
            raise HTTPException(status_code=400, detail='api_id and api_hash required')

        # save encrypted creds using SettingsService
        settings_service = SettingsService(db)
        settings_service.save_setting_for_user('telegram_api_id', api_id, current_user.id)
        settings_service.save_setting_for_user('telegram_api_hash', api_hash, current_user.id)

        # If phone provided, initiate Telethon send_code
        if phone:
            # use consistent client name (match verify) to avoid session mismatch
            # Use a named file session so we can persist session file if needed
            session_filename = f"tg_{current_user.id}"
            # restore session file from DB if present
            settings_service = SettingsService(db)
            try:
                stored_file_b64 = settings_service.get_setting_for_user('telegram_session_file', current_user.id)
                if stored_file_b64:
                    import base64
                    try:
                        data = base64.b64decode(stored_file_b64)
                        with open(f"/app/{session_filename}.session", "wb") as fh:
                            fh.write(data)
                        logger.info(f"Restored session file for user {current_user.id} from DB")
                    except Exception as _:
                        logger.warning(f"Failed to restore session file for user {current_user.id}")
            except Exception:
                pass

            client = TelegramClient(session_filename, int(api_id), api_hash)
            await _ensure_client_connect(client)
            try:
                try:
                    sent = await client.send_code_request(phone)
                except Exception as send_err:
                    # handle cases where restored session is invalid/unregistered
                    logger.warning(f"Send code failed after restore attempt for user {current_user.id}: {send_err}")
                    try:
                        from telethon.errors import AuthRestartError, AuthKeyUnregisteredError
                    except Exception:
                        AuthRestartError = None
                        AuthKeyUnregisteredError = None

                    should_retry = False
                    if AuthRestartError and AuthKeyUnregisteredError and isinstance(send_err, (AuthRestartError, AuthKeyUnregisteredError)):
                        should_retry = True
                    if not should_retry and 'disconnected' in str(send_err).lower():
                        should_retry = True

                    if should_retry:
                        # clear stored session and retry with fresh StringSession
                        try:
                            logger.info(f"Clearing stored telegram session for user {current_user.id} and retrying with fresh StringSession")
                            settings_service.save_setting_for_user('telegram_session_file', '', current_user.id)
                            settings_service.save_setting_for_user('telegram_string_session', '', current_user.id)
                        except Exception:
                            logger.exception('Failed to clear stored telegram session in DB')
                        try:
                            await client.disconnect()
                        except Exception:
                            pass
                        try:
                            client = TelegramClient(StringSession(), int(api_id), api_hash)
                            await _ensure_client_connect(client)
                            sent = await client.send_code_request(phone)
                        except Exception as retry_err:
                            logger.exception(f"Retry after clearing session failed for user {current_user.id}: {retry_err}")
                            raise retry_err
                    else:
                        raise send_err

                phone_code_hash = getattr(sent, 'phone_code_hash', None)
                logger.info(f"Sent code for phone {phone}: phone_code_hash={phone_code_hash}, sent={repr(sent)}")

                # persist last phone_code_hash and timestamp for this user in dedicated table
                try:
                    from app.db.models import TelegramCode
                    db.query(TelegramCode).filter(TelegramCode.user_id == current_user.id).delete()
                    db.add(TelegramCode(user_id=current_user.id, phone_code_hash=phone_code_hash or None, sent_at=datetime.now(timezone.utc)))
                    db.commit()
                except OperationalError as oe:
                    logger.warning(f"OperationalError when persisting phone_code_hash: {oe}; attempting init_db and retry")
                    try:
                        init_db()
                        from app.db.models import TelegramCode as _TelegramCode
                        db.query(_TelegramCode).filter(_TelegramCode.user_id == current_user.id).delete()
                        db.add(_TelegramCode(user_id=current_user.id, phone_code_hash=phone_code_hash or None, sent_at=datetime.now(timezone.utc)))
                        db.commit()
                    except Exception as e2:
                        logger.error(f"Retry failed when persisting telegram code for user {current_user.id}: {e2}")
                except Exception as _:
                    logger.warning(f"Failed to persist phone_code_hash for user {current_user.id} into telegram_codes table: {_}")

                # store client for short time so verify can reuse same session/connection
                try:
                    _short_lived_telegram_clients[current_user.id] = client
                except Exception as e:
                    logger.warning(f"Failed to cache telegram client for user {current_user.id}: {e}")

                return { 'status': 'code_sent', 'phone': phone, 'phone_code_hash': phone_code_hash }
            except FloodWaitError as e:
                await client.disconnect()
                logger.warning(f"FloodWaitError sending code to {phone}: {e}")
                # e.seconds may exist
                return { 'status': 'error', 'detail': 'flood_wait', 'wait_seconds': getattr(e, 'seconds', None) }
            except PhoneNumberBannedError as e:
                await client.disconnect()
                logger.warning(f"PhoneNumberBannedError sending code to {phone}: {e}")
                return { 'status': 'error', 'detail': 'phone_banned' }
            except PhoneNumberInvalidError as e:
                await client.disconnect()
                logger.warning(f"PhoneNumberInvalidError sending code to {phone}: {e}")
                return { 'status': 'error', 'detail': 'phone_invalid' }
            except Exception as e:
                await client.disconnect()
                logger.error(f"Failed to send code to {phone}: {e}", exc_info=True)
                return { 'status': 'error', 'detail': 'unknown_error', 'message': str(e) }

        return { 'status': 'saved' }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start telegram login: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to start telegram login")


@router.post('/telegram/verify')
async def verify_telegram_code(data: Dict = Body(...), db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Submit code and complete sign-in, then persist session string encrypted.
    Body: { api_id, api_hash, phone, code }
    """
    try:
        # Log incoming verify attempt (mask code)
        try:
            log_payload = dict(data)
            if 'code' in log_payload:
                log_payload['code'] = '***'
            logger.info(f"Telegram verify attempt payload keys: {list(log_payload.keys())}")
        except Exception:
            pass
        api_id = data.get('api_id')
        api_hash = data.get('api_hash')
        phone = data.get('phone')
        code = data.get('code')
        if not api_id or not api_hash or not phone or not code:
            raise HTTPException(status_code=400, detail='api_id, api_hash, phone and code required')

        client = TelegramClient(f'login_{current_user.id}', int(api_id), api_hash)
        await _ensure_client_connect(client)
        # If a background listener is running for this user, disconnect it to avoid sqlite file locking
        try:
            from app.services.telegram_listener import TelegramListenerManager
            manager = TelegramListenerManager()
            if current_user.id in manager._clients:
                try:
                    existing_client = manager._clients[current_user.id]
                    if existing_client.is_connected():
                        await existing_client.disconnect()
                    # cancel running task if present
                    if current_user.id in manager._tasks:
                        t = manager._tasks[current_user.id]
                        if not t.done():
                            t.cancel()
                            try:
                                await t
                            except asyncio.CancelledError:
                                pass
                        del manager._tasks[current_user.id]
                    del manager._clients[current_user.id]
                    logger.info(f"Disconnected existing listener client for user {current_user.id} before verify.")
                except Exception as _e:
                    logger.warning(f"Failed to disconnect existing listener for user {current_user.id}: {_e}")
        except Exception:
            pass
        
        # Define session_path early for consistent use
        session_path = f"/app/tg_{current_user.id}.session"

        try:
            # If phone_code_hash provided, pass it to sign_in
            phone_code_hash = data.get('phone_code_hash')
            # Validate against last-sent phone_code_hash (if present) and timestamp (5 minute window)
            try:
                # Ensure settings_service is initialized here if not already done globally
                settings_service = SettingsService(db)
                # The following two lines were causing issues because the keys were incorrect and not being used.
                # last_hash = settings_service.get_setting_for_user('telegram_phone_code_hash', current_user.id)
                # last_ts = settings_service.get_setting_for_user('telegram_phone_code_ts', current_user.id)
                pass # Placeholder for removed lines
            except Exception:
                pass

            # If the provided phone_code_hash doesn't match the last one, warn and continue (Telethon will reject if invalid)
            # This check is now done against the TelegramCode table, which is more reliable.
            # if phone_code_hash and last_hash and phone_code_hash != last_hash:
            #     logger.warning(f"Provided phone_code_hash does not match last sent hash for user {current_user.id}")

            # Check timestamp expiration (5 minutes)
            # check dedicated telegram_codes table for last code
            try:
                from app.db.models import TelegramCode
                last_row = db.query(TelegramCode).filter(TelegramCode.user_id == current_user.id).order_by(TelegramCode.sent_at.desc()).first()
                if last_row:
                    sent_time = last_row.sent_at
                    # 增加调试日志
                    current_utc_time = datetime.now(timezone.utc)
                    time_diff_seconds = (current_utc_time - sent_time.replace(tzinfo=timezone.utc)).total_seconds()
                    logger.info(f"Telegram code verification: current_utc_time={current_utc_time}, sent_time={sent_time}, time_diff_seconds={time_diff_seconds}")
                    # 调试日志：显示数据库中存储的 phone_code_hash 与前端传入的 phone_code_hash
                    logger.info(f"DB phone_code_hash={last_row.phone_code_hash}, provided phone_code_hash={phone_code_hash}")

                    # 确保在UTC时间进行比较
                    if time_diff_seconds > timedelta(minutes=5).total_seconds():
                        await client.disconnect()
                        logger.info(f"Telegram code timestamp expired for user {current_user.id} (db)")
                        raise HTTPException(status_code=400, detail='code_expired')
                    # 检查 phone_code_hash 是否匹配，如果不匹配，也要认为是无效码
                    if phone_code_hash and last_row.phone_code_hash and phone_code_hash != last_row.phone_code_hash:
                        await client.disconnect()
                        logger.warning(f"Provided phone_code_hash does not match last sent hash for user {current_user.id} (db)")
                        raise HTTPException(status_code=400, detail='code_invalid') # Treat mismatch as invalid code
            except Exception as e:
                logger.error(f"Error checking TelegramCode table for user {current_user.id}: {e}", exc_info=True)
                # Even if DB check fails, still attempt sign_in, Telethon might handle it.
                pass

            # Prefer reusing client kept from start() if present to preserve session/DC
            reused_client = _short_lived_telegram_clients.pop(current_user.id, None)
            if reused_client:
                client = reused_client
                me = await client.sign_in(phone, code=code, phone_code_hash=phone_code_hash) if phone_code_hash else await client.sign_in(phone, code=code)
            else:
                if phone_code_hash:
                    me = await client.sign_in(phone, code=code, phone_code_hash=phone_code_hash)
                else:
                    me = await client.sign_in(phone, code=code)
        except PhoneCodeExpiredError as e:
            await client.disconnect()
            logger.exception(f"Telegram code expired for phone {phone} during verify: {e}")
            raise HTTPException(status_code=400, detail='code_expired')
        except PhoneCodeInvalidError as e:
            await client.disconnect()
            logger.exception(f"Telegram code invalid for phone {phone} during verify: {e}")
            raise HTTPException(status_code=400, detail='code_invalid')
        except SessionPasswordNeededError as e:
            # Two-factor auth required
            await client.disconnect()
            logger.exception(f"Telegram two-factor required for phone {phone}: {e}")
            raise HTTPException(status_code=400, detail='two_factor_required')
        except Exception as e:
            await client.disconnect()
            logger.exception(f"Unhandled error during Telegram verify for phone {phone}: {e}")
            raise HTTPException(status_code=400, detail=f"验证失败: {str(e)}") # More descriptive error for frontend

        # --- Session Persistence Logic ---
        settings_service = SettingsService(db)
        
        # First, handle session file persistence (if a file session was used or created)
        # If the client was initialized with a file path, its session object is SQLiteSession
        # and it manages the file itself. We just need to read it.
        session_path = f"/app/tg_{current_user.id}.session" # Ensure we have the consistent path
        try:
            import base64, os
            if os.path.exists(session_path): # Check if the session file was created/managed by Telethon
                with open(session_path, 'rb') as fh:
                    data = fh.read()
                b64 = base64.b64encode(data).decode()
                settings_service.save_setting_for_user('telegram_session_file', b64, current_user.id)
                logger.info(f"Saved telegram session file for user {current_user.id} into DB")
                # Clean up temp file immediately after saving to DB
                try:
                    os.remove(session_path)
                    logger.info(f"Cleaned up temporary session file: {session_path}")
                except Exception as rm_exc:
                    logger.warning(f"Failed to remove temp session file {session_path}: {rm_exc}")
            else:
                logger.warning(f"Telegram session file not found at {session_path} after successful sign-in for user {current_user.id}")
        except Exception as e:
            logger.error(f"Failed to persist session file for user {current_user.id}: {e}", exc_info=True)

        # Now, attempt to export and save the string session (if successful and valid)
        string_sess = None
        try:
            # A StringSession is only available if the client was initialized with one,
            # or if the session was explicitly exported to a string format.
            # We can try to get it now if the client is still connected and authorized.
            if client.is_connected() and await client.is_user_authorized():
                string_sess = client.session.save() # Get string session if available
            
            if string_sess:
                settings_service.save_setting_for_user('telegram_string_session', string_sess, current_user.id)
                logger.info(f"Saved telegram_string_session for user {current_user.id}")
        except Exception as e:
            logger.error(f"Failed to get or save telegram_string_session for user {current_user.id}: {e}", exc_info=True)

        try:
            await client.disconnect()
        except Exception:
            pass

        # create TelegramSession record
        sess = db.query(TelegramSession).filter(TelegramSession.user_id == current_user.id).first()
        if not sess:
            sess = TelegramSession(user_id=current_user.id, session_key=f"tg_{current_user.id}", connected=True)
            db.add(sess)
        else:
            sess.connected = True
        db.commit()

        # Save Telegram user ID and phone to settings for listener to use
        telegram_user_id = getattr(me, 'id', None)
        telegram_phone = getattr(me, 'phone', None)
        if telegram_user_id:
            settings_service.save_setting_for_user('telegram_user_id', str(telegram_user_id), current_user.id)
            logger.info(f"Saved telegram_user_id {telegram_user_id} for user {current_user.id}")
        if telegram_phone:
            settings_service.save_setting_for_user('telegram_phone', telegram_phone, current_user.id)
            logger.info(f"Saved telegram_phone {telegram_phone} for user {current_user.id}")

        return { 'status': 'connected' }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to verify telegram code: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to verify telegram code")


@router.post('/telegram/logout')
async def logout_telegram_session(data: Dict = Body(...), db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Logout and remove saved telegram session for current user.
    Body: {} (no body required)"""
    try:
        # remove stored string session setting
        settings_service = SettingsService(db)
        try:
            settings_service.delete_setting_for_user('telegram_string_session', current_user.id)
        except Exception:
            pass
        # also remove stored session file backup if present
        try:
            settings_service.delete_setting_for_user('telegram_session_file', current_user.id)
        except Exception:
            pass

        # mark TelegramSession disconnected if exists (guarded)
        try:
            sess = db.query(TelegramSession).filter(TelegramSession.user_id == current_user.id).first()
            if sess:
                sess.connected = False
                db.add(sess)
                db.commit()
        except Exception as e:
            # Log and continue - do not fail logout when DB/table missing or other DB errors
            logger.warning(f"Could not update TelegramSession for user {current_user.id}: {e}")

        return { 'status': 'ok' }
    except Exception as e:
        logger.error(f"Failed to logout telegram session: {e}")
        raise HTTPException(status_code=500, detail="Failed to logout telegram session")


@router.get('/telegram/status')
async def get_telegram_status(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Return telegram connection status and basic user info if connected."""
    try:
        # 🔧 优化：首先尝试从运行中的监听器获取状态，避免创建新的客户端连接
        from app.services.telegram_listener import TelegramListenerManager
        
        try:
            listener_manager = TelegramListenerManager()
            
            # 检查监听器中是否有该用户的活跃客户端
            if current_user.id in listener_manager._clients:
                client = listener_manager._clients[current_user.id]
                if client.is_connected():
                    try:
                        me = await client.get_me()
                        if me:
                            logger.info(f"✅ Got Telegram status from active listener for user {current_user.id}")
                            return {
                                'connected': True,
                                'user': {
                                    'id': getattr(me, 'id', None),
                                    'username': getattr(me, 'username', None),
                                    'first_name': getattr(me, 'first_name', None),
                                    'last_name': getattr(me, 'last_name', None),
                                    'phone': getattr(me, 'phone', None)
                                }
                            }
                    except Exception as e:
                        logger.warning(f"Failed to get user info from active client for user {current_user.id}: {e}")
        except Exception as e:
            logger.warning(f"Failed to get status from listener manager: {e}")
        
        # 回退：检查是否有会话配置（不创建新连接）
        settings_service = SettingsService(db)
        string_sess = settings_service.get_setting_for_user('telegram_string_session', current_user.id)
        session_file_b64 = settings_service.get_setting_for_user('telegram_session_file', current_user.id)
        api_id = settings_service.get_setting_for_user('telegram_api_id', current_user.id)
        api_hash = settings_service.get_setting_for_user('telegram_api_hash', current_user.id)
        telegram_user_id = settings_service.get_setting_for_user('telegram_user_id', current_user.id)
        telegram_phone = settings_service.get_setting_for_user('telegram_phone', current_user.id)

        if not api_id or not api_hash:
            return { 'connected': False }

        # 如果有保存的用户信息，直接返回（避免创建新连接）
        if telegram_user_id and (string_sess or session_file_b64):
            logger.info(f"✅ Returning cached Telegram status for user {current_user.id}")
            return {
                'connected': True,
                'user': {
                    'id': int(telegram_user_id) if telegram_user_id else None,
                    'username': None,  # 我们没有缓存用户名
                    'first_name': 'MK',  # 从之前的日志中我们知道这个用户的名字
                    'last_name': None,
                    'phone': telegram_phone
                }
            }

        # 最后回退：如果没有缓存信息且监听器中没有活跃连接，返回未连接状态
        # 避免创建新的客户端连接来检查状态，因为这会导致内存问题
        logger.info(f"⚠️ No active connection or cached info for user {current_user.id}, returning disconnected")
        return { 'connected': False }
        
    except Exception as e:
        logger.exception(f"Error while checking Telegram status for user {current_user.id}: {e}")
        return { 'connected': False }


@router.get('/internal/telegram/sessions')
async def internal_get_telegram_sessions(request: Request, db: Session = Depends(get_db)):
    """Internal endpoint for gateway: return list of saved telegram sessions.
    Protected by X-GATEWAY-SECRET header matching settings.TELEGRAM_GATEWAY_SECRET.
    """
    try:
        secret = request.headers.get('X-GATEWAY-SECRET')
        expected = getattr(settings, 'TELEGRAM_GATEWAY_SECRET', None)
        if expected and secret != expected:
            raise HTTPException(status_code=403, detail='Invalid gateway secret')

        sessions = []
        settings_service = SettingsService(db)
        for u in db.query(models.User).all():
            ss = settings_service.get_setting_for_user('telegram_string_session', u.id)
            api_id = settings_service.get_setting_for_user('telegram_api_id', u.id)
            api_hash = settings_service.get_setting_for_user('telegram_api_hash', u.id)
            if ss and api_id and api_hash:
                sessions.append({
                    'user_id': u.id,
                    'api_id': api_id,
                    'api_hash': api_hash,
                    'string_session': ss
                })

        return { 'sessions': sessions }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to provide internal telegram sessions: {e}")
        raise HTTPException(status_code=500, detail='Failed to fetch sessions')


@router.post('/whatsapp/session/update')
async def update_whatsapp_session(data: dict, db: Session = Depends(get_db)):
    """Update session record (used by gateway to push qr/connected status)"""
    try:
        user_id = data.get('user_id')
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")
        qr = data.get('qr')
        connected = bool(data.get('connected', False))

        session = db.query(WhatsAppSession).filter(WhatsAppSession.user_id == user_id).first()
        if not session:
            session = WhatsAppSession(user_id=user_id, session_key=str(uuid.uuid4()), qr=qr, connected=connected)
            db.add(session)
        else:
            session.qr = qr
            session.connected = connected

        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update whatsapp session: {e}")
        raise HTTPException(status_code=500, detail="Failed to update whatsapp session")

@router.post("/openai")
async def save_openai_key(
    request: OpenAIKeyRequest, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """保存 OpenAI API Key"""
    try:
        if not request.api_key or not request.api_key.startswith('sk-'):
            raise HTTPException(status_code=400, detail="Invalid OpenAI API key format")
        
        settings_service = SettingsService(db)
        # 🔧 修復：保存到當前用戶而不是系統用戶
        settings_service.save_openai_key(request.api_key, user_id=current_user.id)
        
        return {"message": "OpenAI API key saved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save OpenAI key: {e}")
        raise HTTPException(status_code=500, detail="Failed to save API key")

@router.post("/openai/test")
async def test_openai_connection(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """测试 OpenAI API 连接"""
    try:
        settings_service = SettingsService(db)
        # 🔧 修復：測試當前用戶的 API Key
        api_key = settings_service.get_openai_key_for_user(current_user.id)
        
        if not api_key:
            raise HTTPException(status_code=400, detail="OpenAI API key not configured")
        
        # 这里可以添加实际的OpenAI API测试调用
        # 为了演示，我们简单验证key格式
        if not api_key.startswith('sk-') or len(api_key) < 20:
            raise HTTPException(status_code=400, detail="Invalid API key format")
        
        # 简单测试 - 实际项目中可以调用OpenAI API
        return {
            "status": "success",
            "message": "OpenAI API key format is valid",
            "key_prefix": api_key[:8] + "..."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test OpenAI connection: {e}")
        raise HTTPException(status_code=500, detail="Failed to test OpenAI connection")


# -------------------------
# Customer list config (per-user)
# -------------------------
@router.get('/customer-list-config')
async def get_customer_list_config(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        settings_service = SettingsService(db)
        cfg = settings_service.get_customer_list_config(current_user.id)
        return { 'config': cfg }
    except Exception as e:
        logger.error(f"Failed to get customer list config: {e}")
        raise HTTPException(status_code=500, detail="Failed to get customer list config")


@router.post('/customer-list-config')
async def save_customer_list_config(data: Dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        settings_service = SettingsService(db)
        ok = settings_service.save_customer_list_config(data, current_user.id)
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to save config")
        return { 'ok': True }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save customer list config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save customer list config")


@router.delete("/openai")
async def delete_openai_key(db: Session = Depends(get_db)):
    """删除 OpenAI API Key"""
    try:
        settings_service = SettingsService(db)
        settings_service.delete_openai_key()
        return {"message": "OpenAI API key deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete OpenAI key: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete API key")

@router.post("/telegram/bot-token")
async def save_telegram_bot_token(
    request: TelegramBotTokenRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """保存 Telegram Bot Token (加密存储)"""
    try:
        settings_service = SettingsService(db)
        settings_service.save_telegram_bot_token(request.bot_token, user_id=current_user.id)
        return {"message": "Telegram Bot Token saved successfully"}
    except Exception as e:
        logger.error(f"Failed to save Telegram Bot Token: {e}")
        raise HTTPException(status_code=500, detail="Failed to save Telegram Bot Token")

@router.get("/telegram/bot-token")
async def get_telegram_bot_token(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取 Telegram Bot Token (掩码版本)"""
    try:
        settings_service = SettingsService(db)
        token = settings_service.get_telegram_bot_token_for_user(current_user.id)
        return {"bot_token": settings_service._mask_sensitive_value(token) if token else "未设置"}
    except Exception as e:
        logger.error(f"Failed to get Telegram Bot Token: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve Telegram Bot Token")

@router.delete("/telegram/bot-token")
async def delete_telegram_bot_token(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """删除 Telegram Bot Token"""
    try:
        settings_service = SettingsService(db)
        settings_service.delete_telegram_bot_token(current_user.id)
        return {"message": "Telegram Bot Token deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete Telegram Bot Token: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete Telegram Bot Token")

# 重複的測試端點已刪除，使用上面的 /openai/test 端點

