# 设置错误操作首选项
$ErrorActionPreference = "Stop"

# 颜色函数
function Write-ColorOutput($ForegroundColor, $Message) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    Write-Output $Message
    $host.UI.RawUI.ForegroundColor = $fc
}

function Start-ServiceWithStatus {
    param (
        [string]$Name,
        [string]$Command,
        [string]$WorkingDirectory,
        [int]$Port
    )
    
    Write-ColorOutput Green "Starting $Name..."
    
    # 检查端口是否已被占用（跳过端口 0）
    if ($Port -gt 0) {
        $portInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($portInUse) {
            Write-ColorOutput Yellow "Port $Port is in use, attempting to free it..."

            # 尝试找到并停止占用端口的进程
            $processId = (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
            if ($processId) {
                try {
                    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-ColorOutput Yellow "Stopping process: $($process.ProcessName) (PID: $processId)"
                        Stop-Process -Id $processId -Force
                        Start-Sleep -Seconds 2
                    }
                } catch {
                    Write-ColorOutput Red "Failed to stop process on port $Port"
                }
            }

            # 再次检查端口
            $portInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
            if ($portInUse) {
                # If frontend, try fallback ports (3001..3010)
                if ($Name -like '*Front*') {
                    Write-ColorOutput Yellow "Port $Port is still in use; trying fallback ports for frontend..."
                    $fallbackPort = $null
                    for ($p = 3001; $p -le 3010; $p++) {
                        $inUse = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
                        if (-not $inUse) { $fallbackPort = $p; break }
                    }
                    if ($fallbackPort) {
                        Write-ColorOutput Green "Found free fallback port: $fallbackPort. Frontend will start on this port."
                        # set environment variable for that process invocation
                        $env:PORT = "$fallbackPort"
                    } else {
                        Write-ColorOutput Red "No fallback port available for frontend (checked 3001..3010)."
                        return
                    }
                } else {
                    Write-ColorOutput Red "Error: Port $Port is still in use after cleanup attempt"
                    return
                }
            } else {
                Write-ColorOutput Green "Port $Port is now free"
            }
        }
    }

    # 切换到工作目录
    Push-Location $WorkingDirectory
    
    try {
        # 启动进程
        $process = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $Command -PassThru
        
        # 等待几秒检查进程是否仍在运行
        Start-Sleep -Seconds 2
        if ($process.HasExited) {
            Write-ColorOutput Red "Error: $Name failed to start, exit code: $($process.ExitCode)"
        } else {
            Write-ColorOutput Green "$Name started (PID: $($process.Id))"
        }
    }
    catch {
        Write-ColorOutput Red "Error: Failed to start $Name : $_"
    }
    finally {
        # 恢复原来的工作目录
        Pop-Location
    }
}

# 激活虚拟环境
$venvPath = "C:/Users/mingk/Desktop/Business_Automation/venv/Scripts/Activate.ps1"
if (Test-Path $venvPath) {
    . $venvPath
    Write-ColorOutput Green "Python virtual environment activated"
} else {
    Write-ColorOutput Red "Error: Virtual environment not found at: $venvPath"
    exit 1
}

# 清理可能存在的旧进程
Write-ColorOutput Yellow "Cleaning up existing processes..."
$processesToKill = @("uvicorn", "python", "node")
foreach ($processName in $processesToKill) {
    $processes = Get-Process -Name $processName -ErrorAction SilentlyContinue
    foreach ($process in $processes) {
        # 检查是否是我们项目相关的进程
        if (($process.Path -like "*CRM_Automation*") -or `
            ($process.CommandLine -like "*uvicorn*") -or `
            ($process.CommandLine -like "*gateway*") -or `
            ($process.CommandLine -like "*npm run dev*")) {
            try {
                Write-ColorOutput Yellow "Stopping existing process: $($process.ProcessName) (PID: $($process.Id))"
                Stop-Process -Id $process.Id -Force
            } catch {
                Write-ColorOutput Red "Failed to stop process: $($process.ProcessName)"
            }
        }
    }
}
Start-Sleep -Seconds 3

# 创建 logs 目录
if (-not (Test-Path "./logs")) {
    New-Item -ItemType Directory -Path "./logs" | Out-Null
}

# 准备启动命令（在新窗口中直接显示输出）
$backendCmd = "python run.py"
Start-ServiceWithStatus -Name "Backend API" `
    -Command $backendCmd `
    -WorkingDirectory "./backend" `
    -Port 8000

# 等待后端启动
Write-ColorOutput Yellow "Waiting for backend to start..."
Start-Sleep -Seconds 5

# 启动 Telegram Gateway（直接在终端显示输出）
$tgCmd = "python gateway.py"
Start-ServiceWithStatus -Name "Telegram Gateway" `
    -Command $tgCmd `
    -WorkingDirectory "./telegram_gateway" `
    -Port 0  # Telegram Gateway doesn't listen on port

# 启动 WhatsApp Gateway（直接在终端显示输出）
$waCmd = "node index.js"
Start-ServiceWithStatus -Name "WhatsApp Gateway" `
    -Command $waCmd `
    -WorkingDirectory "./whatsapp_gateway" `
    -Port 3002

# 启动前端（直接在终端显示输出），如果脚本中设置了 $env:PORT，会在新窗口里使用该端口
if ($env:PORT) {
    $frontendCmd = "$env:PORT=$env:PORT; npm run dev"
} else {
    $frontendCmd = "npm run dev"
}
Start-ServiceWithStatus -Name "Frontend" `
    -Command $frontendCmd `
    -WorkingDirectory "./frontend" `
    -Port 3000

Write-ColorOutput Green "`nAll services started!"
Write-ColorOutput Yellow @"

Services Status:
Backend API: http://localhost:8000
Frontend: http://localhost:3000
WhatsApp Gateway: http://localhost:3002
Telegram Gateway: Running (check logs)

Press Ctrl+C to stop all services
"@

# 保持脚本运行
try {
    while ($true) { Start-Sleep -Seconds 1 }
}
finally {
    Write-ColorOutput Yellow "`nStopping all services..."
}
