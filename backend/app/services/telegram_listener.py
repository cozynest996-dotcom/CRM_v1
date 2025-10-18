
import asyncio
import logging
import base64
import os
import time
import tempfile
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from telethon.sync import TelegramClient, events
from telethon.tl.custom.message import Message
from telethon.sessions import StringSession
from telethon.errors.rpcerrorlist import AuthKeyUnregisteredError, AuthRestartError, PeerIdInvalidError, FloodWaitError

from app.core.config import settings
from app.db.database import SessionLocal
from app.db import models
from app.services.auth import AuthService

logger = logging.getLogger(__name__)

class TelegramListenerManager:
    """
    管理所有用户已登录的 Telegram 个人账号，并监听传入消息。
    每个用户一个 TelegramClient 实例，运行在独立的 asyncio 任务中。
    """
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(TelegramListenerManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._initialized = True
            self._clients: Dict[int, TelegramClient] = {}
            self._tasks: Dict[int, asyncio.Task] = {}
            self._health_monitors: Dict[int, asyncio.Task] = {}  # 健康监控任务
            self._connection_attempts: Dict[int, int] = {}  # 连接尝试计数
            self._last_activity: Dict[int, datetime] = {}  # 最后活动时间
            # self.api_id = settings.TELEGRAM_API_ID # Removed, now fetched per user
            # self.api_hash = settings.TELEGRAM_API_HASH # Removed, now fetched per user
            self.webhook_url = f"http://localhost:{settings.BACKEND_PORT}/api/messages/inbox" # Will be updated to match the actual inbox URL
            self.max_reconnect_attempts = 5  # 最大重连尝试次数
            self.health_check_interval = 300  # 健康检查间隔（秒）
            logger.info(f"TelegramListenerManager initialized with webhook URL: {self.webhook_url}")

    async def _ensure_client_connect(self, client: TelegramClient, retries: int = 5, delay: int = 2):
        """确保 Telethon 客户端连接，带重试机制"""
        for attempt in range(retries):
            try:
                if not client.is_connected():
                    await client.connect()
                    user_info = client.session.get_update_info().user_id if client.session and client.session.get_update_info() else 'unknown'
                    logger.info(f"Client {user_info} connected successfully (attempt {attempt + 1})")
                return True
            except Exception as e:
                user_info = client.session.get_update_info().user_id if client.session and client.session.get_update_info() else 'unknown'
                logger.warning(f"Client {user_info} failed to connect (attempt {attempt + 1}): {e}")
                if attempt < retries - 1:
                    await asyncio.sleep(delay)
        user_info = client.session.get_update_info().user_id if client.session and client.session.get_update_info() else 'unknown'
        logger.error(f"Client {user_info} failed to connect after {retries} attempts.")
        return False

    async def _monitor_connection_health(self, user_id: int):
        """监控用户连接健康状态并在需要时重连"""
        while user_id in self._clients:
            try:
                await asyncio.sleep(self.health_check_interval)
                
                client = self._clients.get(user_id)
                if not client:
                    logger.warning(f"Client for user {user_id} no longer exists, stopping health monitor")
                    break
                
                # 检查连接状态
                if not client.is_connected():
                    logger.warning(f"User {user_id} client is disconnected, attempting reconnection")
                    await self._attempt_reconnection(user_id)
                    continue
                
                # 检查最后活动时间
                last_activity = self._last_activity.get(user_id)
                if last_activity:
                    inactive_duration = (datetime.now() - last_activity).total_seconds()
                    if inactive_duration > self.health_check_interval * 3:  # 3倍检查间隔无活动
                        logger.info(f"User {user_id} has been inactive for {inactive_duration:.0f}s, performing ping test")
                        try:
                            # 执行简单的 ping 测试
                            await client.get_me()
                            self._last_activity[user_id] = datetime.now()
                            logger.debug(f"Ping test successful for user {user_id}")
                        except Exception as e:
                            logger.warning(f"Ping test failed for user {user_id}: {e}")
                            await self._attempt_reconnection(user_id)
                
            except asyncio.CancelledError:
                logger.info(f"Health monitor for user {user_id} was cancelled")
                break
            except Exception as e:
                logger.error(f"Error in health monitor for user {user_id}: {e}")
                await asyncio.sleep(60)  # 等待1分钟后继续监控

    async def _attempt_reconnection(self, user_id: int):
        """尝试重新连接用户的 Telegram 客户端"""
        attempts = self._connection_attempts.get(user_id, 0)
        if attempts >= self.max_reconnect_attempts:
            logger.error(f"Max reconnection attempts ({self.max_reconnect_attempts}) reached for user {user_id}")
            await self._clear_user_telegram_session(user_id)
            return False
        
        self._connection_attempts[user_id] = attempts + 1
        logger.info(f"Attempting reconnection for user {user_id} (attempt {attempts + 1}/{self.max_reconnect_attempts})")
        
        try:
            client = self._clients.get(user_id)
            if client:
                if client.is_connected():
                    await client.disconnect()
                
                # 等待一段时间后重连
                backoff_time = min(2 ** attempts, 60)  # 指数退避，最大60秒
                await asyncio.sleep(backoff_time)
                
                # 尝试重新连接
                await self._ensure_client_connect(client, retries=3, delay=2)
                
                if client.is_connected():
                    logger.info(f"Successfully reconnected user {user_id}")
                    self._connection_attempts[user_id] = 0  # 重置计数
                    self._last_activity[user_id] = datetime.now()
                    return True
                else:
                    logger.warning(f"Failed to reconnect user {user_id}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error during reconnection attempt for user {user_id}: {e}")
            return False

    async def _start_listening_for_user(self, user_id: int, session_param: Any, api_id: int, api_hash: str, temp_file_path: str = None):
        """为特定用户启动 Telethon 客户端和消息监听任务"""
        client = None
        try:
            logger.info(f"Attempting to start listener for user_id: {user_id} with API ID: {api_id}")

            # 使用更安全的连接逻辑，先验证会话文件
            try:
                # 如果是文件路径，先验证文件是否为有效的 SQLite 数据库
                if isinstance(session_param, str):
                    logger.info(f"User {user_id}: Validating session file: {session_param}")
                    
                    # 简单验证：检查文件是否存在且不为空
                    if not os.path.exists(session_param):
                        logger.error(f"User {user_id}: Session file does not exist: {session_param}")
                        await self._clear_user_telegram_session(user_id)
                        return
                    
                    # 检查文件大小
                    file_size = os.path.getsize(session_param)
                    if file_size < 100:  # SQLite 文件至少应该有几百字节
                        logger.error(f"User {user_id}: Session file too small ({file_size} bytes): {session_param}")
                        await self._clear_user_telegram_session(user_id)
                        return
                    
                    # 尝试用 sqlite3 打开文件验证其有效性
                    import sqlite3
                    try:
                        conn = sqlite3.connect(session_param)
                        cursor = conn.cursor()
                        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                        tables = cursor.fetchall()
                        conn.close()
                        
                        if not tables:
                            logger.error(f"User {user_id}: Session file has no tables: {session_param}")
                            await self._clear_user_telegram_session(user_id)
                            return
                        
                        logger.info(f"User {user_id}: Session file validation passed ({file_size} bytes, {len(tables)} tables)")
                        
                    except sqlite3.DatabaseError as db_e:
                        logger.error(f"User {user_id}: Session file is not a valid SQLite database: {db_e}")
                        await self._clear_user_telegram_session(user_id)
                        return
                
                # 现在安全地创建 TelegramClient
                logger.info(f"User {user_id}: Creating TelegramClient...")
                client = TelegramClient(session_param, api_id, api_hash)
                
                logger.info(f"User {user_id}: Connecting to Telegram...")
                await client.connect()

                is_authorized = await client.is_user_authorized()
                logger.info(f"User {user_id} client.is_user_authorized() returned: {is_authorized}")

                if not is_authorized:
                    logger.warning(f"User {user_id} session is not authorized, clearing session.")
                    await self._clear_user_telegram_session(user_id)
                    return

                # 获取用户信息
                me = await client.get_me()
                logger.info(f"User {user_id}: Successfully connected as {me.first_name} (@{me.username or 'no username'})")

            except Exception as e:
                logger.error(f"User {user_id}: Connection failed: {type(e).__name__}: {e}. Clearing session.")
                await self._clear_user_telegram_session(user_id)
                return

            if client is None or not client.is_connected():
                logger.error(f"Client for user {user_id} is not connected after session restore attempt. Aborting listener.")
                return

            # 确保 client 已经连接并获取到自身信息
            me = await client.get_me()
            if not me:
                logger.error(f"Could not get_me() for user {user_id}. Session likely invalid. Clearing session.")
                await self._clear_user_telegram_session(user_id)
                return

            # 存储活动客户端
            self._clients[user_id] = client
            self._last_activity[user_id] = datetime.now()
            self._connection_attempts[user_id] = 0  # 重置连接尝试计数
            
            # 启动健康监控任务
            health_monitor_task = asyncio.create_task(self._monitor_connection_health(user_id))
            self._health_monitors[user_id] = health_monitor_task
            
            logger.info(f"Client for user {user_id} ({me.first_name}) successfully initialized with health monitoring.")
            logger.info(f"Total active clients now: {len(self._clients)}")
            logger.info(f"Total active tasks now: {len(self._tasks)}")

            @client.on(events.NewMessage(incoming=True, outgoing=True))
            async def handler(event: events.NewMessage.Event):
                try:
                    msg = event.message
                    # Safely extract text content
                    content = ''
                    if hasattr(msg, 'message') and msg.message is not None:
                        content = msg.message
                    elif hasattr(msg, 'raw_text') and msg.raw_text is not None:
                        content = msg.raw_text

                    sender = await msg.get_sender() if getattr(msg, 'sender_id', None) else None
                    sender_name = getattr(sender, 'first_name', None) or getattr(sender, 'title', None) or str(getattr(msg, 'sender_id', 'unknown'))
                    chat_id = getattr(msg, 'chat_id', None)
                    from_id = getattr(msg, 'sender_id', None)

                    # Print to terminal for immediate visibility (helpful during debugging)
                    print(f"📥 [TelegramListener] User {user_id} received message from {sender_name} (chat_id: {chat_id}, from_id: {from_id}): {content}")

                    # Also log at INFO and DEBUG levels
                    logger.info(f"📥 User {user_id} received Telegram message from {sender_name} (chat_id: {chat_id}, from_id: {from_id}): {content}")
                    try:
                        logger.debug(f"Full message object for user {user_id}: {msg.to_dict()}")
                    except Exception:
                        logger.debug(f"Full message repr for user {user_id}: {repr(msg)}")

                    # Forward to the existing handler which will POST to /api/messages/inbox
                    await self._handle_new_message(user_id, msg)
                except Exception as e:
                    logger.error(f"Error in NewMessage handler for user {user_id}: {e}", exc_info=True)

            logger.info(f"Starting run_until_disconnected for user {user_id}...")
            await client.run_until_disconnected() # 保持客户端连接并监听消息
            logger.info(f"run_until_disconnected completed for user {user_id}")

        except FloodWaitError as e:
            logger.warning(f"Telethon FloodWaitError for user {user_id}: waiting for {e.seconds} seconds.")
            await asyncio.sleep(e.seconds)
            asyncio.create_task(self._start_listening_for_user(user_id, session_param, api_id, api_hash)) # 重启监听
        except Exception as e:
            logger.error(f"Error in Telegram listener for user {user_id}: {e}")
            if client and client.is_connected():
                await client.disconnect()
            await self._clear_user_telegram_session(user_id)
        finally:
            # Clean up temporary session file if it was created
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                    logger.info(f"Cleaned up temporary session file {temp_file_path} for user {user_id}.")
                except Exception as cleanup_exc:
                    logger.warning(f"Failed to clean up temp session file {temp_file_path} for user {user_id}: {cleanup_exc}")
            
            if user_id in self._clients:
                del self._clients[user_id]
            if user_id in self._tasks:
                del self._tasks[user_id]
            if user_id in self._health_monitors:
                if not self._health_monitors[user_id].done():
                    self._health_monitors[user_id].cancel()
                del self._health_monitors[user_id]
            if user_id in self._connection_attempts:
                del self._connection_attempts[user_id]
            if user_id in self._last_activity:
                del self._last_activity[user_id]
            logger.info(f"Listener for user {user_id} stopped.")

    async def _handle_new_message(self, user_id: int, message: Message):
        """处理 Telethon 接收到的新消息"""
        # 更新最后活动时间
        self._last_activity[user_id] = datetime.now()
        
        if message.sender_id is None: # 排除没有 sender_id 的消息 (例如频道消息，除非有配置) 
            logger.debug(f"Skipping message with no sender_id from chat {message.chat_id} for user {user_id}")
            return

        try:
            sender = await message.get_sender()
            sender_name = getattr(sender, 'first_name', None) or getattr(sender, 'title', None) or str(message.sender_id)
            chat_id = message.chat_id # 这是与消息发送者聊天的 ID
            from_id = message.sender_id # 消息发送者的 Telegram User ID
            content = message.message
            phone = getattr(sender, 'phone', None) # 尝试获取发送者电话号码
            
            logger.info(f"📥 User {user_id} received Telegram message from {sender_name} (chat_id: {chat_id}, from_id: {from_id}): {content}")
            # Also log full message object for deeper debugging at DEBUG level
            try:
                logger.debug(f"Full message object for user {user_id}: {message.to_dict()}")
            except Exception:
                logger.debug(f"Full message repr for user {user_id}: {repr(message)}")

            # 获取聊天历史（最近5条消息）
            chat_history = await self._get_chat_history(message, user_id, limit=5)
            
            # 准备发送到 /messages/inbox 的数据
            inbox_payload = {
                "user_id": user_id, # 确保工作流知道消息归属哪个用户
                "channel": "telegram",
                "chat_id": str(chat_id), # Telethon 的 chat_id 可以是 int，需要转成 string
                "from_id": str(from_id), # 发送者的 Telegram User ID
                "content": content,
                "name": sender_name,
                "phone": phone, # 如果能获取到则包含
                "timestamp": message.date.isoformat(),
                "chat_history": chat_history # 包含从 Telethon 客户端获取的历史消息
            }
            
            # 调用 /api/messages/inbox 端点
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.post(self.webhook_url, json=inbox_payload, timeout=30)
                response.raise_for_status() # 如果请求失败，抛出异常
                logger.info(f"✅ Successfully forwarded Telegram message to /messages/inbox for user {user_id}.")

        except Exception as e:
            logger.error(f"Error handling new Telegram message for user {user_id}: {e}", exc_info=True)

    async def _get_chat_history(self, current_message: Message, user_id: int, limit: int = 5) -> list:
        """从 Telethon 客户端获取聊天历史消息"""
        try:
            client = self._clients.get(user_id)
            if not client or not client.is_connected():
                logger.warning(f"No connected client for user {user_id}, returning empty chat history")
                return []
            
            # 获取聊天实体
            chat_entity = await current_message.get_chat()
            
            # 获取历史消息（不包括当前消息）
            messages = []
            async for msg in client.iter_messages(chat_entity, limit=limit + 1):
                # 跳过当前消息
                if msg.id == current_message.id:
                    continue
                
                # 只获取文本消息，跳过系统消息和媒体消息
                if msg.message and msg.sender_id:
                    try:
                        sender = await msg.get_sender()
                        sender_name = getattr(sender, 'first_name', None) or getattr(sender, 'title', None) or str(msg.sender_id)
                        
                        messages.append({
                            "content": msg.message,
                            "sender_name": sender_name,
                            "sender_id": str(msg.sender_id),
                            "timestamp": msg.date.isoformat(),
                            "direction": "outgoing" if msg.out else "incoming"
                        })
                        
                        # 达到限制数量就停止
                        if len(messages) >= limit:
                            break
                    except Exception as e:
                        logger.debug(f"Error processing message {msg.id} for chat history: {e}")
                        continue
            
            # 按时间顺序排序（最旧的在前）
            messages.reverse()
            logger.debug(f"Retrieved {len(messages)} chat history messages for user {user_id}")
            return messages
            
        except Exception as e:
            logger.error(f"Error retrieving chat history for user {user_id}: {e}", exc_info=True)
            return []

    async def _clear_user_telegram_session(self, user_id: int): # 新增方法来清除无效会话
        """清除指定用户的 Telegram 会话信息 (string_session 和 session_file)"""
        logger.warning(f"Clearing invalid Telegram session for user {user_id}.")
        db = SessionLocal()
        try:
            settings_records = db.query(models.Setting).filter(models.Setting.user_id == user_id, models.Setting.key.in_(["telegram_string_session", "telegram_session_file"])).all()
            for setting in settings_records:
                db.delete(setting)
            db.commit()
            logger.info(f"Successfully cleared telegram session settings for user {user_id}.")
        except Exception as e:
            logger.error(f"Error clearing Telegram session for user {user_id}: {e}", exc_info=True)
        finally:
            db.close()

        if user_id in self._clients and self._clients[user_id].is_connected():
            await self._clients[user_id].disconnect()
            del self._clients[user_id]
        if user_id in self._tasks and not self._tasks[user_id].done():
            self._tasks[user_id].cancel()
            await asyncio.sleep(0.1) # Give a moment for task to clean up
            del self._tasks[user_id]
        if user_id in self._health_monitors and not self._health_monitors[user_id].done():
            self._health_monitors[user_id].cancel()
            await asyncio.sleep(0.1) # Give a moment for task to clean up
            del self._health_monitors[user_id]
        if user_id in self._connection_attempts:
            del self._connection_attempts[user_id]
        if user_id in self._last_activity:
            del self._last_activity[user_id]

    async def start_listening_all_users(self):
        """为所有已配置 Telegram 会话的用户启动监听"""
        db = SessionLocal()
        try:
            import uuid
            telegram_sessions_str = db.query(models.Setting).filter(
                models.Setting.key == "telegram_string_session",
                models.Setting.value.isnot(None)
            ).all()

            telegram_sessions_file = db.query(models.Setting).filter(
                models.Setting.key == "telegram_session_file",
                models.Setting.value.isnot(None)
            ).all()

            # Import SettingsService here to avoid circular dependency and ensure it's fresh
            from app.services.settings import SettingsService
            settings_service = SettingsService(db)
            
            # Combine and deduplicate based on user_id - PRIORITIZE STRING SESSIONS
            # Use SettingsService to properly decrypt the values
            all_potential_sessions = {}
            for s in telegram_sessions_str: # Process string sessions first (more reliable)
                decrypted_value = settings_service.get_setting_for_user('telegram_string_session', s.user_id)
                if decrypted_value:  # Only add if decryption was successful
                    all_potential_sessions[s.user_id] = {'type': 'string', 'value': decrypted_value}
            for s in telegram_sessions_file: # Then file sessions, only if no string session exists for the user
                if s.user_id not in all_potential_sessions:
                    decrypted_value = settings_service.get_setting_for_user('telegram_session_file', s.user_id)
                    if decrypted_value:  # Only add if decryption was successful
                        all_potential_sessions[s.user_id] = {'type': 'file', 'value': decrypted_value}

            logger.info(f"Found {len(all_potential_sessions)} potential Telegram sessions in DB.")

            for user_id, session_info in all_potential_sessions.items():
                session_type = session_info['type']
                session_value = session_info['value']
                
                # session_param will be either a StringSession object or a file path string
                session_param = None
                temp_session_file_path = None # To keep track for cleanup

                if session_type == 'string':
                    logger.info(f"User {user_id}: Processing StringSession ({len(session_value)} chars)")
                    logger.info(f"User {user_id}: StringSession preview: {session_value[:50]}...")
                    try:
                        session_param = StringSession(session_value)
                        temp_session_file_path = None  # No temp file for string sessions
                        logger.info(f"User {user_id}: StringSession object created successfully.")
                    except Exception as e:
                        logger.error(f"User {user_id}: Failed to create StringSession: {e}")
                        continue
                elif session_type == 'file':
                    try:
                        # Normalize and clean base64 string
                        s = session_value.strip().replace('\n','').replace('\r','').replace(' ','')
                        # Fix padding if necessary
                        pad = len(s) % 4
                        if pad != 0:
                            s += '=' * (4 - pad)
                        # Try standard b64decode, fallback to urlsafe if it fails
                        try:
                            data = base64.b64decode(s)
                        except Exception:
                            try:
                                from base64 import urlsafe_b64decode
                                data = urlsafe_b64decode(s)
                            except Exception as e:
                                logger.error(f"User {user_id}: Error decoding session file (base64/urlsafe), length={len(session_value)}: {e}", exc_info=True)
                                raise
                        # Use a unique temp file name to avoid conflicts, matching settings.py approach
                        temp_filename = f"tg_session_{user_id}_{uuid.uuid4().hex}.session"
                        temp_session_file_path = os.path.join(tempfile.gettempdir(), temp_filename)
                        with open(temp_session_file_path, 'wb') as fh:
                            fh.write(data)
                        logger.info(f"User {user_id}: Restored session file to {temp_session_file_path}")
                        session_param = temp_session_file_path # Pass the file path directly
                        logger.info(f"User {user_id}: Using session file path.")
                    except Exception as e:
                        logger.error(f"User {user_id}: Error decoding or writing session file: {e}", exc_info=True)
                        continue
                
                if session_param is None:
                    logger.warning(f"User {user_id}: No valid session parameter found. Skipping listener startup.")
                    continue

                # Retrieve API ID and API Hash for this specific user from settings
                api_id_str = settings_service.get_setting_for_user('telegram_api_id', user_id)
                api_hash = settings_service.get_setting_for_user('telegram_api_hash', user_id)

                logger.info(f"User {user_id}: Retrieved api_id_str='{api_id_str}', api_hash='****'")

                if not api_id_str or not api_hash:
                    logger.warning(f"User {user_id} has a session but missing API ID or API Hash. Skipping listener startup.")
                    if temp_session_file_path and os.path.exists(temp_session_file_path):
                        os.remove(temp_session_file_path)
                        logger.info(f"Cleaned up temporary session file {temp_session_file_path} for user {user_id}.")
                    continue

                try:
                    api_id = int(api_id_str)
                except ValueError:
                    logger.error(f"Invalid TELEGRAM_API_ID for user {user_id}: {api_id_str}. Skipping listener startup.")
                    if temp_session_file_path and os.path.exists(temp_session_file_path):
                        os.remove(temp_session_file_path)
                        logger.info(f"Cleaned up temporary session file {temp_session_file_path} for user {user_id}.")
                    continue

                if user_id not in self._clients:
                    logger.info(f"Launching listener for user {user_id}...")
                    # 创建一个新的 asyncio 任务来运行监听器，并传递每用户的凭据
                    task = asyncio.create_task(self._start_listening_for_user(user_id, session_param, api_id, api_hash, temp_session_file_path))
                    self._tasks[user_id] = task
                    
                    # Add a callback to handle task completion/failure
                    def task_done_callback(task_obj):
                        try:
                            if task_obj.cancelled():
                                logger.warning(f"Listener task for user {user_id} was cancelled.")
                            elif task_obj.exception():
                                logger.error(f"Listener task for user {user_id} failed with exception: {task_obj.exception()}")
                            else:
                                logger.info(f"Listener task for user {user_id} completed normally.")
                        except Exception as e:
                            logger.error(f"Error in task callback for user {user_id}: {e}")
                    
                    task.add_done_callback(task_done_callback)
                else:
                    logger.info(f"Listener already running for user {user_id}.")
                    # Clean up temp file if listener already running
                    if temp_session_file_path and os.path.exists(temp_session_file_path):
                        try:
                            os.remove(temp_session_file_path)
                            logger.info(f"Cleaned up unused temp session file {temp_session_file_path} for user {user_id}.")
                        except Exception as cleanup_exc:
                            logger.warning(f"Failed to clean up unused temp session file {temp_session_file_path} for user {user_id}: {cleanup_exc}")
        except Exception as e:
            logger.error(f"Error starting Telegram listeners for all users: {e}", exc_info=True)
        finally:
            db.close()

    async def stop_listening_all_users(self):
        """停止所有活动的 Telegram 监听任务和客户端"""
        logger.info("Stopping all Telegram listeners...")
        for user_id, task in list(self._tasks.items()):
            if not task.done():
                task.cancel()
                try:
                    await task # 等待任务取消
                except asyncio.CancelledError:
                    logger.info(f"Listener task for user {user_id} cancelled.")
                except Exception as e:
                    logger.error(f"Error cancelling task for user {user_id}: {e}")
            
            if user_id in self._clients:
                if self._clients[user_id].is_connected():
                    await self._clients[user_id].disconnect()
                    logger.info(f"Client for user {user_id} disconnected.")
                del self._clients[user_id]
            if user_id in self._tasks:
                del self._tasks[user_id]
        logger.info("All Telegram listeners stopped.")
