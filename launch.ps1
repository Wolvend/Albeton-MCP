param(
  [ValidateSet("stdio", "http", "docker", "install", "setup", "verify", "check", "ready", "doctor", "test", "lint", "build", "sweep", "sweep-all", "live-ready", "live-smoke", "concept-demo", "producer-demo", "inspect", "ui-driver", "bridge-status", "bridge-listener", "help")]
  [string]$Mode = "stdio",
  [switch]$SkipSetup,
  [switch]$NoBuild,
  [switch]$NoBridgeInstall,
  [switch]$WithWrite,
  [switch]$WithDownloads,
  [switch]$WithUiControl,
  [switch]$StartLive,
  [switch]$OpenBridge,
  [switch]$RemoteHttp,
  [string]$HttpToken
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

function Show-Help {
  @"
Ableton MCP launcher

Usage:
  .\launch.ps1 [mode] [options]
  ./launch.sh [mode] [options]
  launch.cmd [mode] [options]

Modes:
  stdio            Start local stdio MCP server for Codex, Claude, Cursor, etc. Default.
  docker, http     Start local Streamable HTTP MCP at http://127.0.0.1:17366/mcp.
  setup            Build, install bridge files, and generate client configs.
  install          Build and install Ableton Max for Live bridge files only.
  verify           Build and run MCP verifier.
  check            Build, test, lint, doctor, release check, sweeps, verifier, audit.
  ready            Read-only reboot-ready check for local MCP startup and sample-root config.
  doctor           Run environment and listener checks.
  test, lint       Run unit tests or lint.
  build            Build TypeScript only.
  sweep            Run safe read-only/dry-run MCP sweep.
  sweep-all        Run exhaustive safe contract sweep for every registered tool.
  live-ready       Report host/Ableton/bridge readiness; optionally start Ableton or open the bridge preset.
  live-smoke       Run safe Ableton bridge live smoke checks without real writes.
  concept-demo     Run a side-effect-free concept-to-music MCP client dry run.
  producer-demo    Run the small producer-facade MCP client dry run.
  inspect          List MCP tools with MCP Inspector.
  ui-driver        Start user-chosen foreground Ableton UI driver.
  bridge-status    Report bridge install freshness, Ableton process state, and listener status.
  bridge-listener  Start bridge setup listener for Ableton bridge setup.
  help             Show this help.

Options:
  -SkipSetup         Reuse existing node_modules, dist, and installed bridge files.
  -NoBuild           Do not build during setup.
  -NoBridgeInstall   Do not install Max for Live bridge files during setup.
  -WithWrite         Set ABLETON_MCP_ENABLE_WRITE=1 for this process.
  -WithDownloads     Set ABLETON_MCP_ENABLE_DOWNLOADS=1 for this process.
  -WithUiControl     Set ABLETON_MCP_ENABLE_UI_CONTROL=1 for this process.
  -StartLive         For live-ready only: explicitly start Ableton Live, then re-check readiness.
  -OpenBridge        For live-ready only: explicitly open the installed bridge preset, then re-check readiness.
  -RemoteHttp        For http/docker only: bind 0.0.0.0; requires -HttpToken or env token.
  -HttpToken <token> Set ABLETON_MCP_HTTP_TOKEN for this process. Minimum 16 chars.

Safe defaults:
  Writes, UI control, downloads, and remote HTTP are off unless explicitly enabled.
  Setup logs are written to stderr so stdio MCP stdout stays clean.
"@ | Write-Output
}

function Invoke-CapturedStep {
  param([scriptblock]$Step)

  $output = & $Step 2>&1
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
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

  if (-not $NoBuild) {
    Write-Err "Building Ableton MCP..."
    Invoke-CapturedStep { & npm.cmd run build }
  }

  if (-not $NoBridgeInstall) {
    Write-Err "Installing Ableton Max for Live bridge files..."
    Invoke-CapturedStep { & npm.cmd run bridge:install }
  }
}

Set-DefaultEnv "ABLETON_MCP_ENABLE_WRITE" "0"
Set-DefaultEnv "ABLETON_MCP_ENABLE_UI_CONTROL" "0"
Set-DefaultEnv "ABLETON_MCP_ENABLE_DOWNLOADS" "0"
Set-DefaultEnv "ABLETON_MCP_HTTP_HOST" "127.0.0.1"
Set-DefaultEnv "ABLETON_MCP_HTTP_PORT" "17366"

if ($WithWrite) { $env:ABLETON_MCP_ENABLE_WRITE = "1" }
if ($WithDownloads) { $env:ABLETON_MCP_ENABLE_DOWNLOADS = "1" }
if ($WithUiControl) { $env:ABLETON_MCP_ENABLE_UI_CONTROL = "1" }
if (-not [string]::IsNullOrWhiteSpace($HttpToken)) { $env:ABLETON_MCP_HTTP_TOKEN = $HttpToken }

if ($RemoteHttp) {
  if ($Mode -notin @("http", "docker")) {
    throw "-RemoteHttp is only valid with http or docker mode."
  }
  $token = $env:ABLETON_MCP_HTTP_TOKEN
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 16) {
    throw "Remote HTTP requires -HttpToken or ABLETON_MCP_HTTP_TOKEN with at least 16 characters."
  }
  $env:ABLETON_MCP_HTTP_ALLOW_REMOTE = "1"
  $env:ABLETON_MCP_HTTP_HOST = "0.0.0.0"
}

