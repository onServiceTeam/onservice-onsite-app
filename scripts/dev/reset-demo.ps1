# scripts/dev/reset-demo.ps1
#
# Re-apply the demo seed data (services, demo users, sample bookings, Cebu
# service areas). Safe to run repeatedly — every seed uses ON CONFLICT DO
# NOTHING / idempotent UPDATEs, so it tops up missing rows without wiping
# your manual test data. Use it to refresh the demo catalog/areas after a
# code change, or as a quick "give me the demo accounts back" button.
#
# Usage:  ./scripts/dev/reset-demo.ps1

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$SeedDir  = Join-Path $RepoRoot 'packages\api\seeds'

if (-not (Test-Path $SeedDir)) { throw "Seed directory not found: $SeedDir" }

Get-ChildItem -Path $SeedDir -Filter '*.sql' | Sort-Object Name | ForEach-Object {
  Write-Host "  applying $($_.Name)..."
  Get-Content $_.FullName -Raw | docker exec -i onservice-postgres psql -U onservice -d onservice_dev | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "    (warning: $($_.Name) may have failed; non-fatal)" -ForegroundColor Yellow }
}

Write-Host 'Demo data applied.' -ForegroundColor Green
