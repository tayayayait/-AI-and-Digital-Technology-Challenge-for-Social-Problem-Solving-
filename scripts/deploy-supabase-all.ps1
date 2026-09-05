$ErrorActionPreference = "Stop"

$ProjectRef = "qlaeegqbopzwqdcbjbxc"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$SupabaseCli = Join-Path $Root "node_modules\.bin\supabase.cmd"
$SecretScript = Join-Path $PSScriptRoot "set-supabase-secrets.ps1"
$Functions = @(
  "naver-directions",
  "tmap-pedestrian",
  "weather", "weather-warning",
  "disaster-messages",
  "gemini-chat",
  "gemini-notice",
  "sensors",
  "safemap-feature-info",
  "traffic-events",
  "push-subscribe",
  "push-notify",
  "risk-monitor"
)

function Read-EnvFile($Path) {
  $Values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $Values }
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match "^\s*$" -or $_ -match "^\s*#") { return }
    $Index = $_.IndexOf("=")
    if ($Index -gt 0) {
      $Values[$_.Substring(0, $Index)] = $_.Substring($Index + 1)
    }
  }
  return $Values
}

function Assert-ProjectAccess($Cli, $Ref) {
  $AccessOutput = & $Cli functions list --project-ref $Ref 2>&1
  if ($LASTEXITCODE -ne 0) {
    $AccessText = $AccessOutput -join "`n"
    throw "Current Supabase CLI account cannot access project ref $Ref. Run 'pnpm supabase login' with the project owner/admin account, then retry. Details: $AccessText"
  }
}

if (-not (Test-Path -LiteralPath $SupabaseCli)) {
  throw "Supabase CLI not found. Run: pnpm add -D supabase"
}

Push-Location $Root
try {
  Assert-ProjectAccess $SupabaseCli $ProjectRef

  Write-Output "Linking Supabase project..."
  $LinkArgs = @("link", "--project-ref", $ProjectRef, "--yes")
  $EnvValues = Read-EnvFile (Join-Path $Root ".env")
  if (-not [string]::IsNullOrWhiteSpace($EnvValues["SUPABASE_DB_PASSWORD"])) {
    $LinkArgs += @("--password", $EnvValues["SUPABASE_DB_PASSWORD"])
  }
  & $SupabaseCli @LinkArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase project link failed."
  }

  Write-Output "Uploading database migrations..."
  $DbPushArgs = @("db", "push", "--linked", "--yes")
  if (-not [string]::IsNullOrWhiteSpace($EnvValues["SUPABASE_DB_PASSWORD"])) {
    $DbPushArgs += @("--password", $EnvValues["SUPABASE_DB_PASSWORD"])
  }
  & $SupabaseCli @DbPushArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase db push failed."
  }

  Write-Output "Deploying Edge Functions..."
  $DeployArgs = @("functions", "deploy") + $Functions + @("--project-ref", $ProjectRef, "--no-verify-jwt", "--use-api")
  & $SupabaseCli @DeployArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase functions deploy failed."
  }

  Write-Output "Registering Edge Function secrets..."
  & powershell -ExecutionPolicy Bypass -File $SecretScript
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase secrets registration failed."
  }

  Write-Output "Supabase upload complete for project $ProjectRef."
}
finally {
  Pop-Location
}
