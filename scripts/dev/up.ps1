# scripts/dev/up.ps1
#
# Windows one-command local startup: bring up the Docker stack, run
# migrations, and load demo seed data. PowerShell equivalent of up.sh.
#
# Usage (from the repo root, in PowerShell):
#   ./scripts/dev/up.ps1
#
# Then in two more terminals:
#   npm run dev --workspace=apps/admin     (admin website, http://localhost:7382)
#   npm run start --workspace=apps/mobile  (mobile app via Expo)
#
# See docs/TESTING-GUIDE.md for the demo logins and the 000000 code.

$ErrorActionPreference = 'Stop'

$RepoRoot    = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$ComposeFile = Join-Path $RepoRoot 'infra\docker\docker-compose.dev.yml'
$EnvFile     = Join-Path $RepoRoot 'infra\docker\.env.docker'
$DbUrl       = 'postgresql://onservice:onservice_dev@localhost:7383/onservice_dev'

Set-Location $RepoRoot

Write-Host '==> Building and starting the stack...' -ForegroundColor Cyan
docker compose -f $ComposeFile --env-file $EnvFile up -d --build
if ($LASTEXITCODE -ne 0) { throw 'docker compose failed. Is Docker Desktop running?' }

Write-Host ''
Write-Host '==> Waiting for postgres + redis + minio to be healthy...' -ForegroundColor Cyan
foreach ($svc in @('postgres', 'redis', 'minio')) {
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    $health = (docker inspect --format '{{.State.Health.Status}}' "onservice-$svc" 2>$null)
    if ($health -eq 'healthy') { Write-Host "  $svc: healthy"; $ok = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ok) { throw "$svc did not become healthy. Run: docker logs onservice-$svc" }
}

Write-Host ''
Write-Host '==> Running database migrations...' -ForegroundColor Cyan
$env:DATABASE_URL = $DbUrl
npm run migrate:up --workspace=packages/api
if ($LASTEXITCODE -ne 0) { throw 'migrations failed; check output above' }

Write-Host ''
Write-Host '==> Seeding demo data...' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'reset-demo.ps1')

Write-Host ''
Write-Host '==> Stack is up. Endpoints:' -ForegroundColor Green
Write-Host '    API           http://localhost:7381 (health: /health/ready)'
Write-Host '    Admin website http://localhost:7382 (run: npm run dev --workspace=apps/admin)'
Write-Host '    Mobile app    run: npm run start --workspace=apps/mobile'
Write-Host '    MailHog UI    http://localhost:8025'
Write-Host ''
Write-Host '    Demo login code (mobile): 000000  — see docs/TESTING-GUIDE.md'
Write-Host '==> Tear down with: ./scripts/dev/down.ps1'
