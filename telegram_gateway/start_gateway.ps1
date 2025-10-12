# 激活虚拟环境（根据你的 venv 路径修改）
& C:/Users/mingk/Desktop/Business_Automation/venv/Scripts/Activate.ps1

# 切换到网关目录
Set-Location $PSScriptRoot

# 启动网关（会自动从 config.py 读取配置）
python gateway.py