# Concept To Music

Ableton MCP can turn a place, feeling, or liminal visual brief into a staged Ableton production plan. The workflow is designed for agents, but each step remains inspectable and gated.

## Tool Flow

1. `ableton_plan_concept_track`
   - Stores a concept plan under `diagnostics\runtime\concept-plans`.
   - Produces sections, tempo/key, layer roles, search queries, device-chain suggestions, mix targets, and approval checklist.
   - Accepts `reference_path` for a local reference file. If the path is an approved audio file under sample staging, Codex Imports, the Ableton User Library, or Live Recordings, the plan adds a source-audio treatment plan.

2. `ableton_list_concept_plans` / `ableton_get_concept_plan`
   - Resume prior planning sessions from the bounded concept-plan store.
   - Return redacted paths and summary metadata only.

3. `ableton_search_concept_samples`
   - Searches approved metadata sources without downloading.
   - Sanitizes remote titles, creators, licenses, identifiers, and queries before returning them to the agent.

4. `ableton_stage_concept_samples`
   - Dry-run by default.
   - Real staging requires `dry_run=false` and `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
   - Downloads only from approved sample hosts through the existing sample policy.
   - Builds a provenance record with source URL, destination name, license policy, creator/title/identifier metadata, and checksum/byte count when a real download occurs.
   - Local reference audio can also be converted into approved staging/import paths with `ableton_convert_audio_file` using presets such as `liminal_memory`, `stretched_ambience`, and `reversed_fragment`.

5. `ableton_build_layered_arrangement_plan`
   - Converts the concept plan into a stored Ableton action plan.
   - Builds tempo, track, scene, arrangement marker, mix, send, and sparse MIDI motif actions.
   - Optionally accepts `sample_assignments` that map approved local audio files to named audio layers and emit `ableton_load_preset_or_sample` actions.
   - Automatically maps approved reference audio to the most relevant concept layers unless those layers already have explicit sample assignments.
   - Preserves each layer's Ableton-native device chain as a staged `devicePlan` for review.
   - Uses created-track placeholders for mix, send, and MIDI actions; real execution resolves them from a live snapshot immediately before writing, so the plan can append to a non-empty set.

6. `ableton_list_arrangement_plans` / `ableton_get_arrangement_plan`
   - Resume stored arrangement plans before execution.
   - Return redacted action payloads, redacted sample paths, and summary counts.

7. `ableton_export_concept_midi_motif`
   - Dry-run by default.
   - Renders the stored plan's sparse motif as a `.mid` file under `samples\staging\midi` only after `dry_run=false` and `ABLETON_MCP_ENABLE_WRITE=1`.
   - Never overwrites an existing MIDI file and writes an attribution sidecar with checksum, source plan ID, tempo, key, and note count.

8. `ableton_execute_concept_plan`
   - Dry-run by default.
   - Real execution requires `dry_run=false` and `ABLETON_MCP_ENABLE_WRITE=1`.
   - Sends only stored, pre-approved plan actions through the serialized LiveAPI bridge.

9. `ableton_render_delivery_plan`
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
- Low Pressure
- Mechanical Texture
- Reversed Fragments
- Sparse Motif
- Memory Reverb
- Distant Delay

The preset is intended for slow, degraded, uneasy soundtrack work: tape-like melodic memory, wide empty-room tone, low pressure, mechanical texture, reversed transition fragments, sparse MIDI, long dark reverb, and unstable delay returns.

The arrangement plan includes:

- Named audio, MIDI, and return tracks.
- Scene names and arrangement locators for isolation, motif, decay, collapse, and unresolved tail sections.
- Initial volume, pan, and named reverb/delay return-send targets for each created non-return track.
- A staged device-chain plan for each layer, including instruments, EQ, saturation, reverb, delay, filtering, compression, and utility devices.
- A short editable MIDI motif with sparse, dissonant note placement for the `Sparse Motif` layer, exportable as a staged `.mid` artifact.
- Optional approved local sample clips assigned to audio layers such as `Degraded Memory`, `Stretched Room`, `Mechanical Texture`, or `Reversed Fragments`.
- Optional approved reference-audio treatments for the user's own source track: degraded recognizable motif, stretched room wash, and reversed fragments.
- A staged automation plan for reverb, delay, filter, and volume movement. These lanes are review metadata until the live set has verified device/parameter targets.

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
ableton_search_concept_samples
ableton_build_layered_arrangement_plan
ableton_export_concept_midi_motif with dry_run=true
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
