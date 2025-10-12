# 保存为 scripts/check_local_sessions.py 并在项目根用 venv 运行: python scripts/check_local_sessions.py
import os
import asyncio
from telethon import TelegramClient

SESSION_DIR = 'telegram_gateway'
API_ID = int(os.environ.get('API_ID', '0'))      # 或填具体 api_id
API_HASH = os.environ.get('API_HASH', '')        # 或填具体 api_hash

async def inspect_session(session_path):
    try:
        client = TelegramClient(session_path, API_ID, API_HASH)
        await client.connect()
        me = await client.get_me()
        await client.disconnect()
        print(session_path, '=>', getattr(me,'username',None), getattr(me,'first_name',None), getattr(me,'id',None))
    except Exception as e:
        print(session_path, '=> failed:', e)

async def main():
    for fname in os.listdir(SESSION_DIR):
        if 'session' in fname:
            await inspect_session(os.path.join(SESSION_DIR, fname).rsplit('.',1)[0])

if __name__ == '__main__':
    asyncio.run(main())