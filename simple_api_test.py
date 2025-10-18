#!/usr/bin/env python3
"""
简单的 API 测试脚本
测试 POST /Outsource/Register API
"""

import asyncio
import json
import httpx
from datetime import datetime

async def test_register_api():
    """测试注册 API"""
    
    base_url = "https://gioen24g04003j0321.online"
    endpoint = "/Outsource/Register"
    url = f"{base_url}{endpoint}"
    
    # 测试数据
    test_cases = [
        {
            "name": "Male User Test",
            "data": {
                "referenceCode": "ogeo93103me",
                "phoneNumber": "",
                "referralCode": "",
                "loginUserName": "",
                "loginPassword": "",
                "genderID": 1
            }
        },
        {
            "name": "Female User Test", 
            "data": {
                "referenceCode": "test_female_001",
                "phoneNumber": "",
                "referralCode": "",
                "loginUserName": "",
                "loginPassword": "",
                "genderID": 2
            }
        }
    ]
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    print("🧪 开始测试 Custom API 节点逻辑")
    print("=" * 60)
    print(f"🌐 Base URL: {base_url}")
    print(f"📡 Endpoint: {endpoint}")
    print(f"🔗 Full URL: {url}")
    print(f"📋 Headers: {json.dumps(headers, indent=2)}")
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n🧪 测试用例 {i}: {test_case['name']}")
        print("-" * 40)
        print(f"📦 请求数据: {json.dumps(test_case['data'], indent=2, ensure_ascii=False)}")
        
        try:
            start_time = datetime.now()
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    url=url,
                    headers=headers,
                    json=test_case['data']
                )
            
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            print(f"⏱️ 请求耗时: {duration:.2f} 秒")
            print(f"📊 状态码: {response.status_code}")
            print(f"📄 响应头: {dict(response.headers)}")
            
            try:
                response_data = response.json()
                print(f"📋 响应数据: {json.dumps(response_data, indent=2, ensure_ascii=False)}")
            except:
                print(f"📋 响应文本: {response.text}")
            
            if response.status_code == 200:
                print("✅ 测试成功!")
            else:
                print(f"⚠️ 非 200 状态码: {response.status_code}")
                
        except httpx.TimeoutException:
            print("❌ 请求超时")
        except httpx.RequestError as e:
            print(f"❌ 请求错误: {e}")
        except Exception as e:
            print(f"❌ 未知错误: {e}")
            import traceback
            print(f"📋 详细错误: {traceback.format_exc()}")

async def test_custom_api_node_simulation():
    """模拟 CustomAPIProcessor 的行为"""
    
    print("\n" + "=" * 60)
    print("🔧 模拟 CustomAPIProcessor 节点行为")
    print("=" * 60)
    
    # 模拟节点配置
    node_config = {
        "id": "custom_api_test",
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
    
    print(f"📝 节点配置:")
    print(json.dumps(node_config, indent=2, ensure_ascii=False))
    
    # 提取配置
    node_data = node_config.get("data", {})
    method = node_data.get("method", "GET").upper()
    url = node_data.get("url")
    headers = node_data.get("headers", {})
    body_str = node_data.get("body")
    timeout = node_data.get("timeout", 30)
    retry_count = node_data.get("retry_count", 0)
    
    # 解析 JSON 请求体
    try:
        body = json.loads(body_str) if body_str else None
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析错误: {e}")
        return
    
    print(f"\n🔧 处理后的参数:")
    print(f"  Method: {method}")
    print(f"  URL: {url}")
    print(f"  Headers: {headers}")
    print(f"  Body: {body}")
    print(f"  Timeout: {timeout}")
    print(f"  Retry Count: {retry_count}")
    
    # 执行请求
    for attempt in range(retry_count + 1):
        try:
            print(f"\n🚀 尝试 {attempt + 1}/{retry_count + 1}")
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                if method == "POST":
                    response = await client.post(url, headers=headers, json=body)
                else:
                    raise ValueError(f"Unsupported method: {method}")
                
                # 模拟 CustomAPIProcessor 的响应处理
                try:
                    response_json = response.json()
                except:
                    response_json = {"error": "Could not parse JSON", "text": response.text}
                
                output_data = {
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "data": response_json
                }
                
                print(f"✅ CustomAPIProcessor 输出:")
                print(json.dumps(output_data, indent=2, ensure_ascii=False))
                
                return output_data
                
        except Exception as e:
            print(f"❌ 尝试 {attempt + 1} 失败: {e}")
            if attempt < retry_count:
                wait_time = 2 ** attempt
                print(f"⏱️ 等待 {wait_time} 秒后重试...")
                await asyncio.sleep(wait_time)
            else:
                print(f"❌ 所有重试失败")
                raise

if __name__ == "__main__":
    print("🧪 API 测试开始")
    
    # 基础 API 测试
    asyncio.run(test_register_api())
    
    # CustomAPIProcessor 模拟测试
    asyncio.run(test_custom_api_node_simulation())
    
    print("\n🎉 测试完成!")
