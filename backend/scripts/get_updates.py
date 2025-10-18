#!/usr/bin/env python3
import sys
import requests
import json

def main(token: str):
    url = f"https://api.telegram.org/bot{token}/getUpdates"
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print("ERROR", str(e))
        return 1

    results = data.get('result', [])
    if not results:
        print('NO_UPDATES')
        return 0

    chat_ids = set()
    for u in results:
        msg = u.get('message') or u.get('edited_message') or u.get('channel_post') or u.get('edited_channel_post')
        if not msg:
            continue
        chat = msg.get('chat', {})
        cid = chat.get('id')
        if cid is not None:
            chat_ids.add(str(cid))

    print('CHAT_IDS:' + (','.join(sorted(chat_ids)) if chat_ids else 'NONE'))
    # also print first 5 updates for debug
    print(json.dumps(results[:5], ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('USAGE: get_updates.py <BOT_TOKEN>')
        sys.exit(2)
    sys.exit(main(sys.argv[1]))


