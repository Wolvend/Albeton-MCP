# Ableton UI Driver

The UI driver is the foreground control lane for Ableton. It is intentionally separate from the Max for Live bridge.

It is available by user choice only. The default MCP server will report UI control status and plan UI sessions, but it will not move the mouse or type unless `ABLETON_MCP_ENABLE_UI_CONTROL=1` is set and the UI driver is running.

Use it like ChromeDriver:

- A dedicated local driver owns Ableton window discovery, screenshots, clicks, typing, and recovery.
- MCP talks to the driver over loopback only.
- MCP sends fixed action IDs with request IDs and bounded payloads.
- The driver returns structured JSON with matching IDs, status, errors, and artifacts.
- MCP serializes UI driver calls so mouse/keyboard operations do not overlap.

## Endpoint

```text
POST http://127.0.0.1:17365/ableton-ui-driver
```

Request:

```json
{
  "id": "uuid",
  "action": "capture_screenshot",
  "payload": {}
}
```

Response:

```json
{
  "id": "uuid",
  "ok": true,
  "data": {}
}
```

## Supported MCP Tools

- `ableton_ui_driver_status`
- `ableton_ui_control_consent_status`
- `ableton_plan_ui_control_session`
- `ableton_list_safe_ui_actions`
- `ableton_plan_ui_action_sequence`
- `ableton_run_ui_action_sequence`
- `ableton_ui_driver_ping`
- `ableton_focus_window`
- `ableton_capture_screenshot`
- `ableton_capture_region`
- `ableton_click_named_safe_action`
- `ableton_click_coordinates`
- `ableton_type_text`

## Named Safe Actions

Use named actions first:

- `focus_window`
- `capture_screenshot`
- `capture_browser_region`
- `capture_detail_region`

These actions are reviewed, Ableton-window scoped, serialized, and dry-run friendly. Raw coordinate clicks remain a fallback for cases where the named action map does not cover the workflow.

## Concept Device Placement

Use `ableton_plan_concept_device_ui_placement` after `ableton_render_concept_device_chain_spec` and `ableton_render_concept_device_catalog_matches` when an agent needs to review foreground device placement. The tool is a plan only: it does not move the mouse, type, insert devices, click coordinates, or contact Ableton. It returns screenshot-first UI readiness calls, catalog hints, and the exact gates required before a separate user-approved UI session.

## Run the driver

Run the driver:

```powershell
.\launch.ps1 ui-driver
```

Use this driver only when `ABLETON_MCP_ENABLE_UI_CONTROL=1`.

Before clicking or typing, use:

```text
ableton_ui_control_consent_status
ableton_plan_ui_control_session
ableton_window_status
ableton_capture_screenshot
```

## Safety Model

The UI driver is disabled unless `ABLETON_MCP_ENABLE_UI_CONTROL=1`.

It binds only to `127.0.0.1`, targets only Ableton Live windows, rejects unknown actions, bounds payload sizes, and keeps a single command queue. Do not run UI driver operations while bridge write commands are active.

`click_coordinates` and `capture_region` use Ableton-window-relative coordinates, not whole-desktop coordinates. `type_text` rejects SendKeys control characters until a literal text injector is added.

Screenshot actions focus Ableton, read its Win32 window bounds, reject out-of-window regions, and save PNG files only under `diagnostics\screenshots`.

Background LiveAPI bridge control remains the default for normal production work.
