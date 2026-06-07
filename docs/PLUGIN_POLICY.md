# Plugin And Package Policy

Ableton MCP can help discover and stage plugin/package downloads, but it does not install plugins, run installers, copy files into VST/AU/CLAP/AAX folders, or modify system plugin paths.

## Tools

- `ableton_search_plugin_catalog`
- `ableton_plan_plugin_download`
- `ableton_download_plugin_package`
- `ableton_plugin_install_instructions`

## Defaults

Downloads are disabled unless:

```text
ABLETON_MCP_ENABLE_DOWNLOADS=1
```

Even when downloads are enabled, plugin packages are staged only under:

```text
samples\staging\plugins
```

## Approved URL Policy

Plugin/package URLs must:

- use HTTPS
- avoid embedded credentials
- avoid local/private/raw IP hosts
- come from approved Ableton, Cycling '74, or reviewed GitHub release/download hosts

Redirects are rejected by default. Use the final reviewed HTTPS URL directly.

## Install Policy

MCP never installs plugin packages. Manual install is required:

1. Verify publisher, source, license, and checksum.
2. Scan downloaded files with endpoint security tools.
3. Install through Ableton, Max Package Manager, or the vendor installer.
4. Restart Ableton or rescan plugins as needed.
5. Use read-only Ableton MCP tools to verify visibility.

Executable-like packages such as `.exe`, `.msi`, `.dmg`, `.pkg`, `.bat`, `.cmd`, `.ps1`, and `.sh` are always staging-only.
