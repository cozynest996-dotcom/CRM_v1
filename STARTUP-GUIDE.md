# 🚀 WhatsApp CRM 启动指南

## 🎯 一键启动

### 💻 **推荐方式**

#### 🥇 批处理文件 (最简单)
```bash
# 双击运行或在命令行执行
start.bat
```

#### 🥈 PowerShell 脚本 (更强大)
```powershell
# 完整启动
.\start.ps1

# 快速启动 (跳过检查)
.\start.ps1 -SkipChecks

# 不自动打开浏览器
.\start.ps1 -NoOpen
```

#### 🛠️ 开发者模式 (调试专用)
```powershell
# 开发模式 (热重载 + 调试日志)
.\dev-start.ps1

# 详细模式 + 监控页面
.\dev-start.ps1 -Verbose -OpenLogs
```

## 🔧 管理工具

### 📊 检查服务状态
```powershell
.\check-services.ps1
```

### 🛑 停止所有服务
```powershell
.\stop-services.ps1
```

## 📋 服务信息

| 服务 | 端口 | URL | 功能 |
|------|------|-----|------|
| 🎨 前端 | 3000 | http://localhost:3000 | 用户界面 |
| 📡 后端API | 8000 | http://localhost:8000 | 业务逻辑 |
| 📱 WhatsApp | 3002 | http://localhost:3002 | WhatsApp集成 |

### 🔗 开发工具链接

- **API 文档**: http://localhost:8000/docs
- **API 监控**: http://localhost:8000/metrics  
- **Gateway 状态**: http://localhost:3002/status

## ⚡ 快速开始

### 首次使用
1. 运行 `start.bat` 或 `.\start.ps1`
2. 等待所有服务启动 (约30-60秒)
3. 扫描 WhatsApp 二维码 (在 WhatsApp Gateway 窗口)
4. 访问 http://localhost:3000 开始使用

### 日常开发
1. 使用 `.\dev-start.ps1` 启动开发模式
2. 代码修改会自动重载
3. 使用 `.\check-services.ps1` 检查状态
4. 使用 `.\stop-services.ps1` 停止服务

## 🐛 故障排除

### 常见问题

#### 🚫 端口被占用
```powershell
# 停止所有服务
.\stop-services.ps1

# 重新启动
.\start.ps1
```

#### 📦 依赖问题
```bash
# 重新安装依赖
cd backend && pip install -r requirements.txt
cd ../frontend && npm install
cd ../whatsapp_gateway && npm install
```

#### 🔐 PowerShell 执行策略
```powershell
# 如果无法运行 .ps1 脚本
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 🔍 调试信息

- **后端日志**: 查看 Backend 窗口
- **前端日志**: 查看浏览器控制台
- **WhatsApp日志**: 查看 WhatsApp Gateway 窗口

### 📞 服务状态检查

各服务启动后应显示:
- ✅ **后端**: 显示 "Application startup complete"
- ✅ **前端**: 显示 "Ready in X seconds"  
- ✅ **WhatsApp**: 显示二维码或 "Client is ready!"

## 🎉 使用提示

1. **首次使用**: 需要扫描 WhatsApp 二维码
2. **开发模式**: 代码热重载，调试信息丰富
3. **生产模式**: 使用 `start.bat` 或 `start.ps1`
4. **多开发者**: 每人使用独立的数据库文件

---

### 📚 更多信息

- 📖 [项目文档](docs/00-documentation-index.md)
- 🏗️ [架构设计](docs/02-architecture.md)  
- 🗺️ [功能路线图](docs/01-roadmap.md)
- 🎨 [UI设计](docs/06-customers-ui-design.md)
