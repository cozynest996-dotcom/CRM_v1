#!/usr/bin/env python3
import sys
import json
from app.db.database import SessionLocal
from app.db.models import Customer

def main(chat_id: str):
    db = SessionLocal()
    try:
        found = False
        for c in db.query(Customer).all():
            try:
                cf = c.custom_fields or {}
            except Exception:
                cf = {}
            if str(cf.get('telegram_chat_id')) == str(chat_id) or str(getattr(c, 'telegram_chat_id', '')) == str(chat_id):
                print(json.dumps({
                    'id': c.id,
                    'name': c.name,
                    'phone': c.phone,
                    'custom_fields': cf
                }, ensure_ascii=False))
                found = True
        if not found:
            print('NOT_FOUND')
    finally:
        db.close()

if __name__ == '__main__':
    chat_id = sys.argv[1] if len(sys.argv) > 1 else '601168208639'
    main(chat_id)


