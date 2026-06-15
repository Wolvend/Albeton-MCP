# Model Runtime Compatibility

This document separates MCP clients from model runtimes. Ableton MCP is a tool server. Codex, Claude, Gemini CLI, Docker MCP, OpenClaw, Cursor, or another host app must provide the MCP client. Ollama, llama.cpp, OpenRouter, and most API model providers are model runtimes or model APIs; they need an MCP-capable host or bridge layer to use Ableton MCP.

## Current Local Smoke Test

Date: 2026-06-14

### Codex / Regular MCP

Status: pass.

Evidence:

- `config/codex.json` and `.mcp.json` use `mcpServers.ableton-mcp.command = C:/Users/LIZ/Desktop/MCP/ableton-mcp/launch.cmd`.
- Args are `["stdio", "-SkipSetup"]`.
- Feature gates stay off: `ABLETON_MCP_ENABLE_WRITE=0`, `ABLETON_MCP_ENABLE_UI_CONTROL=0`, `ABLETON_MCP_ENABLE_DOWNLOADS=0`.
- `npm run verify:mcp` passed with 248 tools, 3 resources, 2 prompts, path security checks, runtime report, security report, bridge mock, and sample metadata search.

### llama.cpp

Status: pass for local model API reachability.

Evidence:

- Process: `llama-server.exe`
- Listener: `127.0.0.1:1234`
- Health: `GET http://127.0.0.1:1234/health` returned `{"status":"ok"}`.
- Models: `GET http://127.0.0.1:1234/v1/models` returned `local-gguf`.
- Completion API: `POST http://127.0.0.1:1234/v1/chat/completions` and `/v1/completions` returned valid completion envelopes for `local-gguf`.

Note: the active `local-gguf` model behaved like a reasoning model and returned reasoning text for the direct completion probe. That proves the local API is live, not that this model is the best default for deterministic tool-driving. Use an MCP-capable host that calls llama.cpp for inference and Ableton MCP for tools.

### Ollama

Status: pass after starting the local Ollama daemon.

Evidence:

- Command: `C:\Users\LIZ\AppData\Local\Programs\Ollama\ollama.exe`
- Version: `0.20.5`
- Listener after start: `[::]:11434`
- Model root from server log: `G:\AI\Ollama`
- `GET http://127.0.0.1:11434/api/tags` returned installed models including `phi4-mini:latest`, `qwen3:8b`, `qwen3-vl:2b`, `qwenwify-32b:latest`, and others.
- `POST http://127.0.0.1:11434/api/generate` against `phi4-mini:latest` returned a valid generation envelope.

Note: the direct generation response did not follow the exact test string, but the daemon and inference path are working. Use an MCP-capable host that calls Ollama for inference and Ableton MCP for tools.

## Verified External Guidance

These systems were checked against current public documentation on 2026-06-14.

### Claude Desktop

Status: config shape is correct for local stdio MCP.

Official MCP documentation uses Claude Desktop as the local-server example and places the config at:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

The documented shape uses a top-level `mcpServers` object with server `command` and `args`. Ableton MCP's `config/claude-desktop.json` matches this pattern.

Use:

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

Source: <https://modelcontextprotocol.io/docs/develop/connect-local-servers>

### Claude API Remote MCP

Status: not equivalent to local stdio.

Claude's Messages API MCP connector supports remote MCP servers directly from the API, but the current documented connector requires the beta header `anthropic-beta: mcp-client-2025-11-20`. It also states that local stdio servers cannot be connected directly; the server must be exposed through HTTP, supporting Streamable HTTP or SSE.

For Ableton MCP, that means:

- local Claude Desktop: use stdio
- Claude API remote MCP: use HTTP only if the user explicitly exposes a private, token-protected MCP HTTP endpoint
- do not expose Ableton MCP publicly

Source: <https://platform.claude.com/docs/en/agents-and-tools/mcp-connector>

### Gemini CLI

Status: config guidance is correct.

Gemini CLI documents `settings.json` with a top-level `mcpServers` object. It supports:

- `command` for stdio transport
- `url` for SSE endpoint URL
- `httpUrl` for Streamable HTTP
- `headers` for HTTP/SSE auth headers
- `env`, `cwd`, `timeout`, `includeTools`, and `excludeTools`

