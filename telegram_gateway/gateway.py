import os
import sys
import asyncio
import requests
from telethon import TelegramClient, events
import logging
import logging.config
from aiohttp import web # 导入 aiohttp

from config import (
    BACKEND_WEBHOOK,
    BACKEND_INTERNAL_SESSIONS,
    GATEWAY_SECRET,
    API_ID,
    API_HASH,
    SESSION_NAME,
    LOGGING
)

# 配置日志
logging.config.dictConfig(LOGGING)
logger = logging.getLogger(__name__)

# 转换 API_ID 为整数
try:
    API_ID = int(API_ID)
except ValueError:
    API_ID = 0

async def forward_to_backend(chat_id, from_id, text, user_id=None, gateway_secret=None):
    payload = {
        'chat_id': str(chat_id),
        'from_id': str(from_id),
        'text': text,
    }
    if user_id:
        payload['user_id'] = user_id
    if gateway_secret:
        payload['gateway_secret'] = gateway_secret
    try:
        resp = requests.post(BACKEND_WEBHOOK, json=payload, timeout=5)
        logger.info('POST -> %s %d', BACKEND_WEBHOOK, resp.status_code)
    except Exception as e:
        logger.error('Failed to POST to backend: %s', e)

clients = {}

# 新增一个字典来存储 bot 客户端
bot_clients = {}

async def get_bot_client(bot_token: str, api_id: int, api_hash: str):
    if bot_token not in bot_clients:
        # 使用 bot token 创建新的客户端实例
        client = TelegramClient(bot_token, api_id, api_hash)
        await client.connect()
        bot_clients[bot_token] = client
        logger.info(f'Bot client created for token: {bot_token[:5]}...')
    return bot_clients[bot_token]

async def create_client_for_session(session_name, api_id, api_hash, string_session, user_id=None, gateway_secret=None):
    try:
        from telethon.sessions import StringSession
        client = TelegramClient(StringSession(string_session), int(api_id), api_hash)

        @client.on(events.NewMessage(incoming=True))
        async def handler(event):
            sender = await event.get_sender()
            chat = await event.get_chat()
            chat_id = event.chat_id
            from_id = sender.id if sender else None
            text = event.message.message or ''
            logger.info("New TG msg from %s in chat %s: %s", from_id, chat_id, text[:100])
            try:
                me = await client.get_me()
                logger.info("Gateway session active as: %s", 
                    getattr(me,'username', None) or getattr(me,'first_name', None) or getattr(me,'id', None))
            except Exception:
                logger.warning('Failed to fetch gateway account info')
            await forward_to_backend(chat_id, from_id, text, user_id, gateway_secret=gateway_secret) # 传递 user_id

        await client.connect()
        clients[session_name] = client
        logger.info('Client started for session: %s (User ID: %s)', session_name, user_id)
    except Exception as e:
        logger.error('Failed to create client for %s: %s', session_name, e)


def start_local_single_client():
    try:
        if not API_ID or not API_HASH: # SESSION_NAME in API_ID is not a valid condition for single client mode
            logger.warning('No API_ID/API_HASH configured for single-client mode')
            return
        client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

        @client.on(events.NewMessage(incoming=True)) # 监听所有入站消息
        async def handler(event):
            sender = await event.get_sender()
            chat_id = event.chat_id
            from_id = sender.id if sender else None
            text = event.message.message or ''
            logger.info("New TG msg from %s in chat %s: %s", from_id, chat_id, text[:100])
            try:
                me = await client.get_me()
                logger.info("Gateway session active as: %s",
                    getattr(me,'username', None) or getattr(me,'first_name', None) or getattr(me,'id', None))
            except Exception:
                pass
            await forward_to_backend(chat_id, from_id, text, None, gateway_secret=GATEWAY_SECRET)

        with client: # 使用 'with' 语句确保客户端正确连接和断开
            client.run_until_disconnected()
    except Exception as e:
        logger.error('Single-client mode failed: %s', e)

