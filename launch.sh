#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-stdio}"
if [[ $# -gt 0 ]]; then
  shift
fi

SKIP_SETUP="${ABLETON_MCP_SKIP_SETUP:-0}"
NO_BUILD=0
NO_BRIDGE_INSTALL=0
WITH_WRITE=0
WITH_DOWNLOADS=0
WITH_UI_CONTROL=0
START_LIVE=0
OPEN_BRIDGE=0
REMOTE_HTTP=0
HTTP_TOKEN="${ABLETON_MCP_HTTP_TOKEN:-}"
for arg in "$@"; do
  case "$arg" in
    --skip-setup)
      SKIP_SETUP=1
      ;;
    --no-build)
      NO_BUILD=1
      ;;
    --no-bridge-install)
      NO_BRIDGE_INSTALL=1
      ;;
    --with-write)
      WITH_WRITE=1
      ;;
    --with-downloads)
      WITH_DOWNLOADS=1
      ;;
    --with-ui-control)
      WITH_UI_CONTROL=1
      ;;
    --start-live)
      START_LIVE=1
      ;;
    --open-bridge)
      OPEN_BRIDGE=1
      ;;
    --remote-http)
      REMOTE_HTTP=1
      ;;
    --http-token=*)
      HTTP_TOKEN="${arg#--http-token=}"
      ;;
    *)
      printf 'Unknown option: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

if [[ "${ABLETON_MCP_USE_BASH_NODE:-0}" != "1" ]]; then
  POWERSHELL_BIN=""
  if command -v powershell.exe >/dev/null 2>&1; then
    POWERSHELL_BIN="powershell.exe"
  elif command -v powershell >/dev/null 2>&1; then
    POWERSHELL_BIN="powershell"
  fi

  if [[ -n "$POWERSHELL_BIN" ]]; then
    PS_SCRIPT="$ROOT_DIR/launch.ps1"
    if command -v wslpath >/dev/null 2>&1; then
      PS_SCRIPT="$(wslpath -w "$PS_SCRIPT")"
    elif command -v cygpath >/dev/null 2>&1; then
      PS_SCRIPT="$(cygpath -w "$PS_SCRIPT")"
    fi

    PS_ARGS=("$MODE")
    if [[ "$SKIP_SETUP" == "1" ]]; then
      PS_ARGS+=("-SkipSetup")
    fi
    if [[ "$NO_BUILD" == "1" ]]; then
      PS_ARGS+=("-NoBuild")
    fi
    if [[ "$NO_BRIDGE_INSTALL" == "1" ]]; then
      PS_ARGS+=("-NoBridgeInstall")
    fi
    if [[ "$WITH_WRITE" == "1" ]]; then
      PS_ARGS+=("-WithWrite")
    fi
    if [[ "$WITH_DOWNLOADS" == "1" ]]; then
      PS_ARGS+=("-WithDownloads")
    fi
    if [[ "$WITH_UI_CONTROL" == "1" ]]; then
      PS_ARGS+=("-WithUiControl")
    fi
    if [[ "$START_LIVE" == "1" ]]; then
      PS_ARGS+=("-StartLive")
    fi
    if [[ "$OPEN_BRIDGE" == "1" ]]; then
      PS_ARGS+=("-OpenBridge")
    fi
    if [[ "$REMOTE_HTTP" == "1" ]]; then
      PS_ARGS+=("-RemoteHttp")
    fi
    if [[ -n "$HTTP_TOKEN" ]]; then
      PS_ARGS+=("-HttpToken" "$HTTP_TOKEN")
    fi

    exec "$POWERSHELL_BIN" -NoProfile -ExecutionPolicy Bypass -File "$PS_SCRIPT" "${PS_ARGS[@]}"
  fi
fi

export ABLETON_MCP_ENABLE_WRITE="${ABLETON_MCP_ENABLE_WRITE:-0}"
export ABLETON_MCP_ENABLE_UI_CONTROL="${ABLETON_MCP_ENABLE_UI_CONTROL:-0}"
export ABLETON_MCP_ENABLE_DOWNLOADS="${ABLETON_MCP_ENABLE_DOWNLOADS:-0}"
export ABLETON_MCP_HTTP_HOST="${ABLETON_MCP_HTTP_HOST:-127.0.0.1}"
export ABLETON_MCP_HTTP_PORT="${ABLETON_MCP_HTTP_PORT:-17366}"

if [[ "$WITH_WRITE" == "1" ]]; then
  export ABLETON_MCP_ENABLE_WRITE=1
fi
if [[ "$WITH_DOWNLOADS" == "1" ]]; then
  export ABLETON_MCP_ENABLE_DOWNLOADS=1
fi
if [[ "$WITH_UI_CONTROL" == "1" ]]; then
  export ABLETON_MCP_ENABLE_UI_CONTROL=1
fi
if [[ -n "$HTTP_TOKEN" ]]; then
  export ABLETON_MCP_HTTP_TOKEN="$HTTP_TOKEN"
