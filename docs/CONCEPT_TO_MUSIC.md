# Concept To Music

Ableton MCP can turn a place, feeling, or liminal visual brief into a staged Ableton production plan. The workflow is designed for agents, but each step remains inspectable and gated.

## Tool Flow

1. `ableton_plan_concept_track`
   - Stores a concept plan under `diagnostics\runtime\concept-plans`.
   - Produces sections, tempo/key, layer roles, search queries, device-chain suggestions, mix targets, and approval checklist.

2. `ableton_search_concept_samples`
   - Searches approved metadata sources without downloading.
   - Sanitizes remote titles, creators, licenses, identifiers, and queries before returning them to the agent.

3. `ableton_stage_concept_samples`
   - Dry-run by default.
   - Real staging requires `dry_run=false` and `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
   - Downloads only from approved sample hosts through the existing sample policy.
   - Builds a provenance record with source URL, destination name, license policy, creator/title/identifier metadata, and checksum/byte count when a real download occurs.

4. `ableton_build_layered_arrangement_plan`
   - Converts the concept plan into a stored Ableton action plan.
   - Builds tempo, track, scene, arrangement marker, mix, send, and sparse MIDI motif actions.
   - Uses created-track placeholders for mix, send, and MIDI actions; real execution resolves them from a live snapshot immediately before writing, so the plan can append to a non-empty set.

5. `ableton_execute_concept_plan`
   - Dry-run by default.
   - Real execution requires `dry_run=false` and `ABLETON_MCP_ENABLE_WRITE=1`.
   - Sends only stored, pre-approved plan actions through the serialized LiveAPI bridge.

6. `ableton_render_delivery_plan`
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
- A short editable MIDI motif with sparse, dissonant note placement for the `Sparse Motif` layer.
- A staged automation plan for reverb, delay, filter, and volume movement. These lanes are review metadata until the live set has verified device/parameter targets.

Sample placement remains staged until local sample paths are approved. Device insertion and detailed automation remain explicit bridge/UI capability steps, not hidden side effects.

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
```

Then:

```text
ableton_search_concept_samples
ableton_build_layered_arrangement_plan
ableton_execute_concept_plan with dry_run=true
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
