<#
.SYNOPSIS
  Flux Launcher — starts backend + frontend servers and opens the app.
.DESCRIPTION
  Starts the Express backend (port 3001) and React frontend (port 3000)
  in background PowerShell jobs, then opens the app in the default browser.
  Press any key to stop both servers.
#>

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Flux — Starting Servers       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Kill any lingering processes on our ports ──
Get-Process -Name "bun" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = (Get-CimObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cmd -match "index.ts" -or $cmd -match "flux") {
        $_.Kill()
    }
}

# ── Start Backend ──
Write-Host "▶ Starting backend (port 3001)..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    bun index.ts
} -ArgumentList $BACKEND

# ── Start Frontend ──
Write-Host "▶ Starting frontend (port 3000)..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    bun --hot src/index.ts
} -ArgumentList $FRONTEND

# ── Wait for servers to be ready ──
Start-Sleep -Seconds 3
$frontendReady = $false
$backendReady = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
        $frontendReady = $true
    } catch {}
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:3001/ping" -UseBasicParsing -TimeoutSec 2
        $backendReady = $true
    } catch {}
    if ($frontendReady -and $backendReady) { break }
    Start-Sleep -Seconds 1
}

if ($frontendReady -and $backendReady) {
    Write-Host ""
    Write-Host "✓ Backend  → http://localhost:3001" -ForegroundColor Green
    Write-Host "✓ Frontend → http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Opening Flux in your browser..." -ForegroundColor Cyan
    Start-Process "http://localhost:3000"
    Write-Host ""
    Write-Host "To install as a Windows app:" -ForegroundColor Magenta
    Write-Host "  1. In Chrome/Edge, click the install icon (⊕) in the address bar" -ForegroundColor Magenta
    Write-Host "     or go to ⋮ → Cast, save and share → Install page as app" -ForegroundColor Magenta
    Write-Host "  2. It will appear in Start Menu as 'Flux' with its own window" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Press ENTER to stop all servers and exit." -ForegroundColor Cyan
    $null = Read-Host
} else {
    Write-Host ""
    Write-Host "⚠ Servers may still be starting." -ForegroundColor Red
    if (-not $frontendReady) { Write-Host "  Frontend: http://localhost:3000 — not ready yet" -ForegroundColor Red }
    if (-not $backendReady) { Write-Host "  Backend:  http://localhost:3001 — not ready yet" -ForegroundColor Red }
    Write-Host "Check the job output below:" -ForegroundColor Red
    Receive-Job $backendJob -ErrorAction SilentlyContinue
    Receive-Job $frontendJob -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "Press ENTER to stop and exit." -ForegroundColor Cyan
    $null = Read-Host
}

# ── Cleanup ──
Write-Host "Stopping servers..." -ForegroundColor Yellow
Remove-Job $backendJob -Force -ErrorAction SilentlyContinue
Remove-Job $frontendJob -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green
