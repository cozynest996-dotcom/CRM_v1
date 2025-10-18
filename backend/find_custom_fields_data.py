#!/usr/bin/env python3
"""
查找有custom_fields数据的客户
"""
import sys
sys.path.append('/app')

from app.db.database import SessionLocal
from app.db.models import Customer
import json

def find_customers_with_custom_fields():
    """查找有custom_fields的客户"""
    db = SessionLocal()
    
    try:
        print("🔍 查找有custom_fields数据的客户...")
        
        # 查询所有客户
        customers = db.query(Customer).all()
        print(f"📊 总共 {len(customers)} 个客户")
        
        customers_with_data = []
        
        for customer in customers:
            if customer.custom_fields and len(customer.custom_fields) > 0:
                customers_with_data.append(customer)
        
        print(f"📊 有custom_fields数据的客户: {len(customers_with_data)}")
        
        for i, customer in enumerate(customers_with_data, 1):
            print(f"\n👤 客户 {i}:")
            print(f"  ID: {customer.id}")
            print(f"  姓名: {customer.name}")
            print(f"  电话: {customer.phone}")
            print(f"  Custom Fields: {customer.custom_fields}")
            
            for key, value in customer.custom_fields.items():
                print(f"    {key}: {value}")
        
        # 如果没有找到，创建一些测试数据
        if len(customers_with_data) == 0:
            print("\n🔧 没有找到custom_fields数据，创建测试数据...")
            
            # 找第一个客户并添加custom_fields
            first_customer = customers[0] if customers else None
            if first_customer:
                first_customer.custom_fields = {
                    'budget': '50000',
                    'status': 'potential',
                    'nono': 'test_value'
                }
                db.commit()
                print(f"✅ 为客户 {first_customer.name} 添加了测试custom_fields")
                print(f"   Custom Fields: {first_customer.custom_fields}")
            
    except Exception as e:
        print(f"❌ 查找失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    find_customers_with_custom_fields()
