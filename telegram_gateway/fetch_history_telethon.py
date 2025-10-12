"""Fetch and print chat history from Telegram using Telethon.

Usage (PowerShell):
  cd telegram_gateway
  . .venv\Scripts\Activate.ps1
  python fetch_history_telethon.py --chat 8487835377

Requires: API_ID, API_HASH and a valid session (first-run of gateway.py created it).
"""

import os
import argparse
import asyncio
from telethon import TelegramClient
from dotenv import load_dotenv

load_dotenv()

API_ID = os.environ.get('API_ID')
API_HASH = os.environ.get('API_HASH')
SESSION = os.environ.get('TG_SESSION', 'tg_gateway')


async def fetch_history(chat_id: int, limit: int = None):
    if not API_ID or not API_HASH:
        raise RuntimeError('API_ID and API_HASH must be set in environment (.env)')

    client = TelegramClient(SESSION, int(API_ID), API_HASH)
    await client.start()
    try:
        # iterate messages from oldest to newest
        async for msg in client.iter_messages(chat_id, reverse=True, limit=limit):
            # msg.sender_id may be None for system messages
            text = msg.text or ''
            dt = msg.date.isoformat() if msg.date else ''
            print(f"{msg.id}\t{dt}\t{msg.sender_id}\t{text}")
    finally:
        await client.disconnect()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--chat', required=True, help='chat_id or user_id to fetch')
    p.add_argument('--limit', type=int, default=None, help='max messages (default: all)')
    args = p.parse_args()

    chat = int(args.chat)
    asyncio.run(fetch_history(chat, limit=args.limit))


if __name__ == '__main__':
    main()


