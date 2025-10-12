# 🚀 CRM 工作流自动化系统 - 使用指南

这是一个完整的 CRM 自动化系统，支持基于 MVP 架构的工作流引擎、客户管道管理和 AI 智能分析。

## ✨ 核心功能

### 1. 🎯 客户管道 (Customer Pipeline)
- **可拖拽的阶段管理** - 自定义客户生命周期阶段
- **实时客户状态追踪** - 直观的看板式界面
- **客户详情卡片** - 显示预算、位置、联系信息等
- **批量操作支持** - 快速移动多个客户

### 2. ⚡ 工作流自动化 (Workflow Engine)
- **消息触发器** - WhatsApp 消息自动触发工作流
- **AI 智能分析** - 提取客户意图和信息
- **数据库自动更新** - 智能更新客户档案
- **延迟控制** - 工作时间和发送频率控制
- **合规检查** - 内容过滤和安全保护

### 3. 🤖 AI 节点类型
- **MessageTrigger** - 消息触发 (📱)
- **AI** - 智能分析和回复生成 (🤖)
- **UpdateDB** - 数据库更新 (💾)
- **Delay** - 延迟控制 (⏰)
- **SendWhatsAppMessage** - 发送消息 (💬)
- **Template** - 模板消息 (📄)
- **GuardrailValidator** - 合规检查 (🛡️)

## 🚀 快速开始

### 1. 系统要求
- **Python** 3.8+
- **Node.js** 16+
- **PostgreSQL** (可选，默认使用 SQLite)
- **OpenAI API Key** (用于 AI 功能)

### 2. 安装依赖

#### 后端依赖
```bash
cd backend
pip install -r requirements.txt
```

#### 前端依赖
```bash
cd frontend
npm install
```

### 3. 环境配置
创建 `backend/.env` 文件：

```env
# 数据库配置 (可选择 PostgreSQL 或 SQLite)
DATABASE_URL=postgresql://username:password@localhost:5432/crm_automation
# 或使用 SQLite (默认)
# DB_URL=sqlite:///backend/crm.db

# OpenAI API 配置
OPENAI_API_KEY=your_openai_api_key_here

# WhatsApp Gateway
WHATSAPP_GATEWAY_URL=http://localhost:3002

# JWT 配置
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### 4. 启动服务

#### 1) 启动后端
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2) 启动 WhatsApp Gateway
```bash
cd whatsapp_gateway
npm install
node index.js
```

#### 3) 启动前端
```bash
cd frontend
npm run dev
```

### 5. 访问系统
- **主界面**: http://localhost:3000
- **工作流自动化**: http://localhost:3000/workflow-automation
- **API 文档**: http://localhost:8000/docs

## 📊 数据库迁移 (SQLite → PostgreSQL)

如果要从 SQLite 迁移到 PostgreSQL：

```bash
cd backend
python migrate_to_postgresql.py "sqlite:///backend/crm.db" "postgresql://user:pass@localhost:5432/crm"
```

## 🧪 测试系统

运行完整的 MVP 工作流测试：

```bash
cd backend
python test_mvp_workflow.py
```

## 📚 使用指南

### 1. 初始化客户阶段
首次使用时，点击 "🏗️ 初始化默认阶段" 按钮创建基础的客户阶段：
- 新客户
- 跟进中  
- 有意向
- 已成交
- 已流失

### 2. 创建 MVP 工作流
点击 "🤖 创建 MVP 工作流" 按钮自动创建一个完整的自动化流程：
1. 消息触发 → 2. AI 分析 → 3. 更新数据库 → 4. 合规检查 → 5. 延迟控制 → 6. 发送回复

### 3. 使用工作流编辑器
点击 "⚡ 工作流编辑器" 可以：
- 拖拽添加不同类型的节点
- 连接节点创建工作流
- 配置每个节点的参数
- 保存和激活工作流

### 4. 管理客户管道
在客户管道界面可以：
- 拖拽客户卡片在不同阶段间移动
- 查看每个客户的详细信息
- 添加和编辑客户阶段
- 批量操作客户

## 🔧 API 端点

### 工作流相关
- `GET /api/workflows` - 获取工作流列表
- `POST /api/workflows` - 创建工作流
- `POST /api/workflows/create-mvp-template` - 创建 MVP 模板
- `POST /api/workflows/{id}/execute` - 执行工作流
- `POST /api/workflows/trigger/message` - 消息触发工作流

### 客户管道相关
- `GET /api/pipeline/` - 获取完整管道视图
- `GET /api/pipeline/stages` - 获取客户阶段
- `POST /api/pipeline/stages` - 创建客户阶段
- `POST /api/pipeline/move-customer` - 移动客户
- `POST /api/pipeline/initialize-default-stages` - 初始化默认阶段

## 🎯 MVP 架构详解

系统基于精简的跨行业通用 MVP 架构，核心流程：

```
消息触发 → AI 分析 → 更新数据 → 智能回复 → 发送
```

### 核心组件：
1. **数据模型** - 高频字段用真列，个性化字段存 JSONB
2. **AI 合约** - 标准化的 AI 输入输出格式
3. **节点类型** - 7 种核心节点类型覆盖所有场景
4. **工作流模板** - 预配置的完整自动化流程

### 技术特性：
- **乐观锁** - 数据一致性保护
- **工作时段控制** - 马来西亚时区自适应
- **去重机制** - 避免重复发送
- **合规检查** - 内容安全过滤
- **审计日志** - 完整的操作记录

## 🚨 故障排除

### 常见问题：

1. **AI 功能不工作**
   - 检查 `OPENAI_API_KEY` 是否正确设置
   - 确认 OpenAI API 配额和网络连接

2. **WhatsApp 无法发送消息**
   - 确认 WhatsApp Gateway 正在运行 (端口 3002)
   - 检查 WhatsApp Web 登录状态

3. **数据库连接错误**
   - 检查数据库 URL 配置
   - 确认 PostgreSQL 服务运行状态

4. **前端拖拽不工作**
   - 确认已安装 `react-beautiful-dnd` 依赖
   - 检查浏览器控制台错误信息

## 📈 性能优化建议

1. **数据库优化**
   - 生产环境使用 PostgreSQL
   - 为常用查询字段添加索引
   - 定期清理审计日志

2. **AI 服务优化**
   - 使用 GPT-4o-mini 平衡性能和成本
   - 实现 AI 响应缓存机制
   - 设置合理的超时时间

3. **系统扩展**
   - 使用 Redis 缓存频繁访问的数据
   - 实现消息队列处理高并发
   - 添加监控和日志系统

## 🤝 支持与贡献

### 获取帮助
- 查看 API 文档: http://localhost:8000/docs
- 运行测试脚本: `python test_mvp_workflow.py`
- 检查系统日志和错误信息

### 系统架构扩展
当前实现支持以下扩展：
- 多租户支持 (已预留 tenant_id)
- 更多 AI 模型集成
- 其他消息平台集成 (Telegram, WeChat 等)
- 高级工作流功能 (条件分支、循环等)

---

🎉 **恭喜！你现在拥有了一个功能完整的 CRM 自动化系统！**

该系统实现了用户提供的完整 MVP 架构，支持智能分析、自动回复、客户管理和工作流可视化编辑。可以开始处理真实的客户消息并自动化你的业务流程了。
