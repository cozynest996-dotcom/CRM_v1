# 🗄️ 数据库架构设计 - 多用户聊天记录存储

## 📋 **表结构概览**

我们采用的是**共享表 + user_id 隔离**的架构，而不是每个用户一个表。

### **🎯 核心设计原理**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    Users    │    │  Customers  │    │  Messages   │
│  (用户表)    │    │  (客户表)    │    │  (消息表)    │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ id (PK)     │◄───┤ user_id (FK)│◄───┤ user_id (FK)│
│ email       │    │ id (PK)     │◄───┤ customer_id │
│ name        │    │ name        │    │ direction   │
│ subscription│    │ phone       │    │ content     │
│ ...         │    │ ...         │    │ timestamp   │
└─────────────┘    └─────────────┘    └─────────────┘
```

## 🔐 **数据隔离机制**

### **1. 用户级别隔离**
每条记录都包含 `user_id` 字段，确保：
- ✅ 用户A只能看到自己的客户
- ✅ 用户A只能看到自己的聊天记录
- ✅ 用户A无法访问用户B的任何数据

### **2. 数据查询示例**

```sql
-- 获取用户123的所有客户
SELECT * FROM customers WHERE user_id = 123;

-- 获取用户123与客户456的聊天记录
SELECT * FROM messages 
WHERE user_id = 123 AND customer_id = 456 
ORDER BY timestamp;

-- 获取用户123的所有聊天记录
SELECT m.*, c.name, c.phone 
FROM messages m 
JOIN customers c ON m.customer_id = c.id 
WHERE m.user_id = 123 AND c.user_id = 123;
```

## 📊 **具体表结构**

### **Users 表（用户表）**
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    google_id VARCHAR(100) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    subscription_plan_id INTEGER,
    subscription_status VARCHAR(20) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### **Customers 表（客户表）**
```sql
CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,  -- 🔑 关键：用户隔离字段
    name VARCHAR NOT NULL,
    phone VARCHAR UNIQUE NOT NULL,
    status VARCHAR DEFAULT 'new',
    remark TEXT,
    photo_url VARCHAR,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### **Messages 表（消息表）**
```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,     -- 🔑 关键：用户隔离字段
    customer_id INTEGER NOT NULL, -- 🔑 关联到具体客户
    direction VARCHAR NOT NULL,    -- 'inbound' | 'outbound'
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ack INTEGER DEFAULT 1,        -- 消息状态
    whatsapp_id VARCHAR,          -- WhatsApp消息ID
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

## 🎯 **为什么选择这种架构？**

### **✅ 优势**

#### **1. 数据完整性**
- 所有用户数据在同一个数据库中
- 便于管理员查看整体统计
- 数据备份和维护简单

#### **2. 查询效率**
- 通过索引优化查询性能
- 支持跨用户的聚合统计
- 便于实现全局搜索功能

#### **3. 扩展性好**
- 支持用户权限管理
- 便于添加管理员功能
- 支持数据分析和报告

#### **4. 开发简便**
- 减少数据库连接复杂性
- 统一的数据访问模式
- 便于ORM框架使用

### **🚫 为什么不用每用户一表？**

#### **问题1: 数据库管理复杂**
```python
# 每用户一表的问题
def get_user_messages(user_id):
    table_name = f"messages_user_{user_id}"
    # 需要动态创建表、管理连接等
    return query(f"SELECT * FROM {table_name}")
```

#### **问题2: 扩展困难**
- 新用户需要创建新表
- 数据库迁移复杂
- 无法进行跨用户分析

#### **问题3: 性能问题**
- 大量表会影响数据库性能
- 备份和恢复复杂
- 索引管理困难

## 🔒 **安全性保证**

### **1. API级别隔离**
```python
# 所有API都必须验证用户身份
@router.get("/messages/{customer_id}")
async def get_messages(
    customer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 确保客户属于当前用户
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.user_id == current_user.id  # 🔑 用户隔离
    ).first()
    
    if not customer:
        raise HTTPException(404, "Customer not found")
    
    # 只返回该用户的消息
    messages = db.query(Message).filter(
        Message.customer_id == customer_id,
        Message.user_id == current_user.id  # 🔑 用户隔离
    ).all()
    
    return messages
```

### **2. 数据库级别约束**
```sql
-- 确保消息只能关联到同一用户的客户
ALTER TABLE messages 
ADD CONSTRAINT check_user_customer 
CHECK (
    user_id = (
        SELECT user_id FROM customers 
        WHERE id = customer_id
    )
);
```

## 📈 **性能优化**

### **1. 索引策略**
```sql
-- 用户相关的复合索引
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_messages_user_customer ON messages(user_id, customer_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
```

### **2. 查询优化**
```python
# 使用 SQLAlchemy 的高效查询
def get_user_chat_history(user_id: int, limit: int = 100):
    return db.query(Message).join(Customer).filter(
        Message.user_id == user_id,
        Customer.user_id == user_id
    ).order_by(Message.timestamp.desc()).limit(limit).all()
```

## 🎯 **实际使用示例**

### **用户A的数据（user_id = 1）**
```
Customers:
- id: 101, user_id: 1, name: "张三", phone: "13800138001"
- id: 102, user_id: 1, name: "李四", phone: "13800138002"

Messages:
- id: 1001, user_id: 1, customer_id: 101, content: "你好"
- id: 1002, user_id: 1, customer_id: 101, content: "欢迎咨询"
- id: 1003, user_id: 1, customer_id: 102, content: "产品介绍"
```

### **用户B的数据（user_id = 2）**
```
Customers:
- id: 201, user_id: 2, name: "王五", phone: "13900139001"

Messages:
- id: 2001, user_id: 2, customer_id: 201, content: "咨询价格"
```

**用户A永远无法看到用户B的数据，反之亦然。**

## 🚀 **扩展功能**

### **1. 团队协作**
```sql
-- 未来可添加团队表
CREATE TABLE teams (
    id INTEGER PRIMARY KEY,
    name VARCHAR NOT NULL,
    owner_id INTEGER REFERENCES users(id)
);

-- 团队成员表
CREATE TABLE team_members (
    team_id INTEGER REFERENCES teams(id),
    user_id INTEGER REFERENCES users(id),
    role VARCHAR DEFAULT 'member'
);
```

### **2. 数据共享**
```python
# 支持团队内数据共享
def get_team_messages(user_id: int):
    team_ids = get_user_teams(user_id)
    team_users = get_team_users(team_ids)
    
    return db.query(Message).filter(
        Message.user_id.in_(team_users)
    ).all()
```

## 💡 **总结**

我们的架构：
- ✅ **安全**: 通过 user_id 确保数据隔离
- ✅ **高效**: 单一数据库，优化查询
- ✅ **可扩展**: 支持团队、权限等高级功能
- ✅ **易维护**: 统一的数据结构和访问模式

这种设计既保证了多租户的数据安全，又保持了系统的简洁性和性能！
