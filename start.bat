@echo off
title WhatsApp CRM - One-Click Startup
color 0A

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    WhatsApp CRM System                       ║
echo ║                     一键启动所有服务                          ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM 检查 Node.js
echo [1/6] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js 未安装，请先安装 Node.js
    pause
    exit /b 1
)
echo ✅ Node.js 已安装

REM 检查 Python
echo [2/6] 检查 Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python 未安装，请先安装 Python
    pause
    exit /b 1
)
echo ✅ Python 已安装

REM 安装依赖
echo [3/6] 安装/检查依赖...
echo    📦 检查后端依赖...
cd backend
pip install -r requirements.txt >nul 2>&1
cd ..

echo    📦 检查前端依赖...
cd frontend
call npm install >nul 2>&1
cd ..

echo    📦 检查 WhatsApp Gateway 依赖...
cd whatsapp_gateway
call npm install >nul 2>&1
cd ..

echo ✅ 依赖检查完成

REM 启动服务
echo [4/6] 启动后端服务 (Port 8000)...
start "🔧 Backend API" cmd /k "title Backend API - Port 8000 && cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

REM 等待后端启动
echo    ⏳ 等待后端启动...
timeout /t 3 /nobreak >nul

echo [5/6] 启动 WhatsApp Gateway (Port 3002)...
start "📱 WhatsApp Gateway" cmd /k "title WhatsApp Gateway - Port 3002 && cd /d "%~dp0whatsapp_gateway" && node index.js"

REM 等待 Gateway 启动
echo    ⏳ 等待 Gateway 启动...
timeout /t 3 /nobreak >nul

echo [6/6] 启动前端服务 (Port 3000)...
start "🎨 Frontend" cmd /k "title Frontend - Port 3000 && cd /d "%~dp0frontend" && npm run dev"

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                      🚀 启动完成！                           ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║  📡 Backend API:        http://localhost:8000               ║
echo ║  📱 WhatsApp Gateway:   http://localhost:3002               ║
echo ║  🎨 Frontend:           http://localhost:3000               ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║  💡 提示:                                                    ║
echo ║  1. 首次使用需要扫描 WhatsApp 二维码                          ║
echo ║  2. 等待 30-60 秒让所有服务完全启动                          ║
echo ║  3. 访问 http://localhost:3000 开始使用                     ║
echo ║  4. 关闭时请关闭所有命令行窗口                                ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM 等待用户确认
echo 按任意键自动打开浏览器...
pause >nul

REM 自动打开浏览器
start http://localhost:3000

echo.
echo 🎉 系统启动完成！浏览器将自动打开...
echo.
echo 如果遇到问题:
echo - 检查端口是否被占用 (8000, 3000, 3002)
echo - 确保所有依赖已正确安装
echo - 查看各个服务窗口的错误信息
echo.
pause
