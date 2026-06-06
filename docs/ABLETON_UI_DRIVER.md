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

## Safety Model

The UI driver is disabled unless `ABLETON_MCP_ENABLE_UI_CONTROL=1`.

It should bind only to `127.0.0.1`, target only Ableton windows, reject unknown actions, bound screenshots and payload sizes, and keep a single command queue. Do not run UI driver operations while bridge write commands are active.

Background LiveAPI bridge control remains the default for normal production work.
