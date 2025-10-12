#!/usr/bin/env python3

"""
測試聊天功能的用戶隔離
確保用戶只能看到自己的客戶和消息
"""

import requests
import sys
import os

# 測試用的 JWT tokens
USER1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Im1pbmdrdW4xOTk5QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc1OTUwNDAxNSwiaWF0IjoxNzU4ODk5MjE1fQ.l56bbBEUs0DTd9r1PAWaSFmyyouDpws7rdi1AHmVX5A"
USER2_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyLCJlbWFpbCI6ImNvenluZXN0OTk2QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc1OTUwNDY1MywiaWF0IjoxNzU4ODk5ODUzfQ.6pzNX0eET80L9n2l-gj2uDacSGU8aRlxYhgO_bZ_xYg"

API_BASE = 'http://localhost:8000'

def test_customer_isolation():
    """測試客戶列表隔離"""
    print("🧪 測試客戶列表隔離...")
    
    # 用戶1獲取客戶列表
    response1 = requests.get(
        f"{API_BASE}/api/customers/summary",
        headers={'Authorization': f'Bearer {USER1_TOKEN}'}
    )
    
    if response1.status_code == 200:
        customers1 = response1.json()
        print(f"✅ 用戶1看到 {len(customers1)} 個客戶")
        for c in customers1:
            print(f"  - {c['name']} ({c['phone']})")
    else:
        print(f"❌ 用戶1獲取客戶失敗: {response1.status_code}")
        return False
    
    # 用戶2獲取客戶列表
    response2 = requests.get(
        f"{API_BASE}/api/customers/summary",
        headers={'Authorization': f'Bearer {USER2_TOKEN}'}
    )
    
    if response2.status_code == 200:
        customers2 = response2.json()
        print(f"✅ 用戶2看到 {len(customers2)} 個客戶")
        for c in customers2:
            print(f"  - {c['name']} ({c['phone']})")
    else:
        print(f"❌ 用戶2獲取客戶失敗: {response2.status_code}")
        return False
    
    # 檢查是否有重疊
    user1_customer_ids = {c['id'] for c in customers1}
    user2_customer_ids = {c['id'] for c in customers2}
    overlap = user1_customer_ids & user2_customer_ids
    
    if overlap:
        print(f"❌ 發現客戶重疊！共同客戶ID: {overlap}")
        return False
    else:
        print("✅ 客戶列表完全隔離，無重疊")
        return True

def test_message_isolation():
    """測試消息隔離"""
    print("\n🧪 測試消息存取隔離...")
    
    # 用戶1獲取客戶列表
    response1 = requests.get(
        f"{API_BASE}/api/customers/summary",
        headers={'Authorization': f'Bearer {USER1_TOKEN}'}
    )
    
    if response1.status_code != 200 or not response1.json():
        print("❌ 用戶1沒有客戶，跳過消息測試")
        return True
    
    customers1 = response1.json()
    customer1_id = customers1[0]['id']
    
    # 用戶1存取自己的消息（應該成功）
    response = requests.get(
        f"{API_BASE}/api/messages/{customer1_id}",
        headers={'Authorization': f'Bearer {USER1_TOKEN}'}
    )
    
    if response.status_code == 200:
        messages = response.json()
        print(f"✅ 用戶1成功存取自己的客戶消息 ({len(messages)} 條)")
    else:
        print(f"❌ 用戶1無法存取自己的消息: {response.status_code}")
        return False
    
    # 用戶2嘗試存取用戶1的消息（應該失敗）
    response = requests.get(
        f"{API_BASE}/api/messages/{customer1_id}",
        headers={'Authorization': f'Bearer {USER2_TOKEN}'}
    )
    
    if response.status_code == 404:
        print("✅ 用戶2正確被拒絕存取其他用戶的消息")
        return True
    else:
        print(f"❌ 安全漏洞！用戶2可以存取其他用戶的消息: {response.status_code}")
        return False

def test_cross_user_send():
    """測試跨用戶發送消息"""
    print("\n🧪 測試跨用戶發送消息隔離...")
    
    # 用戶1獲取客戶列表
    response1 = requests.get(
        f"{API_BASE}/api/customers/summary",
        headers={'Authorization': f'Bearer {USER1_TOKEN}'}
    )
    
    if response1.status_code != 200 or not response1.json():
        print("❌ 用戶1沒有客戶，跳過發送測試")
        return True
    
    customers1 = response1.json()
    customer1_id = customers1[0]['id']
    
    # 用戶2嘗試向用戶1的客戶發送消息（應該失敗）
    response = requests.post(
        f"{API_BASE}/api/messages/send",
        headers={'Authorization': f'Bearer {USER2_TOKEN}', 'Content-Type': 'application/json'},
        json={'customer_id': customer1_id, 'content': '測試跨用戶發送'}
    )
    
    if response.status_code == 404:
        print("✅ 用戶2正確被拒絕向其他用戶的客戶發送消息")
        return True
    else:
        print(f"❌ 安全漏洞！用戶2可以向其他用戶的客戶發送消息: {response.status_code}")
        return False

def main():
    print("🔒 開始測試聊天功能用戶隔離...")
    
    tests = [
        ("客戶列表隔離", test_customer_isolation),
        ("消息存取隔離", test_message_isolation),
        ("跨用戶發送隔離", test_cross_user_send)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} 測試出錯: {str(e)}")
            results.append((test_name, False))
    
    print("\n" + "="*60)
    print("📊 測試結果總結:")
    all_passed = True
    for test_name, passed in results:
        status = "✅ 通過" if passed else "❌ 失敗"
        print(f"  {status} {test_name}")
        if not passed:
            all_passed = False
    
    if all_passed:
        print("\n🎉 所有測試通過！聊天功能用戶隔離正常工作。")
    else:
        print("\n⚠️ 有測試失敗，請檢查用戶隔離實現。")
    
    return all_passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
