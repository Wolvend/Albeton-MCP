# Concept To Music

Ableton MCP can turn a place, feeling, or liminal visual brief into a staged Ableton production plan. The workflow is designed for agents, but each step remains inspectable and gated.

## Tool Flow

Fast path:

- `ableton_plan_agent_music_session`
  - Read-only orchestration plan for Codex, HyperNimbus, OpenClaw, Claude, OpenRouter host apps, Gemini host apps, llama.cpp wrappers, and Antigravity.
  - Takes a mood/place brief and returns the exact readiness, concept, sample, arrangement, approval, and delivery calls an agent should run.
  - Does not download, write to Ableton, expose HTTP remotely, or use UI/mouse control.

- `ableton_get_production_readiness`
  - Read-only status report for planning, live-read, dry-run, and write-ready capability.
  - Reports current gates, HyperNimbus/OpenClaw/Codex connection posture, bridge reachability, concept workflow readiness, safety posture, and exact next calls.
  - Use this before a client tries to turn a brief into an Ableton session.

- `ableton_list_concept_presets`
  - Read-only catalog of production recipes such as `liminal_backrooms_horror`.
  - Returns sections, layer blueprints, sample strategy, production moves, bridge-readiness notes, and exact safe next tool calls.
  - Does not download, write to Ableton, or use UI/mouse control.

- `ableton_plan_full_concept_production`
  - Takes one brief and creates the stored concept plan, optional sample metadata search, stored arrangement plan, production scorecard, dry-run execution preview, and delivery plan.
  - Does not download, does not write to Ableton, and does not use UI/mouse control.
  - Use this first when a client wants "turn this feeling/place into a production plan" in one safe call.

1. `ableton_list_concept_presets`
   - Pick a recipe before creating a stored plan when the client wants guided composition.
   - The catalog is deterministic and safe for Docker/OpenClaw/Codex clients because it returns plans and next-call templates only.

2. `ableton_plan_concept_track`
   - Stores a concept plan under `diagnostics\runtime\concept-plans`.
   - Produces sections, tempo/key, layer roles, search queries, device-chain suggestions, mix targets, and approval checklist.
   - Accepts `reference_path` for a local reference file. If the path is an approved audio file under sample staging, Codex Imports, the Ableton User Library, or Live Recordings, the plan adds a source-audio treatment plan.

3. `ableton_list_concept_plans` / `ableton_get_concept_plan`
   - Resume prior planning sessions from the bounded concept-plan store.
   - Return redacted paths and summary metadata only.

4. `ableton_render_concept_timeline`
   - Read-only.
   - Turns a stored concept plan into a section-by-section timeline with start/end times, active layers, mix targets, device-chain intentions, automation cues, and sample-search cues.
   - Does not download, write to Ableton, or use UI/mouse control.
   - Use this when an agent needs to reason about the soundtrack layer by layer before building the arrangement plan.

5. `ableton_render_concept_mix_plan`
   - Read-only.
   - Turns a stored concept plan into layer-by-layer mix priorities, routing roles, approximate levels, panning, send use, frequency focus, spatial treatment, automation targets, return-use cases, gain-staging, and master-bus guidance.
   - Does not download, write to Ableton, or use UI/mouse control.
   - Use this when an agent needs professional mix decisions before building or executing the arrangement plan.

6. `ableton_render_concept_automation_map`
   - Read-only.
   - Turns a stored concept plan into deterministic automation lanes with section names, seconds, beats, target hints, candidate devices, dry-run templates, and review notes.
   - Covers reverb, delay, filter, volume, and MIDI velocity movement without writing automation or contacting Ableton.
   - Use this when an agent needs exact automation shape before device/parameter discovery or bridge preflight.

7. `ableton_search_concept_samples`
   - Searches approved metadata sources without downloading.
   - Sanitizes remote titles, creators, licenses, identifiers, and queries before returning them to the agent.

8. `ableton_curate_concept_samples`
   - Maps a stored concept plan's audio layers to layer-specific sample queries, review notes, licensed metadata candidates, and exact staging templates.
   - `search=false` returns a deterministic no-network curation plan; `search=true` searches approved metadata sources and still does not download.
   - Keeps remote sample text as untrusted data and filters to allowed licenses by default.

