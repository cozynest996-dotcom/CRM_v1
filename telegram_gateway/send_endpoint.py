from flask import Flask, request, jsonify
import os
from telethon import TelegramClient
from dotenv import load_dotenv

load_dotenv()

API_ID = int(os.environ.get('API_ID', '0'))
API_HASH = os.environ.get('API_HASH', '')
SESSION = os.environ.get('TG_SESSION', 'tg_gateway')

app = Flask(__name__)
client = TelegramClient(SESSION, API_ID, API_HASH)

@app.route('/send', methods=['POST'])
def send():
    data = request.get_json() or {}
    chat_id = data.get('chat_id')
    text = data.get('text')
    if not chat_id or not text:
        return jsonify({'error': 'chat_id and text required'}), 400
    try:
        with client:
            client.loop.run_until_complete(client.send_message(int(chat_id), text))
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('TG_SEND_PORT', 4001)))


