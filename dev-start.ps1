# Developer Mode Startup Script - With Debug Info
param(
    [switch]$Verbose = $false,
    [switch]$OpenLogs = $false
)

$Host.UI.RawUI.WindowTitle = "WhatsApp CRM - Dev Mode"

Write-Host "
================================================================
                   DEVELOPER MODE STARTUP                      
                  Developer Mode Startup                     
================================================================
" -ForegroundColor Magenta

# Check development environment
Write-Host "Checking development environment..." -ForegroundColor Yellow

# Check Git status
if (Test-Path ".git") {
    $gitStatus = git status --porcelain 2>$null
    if ($gitStatus) {
        Write-Host "  [GIT] Uncommitted changes detected" -ForegroundColor Yellow
    } else {
        Write-Host "  [GIT] Working directory clean" -ForegroundColor Green
    }
    
    $currentBranch = git branch --show-current 2>$null
    Write-Host "  [BRANCH] Current branch: $currentBranch" -ForegroundColor Cyan
}

# Check database
if (Test-Path "app.db") {
    $dbSize = (Get-Item "app.db").Length / 1KB
    Write-Host "  [DATABASE] app.db (${dbSize:F1} KB)" -ForegroundColor Green
} else {
    Write-Host "  [DATABASE] Not found, will be created automatically" -ForegroundColor Yellow
}

# Check config files
$configFiles = @("backend/app/core/config.py", "frontend/next.config.mjs", "whatsapp_gateway/package.json")
foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Host "  [CONFIG] $file [OK]" -ForegroundColor Green
    } else {
        Write-Host "  [CONFIG] $file [MISSING]" -ForegroundColor Red
    }
}

Write-Host "`nStarting development services..." -ForegroundColor Yellow

# Create logs directory
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# Start backend (dev mode)
Write-Host "  [BACKEND] Starting development server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", {
    $Host.UI.RawUI.WindowTitle = 'Backend DEV - Port 8000'
    Set-Location backend
    Write-Host "[BACKEND] Development mode startup" -ForegroundColor Green
    Write-Host "[LOG] Level: DEBUG" -ForegroundColor Yellow
    Write-Host "[RELOAD] Hot reload enabled" -ForegroundColor Yellow
    Write-Host "[API] Documentation: http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host "[METRICS] Performance: http://localhost:8000/metrics" -ForegroundColor Cyan
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
}

Start-Sleep -Seconds 3

# Start WhatsApp Gateway (dev mode)
Write-Host "  [GATEWAY] Starting development server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", {
    $Host.UI.RawUI.WindowTitle = 'WhatsApp Gateway DEV - Port 3002'
    Set-Location whatsapp_gateway
    Write-Host "[GATEWAY] Development mode startup" -ForegroundColor Green
    Write-Host "[DEBUG] Debug info enabled" -ForegroundColor Yellow
    Write-Host "[STATUS] Health check: http://localhost:3002/status" -ForegroundColor Cyan
    $env:NODE_ENV = "development"
    $env:DEBUG = "whatsapp-web.js:*"
    node index.js
}

Start-Sleep -Seconds 3

# Start frontend (dev mode)
Write-Host "  [FRONTEND] Starting development server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", {
    $Host.UI.RawUI.WindowTitle = 'Frontend DEV - Port 3000'
    Set-Location frontend
    Write-Host "[FRONTEND] Development mode startup" -ForegroundColor Green
    Write-Host "[RELOAD] Hot reload enabled" -ForegroundColor Yellow
    Write-Host "[TYPES] Type checking enabled" -ForegroundColor Yellow
    Write-Host "[PERF] Performance analysis available" -ForegroundColor Cyan
    npm run dev
}

# Wait for services to start
Write-Host "`nWaiting for all services to start (15 seconds)..." -ForegroundColor Yellow
for ($i = 15; $i -gt 0; $i--) {
    Write-Host "  Countdown: $i seconds..." -NoNewline -ForegroundColor Gray
    Start-Sleep -Seconds 1
    Write-Host "`r" -NoNewline
}

# Show development info
Write-Host "
================================================================
                    DEV ENVIRONMENT READY                         
================================================================
  Frontend Dev:       http://localhost:3000                   
  API Documentation:  http://localhost:8000/docs              
  API Metrics:        http://localhost:8000/metrics           
  Gateway Status:     http://localhost:3002/status            
================================================================
  DEV TOOLS:                                                
    • Hot reload enabled (frontend/backend)                                
    • Debug logging enabled                                          
    • API auto-documentation available                                        
    • Type checking enabled                                          
================================================================
  USEFUL COMMANDS:                                                
    • .\check-services.ps1  - Check service status                   
    • .\stop-services.ps1   - Stop all services                   
    • git status             - Check code changes                   
================================================================
" -ForegroundColor Green

# Auto open development tools
Write-Host "Opening development tools..." -ForegroundColor Cyan

# Open main page
Start-Process "http://localhost:3000"
Start-Sleep -Seconds 2

# Open API docs
if ($OpenLogs -or $Verbose) {
    Start-Process "http://localhost:8000/docs"
    Start-Process "http://localhost:8000/metrics"
}

Write-Host "
DEVELOPMENT ENVIRONMENT STARTUP COMPLETE!
TIP: Code changes will auto-reload, no need to restart services
LOG: Check service windows for detailed logs
" -ForegroundColor White

Write-Host "`nPress any key to exit this window..." -ForegroundColor Gray
$null = Read-Host