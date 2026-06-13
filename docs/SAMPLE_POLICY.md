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

Do not import unclear copyrighted, commercial, bootleg, or license-ambiguous audio.
