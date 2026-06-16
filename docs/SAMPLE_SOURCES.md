# Sample Sources

Ableton MCP uses a universal sample-source policy so agents can search, plan, stage, and attribute audio without treating every website as a safe download target.

Default policy accepts only:

- CC0.
- Public domain or Public Domain Mark.
- Plain CC BY with attribution.

Default policy rejects:

- Noncommercial licenses.
- No-derivatives licenses.
- Share-alike licenses unless a future project explicitly accepts the obligation.
- Personal-use, all-rights-reserved, unclear, bootleg, or stream-ripped audio.

## Universal Tools

- `ableton_list_free_sample_sources`
  - Lists every approved source id, tier, search mode, download mode, license expectations, approved hosts, and notes.
- `ableton_search_free_sample_sources`
  - Takes one search phrase plus optional source ids and returns live API candidates where supported, or manual search plans where a source needs browser review.
- `ableton_plan_free_sample_download`
  - Creates a dry-run-first staging plan for a selected source URL and metadata proof. It accepts `url` or `source_url`.
  - Real direct downloads still require `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
  - YouTube and SoundCloud are always manual-proof only and are never stream-ripped by the MCP.

Example:

```json
{
  "query": "fluorescent hallway hum",
  "sources": ["freesound", "internet_archive", "openverse", "youtube_audio_library"],
  "allowed_only": true,
  "page": 1,
  "pageSize": 5
}
```

## Source Tiers

Tier A sources are preferred for legal clarity or public metadata:

- `freesound`
- `internet_archive`
- `openverse`
- `wikimedia_commons`
- `musopen`
- `open_music_archive`

Tier B sources are useful, but require careful item/page proof:

- `pixabay`
- `mixkit`
- `sonniss_gdc`
- `opengameart`
- `sounds_99`
- `sampleradar`
- `adobe_audition_sfx`
- `free_to_use_sounds`

Manual-proof sources are allowed only when the user provides a lawful local file or proof from an official platform feature:

- `youtube_audio_library`
- `youtube_user_provided`
- `soundcloud_user_provided`

## Direct Download Status

The MCP currently supports direct gated staging for:

- Freesound URLs on approved Freesound hosts, when licensing metadata is allowed.
- Internet Archive URLs on approved Archive hosts, when metadata is allowed.

The MCP can search or plan review for additional sources, but does not automatically download them until a source-specific implementation proves the direct download terms and host rules. This keeps the server safe for agents and avoids broad arbitrary URL fetching.

## YouTube And SoundCloud

YouTube and SoundCloud are intentionally not automated download sources.

Allowed:

- A file downloaded through YouTube Studio Audio Library's official download control, with item proof.
- A local file from a SoundCloud creator's official download button, with license or permission proof.
- A local file supplied by the user with explicit rights-holder permission.
- Using a public YouTube or SoundCloud URL as a reference link for manual review.

Not allowed:

- Ripping arbitrary YouTube videos.
- Capturing SoundCloud streams.
- Permanent copies through unofficial extractors.
- Hidden downloader plugins or arbitrary shell execution.

Use `ableton_plan_free_sample_download` with `dry_run=true` for these sources. The plan will report `manualReviewRequired: true` and `youtubeOrSoundCloudRippingAllowed: false`.

## Internet Archive Flow

1. Search with `ableton_search_free_sample_sources` or `ableton_search_internet_archive_audio`.
2. Inspect the item with `ableton_get_remote_sample_metadata`.
3. List candidate files with `ableton_list_internet_archive_audio_files`.
4. Review license policy and source details before staging or downloading.
5. Stage only after `ableton_plan_free_sample_download` returns a valid dry-run plan.

## Storage

Downloads are disabled unless `ABLETON_MCP_ENABLE_DOWNLOADS=1`.

Staging path defaults to:

```text
C:\Users\LIZ\Desktop\MCP\ableton-mcp\samples\staging
```

For large libraries, set:

```text
ABLETON_MCP_SAMPLE_LIBRARY_ROOT=<your media drive sample-library folder>
```

On this workstation the large local trove is staged on `G:\AbletonMCP\SampleLibrary` so the repo and Windows system drive are not filled with multi-GB audio packs.

Import path:

```text
C:\Users\LIZ\Documents\Ableton\User Library\Samples\Codex Imports
```

Every staged or imported sample should preserve source URL, title, creator, license, attribution text, download date, original filename, local filename, duration, format, ffprobe metadata, and checksum.

## Local Sample Intelligence

For large local collections, build a searchable role index instead of asking an agent to browse folders manually:

```text
ableton_build_sample_intelligence_index
ableton_search_sample_intelligence
ableton_get_sample_intelligence_item
ableton_plan_sample_chop_map
```

The index is bounded, explicit, and SQLite-backed. It only reads under `ABLETON_MCP_SAMPLE_LIBRARY_ROOT`, defaults to the `online-treasure-trove` subfolder when present, stores redacted paths, and never runs on startup. It excludes broad user folders, AppData, browser profiles, credential paths, archives, `__MACOSX`, generated render folders, and plugin folders by default.

Indexed fields include source pack, filename tags, role hints, extension, size, modified time, duration, sample rate, channels, peak/loudness hints when available, attribution sidecar state, and “good for” roles. Use this first when the user wants variety, realism, human texture, better synth/sample choices, or less same-sounding procedural output.

## Sample Role Universe

Think in roles first, then search sources. The AI should ask for the kind of sound the song needs, not just a folder full of files.

### Human And Vocal

- Breath ghost: search `breath texture`, `inhale swell`, `mouth air`, `vowel fog`. Best sources: Freesound, Internet Archive, Openverse.
- Choir shadow: search `choir pad`, `vowel cluster`, `sacred hum`, `wordless choir`. Best sources: Musopen, Internet Archive, Openverse.
- Crowd room: search `crowd murmur`, `audience room tone`, `people hall`, `distance voices`. Best sources: Freesound, Wikimedia Commons, Openverse.
- Radio host: search `radio announcer`, `broadcast voice`, `old presenter`, `public address`. Best sources: Internet Archive, Wikimedia Commons.
- Whisper fragment: search `whisper breath`, `soft consonants`, `barely human voice`, `secret room`. Best sources: Freesound, Internet Archive.
- Vocal vowel: search `ahh`, `ooh`, `vowel drone`, `formant voice`. Best sources: Musopen, Freesound, Openverse.
- Call and response: search `answer vocal`, `chant echo`, `group response`, `room chant`. Best sources: Internet Archive, Freesound.
- Adlib texture: search `vocal lick`, `nonverbal phrase`, `human throw`, `far voice`. Best sources: Freesound, Openverse.

### Musical Memory

- Detuned piano: search `old piano`, `felt piano`, `worn upright`, `room piano`. Best sources: Internet Archive, Musopen, Openverse.
- Rhodes bed: search `electric piano`, `Rhodes loop`, `vintage keys`, `jazzy keys`. Best sources: Internet Archive, Openverse.
- Wurlitzer pulse: search `Wurli`, `electric piano`, `warm keys`, `retro keys`. Best sources: Internet Archive, Openverse.
- Celeste glint: search `celeste`, `music box`, `glass keys`, `plucked bells`. Best sources: Musopen, Internet Archive.
- Vibraphone memory: search `vibes`, `mallet`, `soft metal bars`, `dream bells`. Best sources: Musopen, Internet Archive.
- Organ haze: search `church organ`, `small organ`, `reedy sustain`, `air organ`. Best sources: Musopen, Internet Archive.
- String smear: search `string bed`, `ensemble swell`, `slow strings`, `film strings`. Best sources: Musopen, Openverse.
- Guitar harmonic: search `harmonic guitar`, `picked string`, `sustained guitar`, `clean harmonic`. Best sources: Freesound, Openverse.

### Mechanical And Infrastructure

- HVAC hum: search `HVAC`, `air vent`, `room hum`, `building air`. Best sources: Freesound, Internet Archive, Openverse.
- Fluorescent ballast: search `fluorescent hum`, `light buzz`, `neon hum`, `office light`. Best sources: Freesound, Internet Archive.
- Elevator motion: search `elevator cable`, `lift groan`, `motor hum`, `door chime`. Best sources: Freesound, Internet Archive.
- Escalator machine: search `escalator`, `moving stairs`, `motorized stairs`, `mall machine`. Best sources: Freesound, Internet Archive.
- Conveyor / factory motion: search `conveyor belt`, `machine bed`, `industrial motor`, `assembly line`. Best sources: Freesound, Openverse.
- Computer fan / monitor whine: search `fan hum`, `computer fan`, `CRT whine`, `screen whine`. Best sources: Freesound, Openverse.
- Door relay / switch: search `relay click`, `switch click`, `door latch`, `mechanical click`. Best sources: Freesound, Internet Archive.
- Transformer / power bed: search `transformer hum`, `power hum`, `electrical buzz`, `substation`. Best sources: Freesound, Internet Archive.
- Tape motor: search `tape motor`, `reel to reel`, `cassette wobble`, `vinyl crackle`. Best sources: Freesound, Internet Archive.

### Environment And Space

- Room tone: search `room tone`, `empty room`, `hallway air`, `silent space`. Best sources: Freesound, Internet Archive, Openverse.
- Mall atrium: search `shopping mall`, `atrium`, `indoor space`, `food court`. Best sources: Internet Archive, Freesound.
- Tiled corridor: search `tile room`, `bathroom reverb`, `hallway reflections`, `hard floor room`. Best sources: Freesound, Openverse.
- Underwater bed: search `underwater`, `water pressure`, `submerged room`, `deep sea ambience`. Best sources: Freesound, Internet Archive.
- Concrete stairwell: search `stairwell`, `concrete room`, `basement echo`, `parking garage`. Best sources: Freesound, Internet Archive.
- Warehouse air: search `warehouse`, `large room tone`, `empty industrial space`, `echo room`. Best sources: Freesound, Openverse.
- Rain on metal: search `rain metal`, `roof rain`, `tin roof`, `storm surface`. Best sources: Freesound, Internet Archive.
- Wind / exterior space: search `wind bed`, `night wind`, `open field`, `distant weather`. Best sources: Freesound, Openverse.

### Impacts And Transitions

- Sub hit: search `sub drop`, `low boom`, `bass hit`, `pressure thump`. Best sources: Freesound, Sonniss GDC, Openverse.
- Metallic knock: search `metal hit`, `pipe hit`, `industrial thunk`, `clank`. Best sources: Freesound, Sonniss GDC.
- Reverse tail: search `reverse cymbal`, `reverse swell`, `backwards hit`, `impact rise`. Best sources: Freesound, Openverse.
- Downlifter: search `falling noise`, `drop down`, `descent`, `pitch fall`. Best sources: Freesound, Openverse.
- Granular smear: search `texture sweep`, `glitch cloud`, `grain wash`, `smear`. Best sources: Freesound, 99Sounds, Openverse.
- Tape stop / collapse: search `tape stop`, `slowdown`, `resample fall`, `dying machine`. Best sources: Freesound, Internet Archive.
- Glitch flash: search `glitch hit`, `digital burst`, `stutter`, `micro cut`. Best sources: Freesound, OpenGameArt.
- Ear candy: search `sparkle`, `small hit`, `detail`, `button click`, `micro tone`. Best sources: Freesound, Mixkit.

### Search Prompts That Usually Work

- `fluorescent hallway hum`
- `empty mall ambience`
- `tape hiss room tone`
- `elevator cable groan`
- `underwater sub pressure`
- `wordless choir breath`
- `worn piano room`
- `detuned bell memory`
- `metallic impact tail`
- `concrete stairwell echo`
- `vocal vowel fog`
- `industrial pulse machine`
- `night parking garage`
- `reel to reel flutter`
- `cassette crackle ambience`

### Local Search Trove

When the library is already staged locally, start here first:

- `%ABLETON_MCP_SAMPLE_LIBRARY_ROOT%\online-treasure-trove\README.md`
- `%ABLETON_MCP_SAMPLE_LIBRARY_ROOT%\online-treasure-trove\SEARCH.md`

Use the local trove for fast search over:

- Large MusicRadar synth, rhythm, texture, and orchestral packs.
- Internet Archive CC0 and public-domain utility sounds.
- Door, knock, bell, horn, buzzer, and broadcast voice textures that are faster to search locally than to rediscover online.

## Synth And Machine Toolkit

These are the essential Ableton tools that keep music from sounding like a flat retro loop.

| Tool | Use | Why it helps variety |
| --- | --- | --- |
| `ableton_design_synth_patch` | High-level patch planning for bass, lead, pad, drone, bell, pulse, or texture roles. | Forces one role per sound instead of one generic preset for everything. |
| `ableton_design_operator_patch` | FM bells, metallic basses, glass plucks, and spectral shadows. | Adds harmonic complexity without chiptune-style simplicity. |
| `ableton_design_wavetable_patch` | Moving pads, evolving leads, wide motion, and modern spectral textures. | Creates motion that feels alive instead of looped. |
| `ableton_design_drift_patch` | Warm analog-style instability, age, detune, and drift. | Breaks the clean digital stamp that makes things sound samey. |
| `ableton_design_sampler_instrument` | Turns approved samples into playable instruments with zones and loops. | Gives the track human or mechanical fingerprints, not just synth tones. |
| `ableton_design_granular_texture` | Frozen clouds, room smears, reverse fog, and unstable atmosphere. | Makes space feel physical and cinematic. |
| `ableton_design_rack_macros` | Maps sound intent to 8 macros like age, dread, width, distance, and collapse. | Makes one patch perform like many variations. |
| `ableton_generate_harmonic_palette` | Chooses key, mode, borrowed colors, and tension notes. | Prevents every cue from living in the same loop and key center. |
| `ableton_generate_motif_system` | Builds a motif and its returns, inversions, and corruptions. | Keeps the music memorable even when the sound palette changes. |
| `ableton_plan_layer_stack` | Assigns sub, body, texture, motion, and air roles. | Stops overstacking and gives each layer a job. |

Useful device discovery and selection tools:

- `ableton_browse_live_devices`
- `ableton_get_browser_tree`
- `ableton_get_browser_items_at_path`
- `ableton_render_concept_device_chain_spec`
- `ableton_render_concept_device_catalog_matches`
- `ableton_load_drum_kit`

## Anti-16-Bit Upgrade Checklist

- Use at least one sampled human, room, or mechanical layer when the source policy allows it.
- Give the bass/sub one clear job and keep it centered.
- Use different device families for identity, body, texture, and motion.
- Change register between sections so the ear hears a real arrangement.
- Make at least one patch move with automation or macro control.
- Avoid square-wave-only leads and constant single-oscillator writing.
- Use reverb as space, not as a blanket over every part.
- Use silence, dropouts, and returns so the track breathes.
- Keep one motif or harmonic idea returning in changed forms.
- If it sounds like a game loop, add human presence, room noise, or a real-world source layer before adding more notes.
