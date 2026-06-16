# Documentation Index

Start with the root [README](../README.md) for setup, safety defaults, control modes, and current verification status.

## System docs

| Document | Use it for |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Understanding the MCP server layers, runtime middleware, queues, and control model. |
| [Agent installer](AGENT_INSTALLER.md) | Installing regular MCP, Docker/HTTP MCP, model-runtime hosts, and optional skill trees. |
| [Ableton bridge](ABLETON_BRIDGE.md) | Loading and operating the Max for Live LiveAPI bridge. |
| [Ableton UI driver](ABLETON_UI_DRIVER.md) | Running the ChromeDriver-style foreground UI driver. |
| [Platform compatibility](PORTABILITY.md) | Running stdio/HTTP MCP on Windows, WSL, macOS, and Linux. |
| [Client compatibility](CLIENTS.md) | Codex, Claude, Docker MCP, WSL, remote devices, and model-provider host apps. |
| [Model runtime compatibility](MODEL_RUNTIME_COMPATIBILITY.md) | Smoke-tested Codex, Ollama, llama.cpp, Claude, Gemini, and OpenRouter connection guidance. |
| [Docker MCP profile](DOCKER_MCP_PROFILE.md) | Activating a safe local-only Docker MCP profile and OpenClaw registry path. |
| [Verification](VERIFICATION.md) | Running build, test, lint, MCP, bridge, and UI-driver checks. |
| [Final verification report](FINAL_VERIFICATION.md) | Reviewing the latest full local verification results. |

## Reference docs

| Document | Use it for |
| --- | --- |
| [Tool catalog](TOOL_CATALOG.md) | Seeing the high-level MCP tool groups. |
| [Tool reference](TOOL_REFERENCE.md) | Checking commands for inspecting tools and MCP context. |
| [Reference comparison](REFERENCE_AHUJASID_COMPARISON.md) | Comparing this project against `ahujasid/ableton-mcp` and recording adopted capability gaps. |
| [Local paths](LOCAL_PATHS.md) | Confirming verified Ableton, Max, library, and database paths. |
| [Sample policy](SAMPLE_POLICY.md) | Reviewing licensing and attribution rules. |
| [Sample sources](SAMPLE_SOURCES.md) | Checking approved sample sources and import paths. |
| [Producer brain](PRODUCER_BRAIN.md) | Using the stateful producer facade, tool packs, source modes, sound-design planning, render review, mix scoring, revision passes, and delivery handoffs. |
| [Concept to music](CONCEPT_TO_MUSIC.md) | Using producer sessions plus staged concept, sample, arrangement, execution, and delivery tools. |
| [Natural language to music](NATURAL_LANGUAGE_TO_MUSIC.md) | Teaching Codex how to translate user briefs into safe MCP music workflows. |
| [Music production skills](MUSIC_PRODUCTION_SKILLS.md) | Mapping producer skills to current Ableton MCP tools and planned gaps. |
| [Occult liminal Backrooms track](OCCULT_LIMINAL_BACKROOMS_TRACK.md) | A full song thesis and Codex production goal for the haunted Backrooms piece. |
| [Infinite Nowhere Protocol](INFINITE_NOWHERE_PROTOCOL.md) | Original offline horror track project, render command, outputs, stems, and safety boundary. |
| [The Road Has No Horizon](THE_ROAD_HAS_NO_HORIZON.md) | Fully procedural horror track with no reused source samples or prior stems. |
| [Mall at the End of Sleep](MALL_AT_THE_END_OF_SLEEP.md) | 1980s mall dream track using original synthesis plus fresh public-domain sources, with no user source audio. |
| [Future patches](FUTURE_PATCHES.md) | Planning professional music, synthesis, groove, mix, and revision-loop tools. |
| [Plugin policy](PLUGIN_POLICY.md) | Checking plugin/package download staging and no-install safety rules. |

Security controls are documented in [SECURITY](../SECURITY.md).
