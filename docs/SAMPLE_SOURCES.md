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

Staging path:

```text
C:\Users\LIZ\Desktop\MCP\ableton-mcp\samples\staging
```

Import path:

```text
C:\Users\LIZ\Documents\Ableton\User Library\Samples\Codex Imports
```

Every staged or imported sample should preserve source URL, title, creator, license, attribution text, download date, original filename, local filename, duration, format, ffprobe metadata, and checksum.
