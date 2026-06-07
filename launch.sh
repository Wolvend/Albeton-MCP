#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-stdio}"
if [[ $# -gt 0 ]]; then
  shift
fi

SKIP_SETUP="${ABLETON_MCP_SKIP_SETUP:-0}"
for arg in "$@"; do
  case "$arg" in
    --skip-setup)
      SKIP_SETUP=1
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

    exec "$POWERSHELL_BIN" -NoProfile -ExecutionPolicy Bypass -File "$PS_SCRIPT" "${PS_ARGS[@]}"
  fi
fi

export ABLETON_MCP_ENABLE_WRITE="${ABLETON_MCP_ENABLE_WRITE:-0}"
export ABLETON_MCP_ENABLE_UI_CONTROL="${ABLETON_MCP_ENABLE_UI_CONTROL:-0}"
export ABLETON_MCP_ENABLE_DOWNLOADS="${ABLETON_MCP_ENABLE_DOWNLOADS:-0}"
export ABLETON_MCP_HTTP_HOST="${ABLETON_MCP_HTTP_HOST:-127.0.0.1}"
export ABLETON_MCP_HTTP_PORT="${ABLETON_MCP_HTTP_PORT:-17366}"

run_setup() {
  if [[ "$SKIP_SETUP" == "1" ]]; then
    return
  fi

  if [[ ! -d node_modules ]]; then
    printf 'Installing npm dependencies...\n' >&2
    npm install >&2
  fi

  printf 'Building Ableton MCP...\n' >&2
  npm run build >&2

  printf 'Installing Ableton Max for Live bridge files...\n' >&2
  npm run bridge:install >&2
}

case "$MODE" in
  install)
    run_setup
    ;;
  verify)
    run_setup
    npm run verify:mcp
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
  *)
    printf 'Usage: ./launch.sh [stdio|http|docker|install|verify|ui-driver] [--skip-setup]\n' >&2
    exit 2
    ;;
esac
