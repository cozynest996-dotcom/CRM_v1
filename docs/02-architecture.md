# 🏗️ 系统架构 - WhatsApp CRM 系统

本项目是一个完整的 WhatsApp 客户管理系统，采用现代化微服务架构，支持实时消息处理和客户管理。

---

## 📊 系统架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│   Frontend      │◄──►│    Backend      │◄──►│ WhatsApp Gateway│
│   (Next.js)     │    │   (FastAPI)     │    │   (Node.js)     │
│   Port: 3000    │    │   Port: 8000    │    │   Port: 3002    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         │              ┌─────────────────┐             │
         └─────────────►│   SQLite DB     │◄────────────┘
                        │   (app.db)      │
                        │                 │
                        └─────────────────┘

                    ┌─────────────────┐
                    │  WhatsApp Web   │
                    │   (Browser)     │◄─────────────────┐
                    └─────────────────┘                  │
                                                         │
                                              ┌─────────────────┐
                                              │ whatsapp-web.js │
                                              │    Library      │
                                              └─────────────────┘
```

---

## 📂 项目结构

```
CRM_Automation/
├── 📁 frontend/                 # Next.js 前端应用
│   ├── pages/
│   │   └── index.tsx           # 主聊天界面
│   ├── utils/
│   │   └── dateFormat.ts       # 时间格式化工具
│   ├── package.json            # 前端依赖
│   └── tsconfig.json           # TypeScript 配置
│
├── 📁 backend/                  # FastAPI 后端应用
│   ├── app/
│   │   ├── main.py             # FastAPI 应用入口
│   │   ├── 📁 routers/         # API 路由模块
│   │   │   ├── customers.py    # 客户管理 API
│   │   │   ├── messages.py     # 消息处理 API
│   │   │   └── tables.py       # 数据表管理
│   │   ├── 📁 db/              # 数据库模块
│   │   │   ├── database.py     # 数据库连接
│   │   │   └── models.py       # 数据模型定义
│   │   ├── 📁 schemas/         # Pydantic 模式
│   │   │   ├── customer.py     # 客户数据模式
│   │   │   └── message.py      # 消息数据模式
│   │   ├── 📁 services/        # 业务逻辑服务
│   │   │   └── whatsapp.py     # WhatsApp 服务
│   │   ├── 📁 core/            # 核心配置
│   │   │   └── config.py       # 应用配置
│   │   ├── events.py           # SSE 事件处理
│   │   └── metrics.py          # 性能指标
│   ├── requirements.txt        # Python 依赖
│   └── start_server.py         # 服务启动脚本
│
├── 📁 whatsapp_gateway/         # WhatsApp 网关服务
│   ├── index.js                # 主服务文件
│   ├── package.json            # Node.js 依赖
│   └── .wwebjs_auth/          # WhatsApp 会话数据 (git忽略)
│
├── 📁 docs/                     # 项目文档
│   ├── 01-roadmap.md           # 项目路线图
│   ├── 02-architecture.md      # 系统架构 (本文件)
│   ├── 03-db-schema.md         # 数据库设计
│   └── 04-api-contracts.md     # API 接口文档
│
├── 📁 migrations/               # 数据库迁移 (Alembic)
├── app.db                      # SQLite 数据库文件
├── README.md                   # 项目说明
├── .gitignore                  # Git 忽略文件
└── *.bat, *.ps1               # 启动脚本
```

---

## 🔧 核心组件详解

### 1. 前端 (Frontend) - Next.js + TypeScript

**技术栈:**
- **Next.js 14** - React 框架
- **TypeScript** - 类型安全
- **SWR** - 数据获取和缓存
- **Server-Sent Events** - 实时数据更新
- **CSS Modules/内联样式** - 样式方案（当前）

**主要功能:**
- 📱 三栏响应式布局（客户列表/聊天窗口/详情面板）
- 💬 实时聊天界面
- 👤 客户管理界面
- 🔄 自动数据刷新
- 📊 消息状态显示

**关键文件:**
- `pages/index.tsx` - 主聊天界面组件
- `utils/dateFormat.ts` - 时间格式化工具

### 2. 后端 (Backend) - FastAPI + SQLAlchemy

**技术栈:**
- **FastAPI** - 现代 Python Web 框架
- **SQLAlchemy** - ORM 数据库操作
- **SQLite** - 轻量级数据库
- **Pydantic** - 数据验证
- **Uvicorn** - ASGI 服务器

**主要功能:**
- 🔌 RESTful API 服务
- 🗄️ 数据库操作和管理
- 📡 Server-Sent Events 实时推送
- 🔄 WhatsApp Gateway 集成
- 📊 性能指标收集

**API 端点:**
```
GET    /customers/summary      # 获取客户列表
POST   /customers/photo        # 更新客户头像
GET    /messages/{customer_id} # 获取聊天记录
POST   /messages/send          # 发送消息
POST   /messages/inbox         # 接收消息 (Gateway调用)
POST   /messages/ack           # 消息状态更新
GET    /messages/events/stream # SSE 事件流
```

### 3. WhatsApp Gateway - Node.js + whatsapp-web.js

**技术栈:**
- **Node.js** - JavaScript 运行时
- **whatsapp-web.js** - WhatsApp Web API 库
- **Express.js** - Web 服务框架

**主要功能:**
- 🔐 WhatsApp Web 扫码登录
- 📩 消息接收和发送
- 👤 联系人信息获取
- 📸 头像自动下载
- ⏰ 智能已读状态管理
- 🔄 消息状态同步

**智能行为:**
- 随机3-10秒延迟标记已读
- 发送消息前自动标记已读
- 模拟真实用户操作模式

### 4. 数据库 (Database) - SQLite

**核心表结构:**
```sql
customers {
  id: INTEGER PRIMARY KEY
  name: STRING
  phone: STRING (UNIQUE)
  status: STRING
  photo_url: STRING
  unread_count: INTEGER
  created_at: DATETIME
  updated_at: DATETIME
}

