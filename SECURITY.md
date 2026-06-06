# Security

Ableton MCP is read-only by default.

## Controls

- Explicit path allowlist.
- Realpath resolution before file operations.
- Symlink escape rejection.
- Read-only Ableton installation root.
- No broad `C:\`, `C:\Users\LIZ`, or AppData access.
- No arbitrary shell tool.
- No arbitrary URL fetch tool.
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
