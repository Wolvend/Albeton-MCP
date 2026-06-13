# Sample Sources

Default policy accepts only:

- CC0
- Public domain or Public Domain Mark
- Clearly attributed CC BY

Supported sources:

- Freesound API for licensed search and previews.
- Internet Archive public audio metadata, search, and audio file candidate extraction.

Recommended Internet Archive flow:

1. Search with `ableton_search_internet_archive_audio`.
2. Inspect the item with `ableton_get_remote_sample_metadata`.
3. List candidate files with `ableton_list_internet_archive_audio_files`.
4. Review license policy and source details before staging or downloading.

Downloads are disabled unless `ABLETON_MCP_ENABLE_DOWNLOADS=1`.

Even when downloads are enabled, URLs must be HTTPS and must belong to approved Freesound or Internet Archive hosts. Localhost, private IPs, raw IP URLs, embedded credentials, redirects, and arbitrary third-party hosts are rejected.

Staging path:

```text
C:\Users\LIZ\Desktop\MCP\ableton-mcp\samples\staging
```

Import path:

```text
C:\Users\LIZ\Documents\Ableton\User Library\Samples\Codex Imports
```
