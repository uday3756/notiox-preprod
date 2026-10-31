# Apply Supabase migrations automatically
# Usage: .\apply-migrations-auto.ps1
# Requires env: SUPABASE_URL, SUPABASE_ACCESS_TOKEN, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)

$supabaseUrl = $env:SUPABASE_URL
if (-not $supabaseUrl) { $supabaseUrl = "https://tfklcyinjvpvfyxltbzz.supabase.co" }

$accessToken = $env:SUPABASE_ACCESS_TOKEN
if (-not $accessToken) {
    Write-Host "ERROR: Set SUPABASE_ACCESS_TOKEN (Supabase personal access token) before running." -ForegroundColor Red
    exit 1
}

$apiKey = $env:SUPABASE_PUBLISHABLE_KEY
if (-not $apiKey) { $apiKey = $env:SUPABASE_ANON_KEY }
if (-not $apiKey) {
    Write-Host "ERROR: Set SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY before running." -ForegroundColor Red
    exit 1
}

$migrationsDir = ".\supabase\migrations"

$migrations = @(
    "20260621020000_scheduling_nodes.sql",
    "20260621020100_user_working_hours.sql",
    "20260621020300_scheduling_logs.sql",
    "20260621020500_reminder_sent.sql"
)

Write-Host "Applying Supabase Migrations..." -ForegroundColor Cyan
Write-Host ""

foreach ($migration in $migrations) {
    $filePath = Join-Path $migrationsDir $migration

    if (-not (Test-Path $filePath)) {
        Write-Host "File not found: $migration" -ForegroundColor Red
        continue
    }

    Write-Host "Processing: $migration" -ForegroundColor Yellow

    $sqlContent = Get-Content $filePath -Raw

    $body = @{
        query = $sqlContent
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod `
            -Uri "$supabaseUrl/rest/v1/rpc/exec" `
            -Method POST `
            -Headers @{
                "Authorization" = "Bearer $accessToken"
                "Content-Type" = "application/json"
                "apikey" = $apiKey
            } `
            -Body $body `
            -ErrorAction Stop

        Write-Host "Applied: $migration" -ForegroundColor Green
    }
    catch {
        Write-Host "Warning: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   (This might be OK if table already exists)" -ForegroundColor Gray
    }

    Write-Host ""
}

Write-Host "Migration process complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verify in Supabase Dashboard:" -ForegroundColor Yellow
Write-Host "  1. Go to Table Editor"
Write-Host "  2. Check for: scheduling_nodes, user_working_hours, scheduling_logs, reminder_sent"
Write-Host ""
