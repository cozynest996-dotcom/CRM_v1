# Handoff + CTA 拉回流程示例

## 场景：客户咨询租房时突然问停车位问题

```
┌─────────────────┐
│  消息触发器      │ "我想租2房，预算3000，对了你们有停车位吗？"
└────────┬────────┘
         ↓
┌─────────────────┐
│  AI节点1        │ 
│  主流程分析      │ 置信度：0.55 (低于阈值0.7)
│  检测到偏题      │ → 识别到额外问题："停车位"
└────────┬────────┘
         ↓ (置信度低分支)
┌─────────────────┐
│  Handoff节点    │ 
│  处理偏题问题    │ "是的，我们大部分房源都有配套停车位..."
└────────┬────────┘
         ↓
┌─────────────────┐
│  发送消息节点    │ 发送 Handoff 回复
└────────┬────────┘
         ↓
┌─────────────────┐
│  AI节点2        │ 
│  CTA拉回        │ "停车位的问题清楚了吗？😊 
│                 │  那我们继续看看适合您预算3000的2房房源..."
└────────┬────────┘
         ↓
┌─────────────────┐
│  发送消息节点    │ 发送 CTA 话术
└────────┬────────┘
         ↓
┌─────────────────┐
│  等待客户回复    │ (可选：设置延迟节点等待)
└────────┬────────┘
         ↓
┌─────────────────┐
│  条件判断        │ 客户是否回应主流程？
└────┬──────┬─────┘
     │      │
     ↓是    ↓否
   主流程   再次Handoff
```

## 关键节点配置

### AI节点1 - 主流程分析
```json
{
  "type": "AI",
  "data": {
    "label": "主流程分析",
    "handoff_threshold": 0.7,
    "system_prompt": "分析客户租房需求，提取预算、位置、户型等信息。如果客户提出主流程外的问题（如停车、宠物、装修等），降低置信度并标记偏题类型。",
    "output_handles": ["true", "false"]
  }
}
```

### Handoff节点
```json
{
  "type": "Handoff",
  "data": {
    "label": "解答偏题问题",
    "knowledge_base": "parking_faq",
    "response_template": "关于{topic}的问题：{answer}"
  }
}
```

### AI节点2 - CTA拉回
```json
{
  "type": "AI",
  "data": {
    "label": "CTA拉回主流程",
    "system_prompt": "客户的额外问题已解答。现在生成一个自然的过渡话术，确认问题解决后，将话题引导回租房主需求（预算、位置、户型）。话术要自然、不生硬。",
    "temperature": 0.7,
    "context_vars": {
      "handoff_topic": "{{result.handoff.topic}}",
      "main_budget": "{{result.ai.analyze.budget}}",
      "main_location": "{{result.ai.analyze.location}}"
    }
  }
}
```

### 条件判断节点
```json
{
  "type": "Condition",
  "data": {
    "label": "是否回归主线",
    "mode": "visual",
    "conditions": [
      {
        "field": "customer_response",
        "operator": "contains",
        "value": ["好的", "看看", "有吗", "多少钱"]
      }
    ],
    "timeout": 300,
    "timeout_action": "回到主流程"
  }
}
```

## 上下文数据结构示例

```javascript
{
  "trigger": {
    "phone": "+60123456789",
    "message": "我想租2房，预算3000，对了你们有停车位吗？"
  },
  "ai": {
    "analyze": {
      "budget": 3000,
      "rooms": 2,
      "main_topic": "租房",
      "side_question": "停车位",
      "confidence": 0.55
    }
  },
  "handoff": {
    "topic": "停车位",
    "resolved": true,
    "answer": "是的，我们80%的房源都配有停车位..."
  },
  "cta": {
    "message": "停车位的问题清楚了吗？那我们继续看看预算3000的2房房源...",
    "intent": "pull_back_to_main"
  },
  "handoff_count": 1,
  "original_main_context": {
    "budget": 3000,
    "rooms": 2
  }
}
```

## 注意事项

1. **防止循环**：记录 `handoff_count`，超过阈值转人工
2. **保留上下文**：在 `original_main_context` 中保存主流程信息
3. **超时处理**：如果客户长时间不回复，可以再发一条温和提醒
4. **自然过渡**：CTA话术要自然，避免"请问您还有其他问题吗"这种生硬话术

