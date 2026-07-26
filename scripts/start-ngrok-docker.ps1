# Start ngrok in Docker (tunnels local backend :8000)

param(
  [ValidateSet("host", "compose")]
  [string]$Mode = "host"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Prefer existing env / .env; else load from ngrok.yml without printing it
if (-not $env:NGROK_AUTHTOKEN) {
  $envFile = Join-Path $root ".env"
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^\s*NGROK_AUTHTOKEN\s*=\s*(.+)\s*$') {
        $env:NGROK_AUTHTOKEN = $Matches[1].Trim().Trim('"').Trim("'")
      }
    }
  }
}

if (-not $env:NGROK_AUTHTOKEN) {
  $cfg = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
  if (Test-Path $cfg) {
    $line = Select-String -Path $cfg -Pattern '^\s*authtoken\s*:\s*(\S+)' | Select-Object -First 1
    if ($line) { $env:NGROK_AUTHTOKEN = $line.Matches[0].Groups[1].Value }
  }
}

if (-not $env:NGROK_AUTHTOKEN) {
  Write-Host "Set NGROK_AUTHTOKEN first:" -ForegroundColor Yellow
  Write-Host '  $env:NGROK_AUTHTOKEN = "YOUR_TOKEN"'
  Write-Host "  or put NGROK_AUTHTOKEN=... in .env"
  exit 1
}

# Ensure Docker Desktop is up
$dockerOk = $false
try {
  docker info 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { $dockerOk = $true }
} catch {}

if (-not $dockerOk) {
  Write-Host "Starting Docker Desktop..."
  $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Start-Process $dd } else {
    Write-Host "Docker Desktop not found. Install/start it, then re-run." -ForegroundColor Red
    exit 1
  }
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    try {
      docker info 1>$null 2>$null
      if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
    } catch {}
    Write-Host "  waiting for Docker... ($i)"
  }
}

if (-not $dockerOk) {
  Write-Host "Docker did not become ready. Start Docker Desktop manually." -ForegroundColor Red
  exit 1
}

if ($Mode -eq "host") {
  Write-Host "Starting ngrok-host → host.docker.internal:8000"
  docker compose --profile tunnel-host up -d ngrok-host
} else {
  Write-Host "Starting ngrok → backend:8000 (compose stack)"
  docker compose --profile tunnel up -d backend ngrok
}

Start-Sleep -Seconds 4
Write-Host ""
Write-Host "Inspector: http://localhost:4040"
Write-Host "Public URL:"
try {
  $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 10
  $https = $tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
  if ($https) {
    Write-Host "  $($https.public_url)"
    Write-Host "  POST $($https.public_url)/api/telemetry"
  } else {
    Write-Host "  (open http://localhost:4040 - tunnel still starting)"
  }
} catch {
  Write-Host "  (open http://localhost:4040 - tunnel still starting)"
}
