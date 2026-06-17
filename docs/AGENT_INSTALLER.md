# Agent Installer Guide

This guide is for an AI agent installing Ableton MCP for a user. It covers:

- installing the MCP server
- connecting regular stdio MCP clients
- connecting Docker or HTTP MCP clients
- installing an optional agent skill into a local skills tree
- using the server from Codex, Claude, Cursor, OpenClaw, Gemini/OpenRouter host apps, llama.cpp wrappers, Ollama wrappers, and other MCP-capable agents

Do not treat llama.cpp, Ollama, Gemini, or OpenRouter as MCP transports by themselves. They are model runtimes or model providers. Ableton MCP must be connected through an agent host that supports MCP over stdio or Streamable HTTP.

For the latest local Ollama/llama.cpp smoke-test result and current Claude, Gemini, and OpenRouter proof points, see [Model runtime compatibility](MODEL_RUNTIME_COMPATIBILITY.md).

## Safety Rules For The Installing Agent

Follow these rules before making changes:

- Do not expose Ableton MCP to the public internet.
- Prefer stdio on the same machine.
- Use Docker/HTTP only through `127.0.0.1`, Docker MCP, WSL, Tailscale, VPN, or a trusted private LAN.
- Do not enable writes, downloads, or UI/mouse control during installation.
- Do not edit, print, or commit tokens, API keys, generated bearer tokens, `.env`, `config/generated`, cache files, diagnostics, sample staging output, or audio renders.
- Do not run plugin installers.
- Do not rip YouTube, SoundCloud, or arbitrary URLs.
- Do not scan broad user folders, AppData, browser profiles, credential folders, or password stores.

Default gates must stay:

```text
ABLETON_MCP_ENABLE_WRITE=0
ABLETON_MCP_ENABLE_UI_CONTROL=0
ABLETON_MCP_ENABLE_DOWNLOADS=0
```

Only enable a gate after the user explicitly asks for that workflow.

## Install The MCP Server

### Windows Host

Ableton Live is a desktop app, so the Ableton MCP server should run on the same host that can see Ableton and the Ableton User Library.

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
npm install
npm run build
npm run bridge:install
npm run verify:mcp
```

Preferred one-command setup:

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 setup
```

After setup, start regular stdio MCP:

```powershell
.\launch.ps1 stdio -SkipSetup
```

Run a full local check when changing code:

```powershell
.\launch.ps1 check -SkipSetup
```

### Git Bash Or Unix-Style Shell

```bash
cd /c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh setup
./launch.sh stdio --skip-setup
```

### WSL

For real Ableton control, WSL should normally delegate to the Windows host launcher:

```bash
cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp
./launch.sh stdio --skip-setup
```

For headless WSL verification only:

```bash
ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh verify
```

## Configure Regular MCP Clients

Use stdio when the AI client runs on the same machine as Ableton MCP.

Generic MCP config:

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

Portable Unix-style config:

```json
{
  "mcpServers": {
    "ableton-mcp": {
      "command": "/path/to/ableton-mcp/launch.sh",
      "args": ["stdio", "--skip-setup"],
      "env": {
        "ABLETON_MCP_ENABLE_WRITE": "0",
        "ABLETON_MCP_ENABLE_UI_CONTROL": "0",
        "ABLETON_MCP_ENABLE_DOWNLOADS": "0"
      }
    }
  }
}
```

After the client connects, call these tools first:

```text
ableton_mcp_health
ableton_mcp_get_client_bootstrap_bundle
ableton_mcp_get_objective_readiness_report
ableton_mcp_get_launch_readiness_audit
ableton_get_production_readiness
ableton_control_mode_status
```

For music requests, then call:

```text
ableton_plan_agent_music_session
ableton_plan_concept_track
ableton_curate_concept_samples
ableton_render_concept_execution_action_matrix
ableton_render_concept_execution_runbook
ableton_render_delivery_plan
```

## Configure Docker Or HTTP MCP

Docker MCP should connect to a Windows-hosted Ableton MCP HTTP service. Do not try to run Ableton inside a container.

Start the host HTTP transport:

```powershell
cd C:\Users\LIZ\Desktop\MCP\ableton-mcp
.\launch.ps1 docker -SkipSetup
```

Default local URL:

```text
http://127.0.0.1:17366/mcp
```

Use the catalog:

```text
docker/ableton-mcp.catalog.yaml
```

