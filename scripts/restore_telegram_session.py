import asyncio
import base64
import os
from app.db.database import SessionLocal
from app.services.settings import SettingsService
from telethon import TelegramClient


def main(user_id: int = 1):
    db = SessionLocal()
    ss = SettingsService(db)

    api_id = ss.get_setting_for_user('telegram_api_id', user_id)
    api_hash = ss.get_setting_for_user('telegram_api_hash', user_id)
    sess_b64 = ss.get_setting_for_user('telegram_session_file', user_id)

    print('api_id present:', bool(api_id))
    print('api_hash present:', bool(api_hash))
    if not (api_id and api_hash):
        print('Missing api_id/api_hash for user', user_id)
        return

    if not sess_b64:
        print('No session file stored in DB for user', user_id)
        return

    path = f'/tmp/tg_{user_id}.session'
    try:
        data = base64.b64decode(sess_b64)
        with open(path, 'wb') as fh:
            fh.write(data)
        print('Wrote session file to', path)
    except Exception as e:
        print('Failed to write session file:', e)
        return

    client = TelegramClient(path, int(api_id), api_hash)

    async def run():
        await client.connect()
        try:
            me = await client.get_me()
            print('get_me id:', getattr(me, 'id', None))
            print('get_me username:', getattr(me, 'username', None))
        except Exception as e:
            print('get_me failed:', e)
        finally:
            await client.disconnect()

    asyncio.run(run())


if __name__ == '__main__':
    main()