messages {
  id: INTEGER PRIMARY KEY
  customer_id: INTEGER (FK)
  direction: STRING (inbound/outbound)
  content: TEXT
  timestamp: DATETIME
  ack: INTEGER (1=sent, 2=delivered, 3=read)
  whatsapp_id: STRING
}
```

---

## 🔄 数据流和交互

### 1. 接收消息流程

```
WhatsApp → whatsapp-web.js → Gateway → Backend → Database
                                   ↓
Frontend ← SSE Events ← Backend ← Database
```

**详细步骤:**
1. **WhatsApp 收到消息** → whatsapp-web.js 监听
2. **Gateway 处理** → 获取联系人信息和头像
3. **推送到 Backend** → `POST /messages/inbox`
4. **Backend 处理** → 创建/更新客户，保存消息
5. **实时通知** → 通过 SSE 推送到前端
6. **前端更新** → 立即显示新消息和客户

### 2. 发送消息流程

```
Frontend → Backend → Database → Gateway → WhatsApp
              ↓         ↓
        SSE Events → Frontend
```

**详细步骤:**
1. **前端发起** → 用户输入消息，调用 `POST /messages/send`
2. **Backend 处理** → 保存消息到数据库
3. **调用 Gateway** → `POST /send` 到 WhatsApp Gateway
4. **Gateway 发送** → 通过 whatsapp-web.js 发送到 WhatsApp
5. **状态更新** → 消息状态通过 webhook 回调更新
6. **实时同步** → 前端通过 SSE 获得状态更新

### 3. 实时数据同步

**技术实现:**
- **Server-Sent Events (SSE)** - 服务器主动推送
- **SWR 数据获取** - 客户端智能缓存
- **乐观更新** - 前端立即显示，后端确认

**事件类型:**
```typescript
{
  type: "inbound_message",
  customer_id: number,
  message: MessageData
}

{
  type: "new_customer", 
  customer: CustomerData
}

{
  type: "message_seen",
  customer_id: number
}
```

---

## 🚀 部署架构

### 开发环境
```bash
# 启动所有服务
./start_services.bat    # Windows 批处理
./start_all.ps1        # PowerShell 脚本

# 服务端口
Frontend:  http://localhost:3000
Backend:   http://localhost:8000
Gateway:   http://localhost:3002
```

### 生产环境建议
```
Frontend:  Vercel / Netlify
Backend:   VPS + Docker + Nginx
Gateway:   VPS + PM2 + Docker
Database:  PostgreSQL / MySQL
```

---

## 🔒 安全考虑

### 数据安全
- 🔐 WhatsApp 会话数据本地存储
- 🚫 敏感文件通过 .gitignore 排除
- 📊 数据库连接字符串可配置

### API 安全
- 🔑 CORS 跨域配置
- 🛡️ 输入数据验证 (Pydantic)
- 📝 错误日志记录

### 隐私保护
- 🗄️ 客户数据本地存储
- 🔄 消息端到端处理
- 🚫 无第三方数据传输

---

## 📊 性能指标

### 关键指标
- **消息延迟**: < 1秒
- **API 响应**: < 200ms  
- **前端加载**: < 3秒
- **内存使用**: < 512MB

### 监控方式
- Backend metrics 端点
- 前端性能监控
- 数据库查询优化
- Gateway 连接状态

---

## 🔧 配置管理

### 环境变量
```bash
# Backend (.env)
DB_URL=sqlite:///./app.db
WHATSAPP_GATEWAY_URL=http://localhost:3002

# Frontend (.env.local)  
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

### 配置文件
- `backend/app/core/config.py` - 后端配置
- `frontend/next.config.mjs` - 前端配置
- `whatsapp_gateway/package.json` - Gateway 配置

---

## 🛠️ 开发工具

### 启动脚本
- `start_services.bat` - 交互式服务启动
- `start_all.ps1` - PowerShell 批量启动
- `start_dev.bat` - 开发环境启动

### 开发命令
```bash
# 后端开发
cd backend
uvicorn app.main:app --reload

# 前端开发  
cd frontend
npm run dev

# Gateway 开发
cd whatsapp_gateway
node index.js
```

---

## 📈 扩展性设计

### 水平扩展
- 🔄 微服务架构设计
- 📊 数据库读写分离
- 🔀 负载均衡支持

### 功能扩展
- 🤖 AI 回复模块
- 📋 工作流引擎
- 📊 数据分析模块
- 🔌 第三方集成接口

---

这个架构文档反映了当前系统的真实状态，包含了所有已实现的功能和技术细节。