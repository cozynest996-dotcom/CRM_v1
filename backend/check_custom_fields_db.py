#!/usr/bin/env python3
"""
在Docker后端容器中检查custom_fields数据
"""
import os
import sys
import json
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# 数据库连接配置（Docker环境）
DATABASE_URL = "postgresql://crm_user:crm_password@db:5432/crm_db"

def check_custom_fields_data():
    """检查数据库中的custom_fields数据"""
    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()
        
        print("🔍 检查customers表中的custom_fields数据...")
        
        # 查询前5个客户的custom_fields
        result = db.execute(text("""
            SELECT id, name, phone, email, custom_fields 
            FROM customers 
            WHERE custom_fields IS NOT NULL 
            LIMIT 5
        """))
        
        rows = result.fetchall()
        print(f"📊 找到 {len(rows)} 个有custom_fields的客户")
        
        for i, row in enumerate(rows, 1):
            print(f"\n👤 客户 {i}:")
            print(f"  ID: {row.id}")
            print(f"  姓名: {row.name}")
            print(f"  电话: {row.phone}")
            print(f"  邮箱: {row.email}")
            print(f"  Custom Fields: {row.custom_fields}")
            
            # 尝试解析custom_fields
            if row.custom_fields:
                try:
                    if isinstance(row.custom_fields, str):
                        cf_data = json.loads(row.custom_fields)
                    else:
                        cf_data = row.custom_fields
                    print(f"  解析后的Custom Fields: {json.dumps(cf_data, indent=4, ensure_ascii=False)}")
                except Exception as e:
                    print(f"  ❌ 解析custom_fields失败: {e}")
        
        # 检查所有客户的custom_fields键
        print(f"\n🔍 检查所有custom_fields中的键...")
        result = db.execute(text("""
            SELECT custom_fields 
            FROM customers 
            WHERE custom_fields IS NOT NULL 
            AND custom_fields != '{}'::jsonb
        """))
        
        all_keys = set()
        for row in result.fetchall():
            if row.custom_fields:
                try:
                    if isinstance(row.custom_fields, str):
                        cf_data = json.loads(row.custom_fields)
                    else:
                        cf_data = row.custom_fields
                    
                    if isinstance(cf_data, dict):
                        all_keys.update(cf_data.keys())
                except Exception:
                    continue
        
        print(f"📋 发现的custom_fields键: {sorted(all_keys)}")
        
        # 检查settings表中的customer_list_config
        print(f"\n🔍 检查settings表中的customer_list_config...")
        result = db.execute(text("""
            SELECT user_id, key, value 
            FROM settings 
            WHERE key LIKE '%customer_list_config%'
        """))
        
        config_rows = result.fetchall()
        print(f"📊 找到 {len(config_rows)} 个客户列表配置")
        
        for row in config_rows:
            print(f"\n⚙️ 用户 {row.user_id} 的配置:")
            print(f"  键: {row.key}")
            try:
                config_data = json.loads(row.value)
                print(f"  配置: {json.dumps(config_data, indent=4, ensure_ascii=False)}")
            except Exception as e:
                print(f"  原始值: {row.value}")
                print(f"  ❌ 解析配置失败: {e}")
        
        db.close()
        
    except Exception as e:
        print(f"❌ 数据库检查失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_custom_fields_data()
