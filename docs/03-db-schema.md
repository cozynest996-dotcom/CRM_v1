# 🗄️ 数据库设计 - WhatsApp CRM 系统

本文档描述了 WhatsApp CRM 系统的完整数据库设计，使用 SQLite 作为主要存储引擎。

---

## 📊 数据库概览

**数据库类型**: SQLite  
**文件位置**: `app.db`  
**ORM 框架**: SQLAlchemy  
**迁移工具**: Alembic  

---

## 📋 核心表结构

### 1. customers - 客户信息表

存储所有客户的基本信息和状态数据。

```sql
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR NOT NULL,                  -- 客户姓名
    phone VARCHAR UNIQUE NOT NULL,          -- 电话号码 (唯一)
    status VARCHAR DEFAULT 'new' NOT NULL,  -- 客户状态
    remark VARCHAR,                         -- 备注信息
    extra_fields JSON DEFAULT '{}',         -- 扩展字段
    photo_url VARCHAR,                      -- 头像URL
    unread_count INTEGER DEFAULT 0,         -- 未读消息数
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- 索引
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_created_at ON customers(created_at);
```

**字段说明:**
- `id`: 主键，自增ID
- `name`: 客户姓名，从 WhatsApp 联系人获取
- `phone`: 电话号码，格式如 "60123456789"
- `status`: 客户状态 ("new", "active", "inactive")
- `remark`: 手动添加的备注信息
- `extra_fields`: JSON 字段，存储自定义属性
- `photo_url`: WhatsApp 头像链接
- `unread_count`: 未读消息计数

### 2. messages - 消息记录表

存储所有的消息历史，包括入站和出站消息。

```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,           -- 关联客户ID
    direction VARCHAR NOT NULL,             -- 消息方向: inbound/outbound
    content TEXT NOT NULL,                  -- 消息内容
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ack INTEGER DEFAULT 1,                  -- 消息状态
    whatsapp_id VARCHAR,                    -- WhatsApp消息ID
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 索引
CREATE INDEX idx_messages_customer_id ON messages(customer_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_whatsapp_id ON messages(whatsapp_id);
```

**字段说明:**
- `customer_id`: 外键，关联到 customers 表
- `direction`: "inbound" (收到) 或 "outbound" (发送)
- `content`: 消息文本内容
- `ack`: 消息状态码
  - `1`: 已发送 (sent)
  - `2`: 已送达 (delivered)  
  - `3`: 已读 (read)
  - `4`: 已播放 (played, 语音消息)
- `whatsapp_id`: WhatsApp 平台的消息ID，用于状态追踪

### 3. tables - 动态表格定义

支持用户自定义数据表格的元数据存储。

```sql
CREATE TABLE tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR UNIQUE NOT NULL,           -- 表名
    description VARCHAR,                    -- 表描述
    fields JSON DEFAULT '{}',               -- 字段定义
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4. records - 动态表格数据

存储动态表格的实际数据记录。

```sql
CREATE TABLE records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,             -- 关联表格ID
    data JSON DEFAULT '{}',                 -- 数据内容
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY (table_id) REFERENCES tables(id)
);
```

---

## 🔗 关系设计

### 主要关联关系

```
customers (1) ──────── (N) messages
    │
    ├── id ────────────── customer_id
    ├── phone ──────────── 关联WhatsApp账号
    └── unread_count ───── 统计未读消息

tables (1) ──────────── (N) records
    │
    ├── id ────────────── table_id  
    └── fields ─────────── 定义数据结构
```

### 数据完整性

**外键约束:**
- `messages.customer_id` → `customers.id`
- `records.table_id` → `tables.id`

**唯一性约束:**
- `customers.phone` - 每个电话号码唯一
- `tables.name` - 表名唯一

---

## 📊 典型数据示例

### customers 表数据示例

| id | name   | phone       | status | photo_url | unread_count | created_at |
|----|--------|-------------|--------|-----------|--------------|------------|
| 1  | MK Gan | 60127878560 | new    | https://... | 0          | 2025-09-23 |
| 3  | Mk Gan | 601168208639| new    | https://... | 0          | 2025-09-23 |

### messages 表数据示例

| id | customer_id | direction | content | ack | whatsapp_id | timestamp |
|----|-------------|-----------|---------|-----|-------------|-----------|
| 1  | 1          | inbound   | Hello   | 3   | 3EB0E8D9... | 2025-09-23 |
| 2  | 1          | outbound  | Hi      | 2   | 3EB0552B... | 2025-09-23 |

---

## 🔍 常用查询示例

### 获取客户列表（含最新消息）
```sql
SELECT 
    c.*,
    m.content as last_message,
    m.timestamp as last_timestamp
