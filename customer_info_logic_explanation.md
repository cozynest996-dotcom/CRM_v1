# 客户基础信息获取逻辑详解

## 🔍 **客户信息获取流程**

### 1. **触发器阶段 - MessageTriggerProcessor**

当工作流被触发时，`MessageTriggerProcessor` 会根据触发消息的**手机号码**或**聊天ID**来查找或创建客户：

```python
# 1. 从触发数据中提取标识符
phone = trigger_data.get("phone")           # WhatsApp 手机号
chat_id = trigger_data.get("chat_id")       # Telegram 聊天ID
user_id = trigger_data.get("user_id")       # 系统用户ID

# 2. 查找客户的优先级逻辑
customer = None

# 优先级1: Telegram - 使用 chat_id 匹配
if channel == "telegram" and chat_id:
    customer = db.query(Customer).filter(
        Customer.telegram_chat_id == str(chat_id),
        Customer.user_id == user_id
    ).first()

# 优先级2: WhatsApp 或回退 - 使用 phone 匹配  
if not customer and phone:
    customer = db.query(Customer).filter(
        Customer.phone == phone,
        Customer.user_id == user_id
    ).first()

# 优先级3: 如果找不到客户，创建新客户
if not customer:
    customer = Customer(
        phone=phone or None,
        name=phone or (chat_id and f"tg_{chat_id}") or "unknown",
        status="active",
        user_id=user_id,
        telegram_chat_id=str(chat_id) if chat_id else None
    )
    db.add(customer)
    db.commit()
```

### 2. **客户信息存储到工作流上下文**

找到或创建客户后，客户信息会被存储到工作流上下文中：

```python
# 存储到上下文
self.context.db["customer"] = customer

# 创建可序列化的客户数据
customer_data = {
    "id": str(customer.id),
    "name": customer.name,
    "phone": customer.phone, 
    "status": customer.status,
    "user_id": customer.user_id,
    "telegram_chat_id": customer.telegram_chat_id
}
```

### 3. **其他节点中的客户信息获取**

在后续的工作流节点（如 `AIProcessor`、`UpdateDBProcessor`）中，如果需要客户信息：

```python
# 方法1: 从上下文获取（推荐）
customer = self.context.db.get("customer", None)

# 方法2: 如果上下文中没有，根据触发器数据重新查找
if not customer:
    trigger = self.context.get("trigger_data", {})
    phone = trigger.get("phone")
    user_id = trigger.get("user_id")
    if phone and user_id:
        customer = db.query(Customer).filter(
            Customer.phone == phone, 
            Customer.user_id == user_id
        ).first()
```

## 📋 **Customer 模型字段**

### **基础字段**：
- `id` - 客户唯一标识符 (UUID)
- `name` - 客户姓名
- `phone` - 客户电话号码 (WhatsApp 主要标识符)
- `email` - 客户邮箱
- `status` - 客户状态 (active/inactive 等)
- `photo_url` - 客户头像URL
- `last_message` - 最后一条消息内容
- `last_timestamp` - 最后消息时间戳
- `telegram_chat_id` - Telegram 聊天ID (Telegram 主要标识符)
- `unread_count` - 未读消息数量
- `stage_id` - 销售阶段ID
- `user_id` - 所属系统用户ID (多租户隔离)

### **自定义字段**：
- `custom_fields` - JSON 字段，存储动态的自定义数据
  ```json
  {
    "budget": "500000",
    "source": "微信",
    "preferred_location": "深圳南山区",
    "notes": "VIP客户"
  }
  ```

## 🔧 **变量解析格式**

### **客户基础信息变量**：
```typescript
// 旧格式 (向后兼容)
{{db.customer.name}}        // 客户姓名
{{db.customer.phone}}       // 客户电话
{{db.customer.email}}       // 客户邮箱

// 新格式 (推荐)
{{customer.name}}           // 客户姓名  
{{customer.phone}}          // 客户电话
{{customer.email}}          // 客户邮箱
{{customer.status}}         // 客户状态
{{customer.photo_url}}      // 头像URL
```

### **客户自定义字段变量**：
```typescript
// 旧格式 (向后兼容)
{{custom_fields.budget}}           // 预算
{{custom_fields.source}}           // 来源

// 新格式 (推荐)
{{customer.custom.budget}}         // 预算
{{customer.custom.source}}         // 来源  
{{customer.custom.preferred_location}}  // 偏好位置
```

## 🎯 **关键要点**

1. **多租户隔离**: 所有客户查询都必须包含 `user_id` 过滤条件
2. **双重标识符**: WhatsApp 使用 `phone`，Telegram 使用 `telegram_chat_id`
3. **自动创建**: 如果找不到匹配的客户，系统会自动创建新客户
4. **上下文传递**: 客户信息在工作流节点间通过 `self.context.db["customer"]` 传递
5. **向后兼容**: 支持旧的 `db.customer.*` 和 `custom_fields.*` 格式
6. **实时更新**: 客户的 `custom_fields` 可以通过 AI 分析实时更新

## 🚀 **最佳实践**

1. **优先使用新格式**: `{{customer.name}}` 而不是 `{{db.customer.name}}`
2. **自定义字段命名**: 使用下划线分隔的小写字母，如 `preferred_location`
3. **错误处理**: 变量解析器会优雅处理不存在的字段，返回空字符串
4. **性能考虑**: 客户信息在工作流开始时获取一次，后续节点复用
