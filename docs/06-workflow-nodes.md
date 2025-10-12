# ⚙️ Workflow Nodes（MVP → 扩展版）

本文件定义工作流可用的节点类型及参数约定。  
每个节点存储在 `nodes[i].data.params`，执行器根据 `edges` 串行运行。  
执行失败会记录到 `run.log`，并回退到模板方案。

---

## 🔹 共通约定
- **params**：所有节点的配置参数（JSON 格式）  
- **context**：节点运行时共享的上下文，来自触发器或前序节点  
- **变量替换**：`{Name} {Budget} {Phone}` 等动态字段从 context/Sheet/DB 注入  

---

## 🟢 触发器类节点（Triggers）

### 1. SheetTrigger
从 Google Sheet 扫描符合条件的行。  
```json
{
  "sheet_id": "xxx",
  "worksheet": "Leads",
  "conditions": [
    {"key":"Status","op":"=","value":"Needs New Recommendation"},
    {"key":"Budget","op":">=","value":"800"}
  ],
  "poll_interval_sec": 60,
  "match_key": "UID"
}
````

**输出**：`context = { row, UID }`

---

### 2. NewMessageTrigger

监听新消息（入站），适合自动回复。

```json
{
  "source": "whatsapp",
  "match_key": "Phone",
  "conditions": [
    {"key":"text","op":"contains","value":"价格"},
    {"key":"text","op":"regex","value":"\\d{4}"}
  ]
}
```

**输出**：`context = { message: {from, text, channel}, customer }`

---

### 3. TimeTrigger

延迟 / 定时执行。

```json
{ "delay_minutes": 60 }
```

**输出**：保持原 context，不变。

---

### 4. WebhookTrigger（可选）

当外部系统调用 webhook 时触发。

```json
{
  "delay_minutes": 1440,
  "allowed_hours": [9, 22]   // 只允许 09:00 - 22:00 之间发送
}

```

---

### 5. ManualTrigger（可选）

手动触发，适合测试。

```json
{ "manual": true }
```

---

## 🔵 动作类节点（Actions）

### 1. SendWhatsAppMessage

发送 WhatsApp 消息，支持模板 / AI。

```json
{
  "mode": "template",
  "to": "{Phone}",
  "template": "Hi {Name}，这边有套{Room Type}符合你的预算{Budget}。",
  "ai_prompt": "You are a rental assistant ... variables: {Name} {Budget} ...",
  "variables": ["Name","Budget","Room Type"],
  "dry_run": false
}
```

---

### 2. UpdateSheet

更新 Google Sheet。

```json
{
  "sheet_id":"xxx",
  "worksheet":"Leads",
  "match_key":"UID",
  "updates": { "Status":"Followed", "Last_Contact":"now" }
}
```

---

### 3. UpdateCustomerDB

直接更新 DB（适合非 Sheet 的场景）。

```json
{
  "table":"customers",
  "match_key":"UID",
  "updates": { "status":"Viewing Scheduled" }
}
```

---

### 4. SendEmail（可选）

发送邮件，支持模板。

```json
{
  "to":"{Email}",
  "subject":"Viewing Confirmation",
  "body":"Dear {Name}, your viewing is confirmed on {Date}."
}
```

---

### 5. SendSMS（可选）

通过短信网关发送。

```json
{
  "to":"{Phone}",
  "body":"Hi {Name}, reminder for viewing at {Date}."
}
```

---

### 6. CreateTask

为客户生成一条任务（提醒跟进）。

```json
{
  "assign_to":"agent01",
  "title":"跟进 {Name} 看房确认",
  "due_in_hours":24
}
```

---

### 7. AddNote

在客户档案里添加备注。

```json
{
  "customer_id":"{UID}",
  "note":"客户说需要带猫入住，预算 {Budget}"
}
```

---

### 8. BranchCondition（条件分支）

根据 context 条件走不同分支。

```json
{
  "rules":[
    {"if":{"Budget":">=1200"},"goto":"nodeA"},
    {"if":{"Budget":"<1200"},"goto":"nodeB"}
  ]
}
```

---

## 🔴 建议的最小 MVP 节点集

* **触发器**：`SheetTrigger` + `NewMessageTrigger` + `TimeTrigger`
* **动作**：`SendWhatsAppMessage` + `UpdateSheet`

👉 足够覆盖 **表格驱动推荐** 和 **实时自动回复** 场景。

---

## ⚫ 后续扩展节点

* **SendEmail / SendSMS** → 多渠道消息
* **UpdateCustomerDB / AddNote / CreateTask** → 更强的 CRM 功能
* **BranchCondition** → 让流程灵活分流（if/else）
* **WebhookTrigger** → 打通支付、表单等外部事件

---

✅ 这样一份节点清单，能让你的工作流：

1. 支持 **自动回复**（NewMessageTrigger + SendWhatsAppMessage）
2. 支持 **自动跟进**（TimeTrigger + UpdateSheet + CreateTask）
3. 可扩展到 **多渠道 + CRM**（Email/SMS/Notes/Tasks）

```


