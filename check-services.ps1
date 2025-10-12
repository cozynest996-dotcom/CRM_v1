# Service Status Check Script
$Host.UI.RawUI.WindowTitle = "CRM Services Status"

Write-Host "
================================================================
                     SERVICE STATUS CHECK                              
================================================================
" -ForegroundColor Cyan

$services = @(
    @{Name="Backend API"; Port=8000; URL="http://localhost:8000/customers/summary"},
    @{Name="Frontend Page"; Port=3000; URL="http://localhost:3000"},
    @{Name="WhatsApp Gateway"; Port=3002; URL="http://localhost:3002"}
)

foreach ($service in $services) {
    Write-Host "Checking $($service.Name) (Port $($service.Port))..." -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $service.URL -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host " [OK] Running normally" -ForegroundColor Green
        } else {
            Write-Host " [WARNING] Abnormal response ($($response.StatusCode))" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host " [ERROR] Cannot connect" -ForegroundColor Red
    }
}

Write-Host "
PORT USAGE:" -ForegroundColor Yellow
$ports = @(3000, 3002, 8000)
foreach ($port in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Host "  Port $port : [OCCUPIED]" -ForegroundColor Green
    } else {
        Write-Host "  Port $port : [FREE]" -ForegroundColor Red
    }
}

Write-Host "
TROUBLESHOOTING TIPS:" -ForegroundColor Yellow
Write-Host "  • If services not started, run: .\start.ps1"
Write-Host "  • If ports occupied, run: .\stop-services.ps1"
Write-Host "  • Check service logs for specific errors"

Write-Host "`nPress any key to exit..." -ForegroundColor Gray
$null = Read-Host