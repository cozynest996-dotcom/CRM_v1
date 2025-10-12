# CRM Automation - WhatsApp 客户管理系统

一个功能完整的 WhatsApp 客户管理系统，支持实时消息、客户管理和自动化回复。

## ✨ 功能特性

- 🔄 **实时 WhatsApp 集成** - 扫码登录，收发消息
- 👥 **客户管理** - 自动识别新客户，管理联系人信息
- 💬 **聊天界面** - 类似 WhatsApp Web 的用户界面
- 📊 **消息状态** - 已发送、已送达、已读状态追踪
- 🔔 **实时更新** - 使用 SSE 实现实时消息同步
- 📱 **响应式设计** - 支持桌面和移动端

## 🏗️ 系统架构

```
Frontend (Next.js)    Backend (FastAPI)    WhatsApp Gateway
     :3000         ←→       :8000         ←→      :3002
                           
                           SQLite Database
```

### 核心组件

- **Frontend** - Next.js + TypeScript 的现代化前端界面
- **Backend** - FastAPI + SQLAlchemy 的高性能后端 API
- **WhatsApp Gateway** - 基于 whatsapp-web.js 的 WhatsApp 集成
- **Database** - SQLite 数据库存储客户和消息数据

## 🚀 快速开始

### 方式一：使用启动脚本（推荐）

1. 克隆项目
```bash
git clone <your-repo-url>
cd CRM_Automation
```

2. 运行启动脚本
```bash
# Windows
.\start_services.bat

# 或者使用 PowerShell
.\start_all.ps1
```

3. 扫描 WhatsApp 二维码登录

4. 访问 http://localhost:3000 开始使用

### 方式二：手动启动

#### 1. 启动后端
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. 启动 WhatsApp Gateway
```bash
cd whatsapp_gateway
npm install
node index.js
```

#### 3. 启动前端
```bash
cd frontend
npm install
npm run dev
```

## 📋 系统要求

- **Node.js** 16+ 
- **Python** 3.8+
- **Chrome/Chromium** (用于 WhatsApp Web)

## 🔧 配置

### 后端配置 (backend/app/core/config.py)
```python
DB_URL = "sqlite:///path/to/your/app.db"
WHATSAPP_GATEWAY_URL = "http://localhost:3002"
```

### 环境变量（可选）
创建 `.env` 文件：
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## 📁 项目结构

```
CRM_Automation/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── routers/       # API 路由
│   │   ├── db/            # 数据库模型
│   │   ├── schemas/       # Pydantic 模式
│   │   └── services/      # 业务逻辑
│   └── requirements.txt
├── frontend/              # Next.js 前端
│   ├── pages/
│   ├── utils/
│   └── package.json
├── whatsapp_gateway/      # WhatsApp 集成
│   ├── index.js
│   └── package.json
├── docs/                  # 项目文档
└── README.md
```

## 🔄 工作流程

1. **接收消息**: WhatsApp Gateway 监听消息 → 推送到后端 → 存储到数据库
2. **新客户**: 自动识别新号码 → 创建客户记录 → 实时更新前端
3. **发送消息**: 前端发送 → 后端处理 → Gateway 转发到 WhatsApp
4. **状态同步**: WhatsApp 状态变化 → Gateway 推送 → 前端实时更新

## 🛠️ 开发功能

### API 端点
- `GET /customers/summary` - 获取客户列表
- `GET /messages/{customer_id}` - 获取聊天记录
- `POST /messages/send` - 发送消息
- `GET /messages/events/stream` - SSE 实时事件流

### 数据库表
- `customers` - 客户信息（姓名、电话、状态、头像等）
- `messages` - 消息记录（内容、方向、时间、状态等）

## 🔍 故障排除

### WhatsApp 连接问题
- 确保 Chrome 已安装
- 检查防火墙设置
- 重启 WhatsApp Gateway

### 前端无法显示数据
- 检查后端是否运行 (http://localhost:8000)
- 查看浏览器控制台错误
- 确认 CORS 设置正确

### 消息未同步
- 检查 SSE 连接状态
- 验证 WhatsApp Gateway 日志
- 确认数据库写入权限

## 🚧 开发路线图

- [x] 基础 WhatsApp 集成
- [x] 客户管理界面
- [x] 实时消息同步
- [x] 消息状态追踪
- [ ] 消息模板
- [ ] 自动回复
- [ ] 群聊支持
- [ ] 文件发送

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License