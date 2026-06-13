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

Generated stdio configs use the fast launcher path, so they pass `-SkipSetup` or `--skip-setup`. After pulling updates, run `.\launch.ps1 setup` or `.\launch.ps1 check` once before restarting MCP clients.

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
      "args": ["stdio", "-SkipSetup"]
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
      "args": ["stdio", "--skip-setup"]
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
      "args": ["stdio", "-SkipSetup"],
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

## OpenClaw

OpenClaw should consume Ableton MCP as an outbound MCP server. Keep Ableton MCP as the permission owner for writes, downloads, path policy, and UI control.

Start local HTTP:

```powershell
.\launch.ps1 docker -SkipSetup
```

Use the template:

```text
config/openclaw-http.json
```

Or add it with the OpenClaw MCP registry:

```powershell
$safeTools = node -e "import('./dist/src/docker-profile.js').then(m=>console.log(m.HYPERNIMBUS_SAFE_TOOL_ALLOWLIST.join(',')))"
openclaw mcp add ableton-mcp --url http://127.0.0.1:17366/mcp --transport streamable-http --timeout 30 --connect-timeout 5
openclaw mcp tools ableton-mcp --include "$safeTools"
openclaw mcp doctor ableton-mcp --probe
```

After Ableton MCP is reachable, call `ableton_mcp_get_safe_tool_allowlist` and use `safeToolAllowlist.csv` as the same include list. The Node one-liner above is only for first bootstrap before a client can call MCP tools.

Equivalent JSON config can be applied with `openclaw mcp set` when scripting direct config writes:

```powershell
openclaw mcp set ableton-mcp '{"url":"http://127.0.0.1:17366/mcp","transport":"streamable-http","connectTimeout":5,"timeout":30}'
openclaw mcp tools ableton-mcp --include "$safeTools"
openclaw mcp doctor ableton-mcp --probe
```

OpenClaw's [MCP docs](https://docs.openclaw.ai/cli/mcp) distinguish `openclaw mcp serve` for exposing OpenClaw as an MCP server from `openclaw mcp add`, `set`, `tools`, `doctor`, and `probe` for consuming third-party MCP servers. Ableton MCP uses the consumer path.

## WSL

Use Windows-backed control from WSL:

```bash
cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh stdio
```

By default this delegates to the Windows launcher when PowerShell is available. Use native WSL Node for headless verification:

```bash
ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh verify
```

## Other Devices

For another device on a private network, use Streamable HTTP. Keep this behind Tailscale/VPN or a trusted LAN.

Required environment:

```powershell
.\launch.ps1 docker -RemoteHttp -HttpToken "<at least 16 random characters>"
```

Remote clients must send:

```text
Authorization: Bearer <ABLETON_MCP_HTTP_TOKEN>
```

Do not expose port `17366` to the public internet. Prefer Tailscale/VPN, keep the bearer token private, and verify actual listener/firewall exposure before connecting another device.

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
| OpenClaw | Use the local Streamable HTTP profile through `openclaw mcp add`, apply the generated safe tool include list, and verify with `openclaw mcp doctor ableton-mcp --probe`. |
| Claude | Use stdio locally; use HTTP only if the client supports Streamable HTTP MCP. |
| Codex | Use stdio locally or HTTP/Docker routing for remote/private-device workflows. |

The MCP tool `ableton_mcp_get_client_bootstrap_bundle` returns one machine-readable setup bundle with stdio/HTTP defaults, OpenClaw commands, HyperNimbus profile scripts, safe include CSV, provider-host notes for OpenRouter/Gemini/llama.cpp/Antigravity, verification commands, and guardrails. `ableton_mcp_get_client_connection_profiles` and `ableton_mcp_get_safe_tool_allowlist` remain available as narrower calls. After connecting, call `ableton_get_production_readiness` to see whether the environment is in offline-planning, live-read/dry-run, or write-ready mode, then call `ableton_plan_agent_music_session` to get the exact side-effect-free phase plan for turning a mood/place brief into concept, sample, arrangement, approval, and delivery calls.
