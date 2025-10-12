#!/usr/bin/env python3
"""
更新 workflow 7 的 AI 节点 system_prompt，硬性要求返回带置信度的 JSON
"""

import sqlite3
import json
import sys

# 数据库路径
DB_PATH = r"C:\Users\mingk\CRM_Automation\backend\crm.db"

# 改进的 system_prompt
IMPROVED_SYSTEM_PROMPT = """You are a professional real estate assistant. You MUST return ONLY valid JSON (no extra text before or after).

CRITICAL: Your response must be valid JSON following this exact schema:

{
  "analyze": {
    "updates": {},
    "uncertain": [],
    "reason": "Brief explanation for your confidence level (1-2 sentences)",
    "confidence": 0.0
  },
  "reply": {
    "reply_text": "Your helpful response to the customer",
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
      "confidence": 0.0
    }
  }
}

CONFIDENCE SCORING (MANDATORY - DO NOT use 0.0 unless truly uncertain):
- 0.0-0.2: Cannot answer / No relevant information / Complete uncertainty
- 0.3-0.5: Some uncertainty / Partial information / Need clarification  
- 0.6-0.8: Good confidence / Clear information available
- 0.9-1.0: Very high confidence / Exact factual answer / Direct evidence

HANDOFF LOGIC:
- Set "handoff.triggered": true if you cannot provide a helpful answer
- Set "handoff.triggered": false if you can provide a useful response
- Always set "handoff.confidence" to match your "analyze.confidence"
- In "analyze.reason", briefly explain why you chose that confidence level

EXAMPLES:
- Real estate question with clear answer → confidence: 0.8-0.9, handoff: false
- Vague inquiry needing clarification → confidence: 0.4-0.6, handoff: false  
- Completely unrelated topic → confidence: 0.1-0.2, handoff: true
- Technical issue you cannot help with → confidence: 0.0-0.1, handoff: true

Remember: Return ONLY the JSON. No markdown, no explanations, just valid JSON."""

def main():
    try:
        # 连接数据库
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 查询 workflow 7 的节点配置
        cursor.execute("SELECT nodes FROM workflows WHERE id = 7")
        result = cursor.fetchone()
        
        if not result:
            print("❌ Workflow 7 not found")
            return
            
        nodes = json.loads(result[0])
        print("✅ Found workflow 7 nodes")
        
        # 查找 AI 节点
        ai_node = None
        for node in nodes:
            if node.get('type') == 'AI': # 注意这里是 'AI' (大写)
                ai_node = node
                break
                
        if not ai_node:
            print("❌ AI node not found in workflow 7")
            return
            
        print(f"✅ Found AI node: {ai_node['id']}")
        
        # 更新 system_prompt
        old_prompt = ai_node['data'].get('system_prompt', '')
        ai_node['data']['system_prompt'] = IMPROVED_SYSTEM_PROMPT
        
        print("📝 Old system_prompt preview:")
        print(old_prompt[:200] + "..." if len(old_prompt) > 200 else old_prompt)
        print("\n📝 New system_prompt preview:")
        print(IMPROVED_SYSTEM_PROMPT[:200] + "...")
        
        # 准备更新后的节点配置
        updated_nodes_json = json.dumps(nodes)
        print("\n🔍 Debug: JSON to be written to DB (first 500 chars):")
        print(updated_nodes_json[:500] + "...")
        
        # 保存更新后的节点配置
        cursor.execute("UPDATE workflows SET nodes = ? WHERE id = 7", (updated_nodes_json,))
        conn.commit()
        
        if cursor.rowcount > 0:
            print("✅ Successfully updated workflow 7 AI node system_prompt in DB.")
            print("🔄 Please restart the backend to load the new prompt")
        else:
            print("⚠️ Warning: No rows were updated for workflow 7. Check if ID 7 exists.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main()
