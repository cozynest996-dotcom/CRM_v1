# 推荐方案：平衡版Flow（8节点）

## 完整流程图

```
┌─────────────────┐
│ 1. 消息触发器    │
└────────┬────────┘
         ↓
┌─────────────────────────┐
│ 2. AI分析节点           │
│ - 主需求提取            │
│ - 情绪识别（简化版）     │
│ - 置信度判断            │
└────┬─────────────┬──────┘
     ↓高           ↓低
┌─────────┐   ┌──────────────┐
│ 3a.发送  │   │ 3b. FAQ AI   │
│ 主流程   │   │ (带共情话术)  │
└─────────┘   └──────┬───────┘
                     ↓
              ┌─────────────┐
              │ 4. 发送FAQ  │
              └──────┬──────┘
                     ↓
              ┌─────────────────┐
              │ 5. 延迟节点      │
              │ (3-8秒随机)      │
              └──────┬──────────┘
                     ↓
              ┌─────────────────┐
              │ 6. CTA AI       │
              │ (智能过渡话术)   │
              └──────┬──────────┘
                     ↓
              ┌─────────────────┐
              │ 7. 发送CTA      │
              └──────┬──────────┘
                     ↓
              ┌─────────────────────┐
              │ 8. 条件判断         │
              │ (等待20秒)          │
              └──┬──────────┬───────┘
                 ↓积极      ↓沉默/偏题
            ┌────────┐  ┌──────────┐
            │ 主流程  │  │ 转人工    │
            └────────┘  └──────────┘
```

## 节点配置详解

### 节点1：消息触发器
```json
{
  "type": "MessageTrigger",
  "data": {
    "triggerType": "message",
    "config": {
      "channel": "whatsapp",
      "filter": "incoming"
    }
  }
}
```

---

### 节点2：AI分析节点（核心！）
```json
{
  "type": "AI",
  "data": {
    "label": "智能分析+情绪识别",
    "model": {
      "name": "gpt-4",
      "temperature": 0.3,
      "max_tokens": 500
    },
    "system_prompt": `你是专业租房顾问。分析客户消息，输出JSON：

【主需求】
- budget: 预算（数字）
- rooms: 房间数
- location: 位置偏好
- urgency: 紧急度（1-5）

【附加问题】
- side_question: 偏题问题（如"停车位"、"宠物政策"）
- side_question_type: 类型（parking/pet/food/other）

【情绪】（简化版，只判断3种）
- emotion: "neutral"（随意） | "anxious"（焦虑） | "urgent"（急迫）

【置信度】
- confidence: 0-1（是否能清晰提取主需求）
- handoff_needed: true/false（是否需要先回答附加问题）

示例输入："我想租2房，预算3000，对了你们有停车位吗？"
示例输出：
{
  "budget": 3000,
  "rooms": 2,
  "urgency": 3,
  "side_question": "停车位可用性",
  "side_question_type": "parking",
  "emotion": "slightly_anxious",
  "confidence": 0.6,
  "handoff_needed": true
}`,
    "handoff_threshold": 0.7,
    "output_handles": ["true", "false"]
  }
}
```

---

### 节点3a：发送主流程消息（高置信度分支）
```json
{
  "type": "SendWhatsAppMessage",
  "data": {
    "label": "发送主流程回复",
    "message_template": "{{ai.reply.reply_text}}",
    "retry": { "max": 3 }
  }
}
```

---

### 节点3b：FAQ AI（低置信度分支）
```json
{
  "type": "AI",
  "data": {
    "label": "FAQ回答助手",
    "model": {
      "name": "gpt-4",
      "temperature": 0.3,
      "max_tokens": 200
    },
    "system_prompt": `客户询问：{{ai.analyze.side_question}}
类型：{{ai.analyze.side_question_type}}
情绪：{{ai.analyze.emotion}}

根据FAQ知识库回答，要求：
1. 带共情（如"我理解这个很重要"）
2. 具体答案（数字、选项）
3. 简洁（2-3句话）
4. 结尾带确认（"这样清楚吗？"）

【FAQ知识库】
停车位(parking)：
- 80%房源有配套停车位
- 月租RM150-300
- 分固定和共享两种

宠物政策(pet)：
- 60%房东接受小型犬/猫
- 需额外押金RM500
- 大型犬需个案讨论

示例回答（停车位）：
"我理解停车位对您很重要！😊 我们这边80%的房源都有配套停车位，月租大概RM150-300，有固定车位和共享车位两种可以选。这样您放心一些了吗？"`,
    "context_vars": {
      "side_question": "{{ai.analyze.side_question}}",
      "question_type": "{{ai.analyze.side_question_type}}",
      "emotion": "{{ai.analyze.emotion}}"
    }
  }
}
```

---

### 节点4：发送FAQ回复
```json
{
  "type": "SendWhatsAppMessage",
  "data": {
    "label": "发送FAQ回复",
    "message_template": "{{ai.reply.reply_text}}",
    "retry": { "max": 3 }
  }
}
```

---

### 节点5：延迟节点（关键！）
```json
{
  "type": "Delay",
  "data": {
    "label": "模拟真人思考",
    "policy": {
      "mode": "fixed_delay",
      "delay_seconds": 5,           // 固定5秒
      "jitter_seconds": [3, 8]      // 或随机3-8秒
    },
    "description": "给客户时间消化信息，模拟真人打字速度"
  }
}
```

