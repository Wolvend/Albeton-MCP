# Sample Import Policy

Default to legal, attributable, source-tracked samples only.

Allowed default sources:

- Freesound API with CC0 or clear CC BY metadata.
- Internet Archive public-domain or clearly licensed audio.
- Local Ableton User Library content.

Every imported sample should have:

- Source URL
- Source title
- Creator/uploader where available
- License
- Attribution text
- Download date
- Original filename
- Local filename
- Duration
- Format
- ffprobe metadata
- Checksum

`ableton_generate_attribution_report` reads `.attribution.json` sidecars only from:

- `samples\staging`
- `Documents\Ableton\User Library\Samples\Codex Imports`

The report redacts local paths, sanitizes remote title/creator text for display, and keeps source URLs, licenses, checksums, byte counts, and staging/import timestamps available for review.

`ableton_convert_audio_file` can render approved local audio into `samples\staging` or Codex Imports with ffmpeg. It is dry-run by default, requires `ABLETON_MCP_ENABLE_WRITE=1` for real conversion, never overwrites existing files, and writes a sidecar attribution record with transform preset, checksum, byte count, and inherited source metadata when available.

Do not import unclear copyrighted, commercial, bootleg, or license-ambiguous audio.