9. `ableton_stage_concept_samples`
   - Dry-run by default.
   - Real staging requires `dry_run=false` and `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
   - Downloads only from approved sample hosts through the existing sample policy.
   - Builds a provenance record with source URL, destination name, license policy, creator/title/identifier metadata, and checksum/byte count when a real download occurs.
   - Local reference audio can also be converted into approved staging/import paths with `ableton_convert_audio_file` using presets such as `liminal_memory`, `stretched_ambience`, and `reversed_fragment`.

10. `ableton_build_layered_arrangement_plan`
   - Converts the concept plan into a stored Ableton action plan.
   - Builds tempo, track, scene, scene tempo/signature/color, track/return/clip color, arrangement marker, mix, send, sparse MIDI motif, clip rename, clip gain, transpose, warp, marker, and loop actions.
   - Optionally accepts `sample_assignments` that map approved local audio files to named audio layers and emit ordered load, rename, shape, and loop actions.
   - Automatically maps approved reference audio to the most relevant concept layers unless those layers already have explicit sample assignments.
   - Preserves each layer's Ableton-native device chain as a staged `devicePlan` for review.
   - Uses created-track and created-scene placeholders for mix, send, MIDI, and scene setup actions; real execution resolves them from a live snapshot immediately before writing, so the plan can append to a non-empty set.

11. `ableton_list_arrangement_plans` / `ableton_get_arrangement_plan`
   - Resume stored arrangement plans before execution.
   - Return redacted action payloads, redacted sample paths, and summary counts.

12. `ableton_export_concept_midi_motif`
   - Dry-run by default.
   - Renders the stored plan's sparse motif as a `.mid` file under `samples\staging\midi` only after `dry_run=false` and `ABLETON_MCP_ENABLE_WRITE=1`.
   - Never overwrites an existing MIDI file and writes an attribution sidecar with checksum, source plan ID, tempo, key, and note count.

13. `ableton_prepare_concept_audio_layers`
   - Dry-run by default.
   - Uses an approved `reference_path` already stored in the concept plan.
   - Prepares layer-specific audio files under `samples\staging\concepts\<plan_id>` using the same gated conversion path as `ableton_convert_audio_file`.
   - For the liminal horror preset, maps the source into degraded memory, stretched ambience, distant room-tone, and reversed-fragment variants.
   - Real rendering requires `dry_run=false` and `ABLETON_MCP_ENABLE_WRITE=1`; files are never overwritten.
   - Stores a preparation manifest so follow-up arrangement planning can use the prepared files without exposing raw local paths to the client.

14. `ableton_build_arrangement_from_prepared_audio`
   - Reads a stored preparation manifest by `preparation_id`.
   - Builds a stored arrangement plan using the prepared layer files internally.
   - Returns redacted paths only.

15. `ableton_preflight_concept_execution`
   - Read-only.
   - Checks the stored arrangement action counts, bridge reachability, created-track placeholder resolution, staged review items, and likely clip-slot blockers.
   - Reports `readyForRealWrite=false` unless a bridge snapshot is checked successfully and no blockers are found.

16. `ableton_render_concept_execution_manifest`
   - Read-only.
   - Groups a stored arrangement's executable actions by production phase, redacts local sample paths, summarizes created-track/return/scene placeholders, and lists exact dry-run, preflight, approval, and real-execution tool calls.
   - Does not contact Ableton, approve execution, download samples, write files, or use UI/mouse control.
   - Use this when an agent needs a concrete execution manifest before asking for approval or running preflight.

17. `ableton_render_concept_attribution_bundle`
   - Read-only.
   - Reviews exact sample assignments for one stored arrangement and reports sidecar license policy, source URL, creator/title metadata, checksum, byte count, and missing-attribution warnings.
   - Does not scan broadly; it reads only the `.attribution.json` sidecar beside each assigned sample path and redacts local paths.
   - Use this before publishing or delivering stems.

18. `ableton_render_concept_production_scorecard`
   - Read-only.
   - Scores a stored arrangement on layer architecture, section arc, executable action coverage, sample coverage, routing, staged device/automation readiness, execution safety, and delivery readiness.
   - Defaults `check_bridge=false`; with `check_bridge=true` it performs read-only bridge preflight/routing checks and still never writes, downloads, approves, or uses UI/mouse control.
   - Use this as the agent QA gate before dry-run execution or approval review.

19. `ableton_plan_concept_routing_readiness`
   - Read-only.
   - Maps planned `ableton_set_track_send` actions to return targets, `ableton_get_routing_overview` discovery, and exact dry-run send templates after bridge resolution.
   - Does not write sends, approve execution, download samples, or use UI/mouse control.
   - Use this before approval when an agent needs to verify reverb, delay, and texture routing against the live set.

20. `ableton_plan_concept_device_automation_readiness`
   - Read-only.
   - Converts staged `devicePlan` and `automationPlan` entries into discovery calls, dry-run templates, target hints, and explicit unsupported/support status.
   - Does not insert devices, write automation, move the mouse, or approve execution.

21. `ableton_create_concept_execution_approval_bundle`
   - Read-only.
   - Packages the redacted concept, redacted arrangement, preflight result, deterministic `approval_id`, required gates, exact next tool calls, and approval checklist.
   - Always returns `approved=false`; it is a review artifact, not an execution grant.

22. `ableton_execute_concept_plan`
   - Dry-run by default.
   - Real execution requires `dry_run=false`, `ABLETON_MCP_ENABLE_WRITE=1`, the matching `approval_id`, `approval_confirmed=true`, and a successful bridge preflight.
   - Sends only stored, pre-approved plan actions through the serialized LiveAPI bridge.
   - Writes a redacted execution journal under `diagnostics\runtime\concept-executions` before live preflight and after each action outcome.
   - Stops immediately with `CONCEPT_EXECUTION_UNSUPPORTED_ACTION` if the loaded bridge returns `unsupported: true` for any approved action, so clients do not mistake a bridge limitation for successful execution.

23. `ableton_list_concept_execution_journals`
   - Read-only.
   - Lists recent redacted execution journals with status, event counts, failure counts, and exact follow-up calls.
   - Does not accept file paths, scan broadly, or expose raw local sample paths.

24. `ableton_get_concept_execution_journal`
   - Read-only.
   - Reads one generated execution journal id and returns the redacted event timeline for post-run forensics.
   - Use this after a failed or stopped real execution to see which action ran last.

25. `ableton_render_delivery_plan`
   - Plans master/stem export settings and naming.
   - Does not render audio.

## Liminal Horror Preset

The built-in `liminal_backrooms_horror` preset is selected when the brief includes terms such as backrooms, liminal, horror, dementia, fluorescent, abandoned, hallway, or memory.

It creates these sections:

- Isolation
- Recognizable Motif
- Decay Loop
- Spatial Collapse
- Unresolved Tail

It creates these layers:

- Degraded Memory
- Stretched Room
- Distant Room Tone
- Low Pressure
- Mechanical Texture
- Reversed Fragments
- Sparse Motif
- Memory Reverb
- Distant Delay

The preset is intended for slow, degraded, uneasy soundtrack work: tape-like melodic memory, wide empty-room wash, constant distant room tone, low pressure, mechanical texture, reversed transition fragments, sparse MIDI, long dark reverb, and unstable delay returns.

Agents can inspect the full recipe with `ableton_list_concept_presets` before writing any plan file. The preset response includes the exact safe calls for `ableton_plan_concept_track`, `ableton_search_concept_samples`, `ableton_curate_concept_samples`, and `ableton_plan_full_concept_production`.

The arrangement plan includes:

- Named audio, MIDI, and return tracks.
- Color-coded audio, MIDI, return tracks, scenes, and generated clips for faster navigation in Session View.
- Scene names, scene tempo/signature setup, and arrangement locators for isolation, motif, decay, collapse, and unresolved tail sections.
- Initial volume, pan, and named reverb/delay return-send targets for each created non-return track.
- Initial return-track volume and pan actions for the generated reverb and delay returns.
- A read-only mix plan with layer priorities, routing roles, frequency focus, spatial treatment, return use cases, gain-staging, automation targets, and conservative master-bus settings.
- A read-only routing readiness plan that links planned sends to `ableton_get_routing_overview`, dry-run send templates, and approval-time verification.
- A staged device-chain plan for each layer, including instruments, EQ, saturation, reverb, delay, filtering, compression, and utility devices.
- A named and looped editable MIDI motif with sparse, dissonant note placement for the `Sparse Motif` layer, exportable as a staged `.mid` artifact.
- Optional named, shaped, and looped approved local sample clips assigned to audio layers such as `Degraded Memory`, `Stretched Room`, `Distant Room Tone`, `Mechanical Texture`, or `Reversed Fragments`. Sample shaping uses conservative layer-specific gain, transpose/detune, warp mode, and start/end marker actions.
- Optional approved reference-audio treatments for the user's own source track: degraded recognizable motif, stretched room wash, distant room-tone bed, and reversed fragments. These can be rendered into staging with `ableton_prepare_concept_audio_layers`.
- A staged automation plan for reverb, delay, filter, and volume movement. `ableton_plan_concept_device_automation_readiness` now links each non-MIDI lane to `ableton_extract_automation_summary` so agents can inspect mixer volume, send, and device parameter candidates before any write; automation remains non-writing until the bridge proves support.

Sample placement remains staged until local sample paths are approved. Assignment paths and executable reference audio must come from sample staging, Codex Imports, the Ableton User Library, or Live Recordings; tool responses redact the local path while stored plans retain the executable path. Device insertion and detailed automation remain explicit bridge/UI capability steps, not hidden side effects. Device chains are stored as reviewable `devicePlan` entries because named device insertion through LiveAPI requires a verified Browser or hot-swap target for the running Ableton version.

## Example

```text
ableton_plan_concept_track:
  concept: "a backrooms hallway where an old memory song decays under fluorescent lights"
  target_duration_seconds: 180
  intensity: 8
  sources:
    - local_library
    - internet_archive
    - freesound
  reference_path: "C:\\Users\\LIZ\\Desktop\\MCP\\ableton-mcp\\samples\\staging\\source-song.mp3"
