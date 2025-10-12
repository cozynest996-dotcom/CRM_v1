#!/usr/bin/env python3
"""
检查用户数据和WhatsApp会话隔离状态
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.database import SessionLocal
from app.db.models import User, WhatsAppSession, SubscriptionPlan
from sqlalchemy import text

def check_user_data():
    db = SessionLocal()
    try:
        print("=== 用户表数据 ===")
        users = db.query(User).all()
        if not users:
            print("❌ 没有用户数据")
        else:
            for user in users:
                plan_name = "未知"
                if user.subscription_plan:
                    plan_name = user.subscription_plan.name
                elif user.subscription_plan_id:
                    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == user.subscription_plan_id).first()
                    plan_name = plan.name if plan else f"Plan ID {user.subscription_plan_id}"
                
                print(f"ID: {user.id}")
                print(f"  邮箱: {user.email}")
                print(f"  姓名: {user.name}")
                print(f"  状态: {user.subscription_status}")
                print(f"  计划: {plan_name}")
                print(f"  Google ID: {user.google_id}")
                print()
        
        print("=== WhatsApp会话表数据 ===")
        sessions = db.query(WhatsAppSession).all()
        if not sessions:
            print("❌ 没有WhatsApp会话数据")
        else:
            for session in sessions:
                user = db.query(User).filter(User.id == session.user_id).first()
                user_email = user.email if user else "用户不存在"
                qr_status = "有" if session.qr else "无"
                print(f"会话ID: {session.id}")
                print(f"  用户ID: {session.user_id} ({user_email})")
                print(f"  连接状态: {session.connected}")
                print(f"  QR码: {qr_status}")
                print(f"  会话密钥: {session.session_key}")
                print()
        
        print("=== 订阅计划表数据 ===")
        plans = db.query(SubscriptionPlan).all()
        if not plans:
            print("❌ 没有订阅计划数据")
        else:
            for plan in plans:
                print(f"ID: {plan.id}, 名称: {plan.name}, 价格: {plan.price}")
        
        print("\n=== 数据库表列表 ===")
        result = db.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = [row[0] for row in result.fetchall()]
        print(f"数据库表: {', '.join(tables)}")
        
        # 检查WhatsApp会话隔离问题
        print("\n=== WhatsApp会话隔离检查 ===")
        if len(sessions) > 1:
            print("⚠️  发现多个WhatsApp会话")
            user_sessions = {}
            for session in sessions:
                if session.user_id not in user_sessions:
                    user_sessions[session.user_id] = []
                user_sessions[session.user_id].append(session)
            
            for user_id, user_sessions_list in user_sessions.items():
                user = db.query(User).filter(User.id == user_id).first()
                user_email = user.email if user else "未知用户"
                print(f"用户 {user_id} ({user_email}): {len(user_sessions_list)} 个会话")
                
                if len(user_sessions_list) > 1:
                    print(f"  ⚠️  用户 {user_id} 有多个会话，这可能导致隔离问题")
        else:
            print("✅ 会话数据正常")
            
    except Exception as e:
        print(f"❌ 检查失败: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_user_data()
