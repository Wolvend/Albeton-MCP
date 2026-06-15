# Mall at the End of Sleep

`Mall at the End of Sleep` is a new 1980s mall dream track for the Ableton MCP project, built from original synthesis plus fresh public-domain source samples staged only for this project.

## Source Boundary

- No previous master is edited.
- No previous stem is reused.
- No ballroom/78rpm recordings are used.
- No prior vocal sources are used.
- No user-provided source audio is read, copied, saved, or transformed.
- No downloaded file is used unless it is staged by the fixed-source `stage:mall-at-the-end-of-sleep:sources` script.

The renderer synthesizes the musical core in `scripts/render-mall-at-the-end-of-sleep.mjs`: vaporwave chord bed, glass motif, nonverbal choir fog, sub pressure, and arrangement motion. It also transforms a curated Public Domain Mark source set from Internet Archive's Valentino Sound Effects Library into the mall-memory layer: department-store air, crowded-store walla, checkout counter, electric sign flips, elevator interiors, store bell, and humidifier/HVAC tone.

## Concept

The track is a sad, dark dreamcore/vaporwave piece set inside an abandoned 1980s mall. It should feel beautiful first, then wrong: closed fountains, dead escalators, fluorescent air, distant store music that no longer resolves, and a fake sky over wet tile.

The dementia-dream feeling is an original mood direction. The track does not quote, imitate, or derive from any specific existing recording.

## Sound

- Original C# minor vaporwave harmony with darker borrowed-color variants.
- New six-note glass motif that returns late, detuned, missing notes, and envelope-reversed in feel.
- Synthetic nonverbal vowel fog and choir shadows with no words or commands.
- Fresh public-domain mall/retail/elevator/HVAC recordings slowed, reversed, filtered, and smeared.
- Mall PA tones, fluorescent hum, HVAC movement, and short cassette scars.
- Sparse dead-escalator clunks and metallic infrastructure sounds, not drums.
- Mono-centered sub pressure with a late low-end absence and controlled return.
- Wide impossible-atrium reflections while the low end remains mono-compatible.

## Render Command

```powershell
npm run stage:mall-at-the-end-of-sleep:sources
npm run render:mall-at-the-end-of-sleep
```

## Outputs

- `%USERPROFILE%\Downloads\mall-at-the-end-of-sleep-master.wav`
- `%USERPROFILE%\Downloads\mall-at-the-end-of-sleep-master.mp3`
- `%USERPROFILE%\Downloads\mall-at-the-end-of-sleep-attribution.txt`
- `%USERPROFILE%\Downloads\mall-at-the-end-of-sleep-verification.json`
- `samples/staging/mall-at-the-end-of-sleep/stems/*.wav`

The staging folder is ignored by Git and is intended for local Ableton import or further editing.

## Stems

- `closed-mall-vapor-chords`
- `glassy-dream-memory-motif`
- `synthetic-choir-vowel-fog`
- `mall-hvac-fluorescent-air`
- `distant-pa-and-cassette-drift`
- `mono-sub-pressure`
- `dead-escalator-metal`
- `impossible-atrium-reverb`

## Safety Boundary

The renderer itself is offline-only after sources are staged. It does not start Ableton, move the mouse, use LiveAPI writes, install plugins, scrape arbitrary URLs, rip YouTube/SoundCloud audio, expose network services, or create intelligible subliminal/coercive speech. The source staging script downloads only fixed allowlisted Public Domain Mark files from one Internet Archive item and records a local manifest with URLs and SHA-256 hashes.
