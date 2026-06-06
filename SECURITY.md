# Security

Ableton MCP is read-only by default.

## Controls

- Explicit path allowlist.
- `ABLETON_MCP_ALLOWED_ROOTS` cannot widen access beyond the built-in approved roots.
- Realpath resolution before file operations.
- Symlink escape rejection.
- Read-only Ableton installation root.
- No broad `C:\`, `C:\Users\LIZ`, or AppData access.
- No arbitrary shell tool.
- No arbitrary URL fetch tool.
- Sample downloads are restricted to HTTPS URLs from approved Freesound and Internet Archive hosts.
- Private, local, raw-IP, credentialed, and non-HTTPS sample URLs are rejected.
- Sample download redirects are rejected by default.
- Downloads disabled by default.
- Ableton write/control disabled by default.
- UI control disabled by default.
- Imported samples require license metadata and attribution sidecars.

## Feature Gates

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
```

Set a gate to `1` only for the specific workflow that requires it.

## Runtime Guardrails

- Per-tool rate limiting.
- Per-tool MCP argument-size limit.
- Read-only response cache for idempotent closed-world tools only.
- MCP response-size limit with pagination guidance.
- Bridge response-size limit and fixed action-id validation.
- Remote API JSON response-size limit.
- Runtime metrics available through `ableton_mcp_get_runtime_report`.
- Security posture available through `ableton_mcp_security_report`.

## Subprocess Policy

Subprocesses use fixed executable paths and a minimal environment. The server does not expose arbitrary shell execution, arbitrary command templates, or full process environment passthrough.
