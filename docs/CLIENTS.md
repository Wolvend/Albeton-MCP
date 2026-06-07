# MCP Client Compatibility

Ableton MCP exposes the same tools through two transports:

- stdio for same-device MCP clients
- Streamable HTTP for Docker MCP, WSL, and private-network devices

The safest default is stdio on the same machine.

## Automatic Setup

Run:

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 setup
```

This writes ready-to-use configs under `config/generated/` for Codex, Claude Desktop, Cursor, WSL stdio, localhost HTTP, and Tailscale/private HTTP. The generated folder is gitignored because `remote-http.env` may contain a bearer token.

Ready-made template files live in `config/`:

- `config/codex.json`
- `config/claude-desktop.json`
- `config/cursor.json`
- `config/wsl-stdio.json`
- `config/remote-http.example.json`

## Codex

Use the checked-in `.mcp.json` on this Windows machine:

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

For another OS, point the client to the local launcher:

```json
{
  "mcpServers": {
    "ableton-mcp": {
      "command": "/path/to/ableton-mcp/launch.sh",
      "args": ["stdio"]
    }
  }
}
```

## Claude Desktop

Use stdio when Claude Desktop is on the same device:

```json
{
  "mcpServers": {
    "ableton-mcp": {
      "command": "C:/Users/LIZ/Desktop/MCP/ableton-mcp/launch.cmd",
      "args": ["stdio"],
      "env": {
        "ABLETON_MCP_ENABLE_WRITE": "0",
        "ABLETON_MCP_ENABLE_UI_CONTROL": "0",
        "ABLETON_MCP_ENABLE_DOWNLOADS": "0"
      }
    }
  }
}
```

Enable `ABLETON_MCP_ENABLE_WRITE=1` or `ABLETON_MCP_ENABLE_UI_CONTROL=1` only for sessions that need those capabilities.

## Docker MCP

Start the host HTTP server:

```powershell
.\launch.ps1 docker
```

Use:

```text
docker/ableton-mcp.catalog.yaml
```

Default URL:

```text
http://127.0.0.1:17366/mcp
```

## WSL

Use Windows-backed control from WSL:

```bash
cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh stdio
```

Use native WSL Node for headless verification:

```bash
ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh verify
```

## Other Devices

For another device on a private network, use Streamable HTTP. Keep this behind Tailscale/VPN or a trusted LAN.

Required environment:

```powershell
$env:ABLETON_MCP_HTTP_ALLOW_REMOTE="1"
$env:ABLETON_MCP_HTTP_HOST="0.0.0.0"
$env:ABLETON_MCP_TAILSCALE_HOST="100.84.223.22"
$env:ABLETON_MCP_HTTP_TOKEN="<at least 16 random characters>"
.\launch.ps1 docker
```

Remote clients must send:

```text
Authorization: Bearer <ABLETON_MCP_HTTP_TOKEN>
```

Do not expose port `17366` to the public internet.

Default Tailscale URL for this machine:

```text
http://100.84.223.22:17366/mcp
```

## OpenRouter, Gemini, llama.cpp, Antigravity

These are model providers or host runtimes, not all direct MCP transports.

Use Ableton MCP through the app or agent runtime that is actually connecting to MCP:

| System | How to use Ableton MCP |
| --- | --- |
| OpenRouter | Configure Ableton MCP in the MCP-capable host app that uses OpenRouter models. |
| Gemini | Configure Ableton MCP in a Gemini client/agent runtime if it supports MCP server config. |
| llama.cpp | Use an MCP-capable local agent wrapper around llama.cpp. |
| Antigravity | Use stdio or Streamable HTTP if the app exposes MCP server configuration. |
| Claude | Use stdio locally; use HTTP only if the client supports Streamable HTTP MCP. |
| Codex | Use stdio locally or HTTP/Docker routing for remote/private-device workflows. |

The MCP tool `ableton_mcp_get_client_connection_profiles` reports current stdio, local HTTP, private-network candidate URLs, and required auth settings.