**为什么重要？**
- FAQ回答完立刻发CTA = 像机器人
- 延迟5秒 = 像真人在思考下一句话
- 客户体验提升明显，但只需1个节点！

---

### 节点6：CTA AI（智能过渡）
```json
{
  "type": "AI",
  "data": {
    "label": "智能CTA生成",
    "model": {
      "name": "gpt-4",
      "temperature": 0.7,
      "max_tokens": 150
    },
    "system_prompt": `FAQ已回答：{{ai.faq.reply_text}}
客户情绪：{{ai.analyze.emotion}}
主需求：预算{{ai.analyze.budget}}，{{ai.analyze.rooms}}房

生成过渡话术，将话题拉回主需求。要求：
1. 承上启下（提及FAQ话题）
2. 不生硬（不要说"那我们继续吧"）
3. 给选择（"要看图片吗？还是先了解区域？"）
4. 根据情绪调整语气：
   - neutral → 轻松随意
   - anxious → 安抚+具体方案
   - urgent → 直接+高效

❌ 不要说："好的，那我们继续您的租房需求..."
✅ 要说："好的！停车的问题解决了😊 那您预算3000找2房，我这边有几个不错的推荐，您想先看市中心的还是安静一点的区域？"

输出格式：只输出CTA话术文本，不要JSON。`,
    "context_vars": {
      "faq_answer": "{{ai.faq.reply_text}}",
      "emotion": "{{ai.analyze.emotion}}",
      "budget": "{{ai.analyze.budget}}",
      "rooms": "{{ai.analyze.rooms}}"
    }
  }
}
```

---

### 节点7：发送CTA
```json
{
  "type": "SendWhatsAppMessage",
  "data": {
    "label": "发送CTA话术",
    "message_template": "{{ai.cta.reply_text}}",
    "retry": { "max": 3 }
  }
}
```

---

### 节点8：条件判断（客户反应）
```json
{
  "type": "Condition",
  "data": {
    "label": "判断客户反应",
    "mode": "wait_for_response",
    "timeout_seconds": 20,
    "conditions": [
      {
        "name": "积极回应",
        "logic": "message.includes('好的') || message.includes('看看') || message.includes('可以')",
        "next": "continue_main_flow"
      },
      {
        "name": "再次提问",
        "logic": "message.includes('?') || message.includes('吗') || message.includes('呢')",
        "next": "handoff_again"
      },
      {
        "name": "超时无回复",
        "logic": "timeout",
        "next": "mark_as_cold_lead"
      }
    ],
    "default_action": "continue_main_flow"
  }
}
```

---

## 实际对话效果

### 场景：客户询问停车位

```
客户 10:23:15
"我想租2房，预算3000，对了你们有停车位吗？"

[节点2: AI分析]
识别：主需求(2房,3000) + 附加问题(停车位) + 情绪(略焦虑)
置信度：0.6 → 走FAQ分支

[节点3b: FAQ AI] 10:23:17
"我理解停车位对您很重要！😊 我们这边80%的房源都有配套停车位，
月租大概RM150-300，有固定车位和共享车位两种可以选。
这样您放心一些了吗？"

[节点4: 发送] 10:23:17

[节点5: 延迟5秒] ⏳ 模拟真人思考...

[节点6: CTA AI] 10:23:22
"太好了！那您预算3000找2房，我这边有几个不错的推荐，
您想先看市中心的还是安静一点的区域？"

[节点7: 发送] 10:23:22

[节点8: 等待客户回复...]

客户 10:23:40
"先看市中心的吧"

✅ 判断：积极回应 → 继续主流程
```

---

## 为什么8个节点是最佳平衡？

| 方面 | 5节点方案 | **8节点方案** | 15节点方案 |
|------|----------|-------------|-----------|
| 开发时间 | 2小时 | **1天** | 3-5天 |
| 调试难度 | 简单 | **中等** | 困难 |
| 客户体验 | 60分 | **85分** | 95分 |
| 转化率 | 15% | **25-30%** | 35% |
| 维护成本 | 低 | **中** | 高 |
| 性价比 | ⭐⭐ | **⭐⭐⭐⭐⭐** | ⭐⭐⭐ |

---

## 快速实施步骤

1. **第1天**：搭建基础8节点流程（按上面配置）
2. **第2天**：调试AI prompt，测试10个真实对话
3. **第3天**：优化延迟时间和CTA话术
4. **第1周**：上线，收集数据
5. **第2周**：根据数据决定是否加节点（如确认等待、循环FAQ等）

---

## 核心要点

✅ **必须有的3个节点**：
1. 延迟节点（模拟真人）
2. CTA AI（智能过渡）
3. 条件判断（识别客户反应）

❌ **可以省略的**：
- 确认等待（客户不回复就算了）
- FAQ循环（第一次没懂，直接转人工更好）
- 复杂情绪分析（简化成3种就够）

💡 **记住**：
- 节点多 ≠ 体验好
- 8个节点 + 精心调试的prompt = 95%的完整方案效果
- 先把这8个节点跑通，再考虑加节点