# 新增发送消息的 HTTP 端点
async def send_message_handler(request):
    try:
        # 验证 Gateway Secret
        if GATEWAY_SECRET and request.headers.get('X-GATEWAY-SECRET') != GATEWAY_SECRET:
            return web.json_response({'status': 'error', 'message': 'Invalid Gateway Secret'}, status=403)

        data = await request.json()
        chat_id = data.get('chat_id')
        message = data.get('text')
        bot_token = data.get('bot_token')
        user_id = data.get('user_id') # 获取 user_id

        if not chat_id or not message:
            return web.json_response({'status': 'error', 'message': 'Missing chat_id or text'}, status=400)

        # 根据 bot_token 获取或创建 Bot 客户端（仅在提供 bot_token 时）
        client = None
        if bot_token:
            client = await get_bot_client(bot_token, API_ID, API_HASH)
        
        # 根据 user_id 找到对应的 Telethon 客户端发送消息
        # 目前 clients 存储的是用户会话，bot_clients 存储的是 bot 会话
        # 如果是用户会话发送，需要从 clients 字典中获取 client
        # 如果是 bot 会话发送，使用 bot_client 发送

        # 优先尝试用用户会话发送 (如果有user_id)
        session_client = None
        if user_id:
            session_name = f"tg_{user_id}"
            session_client = clients.get(session_name)

        if session_client:
            logger.info(f"Sending message via user session '{session_name}' to {chat_id}")
            try:
                # 尝试解析实体，如果是数字ID，先转换为整数
                if chat_id.isdigit():
                    chat_id = int(chat_id)
                await session_client.send_message(chat_id, message)
            except Exception as entity_error:
                logger.warning(f"Failed to send to {chat_id} directly, trying to resolve entity: {entity_error}")
                try:
                    # 尝试通过用户名或电话号码解析
                    entity = await session_client.get_entity(chat_id)
                    await session_client.send_message(entity, message)
                except Exception as resolve_error:
                    logger.error(f"Failed to resolve entity {chat_id}: {resolve_error}")
                    raise resolve_error
        elif client: # 使用 bot 客户端发送
            logger.info(f"Sending message via bot client to {chat_id}")
            await client.send_message(chat_id, message)
        else:
            return web.json_response({'status': 'error', 'message': 'No Telegram client available to send message'}, status=500)

        logger.info(f'Sent Telegram message to {chat_id} using bot_token {bot_token[:5]}...')
        return web.json_response({'status': 'success', 'telegram_message_id': 'unknown'})

    except Exception as e:
        logger.error('Failed to send Telegram message: %s', e)
        return web.json_response({'status': 'error', 'message': str(e)}, status=500)

# 新增状态检查的 HTTP 端点
async def status_handler(request):
    try:
        # 验证 Gateway Secret
        if GATEWAY_SECRET and request.headers.get('X-GATEWAY-SECRET') != GATEWAY_SECRET:
            return web.json_response({'status': 'error', 'message': 'Invalid Gateway Secret'}, status=403)

        connected_clients = len(clients)
        connected_bots = len(bot_clients)
        status_text = []

        if API_ID == 0:
            status_text.append("API_ID is 0, only bot clients might be active")

        # 检查所有用户客户端的连接状态
        for session_name, client in clients.items():
            is_connected = await client.is_connected()
            status_text.append(f"User session {session_name} connected: {is_connected}")

        # 检查所有 Bot 客户端的连接状态
        for bot_tok, client in bot_clients.items():
            is_connected = await client.is_connected()
            status_text.append(f"Bot client {bot_tok[:5]}... connected: {is_connected}")

        return web.json_response({
            'status': 'success',
            'connected_clients': connected_clients,
            'connected_bots': connected_bots,
            'detail': status_text
        })
    except Exception as e:
        logger.error('Failed to get Telegram gateway status: %s', e)
        return web.json_response({'status': 'error', 'message': str(e)}, status=500)

async def start_web_server(loop):
    app = web.Application()
    app.router.add_post('/send', send_message_handler)
    app.router.add_get('/status', status_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 4000) # Telegram Gateway 运行在 4000 端口
    await site.start()
    logger.info('Telegram Gateway web server started on 0.0.0.0:4000')

def main():
    logger.info('Starting Telethon gateway...')

    # 创建一个新的 asyncio 事件循环
    loop = asyncio.get_event_loop()

    # 启动 web 服务器
    loop.run_until_complete(start_web_server(loop))

    # 如果 BACKEND_INTERNAL_SESSIONS 已设置，尝试从后端获取会话
    try:
        if BACKEND_INTERNAL_SESSIONS:
            headers = {}
            if GATEWAY_SECRET:
                headers['X-GATEWAY-SECRET'] = GATEWAY_SECRET
            resp = requests.get(BACKEND_INTERNAL_SESSIONS, headers=headers, timeout=5)
            if resp.ok:
                data = resp.json()
                for s in data.get('sessions', []):
                    session_name = f"tg_{s['user_id']}"
                    # 在当前运行的事件循环中创建客户端
                    loop.run_until_complete(
                        create_client_for_session(
                            session_name, 
                            s['api_id'], 
                            s['api_hash'], 
                            s['string_session'],
                            user_id=s['user_id'], # 传递 user_id
                            gateway_secret=GATEWAY_SECRET
                        )
                    )
            else:
                logger.error('Failed to fetch internal sessions: %d', resp.status_code)
    except Exception as e:
        logger.error('Error fetching internal sessions: %s', e)

    # 如果没有客户端启动，回退到单客户端模式
    if not clients and not bot_clients:
        logger.info("No user or bot clients started, falling back to local single client mode.")
        start_local_single_client()

    # 保持 asyncio 循环运行
    try:
        loop.run_forever()
    except KeyboardInterrupt:
        logger.info('Gateway stopping...')
        for name, c in clients.items():
            try:
                c.disconnect()
            except Exception:
                pass
        for token, c in bot_clients.items():
            try:
                c.disconnect()
            except Exception:
                pass
    except Exception as e:
        logger.error('Gateway error: %s', e)
        sys.exit(1)


if __name__ == '__main__':
    main()