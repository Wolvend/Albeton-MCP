# Architecture

Ableton MCP is a local stdio MCP server built with TypeScript, Zod schemas, and the official MCP TypeScript SDK.

## Layers

- MCP server: tool registration, schema validation, structured responses, feature gates, path allowlists, pagination, and errors.
- Cache/index: SQLite via `sql.js`, persisted under `data/cache`.
- Offline intelligence: safe on-demand scanning, `.als` gzip/XML summary parsing, MIDI parsing, and ffprobe audio metadata.
- Live bridge: Max for Live/LiveAPI loopback bridge on `127.0.0.1`, using request IDs, heartbeat, timeouts, and snapshot actions.
- Samples: Freesound and Internet Archive metadata/search, with downloads disabled unless `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
- Runtime middleware: FastMCP-inspired cross-cutting tool pipeline for error handling, timing metrics, per-tool rate limiting, short read-cache TTLs, and response-size limits.
- MCP context: read-only resources expose environment, runtime metrics, and scan status; prompts provide safe production planning and security review templates.

No full library scan runs at startup.

## FastMCP-Inspired Controls

FastMCP’s middleware model applies shared behavior around tools without duplicating logic in each tool. This server mirrors that pattern in TypeScript:

- `runTool` wraps every MCP tool.
- Read-only, idempotent, closed-world tools get a short response cache.
- Every tool records call count, failures, cache hits, and duration.
- Rate limits are stricter for write-capable tools.
- Oversized responses are rejected with pagination guidance.

Runtime state is available through `ableton_mcp_get_runtime_report` and the `ableton://runtime` MCP resource.