switch ($Mode) {
  "help" {
    Show-Help
  }
  "install" {
    Invoke-Setup
  }
  "build" {
    Invoke-CapturedStep { & npm.cmd run build }
  }
  "setup" {
    Invoke-Setup
    & npm.cmd run configure:clients -- --with-token
    exit $LASTEXITCODE
  }
  "verify" {
    Invoke-Setup
    & npm.cmd run verify:mcp
    exit $LASTEXITCODE
  }
  "check" {
    Invoke-Setup
    Invoke-CapturedStep { & npm.cmd test }
    Invoke-CapturedStep { & npm.cmd run lint }
    Invoke-CapturedStep { & npm.cmd run doctor }
    Invoke-CapturedStep { & npm.cmd run release:check }
    Invoke-CapturedStep { & npm.cmd run sweep:safe }
    Invoke-CapturedStep { & npm.cmd run sweep:all }
    Invoke-CapturedStep { & npm.cmd run verify:mcp }
    Invoke-CapturedStep { & npm.cmd audit --audit-level=moderate }
  }
  "ready" {
    Invoke-Setup
    & npm.cmd run ready:check
    exit $LASTEXITCODE
  }
  "doctor" {
    Invoke-Setup
    & npm.cmd run doctor
    exit $LASTEXITCODE
  }
  "test" {
    Invoke-Setup
    & npm.cmd test
    exit $LASTEXITCODE
  }
  "lint" {
    Invoke-Setup
    & npm.cmd run lint
    exit $LASTEXITCODE
  }
  "sweep" {
    Invoke-Setup
    & npm.cmd run sweep:safe
    exit $LASTEXITCODE
  }
  "sweep-all" {
    Invoke-Setup
    & npm.cmd run sweep:all
    exit $LASTEXITCODE
  }
  "live-ready" {
    Invoke-Setup
    if ($StartLive) {
      if ($OpenBridge) {
        & npm.cmd run live-ready -- --launch-live --open-bridge-device --yes
      } else {
        & npm.cmd run live-ready -- --launch-live --yes
      }
    } elseif ($OpenBridge) {
      & npm.cmd run live-ready -- --open-bridge-device --yes
    } else {
      & npm.cmd run live-ready
    }
    exit $LASTEXITCODE
  }
  "live-smoke" {
    Invoke-Setup
    & npm.cmd run live-smoke
    exit $LASTEXITCODE
  }
  "concept-demo" {
    Invoke-Setup
    & npm.cmd run demo:concept
    exit $LASTEXITCODE
  }
  "producer-demo" {
    Invoke-Setup
    & npm.cmd run demo:producer
    exit $LASTEXITCODE
  }
  "inspect" {
    Invoke-Setup
    & npm.cmd run inspect
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
  "bridge-status" {
    Invoke-Setup
    & npm.cmd run bridge:status -- --check-bridge
    exit $LASTEXITCODE
  }
  "bridge-listener" {
    Invoke-Setup
    & node dist/scripts/ableton-bridge-setup-listener.js
    exit $LASTEXITCODE
  }
}
