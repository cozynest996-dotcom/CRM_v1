# CustomAPI 智能变量测试指南

## ✅ 已修复的问题

1. **Template节点智能变量支持** - 现在支持 `{{var_1}}`, `{{var_2}}` 等智能变量
2. **CustomAPI节点转换器方法** - 添加了 `_apply_transformer()` 方法
3. **DbTrigger客户数据** - 修复了context.db存储问题

## 🧪 如何测试CustomAPI智能变量

### 方式1：在自动化界面创建工作流

1. **打开自动化页面**
   - 访问 http://localhost:3000/automation

2. **创建新工作流**
   - 点击"新建工作流"

3. **添加节点**：

   **a. MessageTrigger (消息触发器)**
   - 渠道：WhatsApp
   
   **b. CustomAPI (API调用)**
   - Method: POST
   - URL: `https://httpbin.org/post`
   - Headers: `{"Content-Type": "application/json"}`
   - Body:
     ```json
     {
       "customer_name": "{{var_name}}",
       "phone_last_4": "{{var_phone}}",
       "raw_phone": "{{trigger.phone}}",
       "raw_name": "{{trigger.name}}"
     }
     ```
   
   **智能变量配置**：
   - `var_name`:
     - Display Name: 客户姓名（首字）
     - Source: `{{trigger.name}}`
     - Transformer: First Word
   
   - `var_phone`:
     - Display Name: 电话后4位
     - Source: `{{trigger.phone}}`
     - Transformer: Last 4 Digits

   **c. Template (模板)**
   - 消息内容:
     ```
     ✅ API测试成功！
     
     智能变量结果：
     客户名（首字）: {{var_name}}
     电话后4位: {{var_phone}}
     
     原始数据：
     完整姓名: {{trigger.name}}
     完整电话: {{trigger.phone}}
     ```

   **d. SendWhatsAppMessage (发送消息)**
   - 使用默认配置

4. **连接节点**
   - MessageTrigger → CustomAPI → Template → SendWhatsAppMessage

5. **保存并激活工作流**

### 方式2：直接测试（推荐）

发送WhatsApp消息 "test api" 到系统，查看日志：

**预期日志输出**：
```
🔧 CustomAPI 节点开始执行...
  🧠 处理智能变量:
    找到 2 个智能变量
    处理变量: var_name
      数据源: {{trigger.name}}
      转换器: First Word
      解析后值: MK 2nd Hp No.
      转换后值: MK
    处理变量: var_phone
      数据源: {{trigger.phone}}
      转换器: Last 4 Digits
      解析后值: 601168208639
      转换后值: 8639
  
  📤 最终请求参数:
    Body: {
      "customer_name": "MK",
      "phone_last_4": "8639",
      "raw_phone": "601168208639",
      "raw_name": "MK 2nd Hp No."
    }
```

## 🎯 支持的转换器

CustomAPI节点支持以下智能变量转换器：

1. **Last 4 Digits** - 提取最后4位数字
   - 输入: "601168208639" → 输出: "8639"
   - 输入: "abc123def456" → 输出: "3456"

2. **First Word** - 提取第一个单词
   - 输入: "MK 2nd Hp No." → 输出: "MK"
   - 输入: "John Doe" → 输出: "John"

3. **Uppercase** - 转大写
   - 输入: "hello" → 输出: "HELLO"

4. **Lowercase** - 转小写
   - 输入: "HELLO" → 输出: "hello"

5. **Capitalize** - 首字母大写
   - 输入: "hello world" → 输出: "Hello world"

6. **Extract Email** - 提取邮箱地址
   - 输入: "Contact: john@example.com for more" → 输出: "john@example.com"

7. **Extract Phone** - 提取电话号码（所有数字）
   - 输入: "+60 11-6820-8639" → 输出: "601168208639"

## 📊 测试用例示例

### 测试1：电话号码处理
```
触发数据:
  name: "MK 2nd Hp No."
  phone: "601168208639"

智能变量:
  var_last4: {{trigger.phone}} + Last 4 Digits = "8639"
  var_first_name: {{trigger.name}} + First Word = "MK"
```

### 测试2：文本格式化
```
触发数据:
  name: "john doe"
  
智能变量:
  var_upper: {{trigger.name}} + Uppercase = "JOHN DOE"
  var_cap: {{trigger.name}} + Capitalize = "John doe"
```

### 测试3：数据提取
```
触发数据:
  message: "My email is test@example.com"
  
智能变量:
  var_email: {{trigger.message}} + Extract Email = "test@example.com"
```

## ⚠️ 注意事项

1. **智能变量只在以下节点中可用**：
   - Template 节点
   - CustomAPI 节点

2. **变量命名规则**：
   - 必须以 `var_` 开头
   - 例如：`var_name`, `var_phone`, `var_email`

3. **Source必须是有效的变量路径**：
   - `{{trigger.phone}}`
   - `{{trigger.name}}`
   - `{{trigger.message}}`
   - `{{db.customer.email}}`

4. **转换器是可选的**：
   - 如果不选择转换器，将直接使用source的值

## 🔍 调试技巧

1. **查看后端日志**：
   ```bash
   docker-compose logs -f backend | grep "智能变量"
   ```

2. **检查变量解析**：
   后端会打印详细的变量解析过程，包括：
   - 原始source值
   - 解析后的值
   - 转换器应用结果

3. **验证API请求**：
   使用httpbin.org可以看到实际发送的数据


