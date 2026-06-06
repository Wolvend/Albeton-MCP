# Architecture

Ableton MCP is a local stdio MCP server built with TypeScript, Zod schemas, and the official MCP TypeScript SDK.

## Layers

- MCP server: tool registration, schema validation, structured responses, feature gates, path allowlists, pagination, and errors.
- Cache/index: SQLite via `sql.js`, persisted under `data/cache`.
- Offline intelligence: safe on-demand scanning, `.als` gzip/XML summary parsing, MIDI parsing, and ffprobe audio metadata.
- Live bridge: Max for Live/LiveAPI loopback bridge on `127.0.0.1`, using request IDs, heartbeat, timeouts, and snapshot actions.
- Samples: Freesound and Internet Archive metadata/search, with downloads disabled unless `ABLETON_MCP_ENABLE_DOWNLOADS=1`.

No full library scan runs at startup.