Same-machine stdio example:

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
      },
      "timeout": 600000,
      "trust": false
    }
  }
}
```

Private HTTP example:

```json
{
  "mcpServers": {
    "ableton-mcp": {
      "httpUrl": "http://127.0.0.1:17366/mcp",
      "headers": {
        "Authorization": "Bearer <token-if-remote-http-is-enabled>"
      },
      "timeout": 600000,
      "trust": false
    }
  }
}
```

For local-only HTTP on `127.0.0.1`, omit the bearer header unless the launcher was started with a token requirement.

Source: <https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md>

### OpenRouter

Status: use through an MCP-capable bridge/agent, not as a direct Ableton MCP transport.

OpenRouter's MCP cookbook says MCP servers can be used with OpenRouter by converting MCP tool definitions to OpenAI-compatible tool definitions, and notes that MCP is stateful and requires session management. Their example uses an MCP client SDK plus the OpenAI client with OpenRouter under the hood.

For Ableton MCP, that means:

- OpenRouter provides the model API.
- The agent host or bridge owns MCP session management.
- Ableton MCP still runs as stdio or Streamable HTTP.
- The model should receive only the safe tools that the host exposes, ideally from `ableton_mcp_get_safe_tool_allowlist`.

Source: <https://openrouter.ai/docs/cookbook/coding-agents/mcp-servers>

### llama.cpp

Status: local model API is usable by an MCP-capable host.

llama.cpp provides an OpenAI-compatible HTTP API with endpoints including `/v1/completions`, `/v1/chat/completions`, and `/v1/embedding`. That matches the local smoke test against `127.0.0.1:1234`.

Source: <https://llama-cpp.com/>

### Ollama

Status: local model API is usable by an MCP-capable host.

Ollama documents a local REST API, including:

- `POST /api/generate`
- streaming disabled with `{"stream": false}`
- `GET /api/version`
- local model names in `model:tag` format

That matches the local smoke test against `127.0.0.1:11434`.

Source: <https://github.com/ollama/ollama/blob/main/docs/api.md>

## Correct Universal Architecture

Use:

```text
model runtime/provider -> MCP-capable agent host -> Ableton MCP -> Ableton Live bridge/UI driver
```

Do not use:

```text
model runtime/provider -> Ableton MCP directly
```

The model runtime usually cannot negotiate MCP sessions, list tools, approve actions, enforce user consent, or handle Streamable HTTP by itself. The MCP-capable host does that.

## Recommended Defaults

| Host/runtime | Recommended Ableton MCP path |
| --- | --- |
| Codex | stdio through `.mcp.json` or `config/codex.json` |
| Claude Desktop | stdio through `claude_desktop_config.json` |
| Claude API remote MCP | private/tokenized Streamable HTTP only, not public internet |
| Gemini CLI | stdio with `command`, or private HTTP with `httpUrl` |
| OpenRouter | MCP-capable bridge/agent that converts MCP tools to OpenAI-compatible tool calls |
| llama.cpp | MCP-capable local agent wrapper using llama.cpp for inference |
| Ollama | MCP-capable local agent wrapper using Ollama for inference |
| Docker MCP | Windows-hosted Streamable HTTP at `http://127.0.0.1:17366/mcp` |
| OpenClaw | local Streamable HTTP plus safe tool allowlist |

## Quick Smoke Commands

### Ableton MCP

```powershell
npm run verify:mcp
npm run sweep:safe
```

### llama.cpp

```powershell
Invoke-RestMethod http://127.0.0.1:1234/health
Invoke-RestMethod http://127.0.0.1:1234/v1/models
```

### Ollama

```powershell
ollama --version
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Generation probe:

```powershell
$body = @{
  model = "phi4-mini:latest"
  prompt = "Reply with exactly: ableton ollama smoke ok"
  stream = $false
  options = @{ temperature = 0; num_predict = 16 }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $body
```

## Remaining Runtime Notes

- Ollama was not initially listening and had to be started with `ollama serve`.
- Ollama is currently listening on `[::]:11434`. Treat that as broader than loopback; do not expose it through firewall/router rules unless intended.
- llama.cpp is currently listening on `127.0.0.1:1234`, which is the desired local-only posture.
- Docker backend has a separate local service on `127.0.0.1:8080`; it is not the llama.cpp OpenAI API.
- Ableton MCP HTTP transport is local at `127.0.0.1:17366` when the Docker/HTTP launcher is running.
