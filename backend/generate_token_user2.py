#!/usr/bin/env python3
"""
为用户2生成JWT token
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.database import SessionLocal
from app.db.models import User
from app.services.auth import AuthService

def generate_token_for_user2():
    db = SessionLocal()
    try:
        # 获取用户2
        user2 = db.query(User).filter(User.email == "cozynest996@gmail.com").first()
        if not user2:
            print("❌ 用户2不存在")
            return
        
        # 生成token
        auth_service = AuthService(db)
        token = auth_service.create_access_token(user2)
        print(token)
        
    except Exception as e:
        print(f"❌ 生成token失败: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    generate_token_for_user2()
