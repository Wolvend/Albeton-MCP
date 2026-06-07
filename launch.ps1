param(
  [ValidateSet("stdio", "http", "docker", "install", "verify", "ui-driver")]
  [string]$Mode = "stdio",
  [switch]$SkipSetup
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Set-DefaultEnv {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, "Process"))) {
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
  }
}

function Write-Err {
  param([string]$Message)
  [Console]::Error.WriteLine($Message)
}

function Invoke-CapturedStep {
  param([scriptblock]$Step)

  $output = & $Step 2>&1
  $exitCode = $LASTEXITCODE
  foreach ($line in $output) {
    Write-Err $line
  }
  if ($exitCode -ne 0) {
    exit $exitCode
  }
}

function Invoke-Setup {
  if ($SkipSetup -or $env:ABLETON_MCP_SKIP_SETUP -eq "1") {
    return
  }

  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
    Write-Err "Installing npm dependencies..."
    Invoke-CapturedStep { & npm.cmd install }
  }

  Write-Err "Building Ableton MCP..."
  Invoke-CapturedStep { & npm.cmd run build }

  Write-Err "Installing Ableton Max for Live bridge files..."
  Invoke-CapturedStep { & npm.cmd run bridge:install }
}

Set-DefaultEnv "ABLETON_MCP_ENABLE_WRITE" "0"
Set-DefaultEnv "ABLETON_MCP_ENABLE_UI_CONTROL" "0"
Set-DefaultEnv "ABLETON_MCP_ENABLE_DOWNLOADS" "0"
Set-DefaultEnv "ABLETON_MCP_HTTP_HOST" "127.0.0.1"
Set-DefaultEnv "ABLETON_MCP_HTTP_PORT" "17366"

switch ($Mode) {
  "install" {
    Invoke-Setup
  }
  "verify" {
    Invoke-Setup
    & npm.cmd run verify:mcp
    exit $LASTEXITCODE
  }
  "stdio" {
    Invoke-Setup
    & node dist/src/index.js
    exit $LASTEXITCODE
  }
  { $_ -in @("http", "docker") } {
    Invoke-Setup
    & node dist/src/http.js
    exit $LASTEXITCODE
  }
  "ui-driver" {
    $env:ABLETON_MCP_ENABLE_UI_CONTROL = "1"
    Invoke-Setup
    & node dist/scripts/ableton-ui-driver.js
    exit $LASTEXITCODE
  }
}
