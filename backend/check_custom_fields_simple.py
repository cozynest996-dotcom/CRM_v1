#!/usr/bin/env python3
"""
简单检查custom_fields数据
"""
import sys
sys.path.append('/app')

from app.db.database import SessionLocal
from app.db.models import Customer, Setting
import json

def check_data():
    """检查数据"""
    db = SessionLocal()
    
    try:
        print("🔍 检查customers表中的数据...")
        
        # 查询前5个客户
        customers = db.query(Customer).limit(5).all()
        print(f"📊 找到 {len(customers)} 个客户")
        
        for i, customer in enumerate(customers, 1):
            print(f"\n👤 客户 {i}:")
            print(f"  ID: {customer.id}")
            print(f"  姓名: {customer.name}")
            print(f"  电话: {customer.phone}")
            print(f"  邮箱: {customer.email}")
            print(f"  Custom Fields: {customer.custom_fields}")
            print(f"  Custom Fields 类型: {type(customer.custom_fields)}")
            
            if customer.custom_fields:
                try:
                    if isinstance(customer.custom_fields, dict):
                        print(f"  Custom Fields 键: {list(customer.custom_fields.keys())}")
                        for key, value in customer.custom_fields.items():
                            print(f"    {key}: {value}")
                except Exception as e:
                    print(f"  ❌ 处理custom_fields失败: {e}")
        
        # 检查所有客户的custom_fields
        print(f"\n🔍 统计所有custom_fields键...")
        all_customers = db.query(Customer).all()
        all_keys = set()
        
        for customer in all_customers:
            if customer.custom_fields and isinstance(customer.custom_fields, dict):
                all_keys.update(customer.custom_fields.keys())
        
        print(f"📋 所有custom_fields键: {sorted(all_keys)}")
        
        # 检查settings表
        print(f"\n🔍 检查客户列表配置...")
        settings = db.query(Setting).filter(Setting.key.like('%customer_list_config%')).all()
        print(f"📊 找到 {len(settings)} 个配置")
        
        for setting in settings:
            print(f"\n⚙️ 用户 {setting.user_id} 的配置:")
            print(f"  键: {setting.key}")
            print(f"  值: {setting.value}")
            
    except Exception as e:
        print(f"❌ 检查失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_data()
