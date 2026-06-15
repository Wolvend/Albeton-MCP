# The Road Has No Horizon

`The Road Has No Horizon` is a completely separate procedural horror track for the Ableton MCP project.

## What Makes It New

- No previous master is edited.
- No previous stem is reused.
- No ballroom/78rpm source recordings are used.
- No staged vocal samples are used.
- No external sample files are used at all.

The melody, vocal apparitions, room tone, sub pressure, lab transmissions, wire resonance, and impacts are synthesized directly in `scripts/render-the-road-has-no-horizon.mjs`.

## Concept

The track is a middle-of-nowhere bad-trip piece: an endless road, dead fields, fluorescent sky, utility wires, and a horizon that never arrives. The psychological-experiment tone is fictional atmosphere only. There are no intelligible commands, real subliminal instruction content, or coercive speech.

## Sound

- Original six-note dead-road motif, corrupted on each return.
- Synthetic nonverbal formant vocals, breath noise, and vowel ghosts.
- Low-passed empty-field air and fluorescent sky hum.
- Mono-centered sub pressure with a late low-end absence and controlled return.
- Fictional lab chirps and transmission tones.
- Distant ground failures and wire-fence resonances.
- Wide room motion on reflections only; low end stays mono-compatible.

## Render Command

```powershell
npm run render:the-road-has-no-horizon
```

## Outputs

- `%USERPROFILE%\Downloads\the-road-has-no-horizon-master.wav`
- `%USERPROFILE%\Downloads\the-road-has-no-horizon-master.mp3`
- `%USERPROFILE%\Downloads\the-road-has-no-horizon-attribution.txt`
- `%USERPROFILE%\Downloads\the-road-has-no-horizon-verification.json`
- `samples/staging/the-road-has-no-horizon/stems/*.wav`

The staging folder is ignored by Git and is intended for local Ableton import/editing.

## Safety Boundary

The renderer is offline-only. It does not start Ableton, move the mouse, use LiveAPI writes, install plugins, download samples, scrape arbitrary URLs, or expose network services.
