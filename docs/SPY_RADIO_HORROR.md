# Spy Radio: Bad Trip Station

Original sample-driven backrooms horror transform using:

- `%USERPROFILE%\Downloads\spy-radio-station-34545 - evil chopped reverse edit.mp3`

## Prompt Used to Generate This Render

```text
Prompt:
1) Start as a nostalgic broadcast memory: warm, roomy, and emotionally beautiful.
2) Let the same memory become wrong: pitch sag, late transients, phase slip, and unstable geometry.
3) Animate room depth in phases: tiny closet -> endless corridor -> tiled atrium -> dead office.
4) Keep rhythm as machine memory: sparse low thumps, delayed impacts, and elevator-like metallic glides.
5) Add nonverbal human traces with no understandable text.
6) Recur the memory motif in corrupted passes: delayed return, missing fragment, inversion, reversed tails.
7) End with a low-end drain and a controlled pressure return beneath ambient collapse.
```

## Source Boundary

- Uses one user-provided sample file.
- No other sample downloads or external audio are imported.
- No Ableton writes, UI/mouse control, plugin installs, arbitrary URL fetch, or network actions are used.
- No subliminal or coercive speech content is used.

## Render Command

```powershell
npm run render:spy-radio-horror
```

You may pass an alternate source path:

```powershell
node scripts/render-spy-radio-horror.mjs "C:\\path\\to\\my\\source.mp3"
```

## Outputs

- `%USERPROFILE%\Downloads\spy-radio-bad-trip-station-master.wav`
- `%USERPROFILE%\Downloads\spy-radio-bad-trip-station-master.mp3`
- `%USERPROFILE%\Downloads\spy-radio-bad-trip-station-master-listenable.mp3` *(loudness-normalized for easier monitoring)*
- `%USERPROFILE%\Downloads\spy-radio-bad-trip-station-attribution.txt`
- `%USERPROFILE%\Downloads\spy-radio-bad-trip-station-verification.json`
- `samples/staging/spy-radio-bad-trip-station/stems/*.wav`

If the base MP3 sounds too quiet for normal listening, use:

```powershell
ffmpeg -y -i "%USERPROFILE%\Downloads\spy-radio-bad-trip-station-master.mp3" -af "loudnorm=I=-14:TP=-1.0:LRA=11:dual_mono=true" "%USERPROFILE%\Downloads\spy-radio-bad-trip-station-master-listenable.mp3"
```

## Stems

- `source-memory-misremembered`
- `ghost-vocal-ghosts`
- `horror-room-size`
- `deep-pressure-center`
- `impact-and-thump-memory`
- `tape-failure-scars`
- `corridor-smear-movement`
- `final-empty-arrival`

## Safety Notes

- Offline only.
- `sourceSamplesUsed: 1`.
- All edits happen in output folders and staging; no runtime Ableton mutation occurs.
