# Docker MCP

Ableton Live runs as a Windows desktop application, so Docker MCP should connect to a Windows-hosted Ableton MCP HTTP service instead of trying to run Ableton inside a container.

## Start the host service

From PowerShell:

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 docker
```

From Git Bash:

```bash
cd /c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh docker
```

This starts the Streamable HTTP transport on:

```text
http://127.0.0.1:17366/mcp
```

## Connect Docker MCP

Use:

```text
docker/ableton-mcp.catalog.yaml
```

The catalog points at the local host HTTP transport. Keep the launcher running while Docker MCP is connected.

For the HyperNimbus Docker MCP profile, use the checked-in profile automation:

```powershell
npm run docker:hypernimbus:plan
npm run docker:hypernimbus:apply
npm run docker:hypernimbus:verify
```

The apply command backs up the existing profile before adding Ableton MCP and enables only the safe default tool allowlist. See [HyperNimbus Docker MCP](HYPERNIMBUS_DOCKER_MCP.md).

## Control model

Docker MCP and regular MCP expose the same tool surface. The difference is only transport:

| Client style | Transport | Launcher mode |
| --- | --- | --- |
| Codex, Cursor, Claude Desktop, local MCP | stdio | `.\launch.ps1 stdio` |
| Docker MCP, HTTP MCP clients | Streamable HTTP | `.\launch.ps1 docker` |

Ableton control still happens on the Windows host through:

- Max for Live bridge on `127.0.0.1:17364`
- Optional UI driver on `127.0.0.1:17365`
- MCP HTTP transport on `127.0.0.1:17366`

## Security defaults

The Docker MCP path keeps the same defaults:

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
```

Do not expose `17366` publicly. Keep it bound to `127.0.0.1` unless you have a specific private-network need and have reviewed firewall exposure.

For private-network devices, remote HTTP is opt-in only:

```powershell
.\launch.ps1 docker -RemoteHttp -HttpToken "<at least 16 random characters>"
```

The launcher sets `ABLETON_MCP_HTTP_ALLOW_REMOTE=1` and binds HTTP to `0.0.0.0` only for that process. Remote clients must send `Authorization: Bearer <ABLETON_MCP_HTTP_TOKEN>`.
