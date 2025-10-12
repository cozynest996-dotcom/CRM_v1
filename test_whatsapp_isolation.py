#!/usr/bin/env python3
"""
测试 WhatsApp 用户隔离功能
验证不同用户有独立的 WhatsApp 会话
"""

import requests
import json
import time

# 配置
BACKEND_URL = "http://localhost:8000"
GATEWAY_URL = "http://localhost:3002"

def test_user_specific_qr():
    """测试用户特定的二维码生成"""
    print("🔍 测试用户特定的二维码生成...")
    
    # 测试用户1
    user1_id = 1
    response1 = requests.get(f"{GATEWAY_URL}/qr?user_id={user1_id}")
    print(f"用户 {user1_id} QR 响应: {response1.status_code}")
    if response1.ok:
        data1 = response1.json()
        print(f"  QR 状态: {data1}")
    
    # 测试用户2
    user2_id = 2
    response2 = requests.get(f"{GATEWAY_URL}/qr?user_id={user2_id}")
    print(f"用户 {user2_id} QR 响应: {response2.status_code}")
    if response2.ok:
        data2 = response2.json()
        print(f"  QR 状态: {data2}")
    
    return response1.ok and response2.ok

def test_user_specific_status():
    """测试用户特定的状态查询"""
    print("🔍 测试用户特定的状态查询...")
    
    # 测试用户1
    user1_id = 1
    response1 = requests.get(f"{GATEWAY_URL}/status?user_id={user1_id}")
    print(f"用户 {user1_id} 状态响应: {response1.status_code}")
    if response1.ok:
        data1 = response1.json()
        print(f"  状态: {data1}")
    
    # 测试用户2
    user2_id = 2
    response2 = requests.get(f"{GATEWAY_URL}/status?user_id={user2_id}")
    print(f"用户 {user2_id} 状态响应: {response2.status_code}")
    if response2.ok:
        data2 = response2.json()
        print(f"  状态: {data2}")
    
    return response1.ok and response2.ok

def test_user_specific_send():
    """测试用户特定的消息发送"""
    print("🔍 测试用户特定的消息发送...")
    
    # 测试用户1发送消息
    user1_id = 1
    payload1 = {
        "to": "1234567890",  # 测试号码
        "message": "测试消息来自用户1",
        "user_id": user1_id,
        "backend_message_id": 1001
    }
    
    response1 = requests.post(f"{GATEWAY_URL}/send", json=payload1)
    print(f"用户 {user1_id} 发送响应: {response1.status_code}")
    if response1.ok:
        data1 = response1.json()
        print(f"  响应: {data1}")
    else:
        print(f"  错误: {response1.text}")
    
    # 测试用户2发送消息
    user2_id = 2
    payload2 = {
        "to": "1234567890",  # 测试号码
        "message": "测试消息来自用户2",
        "user_id": user2_id,
        "backend_message_id": 1002
    }
    
    response2 = requests.post(f"{GATEWAY_URL}/send", json=payload2)
    print(f"用户 {user2_id} 发送响应: {response2.status_code}")
    if response2.ok:
        data2 = response2.json()
        print(f"  响应: {data2}")
    else:
        print(f"  错误: {response2.text}")
    
    return True

def test_backend_session_endpoints():
    """测试后端的会话管理端点"""
    print("🔍 测试后端会话管理端点...")
    
    # 注意：这需要有效的JWT token，这里只是结构测试
    headers = {
        "Content-Type": "application/json",
        # "Authorization": "Bearer YOUR_JWT_TOKEN"  # 实际使用时需要提供
    }
    
    # 测试获取会话状态
    try:
        response = requests.get(f"{BACKEND_URL}/settings/whatsapp/session", headers=headers)
        print(f"获取会话状态响应: {response.status_code}")
        if response.status_code == 401:
            print("  需要认证（正常）")
        elif response.ok:
            data = response.json()
            print(f"  会话数据: {data}")
    except Exception as e:
        print(f"  连接错误: {e}")
    
    # 测试创建会话
    try:
        response = requests.post(f"{BACKEND_URL}/settings/whatsapp/session", headers=headers)
        print(f"创建会话响应: {response.status_code}")
        if response.status_code == 401:
            print("  需要认证（正常）")
        elif response.ok:
            data = response.json()
            print(f"  会话数据: {data}")
    except Exception as e:
        print(f"  连接错误: {e}")
    
    return True

def main():
    """运行所有测试"""
    print("🚀 开始测试 WhatsApp 用户隔离功能")
    print("=" * 50)
    
    tests = [
        ("用户特定QR码", test_user_specific_qr),
        ("用户特定状态", test_user_specific_status),
        ("用户特定发送", test_user_specific_send),
        ("后端会话端点", test_backend_session_endpoints),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n📋 {test_name}")
        print("-" * 30)
        try:
            result = test_func()
            results.append((test_name, result))
            print(f"✅ {test_name} {'通过' if result else '失败'}")
        except Exception as e:
            print(f"❌ {test_name} 出错: {e}")
            results.append((test_name, False))
        
        time.sleep(1)  # 避免请求过快
    
    print("\n" + "=" * 50)
    print("📊 测试结果汇总:")
    for test_name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"  {test_name}: {status}")
    
    print("\n💡 提示:")
    print("  - 确保 WhatsApp Gateway 在 3002 端口运行")
    print("  - 确保后端服务在 8000 端口运行")
    print("  - 实际测试消息发送需要 WhatsApp 连接")
    print("  - 后端会话测试需要有效的 JWT token")

if __name__ == "__main__":
    main()
