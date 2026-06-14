# Architecture

Ableton MCP is a local stdio MCP server built with TypeScript, Zod schemas, and the official MCP TypeScript SDK.

## Layers

- MCP server: tool registration, schema validation, structured responses, feature gates, path allowlists, pagination, and errors.
- Cache/index: SQLite via `sql.js`, persisted under `data/cache`.
- Offline intelligence: safe on-demand scanning, `.als` gzip/XML summary parsing, MIDI parsing, and ffprobe audio metadata.
- Live bridge: Max for Live/LiveAPI loopback bridge on `127.0.0.1`, using request IDs, heartbeat, timeouts, and snapshot actions.
- Control modes: background bridge control is the default; foreground UI/mouse control is an explicit fallback through a ChromeDriver-style loopback UI driver that requires `ABLETON_MCP_ENABLE_UI_CONTROL=1`.
- Samples: universal source policy/search planning, Freesound and Internet Archive direct metadata paths, Openverse discovery, manual-review source plans, and downloads disabled unless `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
- Runtime middleware: FastMCP-inspired cross-cutting tool pipeline for error handling, timing metrics, per-tool rate limiting, short read-cache TTLs, and response-size limits.
- MCP context: read-only resources expose environment, runtime metrics, and scan status; prompts provide safe production planning and security review templates.

No full library scan runs at startup.

## FastMCP-Inspired Controls

FastMCP’s middleware model applies shared behavior around tools without duplicating logic in each tool. This server mirrors that pattern in TypeScript:

- `runTool` wraps every MCP tool.
- Tool arguments are size-bounded before handlers run.
- Read-only, idempotent, closed-world tools get a short response cache.
- Every tool records call count, failures, cache hits, and duration.
- Rate limits are stricter for write-capable tools.
- Oversized responses are rejected with pagination guidance.
- Bridge calls use fixed action identifiers and size-bounded responses.
- Bridge calls are serialized through one local command queue so concurrent MCP requests cannot overlap inside Ableton.
- Remote sample metadata/search responses are size-bounded.

Runtime state is available through `ableton_mcp_get_runtime_report` and the `ableton://runtime` MCP resource.

## Control Model

The intended model is similar to a browser extension:

- Ableton hosts a trusted local bridge device.
- MCP sends structured requests to that bridge over loopback.
- The bridge performs LiveAPI work inside Ableton and returns structured results.
- Codex can keep working in the background without stealing the user's mouse.

Foreground UI automation remains useful for gaps in LiveAPI coverage, but it is treated as a separate fallback. The server reports this policy through `ableton_control_mode_status`; UI actions are dry-run by default and require both the UI feature gate and the UI driver on `127.0.0.1:17365`.
