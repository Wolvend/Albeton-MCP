# Launch Modes

The root launcher scripts make the project usable as either a regular stdio MCP server or a localhost HTTP service for Docker MCP.

## Windows PowerShell

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 stdio
```

## Git Bash On Windows

```bash
cd /c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh stdio
```

## WSL Or Native Bash

By default, `launch.sh` delegates to PowerShell when PowerShell is available. That is useful from WSL when you want Windows-backed Ableton control.

Use native Bash/Node for headless WSL, Linux, or macOS operation:

```bash
ABLETON_MCP_USE_BASH_NODE=1 ./launch.sh verify
```

## Modes

| Mode | Command | Behavior |
| --- | --- | --- |
| `stdio` | `.\launch.ps1 stdio` | Builds, installs bridge files, then starts `dist/src/index.js` for normal MCP stdio clients. |
| `docker` | `.\launch.ps1 docker` | Builds, installs bridge files, then starts `dist/src/http.js` at `127.0.0.1:17366/mcp`. |
| `http` | `.\launch.ps1 http` | Alias for `docker`; useful for non-Docker Streamable HTTP clients. |
| `install` | `.\launch.ps1 install` | Builds and installs the Max for Live bridge preset files only. |
| `bridge-status` | `.\launch.ps1 bridge-status -SkipSetup` | Reports installed bridge file freshness, Ableton process state, and listener reachability. |
| `setup` | `.\launch.ps1 setup` | Builds, installs bridge files, and writes generated Codex, Claude, Cursor, WSL, local HTTP, and Tailscale HTTP client configs. |
| `verify` | `.\launch.ps1 verify` | Builds, installs bridge files, then runs `npm run verify:mcp`. |
| `check` | `.\launch.ps1 check` | Builds, tests, lints, runs doctor, release check, safe and all-tool sweeps, MCP verifier, and npm audit. |
| `doctor` | `.\launch.ps1 doctor` | Runs environment, catalog, and listener checks. |
| `test` | `.\launch.ps1 test` | Runs unit tests. |
| `lint` | `.\launch.ps1 lint` | Runs ESLint. |
| `build` | `.\launch.ps1 build` | Builds TypeScript only. |
| `sweep` | `.\launch.ps1 sweep` | Runs the read-only/dry-run MCP safe sweep. |
| `sweep-all` | `.\launch.ps1 sweep-all` | Calls every registered tool once with safe read-only or dry-run arguments. |
| `live-ready` | `.\launch.ps1 live-ready -SkipSetup` | Reports installed bridge file freshness, Ableton process state, and listener reachability without starting Ableton. |
| `live-ready -StartLive` | `.\launch.ps1 live-ready -StartLive -SkipSetup` | Explicitly starts Ableton Live, waits for the process, then re-checks bridge readiness. Does not enable writes, downloads, or UI/mouse control. |
| `live-ready -OpenBridge` | `.\launch.ps1 live-ready -OpenBridge -SkipSetup` | Explicitly asks the OS/Ableton to open the installed `Ableton MCP Bridge.amxd` preset, then re-checks the listener. It does not move the mouse; Ableton may still prompt or require the current set to accept the device. |
| `live-smoke` | `.\launch.ps1 live-smoke` | Confirms objective readiness, launch readiness, LiveAPI coverage, bridge reachability, routing readiness, and one dry-run write probe. |
| `concept-demo` | `.\launch.ps1 concept-demo` | Runs a side-effect-free MCP client workflow from concept brief to stored arrangement, action matrix, approval dry-run, and delivery plan. |
| `inspect` | `.\launch.ps1 inspect` | Lists tools through MCP Inspector. |
| `ui-driver` | `.\launch.ps1 ui-driver` | Enables `ABLETON_MCP_ENABLE_UI_CONTROL=1` and starts the foreground Ableton UI driver. |
| `bridge-listener` | `.\launch.ps1 bridge-listener` | Starts the local bridge setup listener. |
| `help` | `.\launch.ps1 help` | Prints launcher usage. |

Pass `-SkipSetup` in PowerShell or `--skip-setup` in Bash when dependencies, build output, and bridge files are already current. Generated client configs use this fast path so MCP clients do not rebuild on every spawn. After pulling updates, run `.\launch.ps1 setup` or `.\launch.ps1 check` once to refresh `dist` and bridge files.

Recommended local sequence:

```powershell
.\launch.ps1 setup
.\launch.ps1 check -SkipSetup
# Open Ableton and load the bridge device if bridge-status reports device_not_loaded.
.\launch.ps1 bridge-status -SkipSetup
.\launch.ps1 live-ready -StartLive -SkipSetup
.\launch.ps1 live-ready -OpenBridge -SkipSetup
.\launch.ps1 live-smoke -SkipSetup
```

## Options

| PowerShell | Bash | Purpose |
| --- | --- | --- |
| `-SkipSetup` | `--skip-setup` | Reuse current dependencies, build output, and bridge files. |
| `-NoBuild` | `--no-build` | Skip TypeScript build during setup. |
| `-NoBridgeInstall` | `--no-bridge-install` | Skip bridge file install during setup. |
| `-WithWrite` | `--with-write` | Set `ABLETON_MCP_ENABLE_WRITE=1` for this process. |
| `-WithDownloads` | `--with-downloads` | Set `ABLETON_MCP_ENABLE_DOWNLOADS=1` for this process. |
| `-WithUiControl` | `--with-ui-control` | Set `ABLETON_MCP_ENABLE_UI_CONTROL=1` for this process. |
| `-StartLive` | `--start-live` | For `live-ready` only: explicitly start Ableton Live, then re-check readiness. |
| `-OpenBridge` | `--open-bridge` | For `live-ready` only: explicitly open the installed bridge preset, then re-check readiness. |
| `-RemoteHttp` | `--remote-http` | Bind HTTP to `0.0.0.0`; valid only for `http`/`docker` and requires a token. |
| `-HttpToken <token>` | `--http-token=<token>` | Set an HTTP bearer token for this process. Minimum 16 characters. |

## Defaults

The launcher sets conservative defaults when the environment does not already define them:

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
ABLETON_MCP_HTTP_HOST=127.0.0.1
ABLETON_MCP_HTTP_PORT=17366
```

