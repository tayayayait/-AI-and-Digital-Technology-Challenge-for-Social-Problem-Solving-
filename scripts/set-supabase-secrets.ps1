$ErrorActionPreference = "Stop"

$ProjectRef = "qlaeegqbopzwqdcbjbxc"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvPath = Join-Path $Root ".env"
$ServiceAccountPath = Join-Path $Root "apikey.json"
$TempDir = Join-Path $Root "tmp"
$TempSecretsPath = Join-Path $TempDir "supabase-edge-secrets.env"
$SupabaseCli = Join-Path $Root "node_modules\.bin\supabase.cmd"

function Read-EnvFile($Path) {
  $Values = @{}
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

if (-not (Test-Path -LiteralPath $EnvPath)) {
  throw ".env not found."
}

$EnvValues = Read-EnvFile $EnvPath
$RequiredEnv = @(
  "NAVER_DIRECTIONS_CLIENT_ID",
  "NAVER_DIRECTIONS_CLIENT_SECRET",
  "TMAP_APP_KEY",
  "KMA_SERVICE_KEY",
  "KMA_WARNING_SERVICE_KEY",
  "HRFCO_SERVICE_KEY",
  "DISASTER_MSG_SERVICE_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "RISK_MONITOR_CRON_SECRET",
  "CCTV_ANALYSIS_DAILY_LIMIT",
  "VERTEX_AI_PROJECT_ID",
  "VERTEX_AI_LOCATION",
  "VERTEX_AI_MODEL"
)

foreach ($Name in $RequiredEnv) {
  if ([string]::IsNullOrWhiteSpace($EnvValues[$Name])) {
    throw "Missing $Name in .env."
  }
}

Assert-ProjectAccess $SupabaseCli $ProjectRef
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
  $SecretLines = New-Object System.Collections.Generic.List[string]
  foreach ($Name in $RequiredEnv) {
    $SecretLines.Add("$Name=$($EnvValues[$Name])")
  }

  foreach ($Name in @(
    "DISASTER_MSG_API_URL",
    "GEMINI_API_KEY",
    "SAFEMAP_SERVICE_KEY",
    "ITS_API_KEY",
    "ITS_CCTV_API_KEY",
    "NAVER_SEARCH_CLIENT_ID",
    "NAVER_SEARCH_CLIENT_SECRET",
    "SENSOR_API_KEY"
  )) {
    if (-not [string]::IsNullOrWhiteSpace($EnvValues[$Name])) {
      $SecretLines.Add("$Name=$($EnvValues[$Name])")
    }
  }

  if (Test-Path -LiteralPath $ServiceAccountPath) {
    $ServiceAccountJson = Get-Content -LiteralPath $ServiceAccountPath -Raw |
      ConvertFrom-Json |
      ConvertTo-Json -Compress -Depth 20
    $SecretLines.Add("GOOGLE_SERVICE_ACCOUNT_JSON=$ServiceAccountJson")
  } elseif (-not [string]::IsNullOrWhiteSpace($EnvValues["GOOGLE_SERVICE_ACCOUNT_JSON"])) {
    $SecretLines.Add("GOOGLE_SERVICE_ACCOUNT_JSON=$($EnvValues["GOOGLE_SERVICE_ACCOUNT_JSON"])")
  } else {
    throw "Missing GOOGLE_SERVICE_ACCOUNT_JSON. Put apikey.json in project root or set it in .env."
  }

  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($TempSecretsPath, [string[]]$SecretLines, $Utf8NoBom)

  $SetOutput = & $SupabaseCli secrets set --project-ref $ProjectRef --env-file $TempSecretsPath 2>&1
  $SetText = $SetOutput -join "`n"
  if ($LASTEXITCODE -ne 0 -or $SetText -match '"_tag"\s*:\s*"Error"|Unexpected error|necessary privileges') {
    throw "Supabase secrets set failed: $SetText"
  }

  Write-Output "Supabase Edge Function secrets registered for project $ProjectRef."
}
finally {
  if (Test-Path -LiteralPath $TempSecretsPath) {
    Remove-Item -LiteralPath $TempSecretsPath -Force
  }
}
