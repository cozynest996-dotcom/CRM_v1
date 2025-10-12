# 设置错误操作首选项
$ErrorActionPreference = "Stop"

function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

# 停止所有 Python 进程（backend, telegram gateway）
Write-ColorOutput Yellow "正在停止 Python 进程..."
Get-Process | Where-Object { $_.ProcessName -eq "python" -or $_.ProcessName -eq "uvicorn" } | ForEach-Object {
    try {
        $_ | Stop-Process -Force
        Write-ColorOutput Green "已停止进程: $($_.ProcessName) (PID: $($_.Id))"
    } catch {
        Write-ColorOutput Red "停止进程失败: $($_.ProcessName) (PID: $($_.Id))"
    }
}

# 停止 Node.js 进程（frontend, whatsapp gateway）
Write-ColorOutput Yellow "正在停止 Node.js 进程..."
Get-Process | Where-Object { $_.ProcessName -eq "node" } | ForEach-Object {
    try {
        $_ | Stop-Process -Force
        Write-ColorOutput Green "已停止进程: $($_.ProcessName) (PID: $($_.Id))"
    } catch {
        Write-ColorOutput Red "停止进程失败: $($_.ProcessName) (PID: $($_.Id))"
    }
}

Write-ColorOutput Green "所有服务已停止！"