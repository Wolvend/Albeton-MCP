# Reference Comparison: ahujasid/ableton-mcp

This note records the local review of `https://github.com/ahujasid/ableton-mcp` so future agents can see what was borrowed as capability inspiration and what was intentionally not copied.

## Reference Surface

The reference project is a Python FastMCP server plus an Ableton MIDI Remote Script. Its MCP tools are:

```text
get_session_info
get_track_info
create_midi_track
set_track_name
create_clip
create_audio_clip
add_notes_to_clip
set_clip_name
set_tempo
load_instrument_or_effect
fire_clip
stop_clip
start_playback
stop_playback
get_browser_tree
get_browser_items_at_path
load_drum_kit
switch_to_arrangement_view
set_arrangement_time
get_arrangement_clips
duplicate_to_arrangement
```

## Coverage In This Project

| Reference capability | Ableton MCP coverage |
| --- | --- |
| Session info, track info, transport, tempo | `ableton_get_live_state`, `ableton_get_full_snapshot`, `ableton_list_tracks`, `ableton_get_track_detail`, `ableton_get_transport`, `ableton_set_tempo`, `ableton_transport_control` |
| Track and clip creation/naming | `ableton_create_midi_track`, `ableton_create_audio_track`, `ableton_rename_track`, `ableton_create_clip`, `ableton_create_midi_clip`, `ableton_rename_clip` |
| Session clip launch/stop | `ableton_fire_clip`, `ableton_stop_clip` |
| MIDI note insertion | `ableton_insert_midi_notes`, plus `ableton_get_clip_notes` and `ableton_humanize_midi_clip` |
| Audio clip creation from file | `ableton_load_preset_or_sample` in `audio_clip` mode, using approved local sample roots only |
| Browser tree/path reads | `ableton_get_browser_tree`, `ableton_get_browser_items_at_path`, `ableton_browse_live_devices` |
| Drum kit loading | `ableton_load_drum_kit` is a dry-run plan only until a safe Browser `load_item` path is proven |
| Arrangement view/time/clips | `ableton_switch_to_arrangement_view`, `ableton_set_arrangement_time`, `ableton_get_arrangement_clips` |
| Session clip to Arrangement | `ableton_duplicate_session_clip_to_arrangement`, gated and dry-run first |

## Security Differences

The reference Remote Script binds a TCP listener to `0.0.0.0:9877`. This project keeps the default Ableton bridge on `127.0.0.1:17364`, serializes bridge calls, and requires explicit gates for writes, UI control, downloads, and remote HTTP.

The reference implementation returns mostly string responses. This project keeps strict Zod schemas, structured responses, actionable errors, bounded pagination, path allowlisting, and explicit `unsupported: true` results when a LiveAPI operation is not proven.

## Decisions

- Keep the Max for Live/LiveAPI bridge as the primary bridge.
- Do not adopt the Remote Script listener model as the default because broad binding is easier to expose accidentally.
- Add reference-inspired Browser and Arrangement tools with typed schemas.
- Keep Browser `load_item`, drum kit loading, and device insertion unsupported until there is a proven atomic workflow with rollback or a clear user-gated UI fallback.
- Preserve dry-run defaults and capability honesty for all arrangement and device-chain actions.