For a Docker MCP profile or registry, add Ableton MCP as a Streamable HTTP server and include only the safe default tool allowlist. The allowlist is available from:

```text
ableton_mcp_get_safe_tool_allowlist
```

Before the MCP client can call tools, a bootstrap script can print the same CSV:

```powershell
node -e "import('./dist/src/docker-profile.js').then(m=>console.log(m.DOCKER_MCP_SAFE_TOOL_ALLOWLIST.join(',')))"
```

For OpenClaw-style clients:

```powershell
openclaw mcp add ableton-mcp --url http://127.0.0.1:17366/mcp --transport streamable-http --timeout 30 --connect-timeout 5
openclaw mcp tools ableton-mcp --include "<safe tool CSV>"
openclaw mcp doctor ableton-mcp --probe
```

If the client is on another private device, use remote HTTP only with a bearer token:

```powershell
.\launch.ps1 docker -RemoteHttp -HttpToken "<at least 32 random characters>"
```

Remote clients must send:

```text
Authorization: Bearer <ABLETON_MCP_HTTP_TOKEN>
```

Keep this behind Tailscale, VPN, or a trusted private LAN. Verify actual listener and firewall exposure before using remote HTTP.

## Install Optional Agent Skill

This repo already includes agent-facing music docs:

```text
docs/MUSIC_PRODUCTION_SKILLS.md
docs/NATURAL_LANGUAGE_TO_MUSIC.md
docs/CONCEPT_TO_MUSIC.md
docs/TOOL_REFERENCE.md
docs/CLIENTS.md
```

If the host supports local skills, install a small skill that points agents to those docs and forces safe MCP usage.

Example Codex skills tree:

```text
%USERPROFILE%\.codex\skills\ableton-producer\SKILL.md
```

Generic skills tree:

```text
~/.codex/skills/ableton-producer/SKILL.md
~/.agents/skills/ableton-producer/SKILL.md
<host-specific-user-skills>/ableton-producer/SKILL.md
```

Create the directory and write this `SKILL.md`:

```markdown
# Ableton Producer

Use this skill when the user asks to make, edit, analyze, arrange, mix, master, sample, render, or control music with Ableton MCP.

## Required Context

Read these project docs before acting:

- `C:\Users\LIZ\Desktop\MCP\ableton-mcp\docs\MUSIC_PRODUCTION_SKILLS.md`
- `C:\Users\LIZ\Desktop\MCP\ableton-mcp\docs\NATURAL_LANGUAGE_TO_MUSIC.md`
- `C:\Users\LIZ\Desktop\MCP\ableton-mcp\docs\CONCEPT_TO_MUSIC.md`
- `C:\Users\LIZ\Desktop\MCP\ableton-mcp\docs\TOOL_REFERENCE.md`
- `C:\Users\LIZ\Desktop\MCP\ableton-mcp\SECURITY.md`

For a non-Windows install, replace the path with that user's Ableton MCP repo path.

## Operating Rules

- Start with `ableton_mcp_health`, `ableton_mcp_get_client_bootstrap_bundle`, `ableton_get_production_readiness`, and `ableton_control_mode_status`.
- Use read-only and dry-run tools before any write.
- Keep `ABLETON_MCP_ENABLE_WRITE=0`, `ABLETON_MCP_ENABLE_UI_CONTROL=0`, and `ABLETON_MCP_ENABLE_DOWNLOADS=0` unless the user explicitly requests the gated workflow.
- Never claim Ableton LiveAPI success if the bridge returns `unsupported`, `BRIDGE_UNREACHABLE`, or a timeout.
- Use background LiveAPI bridge first.
- Use UI/mouse control only when the user explicitly chooses it.
- Use licensed, attributable samples only.
- Do not use arbitrary URL fetches, broad filesystem scans, plugin installers, YouTube/SoundCloud ripping, or secret access.

## Default Music Workflow

1. Interpret the user's brief as mood, reference, structure, sound palette, constraints, and safety gates.
2. Call `ableton_plan_agent_music_session`.
3. Build or inspect a concept with `ableton_plan_concept_track`.
4. Curate legal/local samples with `ableton_curate_concept_samples`.
5. Review device and mix intent with `ableton_render_concept_device_chain_spec`, `ableton_render_concept_device_catalog_matches`, and `ableton_render_concept_mix_plan`.
6. Review execution with `ableton_render_concept_execution_action_matrix`, `ableton_render_concept_execution_manifest`, and `ableton_render_concept_execution_runbook`.
7. Execute only as dry-run unless the user enables write gates and approves the exact action bundle.
8. Render or verify output with local ffmpeg/ffprobe checks when applicable.
9. Report exact files, commands, skipped live checks, and remaining setup steps.
```