Only enable write, UI control, or downloads for a specific workflow that needs them.

## Automatic Client Setup

Run:

```powershell
.\launch.ps1 setup
```

Generated files are written to `config/generated/`, which is ignored by git:

```text
codex.json
claude-desktop.json
cursor.json
wsl-stdio.json
local-http.json
remote-http.json
remote-http.env
INSTALL_SUMMARY.md
```

`remote-http.env` contains a generated bearer token when setup is run through the launcher. The token is not printed in terminal output and should not be committed.

Remote HTTP remains disabled unless `ABLETON_MCP_HTTP_ALLOW_REMOTE=1` is set or the launcher is started with `-RemoteHttp` / `--remote-http`. Prefer Tailscale or another private VPN, keep the bearer token private, and verify actual firewall/listener exposure before connecting another device.

## MCP stdio safety

For `stdio`, setup output is written to stderr. stdout is reserved for MCP JSON-RPC after the server starts.

## Regular MCP config

Use the checked-in `.mcp.json` for this machine:

```json
{
  "mcpServers": {
    "ableton-mcp": {
      "command": "C:/Users/LIZ/Desktop/MCP/ableton-mcp/launch.cmd",
      "args": ["stdio", "-SkipSetup"]
    }
  }
}
```

## Docker MCP config

Start the host service first:

```powershell
.\launch.ps1 docker
```

Then connect Docker MCP to:

```text
http://127.0.0.1:17366/mcp
```

The Docker catalog file is `docker/ableton-mcp.catalog.yaml`.

For a private Tailscale/VPN HTTP session, use an explicit token and remote flag:

```powershell
.\launch.ps1 docker -RemoteHttp -HttpToken "replace-with-32-plus-random-chars"
```

Do not expose port `17366` to the public internet.
