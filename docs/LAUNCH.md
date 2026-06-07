# Launch Modes

The root launcher scripts make the project usable as either a regular stdio MCP server or a localhost HTTP service for Docker MCP.

## Windows PowerShell

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 stdio
```

## Git Bash

```bash
cd /c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh stdio
```

## Modes

| Mode | Command | Behavior |
| --- | --- | --- |
| `stdio` | `.\launch.ps1 stdio` | Builds, installs bridge files, then starts `dist/src/index.js` for normal MCP stdio clients. |
| `docker` | `.\launch.ps1 docker` | Builds, installs bridge files, then starts `dist/src/http.js` at `127.0.0.1:17366/mcp`. |
| `http` | `.\launch.ps1 http` | Alias for `docker`; useful for non-Docker Streamable HTTP clients. |
| `install` | `.\launch.ps1 install` | Builds and installs the Max for Live bridge preset files only. |
| `setup` | `.\launch.ps1 setup` | Builds, installs bridge files, and writes generated Codex, Claude, Cursor, WSL, local HTTP, and Tailscale HTTP client configs. |
| `verify` | `.\launch.ps1 verify` | Builds, installs bridge files, then runs `npm run verify:mcp`. |
| `ui-driver` | `.\launch.ps1 ui-driver` | Enables `ABLETON_MCP_ENABLE_UI_CONTROL=1` and starts the foreground Ableton UI driver. |

Pass `-SkipSetup` in PowerShell or `--skip-setup` in Bash when dependencies, build output, and bridge files are already current.

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

## MCP stdio safety

For `stdio`, setup output is written to stderr. stdout is reserved for MCP JSON-RPC after the server starts.

## Regular MCP config

Use the checked-in `.mcp.json` for this machine:

```json
{
  "mcpServers": {
    "ableton-mcp": {
      "command": "C:/Users/LIZ/Desktop/MCP/ableton-mcp/launch.cmd",
      "args": ["stdio"]
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
