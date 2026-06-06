# Ableton MCP Master Prompt

Use this prompt in a fresh Codex session opened from:

```text
C:\Users\LIZ\Desktop\MCP\ableton-mcp
```

## Copy-Paste Prompt

```text
Build me the fastest, safest, most professional Ableton Live MCP server possible for Windows. This MCP must give Codex deep, practical control and visibility over Ableton Live, my Ableton library, legal internet sample sources, screenshots of the Ableton UI, and real-time session state. Treat this as a production-grade local music automation system, not a toy demo.

Current local machine facts already verified:
- Project root: C:\Users\LIZ\Desktop\MCP\ableton-mcp
- Ableton Live install: C:\ProgramData\Ableton\Live 12 Trial
- Ableton Live executable: C:\ProgramData\Ableton\Live 12 Trial\Program\Ableton Live 12 Trial.exe
- Bundled Max executable: C:\ProgramData\Ableton\Live 12 Trial\Resources\Max\Max.exe
- Ableton User Library: C:\Users\LIZ\Documents\Ableton\User Library
- Ableton Factory Packs: C:\Users\LIZ\Documents\Ableton\Factory Packs
- Ableton Live Recordings: C:\Users\LIZ\Documents\Ableton\Live Recordings
- Ableton preferences: C:\Users\LIZ\AppData\Roaming\Ableton\Live 12.4\Preferences
- Ableton local database: C:\Users\LIZ\AppData\Local\Ableton\Live Database
- Node is available: C:\Program Files\nodejs\node.exe
- npm is available: C:\Program Files\nodejs\npm.ps1
- Git is available: C:\Program Files\Git\cmd\git.exe
- ffmpeg is available: C:\ffmpeg_latest\ffmpeg.exe
- ffprobe is available: C:\ffmpeg_latest\ffprobe.exe
- Ableton Live itself may not be open yet. Detect and report live status before bridge tests.

Research first using official or primary sources:
- MCP specification and TypeScript SDK:
  https://modelcontextprotocol.io/
  https://github.com/modelcontextprotocol/typescript-sdk
- Ableton Live 12 manual:
  https://www.ableton.com/en/manual/
- Ableton Max for Live Live API / Live Object Model:
  https://help.ableton.com/hc/en-us/articles/5402681764242-Controlling-Live-using-Max-for-Live
  https://docs.cycling74.com/legacy/max8/vignettes/live_api_overview
- AbletonOSC as an optional bridge reference:
  https://github.com/ideoforms/AbletonOSC
- Ableton Link if useful for tempo/session sync:
  https://github.com/Ableton/link
- Freesound API for licensed samples:
  https://freesound.org/docs/api/overview.html
- Internet Archive metadata/search APIs for public audio:
  https://archive.org/developers/metadata.html
  https://archive.org/developers/advancedsearch.html
- ffmpeg/ffprobe docs for media analysis:
  https://ffmpeg.org/documentation.html
- Tone.js MIDI or another reliable MIDI library for MIDI file/clip generation:
  https://github.com/Tonejs/Midi

Core stack requirements:
- TypeScript first, unless there is a strong reason not to.
- Node 22+ compatible.
- MCP stdio server by default for local Codex use.
- Optional local loopback HTTP bridge only when needed, bound to 127.0.0.1.
- Zod schemas for every MCP tool.
- Structured MCP outputs wherever possible.
- Concise, action-oriented tool names.
- Tool annotations for readOnlyHint, destructiveHint, idempotentHint, and openWorldHint.
- Actionable error messages with specific next steps.
- No broad filesystem access.
- No arbitrary shell execution.
- No arbitrary URL fetch.
- No hidden prompt or workflow leakage.
- No destructive file operations.
- No project overwrites.

Required architecture:

1. MCP server layer
- Runs as a local stdio MCP server.
- Owns tool schemas, validation, path allowlists, cache access, and bridge clients.
- Starts fast. Do not scan all files on boot.
- Uses SQLite for cache, indexing, remote sample metadata, bridge state snapshots, and analysis results.
- Uses worker threads or streaming parsers for heavy .als, audio, or sample analysis.
- Provides paginated output and compact summaries by default.

2. Ableton live bridge layer
- Prefer a Max for Live bridge using LiveAPI and 127.0.0.1-only communication.
- Evaluate AbletonOSC as a bridge option and use it only if it is clearly better or faster for broad control.
- The bridge must support heartbeat, reconnect, request IDs, timeouts, structured errors, and no audio-thread blocking.
- The bridge must observe and report fast whole-session state: tempo, transport, tracks, scenes, clips, devices, parameters, selected track, selected device, armed/solo/mute state, clip launch state, and visible UI context where available.
- Use diff snapshots for fast iteration: full snapshot on demand, incremental diff after that.

3. Ableton offline library/project intelligence layer
- Index Ableton User Library, Packs, Templates, Presets, Samples, MIDI Tools, Clips, Grooves, Tunings, and Live Recordings.
- Parse .als, .adg, .adv, .amxd, .alc, .asd, MIDI, audio metadata where safe.
- Treat .als as compressed XML for read-only analysis only. Never overwrite original Live Sets.
- Find missing files, plugin references, sample references, tempo, tracks, devices, clip names, set structure, and large/slow assets where possible.
- Build an incremental scanner using file modified times, size, path hash, and content hash only when needed.

4. Visual/screenshot layer
- Capture the Ableton window only by default, not the entire desktop.
- Support Windows window discovery and focus.
- Use screenshot-desktop, sharp, Windows APIs, Playwright only when appropriate, or a better proven option.
- Add optional OCR/vision support for UI labels only if useful.
- UI automation must be gated behind ABLETON_MCP_ENABLE_UI_CONTROL=1.
- No random clicking. UI control must use explicit coordinates or named safe actions and support dry_run.
- Screenshot output should be bounded, compressed, and saved in a safe local diagnostics folder.

5. Internet sample/library layer
- Add legal sample discovery from public/licensed sources only.
- Support Freesound API for Creative Commons samples. API key should be optional but supported through FREESOUND_API_KEY.
- Support Internet Archive metadata/search/download for public-domain or clearly licensed audio.
- Track license, source URL, attribution, duration, format, checksum, local path, date imported, and query used for every imported sample.
- Default to CC0, public domain, or clearly attributed CC BY samples.
- Do not import unclear, copyrighted, commercial, bootleg, or AI-unsafe samples.
- Download samples only into:
  C:\Users\LIZ\Documents\Ableton\User Library\Samples\Codex Imports
- Stage downloads first under:
  C:\Users\LIZ\Desktop\MCP\ableton-mcp\samples\staging
- Use ffmpeg/ffprobe for metadata and safe conversion.
- Add optional BPM/key/onset/loudness analysis using Essentia, librosa, aubio, or a well-supported Node audio analysis package.

6. Synth/device control layer
- Provide direct control of all Ableton-native devices and exposed parameters through LiveAPI or the bridge.
- Support third-party synths/effects only through parameters exposed to Ableton automation or safe UI fallback.
- Be honest about limits: hidden plugin GUI internals and non-automatable parameters may not be controllable.
- Support listing device chains, parameters, macro mappings, racks, presets, and automation-capable targets.
- Mutating device actions must be gated behind ABLETON_MCP_ENABLE_WRITE=1.

Allowed filesystem roots:
- C:\Users\LIZ\Desktop\MCP\ableton-mcp
- C:\Users\LIZ\Documents\Ableton
- C:\ProgramData\Ableton\Live 12 Trial, read-only only

Never access:
- C:\
- C:\Users\LIZ
- C:\Users\LIZ\AppData broadly
- C:\Users\LIZ\.codex
- C:\Users\LIZ\.ssh
- C:\Users\LIZ\.aws
- C:\Users\LIZ\.docker
- Browser profiles
- Password stores
- Any secret or credential file unless explicitly created for this project

Environment flags:
- ABLETON_MCP_ENABLE_WRITE=0 by default
- ABLETON_MCP_ENABLE_UI_CONTROL=0 by default
- ABLETON_MCP_ENABLE_DOWNLOADS=0 by default
- ABLETON_MCP_ALLOWED_ROOTS must be explicit
- FREESOUND_API_KEY optional
- INTERNET_ARCHIVE_ACCESS_KEY optional only if write/authenticated IA work is ever added, but default should be unauthenticated read-only public metadata

Implement these MCP tools.

Environment and setup:
- ableton_find_installation
- ableton_get_environment
- ableton_validate_config
- ableton_launch_live
- ableton_live_status
- ableton_bridge_install_instructions
- ableton_bridge_ping
- ableton_export_diagnostic_report

Library and cache:
- ableton_scan_library
- ableton_get_scan_status
- ableton_search_library
- ableton_search_samples
- ableton_search_presets
- ableton_search_templates
- ableton_search_clips
- ableton_search_midi_tools
- ableton_list_packs
- ableton_list_recent_projects
- ableton_get_library_item
- ableton_reindex_path

Live Set analysis:
- ableton_analyze_set
- ableton_get_set_summary
- ableton_find_missing_files
- ableton_list_set_tracks
- ableton_list_set_devices
- ableton_list_set_plugins
- ableton_list_set_samples
- ableton_extract_set_tempo_map
- ableton_extract_set_clip_summary
- ableton_compare_sets

Fast live session view:
- ableton_get_full_snapshot
- ableton_get_snapshot_diff
- ableton_get_live_state
- ableton_list_tracks
- ableton_list_scenes
- ableton_list_clips
- ableton_list_devices
- ableton_list_device_parameters
- ableton_get_selected_track
- ableton_get_selected_device
- ableton_get_tempo
- ableton_get_transport

Live control, gated behind ABLETON_MCP_ENABLE_WRITE=1:
- ableton_set_tempo
- ableton_transport_control
- ableton_create_audio_track
- ableton_create_midi_track
- ableton_create_return_track
- ableton_create_scene
- ableton_create_clip
- ableton_create_midi_clip
- ableton_insert_midi_notes
- ableton_set_clip_loop
- ableton_fire_clip
- ableton_stop_clip
- ableton_arm_track
- ableton_mute_track
- ableton_solo_track
- ableton_set_track_volume
- ableton_set_track_pan
- ableton_insert_instrument
- ableton_insert_effect
- ableton_load_preset_or_sample
- ableton_set_device_parameter
- ableton_map_macro
- ableton_rename_track
- ableton_rename_clip

Screenshots and UI, read-only by default and UI actions gated behind ABLETON_MCP_ENABLE_UI_CONTROL=1:
- ableton_window_status
- ableton_focus_window
- ableton_capture_screenshot
- ableton_capture_region
- ableton_get_ui_overview
- ableton_compare_screenshots
- ableton_click_named_safe_action
- ableton_click_coordinates
- ableton_type_text

Internet sample discovery and import, downloads gated behind ABLETON_MCP_ENABLE_DOWNLOADS=1:
- ableton_search_freesound
- ableton_search_internet_archive_audio
- ableton_get_remote_sample_metadata
- ableton_preview_remote_sample
- ableton_download_sample
- ableton_analyze_audio_file
- ableton_convert_audio_file
- ableton_normalize_sample_metadata
- ableton_import_sample_to_library
- ableton_find_local_samples
- ableton_build_sample_pack
- ableton_generate_attribution_report

Composition and production helpers:
- ableton_generate_session_plan
- ableton_generate_midi_clip_plan
- ableton_generate_drum_rack_plan
- ableton_suggest_instrument_chain
- ableton_suggest_effect_chain
- ableton_suggest_arrangement
- ableton_suggest_mix_actions
- ableton_validate_production_plan

Developer and evaluation tools:
- ableton_mcp_health
- ableton_mcp_list_capabilities
- ableton_mcp_run_self_test
- ableton_mcp_run_bridge_mock_test
- ableton_mcp_run_path_security_test
- ableton_mcp_run_sample_license_test
- ableton_mcp_run_eval_suite

Performance requirements:
- Server startup under 1 second if possible.
- No full library scan at startup.
- On-demand first scan.
- Incremental scans after first scan.
- Snapshot diff for fast Ableton iteration.
- Bounded response sizes.
- Pagination for all list/search tools.
- Timeouts for bridge and network calls.
- Abort/cancel support for long scans and downloads.
- Cache remote API responses with timestamps.
- Use file watching only for allowed roots and only after initial scan.

Security requirements:
- Read-only by default.
- Path allowlist enforcement on every file operation.
- Resolve real paths and reject path traversal.
- No symlink escape from allowed roots.
- No broad AppData access.
- No shell command tool.
- No arbitrary JS eval.
- No arbitrary URL fetch.
- No raw private .als XML returned unless explicitly requested with a narrow path.
- No deleting, renaming, moving, or overwriting user files.
- No destructive Ableton actions.
- No internet downloads unless ABLETON_MCP_ENABLE_DOWNLOADS=1.
- All mutating tools must support dry_run where possible.
- All imported samples must include attribution/license metadata.
- Redact usernames from shareable reports unless the user asks for full local paths.
- Do not pass full process environment to child processes.
- Keep loopback services on 127.0.0.1 only.

Project deliverables:
- Complete TypeScript MCP server source.
- package.json with scripts: build, test, lint, start, inspect, dev.
- tsconfig.json.
- .mcp.json example.
- .env.example.
- README.md with exact local setup steps.
- SECURITY.md threat model.
- docs/ARCHITECTURE.md.
- docs/ABLETON_BRIDGE.md.
- docs/SAMPLE_SOURCES.md.
- docs/TOOL_REFERENCE.md.
- docs/VERIFICATION.md.
- bridge/max-for-live custom bridge source or clear AbletonOSC setup.
- tests for path allowlist, scanner, .als parser, audio metadata, sample licensing, MCP schemas, and bridge mock.
- A final verification report with commands run and results.

Before coding:
1. Verify all local paths listed above.
2. Detect whether Ableton Live is running.
3. Detect whether bundled Max is available.
4. Check Node, npm, Git, ffmpeg, and ffprobe.
5. Research official docs and summarize constraints.
6. Produce a concise architecture plan.
7. Then implement.

Verification before completion:
- npm install succeeds.
- npm run build succeeds.
- npm test succeeds.
- npm run lint succeeds if lint is configured.
- MCP Inspector can list tools.
- Path security tests reject forbidden paths.
- Scanner can index a tiny fixture.
- .als parser handles a fixture without modifying it.
- Audio metadata test works through ffprobe.
- Bridge mock test passes without Ableton open.
- If Ableton is open and bridge is installed, live bridge ping and snapshot work.
- Screenshot test captures only the Ableton window when Ableton is open.
- Sample search test returns metadata without downloading unless downloads are enabled.

Do not claim complete unless the verification commands actually ran. If something requires Ableton UI setup or a Freesound API key, say exactly what remains and provide the next command or UI step.
```

