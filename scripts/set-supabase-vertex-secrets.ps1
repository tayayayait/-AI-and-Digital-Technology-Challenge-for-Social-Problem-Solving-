$ErrorActionPreference = "Stop"

$ProjectRef = "qlaeegqbopzwqdcbjbxc"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvPath = Join-Path $Root ".env"
$ServiceAccountPath = Join-Path $Root "apikey.json"
$TempDir = Join-Path $Root "tmp"
$TempSecretsPath = Join-Path $TempDir "vertex-supabase-secrets.env"
$SupabaseCli = Join-Path $Root "node_modules\.bin\supabase.cmd"

if (-not (Test-Path -LiteralPath $SupabaseCli)) {
  throw "Supabase CLI not found. Run: pnpm add -D supabase"
}

if (-not (Test-Path -LiteralPath $EnvPath)) {
  throw ".env not found."
}

if (-not (Test-Path -LiteralPath $ServiceAccountPath)) {
  throw "apikey.json not found."
}

$EnvValues = @{}
Get-Content -LiteralPath $EnvPath | ForEach-Object {
  if ($_ -match "^\s*$" -or $_ -match "^\s*#") { return }
  $Index = $_.IndexOf("=")
  if ($Index -gt 0) {
    $EnvValues[$_.Substring(0, $Index)] = $_.Substring($Index + 1)
  }
}

$RequiredEnv = @("VERTEX_AI_PROJECT_ID", "VERTEX_AI_LOCATION", "VERTEX_AI_MODEL")
foreach ($Name in $RequiredEnv) {
  if ([string]::IsNullOrWhiteSpace($EnvValues[$Name])) {
    throw "Missing $Name in .env."
  }
}

$AccessOutput = & $SupabaseCli functions list --project-ref $ProjectRef 2>&1
if ($LASTEXITCODE -ne 0) {
  $AccessText = $AccessOutput -join "`n"
  throw "Current Supabase CLI account cannot access project ref $ProjectRef. Run 'pnpm supabase login' with the project owner/admin account, then retry. Details: $AccessText"
}

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
  $ServiceAccountJson = Get-Content -LiteralPath $ServiceAccountPath -Raw |
    ConvertFrom-Json |
    ConvertTo-Json -Compress -Depth 20

  $Lines = @(
    "VERTEX_AI_PROJECT_ID=$($EnvValues["VERTEX_AI_PROJECT_ID"])",
    "VERTEX_AI_LOCATION=$($EnvValues["VERTEX_AI_LOCATION"])",
    "VERTEX_AI_MODEL=$($EnvValues["VERTEX_AI_MODEL"])",
    "GOOGLE_SERVICE_ACCOUNT_JSON=$ServiceAccountJson"
  )
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($TempSecretsPath, [string[]]$Lines, $Utf8NoBom)

  $SetOutput = & $SupabaseCli secrets set --project-ref $ProjectRef --env-file $TempSecretsPath 2>&1
  $SetText = $SetOutput -join "`n"
  if ($LASTEXITCODE -ne 0 -or $SetText -match '"_tag"\s*:\s*"Error"|Unexpected error|necessary privileges') {
    throw "Supabase secrets set failed: $SetText"
  }

  Write-Output "Vertex AI secrets registered for Supabase project $ProjectRef."
}
finally {
  if (Test-Path -LiteralPath $TempSecretsPath) {
    Remove-Item -LiteralPath $TempSecretsPath -Force
  }
}