FROM customers c
LEFT JOIN (
    SELECT customer_id, content, timestamp,
           ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY timestamp DESC) as rn
    FROM messages
) m ON c.id = m.customer_id AND m.rn = 1
ORDER BY c.updated_at DESC;
```

### 获取客户聊天记录
```sql
SELECT *
FROM messages 
WHERE customer_id = ?
ORDER BY timestamp ASC;
```

### 统计未读消息
```sql
SELECT 
    customer_id,
    COUNT(*) as unread_count
FROM messages 
WHERE direction = 'inbound' 
  AND ack < 3
GROUP BY customer_id;
```

---

## 🚀 性能优化

### 索引策略

**主要索引:**
- `customers.phone` - 客户查找
- `messages.customer_id` - 消息关联
- `messages.timestamp` - 时间排序
- `messages.whatsapp_id` - WhatsApp ID 查找

**复合索引 (未来优化):**
```sql
CREATE INDEX idx_messages_customer_time ON messages(customer_id, timestamp);
CREATE INDEX idx_messages_unread ON messages(customer_id, direction, ack);
```

### 查询优化

**分页查询:**
```sql
-- 消息分页（最近100条）
SELECT * FROM messages 
WHERE customer_id = ?
ORDER BY timestamp DESC 
LIMIT 100 OFFSET ?;
```

**避免 N+1 查询:**
- 使用 JOIN 一次性获取关联数据
- SQLAlchemy 的 `joinedload` 预加载

---

## 📈 扩展性设计

### 水平扩展准备

**分片策略 (未来):**
- 按客户 ID 哈希分片
- 按时间范围分片 (messages)

**读写分离:**
- 主库处理写操作
- 从库处理读操作

### 数据迁移计划

**SQLite → PostgreSQL:**
```python
# 迁移脚本示例
def migrate_to_postgres():
    # 1. 导出 SQLite 数据
    # 2. 转换数据格式
    # 3. 导入 PostgreSQL
    # 4. 验证数据完整性
```

---

## 🔒 数据安全

### 备份策略

**自动备份:**
```bash
# 日常备份脚本
cp app.db backups/app_$(date +%Y%m%d_%H%M%S).db
```

**数据恢复:**
```bash
# 恢复数据
cp backups/app_20250923_120000.db app.db
```

### 敏感数据处理

**客户隐私:**
- 电话号码脱敏显示
- 消息内容加密存储 (未来)
- 访问日志记录

---

## 🛠️ 开发工具

### 数据库管理

**SQLite 命令行:**
```bash
# 连接数据库
sqlite3 app.db

# 查看表结构
.schema customers

# 导出数据
.output customers.csv
.mode csv
SELECT * FROM customers;
```

**Python 脚本:**
```python
# 数据库初始化
from app.db.database import init_db
init_db()

# 添加测试数据  
from backend.add_test_customers import create_test_customers
create_test_customers()
```

---

## 📊 监控和维护

### 性能监控

**关键指标:**
- 数据库文件大小
- 查询响应时间
- 连接池状态
- 索引使用率

**监控查询:**
```sql
-- 检查表大小
SELECT name, COUNT(*) FROM sqlite_master 
WHERE type='table' GROUP BY name;

-- 检查索引效果
EXPLAIN QUERY PLAN 
SELECT * FROM messages WHERE customer_id = 1;
```

### 定期维护

**清理任务:**
```sql
-- 清理旧消息 (保留最近30天)
DELETE FROM messages 
WHERE timestamp < datetime('now', '-30 days');

-- 重建索引
REINDEX;

-- 优化数据库
VACUUM;
```

---

这个数据库设计支持了当前 WhatsApp CRM 系统的所有功能，同时为未来的扩展留有充足的空间。