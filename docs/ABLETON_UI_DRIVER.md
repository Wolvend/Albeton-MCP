# Ableton UI Driver

The UI driver is the foreground control lane for Ableton. It is intentionally separate from the Max for Live bridge.

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
- `ableton_ui_driver_ping`
- `ableton_focus_window`
- `ableton_capture_screenshot`
- `ableton_capture_region`
- `ableton_click_named_safe_action`
- `ableton_click_coordinates`
- `ableton_type_text`

## Run the driver

Run the driver:

```powershell
.\launch.ps1 ui-driver
```

Use this driver only when `ABLETON_MCP_ENABLE_UI_CONTROL=1`.

## Safety Model

The UI driver is disabled unless `ABLETON_MCP_ENABLE_UI_CONTROL=1`.

It binds only to `127.0.0.1`, targets only Ableton Live windows, rejects unknown actions, bounds payload sizes, and keeps a single command queue. Do not run UI driver operations while bridge write commands are active.

`click_coordinates` and `capture_region` use Ableton-window-relative coordinates, not whole-desktop coordinates. `type_text` rejects SendKeys control characters until a literal text injector is added.

Screenshot actions focus Ableton, read its Win32 window bounds, reject out-of-window regions, and save PNG files only under `diagnostics\screenshots`.

Background LiveAPI bridge control remains the default for normal production work.
