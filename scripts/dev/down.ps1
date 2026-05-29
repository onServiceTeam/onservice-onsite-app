# scripts/dev/down.ps1
#
# Stop and remove the local Docker stack. PowerShell equivalent of down.sh.
# Add -Volumes to also delete the database (full wipe / fresh start).
#
# Usage:
#   ./scripts/dev/down.ps1            stop containers, keep the database
#   ./scripts/dev/down.ps1 -Volumes   stop AND erase the database

param([switch]$Volumes)

$ErrorActionPreference = 'Stop'

$RepoRoot    = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$ComposeFile = Join-Path $RepoRoot 'infra\docker\docker-compose.dev.yml'
$EnvFile     = Join-Path $RepoRoot 'infra\docker\.env.docker'

Set-Location $RepoRoot

if ($Volumes) {
  Write-Host '==> Stopping stack and ERASING the database...' -ForegroundColor Yellow
  docker compose -f $ComposeFile --env-file $EnvFile down -v
} else {
  Write-Host '==> Stopping stack (database preserved)...' -ForegroundColor Cyan
  docker compose -f $ComposeFile --env-file $EnvFile down
}

Write-Host 'Stack stopped.' -ForegroundColor Green
