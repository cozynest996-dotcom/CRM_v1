#!/usr/bin/env python3
"""
创建 WhatsAppSession 表
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.database import engine, SessionLocal
from app.db.models import Base, WhatsAppSession, User
from sqlalchemy import text

def create_whatsapp_session_table():
    """创建 WhatsAppSession 表"""
    try:
        # 创建所有表
        Base.metadata.create_all(bind=engine)
        print("✅ WhatsAppSession 表创建成功")
        
        # 验证表是否存在
        db = SessionLocal()
        try:
            result = db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='whatsapp_sessions'"))
            table_exists = result.fetchone()
            if table_exists:
                print("✅ whatsapp_sessions 表已确认存在")
            else:
                print("❌ whatsapp_sessions 表不存在")
                
            # 显示表结构
            result = db.execute(text("PRAGMA table_info(whatsapp_sessions)"))
            columns = result.fetchall()
            if columns:
                print("\n📋 whatsapp_sessions 表结构:")
                for col in columns:
                    print(f"  - {col[1]} ({col[2]})")
            
        finally:
            db.close()
            
    except Exception as e:
        print(f"❌ 创建表失败: {e}")
        raise

if __name__ == "__main__":
    create_whatsapp_session_table()
