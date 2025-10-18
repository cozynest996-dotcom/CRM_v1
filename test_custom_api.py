#!/usr/bin/env python3
"""
测试 Custom API 节点逻辑
测试 POST /Outsource/Register API
"""

import asyncio
import json
import sys
import os
from datetime import datetime
from sqlalchemy.orm import Session

# 添加 backend 目录到 Python 路径
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.workflow_engine import CustomAPIProcessor, WorkflowContext
from app.db.database import SessionLocal

async def test_custom_api():
    """测试自定义 API 节点"""
    
    # 创建数据库会话
    db = SessionLocal()
    
    try:
        # 创建工作流上下文
        context = WorkflowContext()
        context.set("user_id", 1)  # 设置用户ID
        
        # 创建 CustomAPI 处理器
        processor = CustomAPIProcessor(db, context)
        
        # 配置 API 节点
        node_config = {
            "id": "test_api_node",
            "type": "CustomAPI",
            "data": {
                "method": "POST",
                "url": "https://gioen24g04003j0321.online/Outsource/Register",
                "headers": {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                "body": json.dumps({
                    "referenceCode": "ogeo93103me",
                    "phoneNumber": "",
                    "referralCode": "",
                    "loginUserName": "",
                    "loginPassword": "",
                    "genderID": 1
                }),
                "timeout": 30,
                "retry_count": 2,
                "response_mapping": {
                    "data_field": ""  # 返回完整响应
                }
            }
        }
        
        print("🚀 开始测试 Custom API 节点...")
        print(f"📡 请求 URL: {node_config['data']['url']}")
        print(f"📝 请求方法: {node_config['data']['method']}")
        print(f"📦 请求体: {node_config['data']['body']}")
        print(f"📋 请求头: {node_config['data']['headers']}")
        print("-" * 50)
        
        # 执行 API 调用
        start_time = datetime.now()
        result = await processor.execute(node_config)
        end_time = datetime.now()
        
        duration = (end_time - start_time).total_seconds()
        
        print("✅ API 调用成功!")
        print(f"⏱️ 耗时: {duration:.2f} 秒")
        print(f"📊 状态码: {result.get('status_code')}")
        print(f"📄 响应头: {json.dumps(dict(result.get('headers', {})), indent=2, ensure_ascii=False)}")
        print(f"📋 响应数据: {json.dumps(result.get('data'), indent=2, ensure_ascii=False)}")
        
        # 检查上下文中是否保存了响应
        api_response = context.get("api.response")
        if api_response:
            print("\n✅ 响应已保存到上下文中，可供后续节点使用")
            print(f"🔍 上下文中的 API 响应: {json.dumps(api_response, indent=2, ensure_ascii=False)}")
        
        return result
        
    except Exception as e:
        print(f"❌ API 调用失败: {str(e)}")
        print(f"🔍 错误类型: {type(e).__name__}")
        import traceback
        print(f"📋 详细错误信息:\n{traceback.format_exc()}")
        return None
        
    finally:
        db.close()

async def test_with_different_genders():
    """测试不同性别的 API 调用"""
    
    genders = [
        {"id": 1, "name": "Male"},
        {"id": 2, "name": "Female"}
    ]
    
    for gender in genders:
        print(f"\n🧪 测试性别: {gender['name']} (ID: {gender['id']})")
        print("=" * 60)
        
        # 创建数据库会话
        db = SessionLocal()
        
        try:
            # 创建工作流上下文
            context = WorkflowContext()
            context.set("user_id", 1)
            
            # 创建 CustomAPI 处理器
            processor = CustomAPIProcessor(db, context)
            
            # 配置 API 节点
            node_config = {
                "id": f"test_api_node_gender_{gender['id']}",
                "type": "CustomAPI",
                "data": {
                    "method": "POST",
                    "url": "https://gioen24g04003j0321.online/Outsource/Register",
                    "headers": {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    "body": json.dumps({
                        "referenceCode": f"test_{gender['name'].lower()}_{datetime.now().strftime('%H%M%S')}",
                        "phoneNumber": "",
                        "referralCode": "",
                        "loginUserName": "",
                        "loginPassword": "",
                        "genderID": gender['id']
                    }),
                    "timeout": 30,
                    "retry_count": 1
                }
            }
            
            print(f"📦 请求体: {node_config['data']['body']}")
            
            # 执行 API 调用
            result = await processor.execute(node_config)
            
            print(f"✅ {gender['name']} 性别测试成功!")
            print(f"📊 状态码: {result.get('status_code')}")
            print(f"📋 响应数据: {json.dumps(result.get('data'), indent=2, ensure_ascii=False)}")
            
        except Exception as e:
            print(f"❌ {gender['name']} 性别测试失败: {str(e)}")
            
        finally:
            db.close()

if __name__ == "__main__":
    print("🧪 Custom API 节点测试开始")
    print("=" * 60)
    
    # 基础测试
    asyncio.run(test_custom_api())
    
    print("\n" + "=" * 60)
    print("🧪 不同性别参数测试")
    
    # 不同性别测试
    asyncio.run(test_with_different_genders())
    
    print("\n🎉 测试完成!")