## Local Paths Summary

```text
Project root:
C:\Users\LIZ\Desktop\MCP\ableton-mcp

Ableton Live install:
C:\ProgramData\Ableton\Live 12 Trial

Ableton Live executable:
C:\ProgramData\Ableton\Live 12 Trial\Program\Ableton Live 12 Trial.exe

Bundled Max:
C:\ProgramData\Ableton\Live 12 Trial\Resources\Max\Max.exe

Ableton User Library:
C:\Users\LIZ\Documents\Ableton\User Library

Ableton Factory Packs:
C:\Users\LIZ\Documents\Ableton\Factory Packs

Ableton Live Recordings:
C:\Users\LIZ\Documents\Ableton\Live Recordings

Ableton Preferences:
C:\Users\LIZ\AppData\Roaming\Ableton\Live 12.4\Preferences

Ableton Local Database:
C:\Users\LIZ\AppData\Local\Ableton\Live Database
```

## Tooling To Use

- TypeScript MCP SDK for the server.
- Zod for schemas.
- SQLite for index/cache.
- Max for Live LiveAPI for first-class Ableton control.
- AbletonOSC only if it gives faster or broader coverage than a custom bridge.
- Windows screenshot APIs, screenshot-desktop, or equivalent for Ableton-window screenshots.
- sharp for image processing.
- ffmpeg and ffprobe for audio conversion and metadata.
- Essentia, librosa, aubio, or a reliable Node package for BPM/key/onset/loudness analysis.
- Freesound API for licensed sample search.
- Internet Archive APIs for public audio metadata and downloads.
- Tone.js MIDI or equivalent for MIDI generation.
- MCP Inspector for protocol verification.
- Vitest or Jest for tests.
- ESLint and TypeScript strict mode for code quality.

## Sources

- MCP: https://modelcontextprotocol.io/
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Ableton manual: https://www.ableton.com/en/manual/
- Ableton Max for Live API: https://help.ableton.com/hc/en-us/articles/5402681764242-Controlling-Live-using-Max-for-Live
- Cycling 74 Live API overview: https://docs.cycling74.com/legacy/max8/vignettes/live_api_overview
- AbletonOSC: https://github.com/ideoforms/AbletonOSC
- Ableton Link: https://github.com/Ableton/link
- Freesound API: https://freesound.org/docs/api/overview.html
- Internet Archive metadata API: https://archive.org/developers/metadata.html
- Internet Archive advanced search API: https://archive.org/developers/advancedsearch.html
- ffmpeg docs: https://ffmpeg.org/documentation.html
- Tone.js MIDI: https://github.com/Tonejs/Midi

