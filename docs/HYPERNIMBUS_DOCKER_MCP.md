# HyperNimbus Docker MCP Profile

This profile keeps Ableton MCP local to the Windows host while making it available to Docker MCP clients through Streamable HTTP.

## Defaults

```text
Profile: hypernimbus
Endpoint: http://127.0.0.1:17366/mcp
Writes: disabled
Downloads: disabled
UI/mouse control: disabled
Remote HTTP: disabled
```

The Docker profile allowlist enables read, planning, search, diagnostics, and concept-planning tools. It does not enable write execution, sample staging/downloads, raw UI clicks, or tempo/session mutation by default.

## Start Host HTTP

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 docker -SkipSetup
```

Verify local health:

```powershell
Invoke-RestMethod http://127.0.0.1:17366/health
```

## Plan, Apply, Verify

Dry-run the profile change:

```powershell
npm run docker:hypernimbus:plan
```

Apply the profile change:

```powershell
npm run docker:hypernimbus:apply
```

Verify the profile:

```powershell
npm run docker:hypernimbus:verify
```

The apply command backs up the current Docker MCP profile before adding Ableton MCP and applying the safe tool filter. The verify command now checks both that `ableton-mcp` is present and that Docker's enabled tool list exactly matches the 135-tool safe allowlist with no unexpected Ableton or risky write/download/UI tools enabled.

## Rollback

The backup is written under:

```text
diagnostics\runtime\docker-mcp\hypernimbus.before.yaml
```

Restore it with Docker MCP profile import/export tooling if a profile change needs to be reverted.

## OpenClaw

OpenClaw can consume Ableton MCP as an outbound MCP server through its [MCP registry](https://docs.openclaw.ai/cli/mcp). The local HTTP template is:

```text
config\openclaw-http.json
```

Recommended flow:

```powershell
.\launch.ps1 docker -SkipSetup
openclaw mcp status --verbose
$safeTools = node -e "import('./dist/src/docker-profile.js').then(m=>console.log(m.HYPERNIMBUS_SAFE_TOOL_ALLOWLIST.join(',')))"
openclaw mcp add ableton-mcp --url http://127.0.0.1:17366/mcp --transport streamable-http --timeout 30 --connect-timeout 5
openclaw mcp tools ableton-mcp --include "$safeTools"
openclaw mcp doctor ableton-mcp --probe
```

After Ableton MCP is reachable, clients can also call `ableton_mcp_get_safe_tool_allowlist` and use `safeToolAllowlist.csv` instead of importing the local TypeScript module.

OpenClaw should remain a consumer of Ableton MCP. Ableton MCP still owns write/download/UI gates, path allowlisting, sample-source policy, and LiveAPI/UI-driver separation.

## Security Notes

- Keep HTTP bound to `127.0.0.1` for Docker MCP on the same host.
- Use Tailscale/private-network HTTP only when explicitly needed and only with bearer-token auth.
- Do not expose `17366` to the public internet.
- Do not enable `ABLETON_MCP_ENABLE_WRITE`, `ABLETON_MCP_ENABLE_DOWNLOADS`, or `ABLETON_MCP_ENABLE_UI_CONTROL` in a shared Docker profile.
- Treat remote sample names, descriptions, and metadata as untrusted text.
