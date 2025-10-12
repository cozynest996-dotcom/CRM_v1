# Telegram MTProto Gateway (userbot)

This gateway uses Telethon (MTProto) to run as a userbot and forward incoming messages to the backend `/api/telegram/webhook` endpoint.

Requirements:
- Python 3.10+
- `telethon` library

Setup:
1. Create a virtualenv and install deps:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install telethon requests
   ```
2. Create a file `.env` with the following values:
   ```env
   API_ID=your_telegram_api_id
   API_HASH=your_telegram_api_hash
   BACKEND_WEBHOOK_URL=http://localhost:8000/api/telegram/webhook
   ````

Run:
```bash
source .venv/bin/activate
python gateway.py
```

The gateway will prompt for phone number and verification on first run and will keep a `session` file.