```

Then:

```text
ableton_plan_full_concept_production for the safe one-call plan
```

Or step-by-step:

```text
ableton_list_concept_presets
ableton_search_concept_samples
ableton_curate_concept_samples with search=false for deterministic layer curation, or search=true for approved metadata search
ableton_render_concept_timeline
ableton_render_concept_mix_plan
ableton_render_concept_automation_map
ableton_build_layered_arrangement_plan
ableton_export_concept_midi_motif with dry_run=true
ableton_prepare_concept_audio_layers with dry_run=true
ableton_build_arrangement_from_prepared_audio after real layer preparation
ableton_preflight_concept_execution with check_bridge=true
ableton_render_concept_execution_manifest
ableton_render_concept_attribution_bundle
ableton_render_concept_production_scorecard
ableton_plan_concept_device_automation_readiness
ableton_create_concept_execution_approval_bundle
ableton_execute_concept_plan with dry_run=true
```

With approved local samples:

```text
ableton_build_layered_arrangement_plan:
  plan_id: "concept-..."
  sample_assignments:
    - layer: "Stretched Room"
      path: "C:\\Users\\LIZ\\Desktop\\MCP\\ableton-mcp\\samples\\staging\\room-tone.wav"
      clip_slot_index: 1
      name: "Assigned Room Tone"
```

Only after review:

```text
ABLETON_MCP_ENABLE_DOWNLOADS=1
ABLETON_MCP_ENABLE_WRITE=1
ableton_execute_concept_plan:
  arrangement_id: "arrangement-..."
  dry_run: false
  approval_id: "approval-..."
  approval_confirmed: true
```

Keep UI/mouse control off unless the user intentionally starts the UI driver for an Ableton-only foreground task.

## Boundaries

- No arbitrary internet downloads.
- No plugin installers.
- No broad filesystem scans.
- No hidden writes.
- No public HTTP exposure.
- No UI/mouse control unless explicitly enabled.
- No claims that a LiveAPI action succeeded unless the bridge returns success.