For a host with a different skill format, keep the same rules and links, but adapt the file location and metadata.

## Universal Model Runtime Notes

Use this pattern:

```text
model runtime -> MCP-capable agent host -> Ableton MCP -> Ableton bridge/UI driver
```

Examples:

| Runtime or app | Correct integration |
| --- | --- |
| Codex | Add Ableton MCP as stdio in `.mcp.json` or generated Codex config. |
| Claude Desktop | Add Ableton MCP as stdio in Claude's MCP config. |
| Cursor | Add Ableton MCP as stdio in Cursor's MCP config. |
| Docker MCP | Start `.\launch.ps1 docker -SkipSetup`, then connect to `http://127.0.0.1:17366/mcp`. |
| OpenClaw | Add the local HTTP MCP server and apply the safe tool include CSV. |
| llama.cpp | Use an MCP-capable wrapper or agent that calls llama.cpp for inference and Ableton MCP for tools. |
| Ollama | Use an MCP-capable wrapper or agent that calls Ollama for inference and Ableton MCP for tools. |
| OpenRouter | Configure Ableton MCP in the MCP-capable agent app that uses OpenRouter models. |
| Gemini | Configure Ableton MCP in the Gemini agent/client if it supports MCP. |
| Custom API agent | Implement MCP stdio or Streamable HTTP client support, then connect to Ableton MCP. |

The model should not directly edit Ableton project files or call shell commands as a substitute for MCP tools.

## Verify Installation

Run:

```powershell
npm run build
npm run lint
npm test
npm run doctor
npm run verify:mcp
npm run sweep:safe
npm audit --audit-level=moderate
```

Expected current baseline:

```text
doctor: pass
verify:mcp: pass
sweep:safe: pass
tests: pass
audit: 0 moderate-or-higher vulnerabilities
```

For live bridge verification:

```powershell
npm run bridge:install
.\launch.ps1 live-smoke -SkipSetup
```

If `live-smoke` says `bridge_device_not_loaded`, the code is installed but Ableton still needs the Max for Live bridge device loaded on a MIDI track.

## Ableton Bridge Runtime Step

To use LiveAPI bridge tools:

1. Open Ableton Live.
2. Load `Ableton MCP Bridge` onto a MIDI track from the User Library Max MIDI Effects presets.
3. Confirm the bridge listens on `127.0.0.1:17364`.
4. Run:

```powershell
.\launch.ps1 live-smoke -SkipSetup
```

The bridge is required for real live reads and write-gated Ableton actions. Without it, planning, offline analysis, render scripts, and dry-run workflows still work.

## Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| MCP tools list is empty | Client config is not launching Ableton MCP | Check command path, args, Node install, and `.\launch.ps1 stdio -SkipSetup`. |
| `BRIDGE_UNREACHABLE` | Max for Live bridge is not loaded or not listening | Run `npm run bridge:install`, load bridge device in Ableton, rerun live smoke. |
| Docker client cannot connect | Host HTTP server is not running or wrong URL | Run `.\launch.ps1 docker -SkipSetup` and use `http://127.0.0.1:17366/mcp`. |
| Remote client gets 401 | Missing bearer token | Send `Authorization: Bearer <token>`. |
| UI tools fail | UI control is disabled by default | Start `.\launch.ps1 ui-driver` only after user opts in. If token auth fails, restart the UI driver or remove stale ignored runtime state at `diagnostics/runtime/ui-driver/session-token.json`. |
| Downloads fail | Downloads are disabled by default | Enable `ABLETON_MCP_ENABLE_DOWNLOADS=1` only for approved licensed downloads. |
| Write tool returns dry-run | Safe default | Enable `ABLETON_MCP_ENABLE_WRITE=1` and pass `dry_run=false` only after exact approval. |

## Installer Completion Checklist

- Server builds.
- MCP verifier passes.
- Safe sweep passes.
- Client config points to `launch.cmd stdio -SkipSetup` or `launch.sh stdio --skip-setup`.
- Docker/HTTP clients use `http://127.0.0.1:17366/mcp` unless private remote access is explicitly configured.
- Optional skill file is installed in the user's skills tree.
- Feature gates remain off by default.
- User knows to load the Max for Live bridge device for live Ableton control.
