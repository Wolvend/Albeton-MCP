# Platform Compatibility

Ableton MCP is portable as an MCP server. Ableton desktop automation is available only where Ableton Live and the bridge runtime can actually run.

## Support Matrix

| Host | MCP stdio | MCP HTTP/Docker | Library scanning | Audio/MIDI analysis | Max for Live bridge | UI driver |
| --- | --- | --- | --- | --- | --- | --- |
| Windows | Supported | Supported | Supported | Supported | Supported | Supported |
| WSL2 | Supported | Supported | Supported for mounted/allowed paths | Supported if tools are installed | Connects to Windows host bridge over loopback when reachable | Use Windows host UI driver |
| macOS | Supported | Supported | Supported with path overrides/defaults | Supported if tools are installed | Source/layout compatible; requires local Ableton/Max verification | Not implemented |
| Linux | Supported headless | Supported headless | Supported for local allowed paths | Supported if tools are installed | No native Ableton Live desktop default | Not implemented |

## Defaults

Windows defaults:

```text
Ableton install: C:\ProgramData\Ableton\Live 12 Trial
Ableton library: %USERPROFILE%\Documents\Ableton
```

macOS defaults:

```text
Ableton app: /Applications/Ableton Live 12 Trial.app
Ableton library: ~/Music/Ableton
```

Linux and WSL default to headless MCP operation. Use environment overrides if you have a custom Ableton-compatible path, or connect to a Windows/macOS host bridge.

## WSL Modes

Use the Windows-backed launcher from WSL:

```bash
cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh stdio
```

Force native WSL Node instead of the Windows PowerShell handoff:

```bash
cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp
ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh verify
```

The native WSL path is useful for headless MCP validation. For actual Ableton UI/mouse control, keep the Windows host bridge/UI driver running.

## Environment Overrides

All path defaults can be overridden:

```text
ABLETON_MCP_ABLETON_ROOT=
ABLETON_MCP_LIVE_INSTALL=
ABLETON_MCP_LIVE_EXECUTABLE=
ABLETON_MCP_MAX_EXECUTABLE=
ABLETON_MCP_USER_LIBRARY=
ABLETON_MCP_FACTORY_PACKS=
ABLETON_MCP_LIVE_RECORDINGS=
ABLETON_MCP_PREFERENCES=
ABLETON_MCP_LIVE_DATABASE=
ABLETON_MCP_IMPORTS=
```

Tool paths can also be overridden:

```text
ABLETON_MCP_NODE=
ABLETON_MCP_NPM=
ABLETON_MCP_GIT=
ABLETON_MCP_FFMPEG=
ABLETON_MCP_FFPROBE=
ABLETON_MCP_POWERSHELL=
```

## Security

Allowed roots remain constrained to the platform baseline:

- project root
- configured Ableton library root
- configured Ableton install root, when present

`ABLETON_MCP_ALLOWED_ROOTS` can narrow to those roots, but cannot add arbitrary home folders, credential folders, browser profiles, broad AppData, `.ssh`, `.aws`, `.docker`, or root filesystem paths.
