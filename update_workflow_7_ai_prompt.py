#!/usr/bin/env python3

import sqlite3
import json
import requests

# JWT Token - 请替换为有效的 token
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Im1pbmdrdW4xOTk5QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc2MDQzNTc2NSwiaWF0IjoxNzU5ODMwOTY1fQ.wuSqXbq0GdQ7qmAeU_RcmFw0pSnjnQloAzw3B95_Zlc"

# 新的 System Prompt
NEW_SYSTEM_PROMPT = """
你是一个专业的房产中介。你的任务是：1) 分析客户的咨询内容和意图 2) 根据客户信息提供专业、友好的回复 3) 如果是询问房源，要表现出热情和专业性 4) 回复要简洁但有用。请以严格的 JSON 格式返回结果，包含 'analyze' 和 'reply' 对象，以及一个 'meta' 对象，其中 'analyze' 包含 'confidence' (0.0-1.0，反映你对回复的确定性)，'meta' 包含 'handoff' 对象（如果需要转人工，设置 'triggered' 为 true，并提供 'reason'）。

示例 JSON 格式:
{
  "analyze": {
    "updates": {},
    "uncertain": [],
    "reason": "分析原因",
    "confidence": 0.9
  },
  "reply": {
    "reply_text": "回复内容",
    "followup_questions": [],
    "suggested_tags": []
  },
  "meta": {
    "used_profile": "ai_assistant",
    "separator": "|||",
    "safe_to_send_before_db_update": true,
    "handoff": {
      "triggered": false,
      "reason": null,
      "confidence": 0.9
    }
  }
}
"""

# 连接数据库
conn = sqlite3.connect('backend/crm.db')
cursor = conn.cursor()

# 获取工作流 7 的详细信息
cursor.execute("SELECT id, name, nodes, edges FROM workflows WHERE id = 7")
workflow = cursor.fetchone()

if workflow:
    workflow_id, name, nodes_json, edges_json = workflow
    nodes = json.loads(nodes_json)
    edges = json.loads(edges_json)
    
    print(f"工作流 ID: {workflow_id}")
    print(f"工作流名称: {name}")
    
    print("\n=== 更新 AI 节点 System Prompt ===")
    ai_node_id = "AI_1759761365245"
    ai_node_found = False
    
    for i, node in enumerate(nodes):
        if node.get('id') == ai_node_id:
            ai_node_found = True
            old_system_prompt = node.get('data', {}).get('system_prompt', '')
            node['data']['system_prompt'] = NEW_SYSTEM_PROMPT
            print(f"AI 节点 {ai_node_id} 的 System Prompt 已更新。")
            print(f"  旧 System Prompt 长度: {len(old_system_prompt)}")
            print(f"  新 System Prompt 长度: {len(NEW_SYSTEM_PROMPT)}")
            break
            
    if not ai_node_found:
        print(f"未找到 AI 节点 {ai_node_id}，无法更新 System Prompt。")
        
    # 更新数据库
    updated_nodes_json = json.dumps(nodes)
    cursor.execute("UPDATE workflows SET nodes = ? WHERE id = 7", (updated_nodes_json,))
    conn.commit()
    
    print("✅ 数据库更新完成")
    
    # 同时通过 API 更新（确保前端同步）
    try:
        headers = {
            'Authorization': f'Bearer {AUTH_TOKEN}',
            'Content-Type': 'application/json'
        }
        
        workflow_data = {
            'name': name,
            'nodes': nodes,
            'edges': edges,
            'is_active': True
        }
        
        response = requests.put(
            f'http://localhost:8000/api/workflows/7',
            headers=headers,
            json=workflow_data
        )
        
        if response.status_code == 200:
            print("✅ API 更新成功")
        else:
            print(f"⚠️ API 更新失败: {response.status_code} - {response.text}")
    
    except Exception as e:
        print(f"⚠️ API 更新异常: {e}")

else:
    print("未找到工作流 ID 7")

conn.close()