fi
if [[ "$REMOTE_HTTP" == "1" ]]; then
  if [[ "$MODE" != "http" && "$MODE" != "docker" ]]; then
    printf '%s\n' '--remote-http is only valid with http or docker mode.' >&2
    exit 2
  fi
  if [[ -z "${ABLETON_MCP_HTTP_TOKEN:-}" || ${#ABLETON_MCP_HTTP_TOKEN} -lt 16 ]]; then
    printf '%s\n' 'Remote HTTP requires --http-token=<token> or ABLETON_MCP_HTTP_TOKEN with at least 16 characters.' >&2
    exit 2
  fi
  export ABLETON_MCP_HTTP_ALLOW_REMOTE=1
  export ABLETON_MCP_HTTP_HOST=0.0.0.0
fi

show_help() {
  cat <<'EOF'
Ableton MCP launcher

Usage:
  ./launch.sh [mode] [options]
  ./launch.ps1 [mode] [options]
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
  --skip-setup         Reuse existing node_modules, dist, and installed bridge files.
  --no-build           Do not build during setup.
  --no-bridge-install  Do not install Max for Live bridge files during setup.
  --with-write         Set ABLETON_MCP_ENABLE_WRITE=1 for this process.
  --with-downloads     Set ABLETON_MCP_ENABLE_DOWNLOADS=1 for this process.
  --with-ui-control    Set ABLETON_MCP_ENABLE_UI_CONTROL=1 for this process.
  --start-live         For live-ready only: explicitly start Ableton Live, then re-check readiness.
  --open-bridge        For live-ready only: explicitly open the installed bridge preset, then re-check readiness.
  --remote-http        For http/docker only: bind 0.0.0.0; requires token.
  --http-token=<token> Set ABLETON_MCP_HTTP_TOKEN for this process. Minimum 16 chars.

Safe defaults:
  Writes, UI control, downloads, and remote HTTP are off unless explicitly enabled.
  Setup logs are written to stderr so stdio MCP stdout stays clean.
EOF
}

run_setup() {
  if [[ "$SKIP_SETUP" == "1" ]]; then
    return
  fi

  if [[ ! -d node_modules ]]; then
    printf 'Installing npm dependencies...\n' >&2
    npm install >&2
  fi

  if [[ "$NO_BUILD" != "1" ]]; then
    printf 'Building Ableton MCP...\n' >&2
    npm run build >&2
  fi

  if [[ "$NO_BRIDGE_INSTALL" != "1" ]]; then
    printf 'Installing Ableton Max for Live bridge files...\n' >&2
    npm run bridge:install >&2
  fi
}

case "$MODE" in
  help)
    show_help
    ;;
  install)
    run_setup
    ;;
  build)
    npm run build
    ;;
  setup)
    run_setup
    npm run configure:clients -- --with-token
    ;;
  verify)
    run_setup
    npm run verify:mcp
    ;;
  check)
    run_setup
    npm test
    npm run lint
    npm run doctor
    npm run release:check
    npm run sweep:safe
    npm run sweep:all
    npm run verify:mcp
    npm audit --audit-level=moderate
    ;;
  ready)
    run_setup
    npm run ready:check
    ;;
  doctor)
    run_setup
    npm run doctor
    ;;
  test)
    run_setup
    npm test
    ;;
  lint)
    run_setup
    npm run lint
    ;;
  sweep)
    run_setup
    npm run sweep:safe
    ;;
  sweep-all)
    run_setup
    npm run sweep:all
    ;;
  live-ready)
    run_setup
    if [[ "$START_LIVE" == "1" && "$OPEN_BRIDGE" == "1" ]]; then
      npm run live-ready -- --launch-live --open-bridge-device --yes
    elif [[ "$START_LIVE" == "1" ]]; then
      npm run live-ready -- --launch-live --yes
    elif [[ "$OPEN_BRIDGE" == "1" ]]; then
      npm run live-ready -- --open-bridge-device --yes
    else
      npm run live-ready
    fi
    ;;
  live-smoke)
    run_setup
    npm run live-smoke
    ;;
  concept-demo)
    run_setup
    npm run demo:concept
    ;;
  producer-demo)
    run_setup
    npm run demo:producer
    ;;
  inspect)
    run_setup
    npm run inspect
    ;;
  stdio)
    run_setup
    exec node dist/src/index.js
    ;;
  http|docker)
    run_setup
    exec node dist/src/http.js
    ;;
  ui-driver)
    export ABLETON_MCP_ENABLE_UI_CONTROL=1
    run_setup
    exec node dist/scripts/ableton-ui-driver.js
    ;;
  bridge-status)
    run_setup
    npm run bridge:status -- --check-bridge
    ;;
  bridge-listener)
    run_setup
    exec node dist/scripts/ableton-bridge-setup-listener.js
    ;;
  *)
    show_help >&2
    exit 2
    ;;
esac
