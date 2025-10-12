#!/usr/bin/env python3

"""
測試工作流的 WhatsApp 消息發送是否正常工作
確保身份驗證修復後工作流可以成功發送消息
"""

import asyncio
import sys
import os

# 將後端目錄添加到 Python 路徑
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from app.db.database import SessionLocal
from app.db.models import User, Customer
from app.services.whatsapp import WhatsAppService
from app.services.auth import AuthService

async def test_workflow_whatsapp_send():
    """測試工作流中的 WhatsApp 消息發送"""
    print("🧪 測試工作流 WhatsApp 消息發送...")
    
    db = SessionLocal()
    try:
        # 1. 獲取第一個用戶
        user = db.query(User).first()
        if not user:
            print("❌ 沒有找到用戶，請先創建用戶")
            return
        
        print(f"👤 使用用戶: {user.email} (ID: {user.id})")
        
        # 2. 獲取第一個客戶
        customer = db.query(Customer).filter(Customer.user_id == user.id).first()
        if not customer:
            print("❌ 沒有找到該用戶的客戶，請先創建客戶")
            return
        
        print(f"📱 測試發送給客戶: {customer.name} ({customer.phone})")
        
        # 3. 創建 WhatsApp 服務並測試發送
        whatsapp_service = WhatsAppService()
        
        test_message = "🧪 這是一條來自工作流測試的消息，請忽略。"
        
        try:
            result = await whatsapp_service.send_message(
                phone=customer.phone,
                message=test_message,
                user_id=user.id
            )
            
            print("✅ 工作流 WhatsApp 發送測試成功！")
            print(f"📊 結果: {result}")
            
        except Exception as e:
            print(f"❌ 工作流 WhatsApp 發送測試失敗: {str(e)}")
            print("🔍 請檢查:")
            print("  1. WhatsApp Gateway 是否運行在 localhost:3002")
            print("  2. Gateway 是否已更新為支持 JWT 認證")
            print("  3. 用戶的 WhatsApp 是否已連接")
        
    finally:
        db.close()

async def test_jwt_generation():
    """測試 JWT token 生成"""
    print("\n🔐 測試 JWT token 生成...")
    
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            print("❌ 沒有找到用戶")
            return
        
        auth_service = AuthService(db)
        token = auth_service.create_access_token(user)
        
        print(f"✅ JWT token 生成成功")
        print(f"📄 Token 長度: {len(token)} 字符")
        print(f"🔤 Token 前綴: {token[:50]}...")
        
        # 驗證 token
        try:
            payload = auth_service.verify_token(token)
            print(f"✅ JWT token 驗證成功")
            print(f"👤 用戶ID: {payload.get('user_id')}")
            print(f"📧 郵箱: {payload.get('email')}")
        except Exception as e:
            print(f"❌ JWT token 驗證失敗: {str(e)}")
        
    finally:
        db.close()

if __name__ == "__main__":
    print("🚀 開始測試工作流身份驗證修復...")
    
    asyncio.run(test_jwt_generation())
    asyncio.run(test_workflow_whatsapp_send())
    
    print("\n✨ 測試完成！如果上面顯示成功，說明修復生效。")
    print("💡 現在可以試著發送 WhatsApp 消息來觸發工作流。")
