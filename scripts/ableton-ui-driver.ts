import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { LOCAL_PATHS, TOOL_PATHS } from "../src/config.js";
import { ensureUiDriverServerToken, getUiDriverAuthRuntimeState, isAuthorizedUiDriverRequest, uiDriverUnauthorizedResponse } from "../src/ui-driver-auth.js";
import { findSafeUiAction, getSafeUiActions, planSafeUiActionSequence } from "./ui-safe-actions.js";

const execFileAsync = promisify(execFile);
const host = "127.0.0.1";
const configuredPort = Number(process.env.ABLETON_MCP_UI_DRIVER_PORT ?? "17365");
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 17365;
const MAX_REQUEST_BYTES = 64_000;
const startedAt = new Date().toISOString();
const auth = await ensureUiDriverServerToken();
const authRuntime = getUiDriverAuthRuntimeState(auth.tokenFile);
let requestCount = 0;
let lastAction: { action: string; at: string; ok: boolean; durationMs: number } | null = null;

type DriverRequest = {
  id?: string;
  action?: string;
  payload?: Record<string, unknown>;
};

type AbletonWindow = {
  processName: string;
  pid: number;
  title: string;
  handle: number;
};

type WindowRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function jsonResponse(res: http.ServerResponse, statusCode: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

function isLoopbackRemote(remoteAddress: string | undefined) {
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

function parseJson(text: string): DriverRequest {
  const parsed = JSON.parse(text) as DriverRequest;
  if (!parsed || typeof parsed !== "object") throw new Error("Request body must be a JSON object.");
  if (typeof parsed.action !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(parsed.action)) throw new Error("Invalid action.");
  if (parsed.payload !== undefined && (typeof parsed.payload !== "object" || parsed.payload === null || Array.isArray(parsed.payload))) throw new Error("Payload must be an object.");
  return parsed;
}

async function powershellJson(script: string) {
  const { stdout } = await execFileAsync(TOOL_PATHS.powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    timeout: 8_000,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH }
  });
  const trimmed = stdout.trim();
  return trimmed ? JSON.parse(trimmed) as unknown : null;
}

async function listAbletonWindows(): Promise<AbletonWindow[]> {
  const result = await powershellJson(`
    $items = Get-Process | Where-Object { $_.ProcessName -like 'Ableton Live*' -and $_.MainWindowHandle -ne 0 } | ForEach-Object {
      [PSCustomObject]@{
        processName = $_.ProcessName
        pid = $_.Id
        title = $_.MainWindowTitle
        handle = [Int64]$_.MainWindowHandle
      }
    }
    $items | ConvertTo-Json -Compress
  `);
  if (!result) return [];
  return Array.isArray(result) ? result as AbletonWindow[] : [result as AbletonWindow];
}

async function requireAbletonWindow() {
  const windows = await listAbletonWindows();
  const window = windows.find((candidate) => candidate.title && candidate.handle > 0);
  if (!window) {
    throw new Error("No targetable Ableton Live window was found.");
  }
  return window;
}

function psString(value: string) {
  return JSON.stringify(value).replace(/\u2028|\u2029/g, "");
}

async function focusWindow() {
  const window = await requireAbletonWindow();
  const result = await powershellJson(`
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@
    $handle = [IntPtr]${window.handle}
    [void][Win32]::ShowWindowAsync($handle, 9)
    $ok = [Win32]::SetForegroundWindow($handle)
    [PSCustomObject]@{ ok = $ok; handle = ${window.handle}; title = ${psString(window.title)} } | ConvertTo-Json -Compress
  `);
  return { window, focus: result };
}

function boundedNumber(value: unknown, name: string, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return Math.trunc(number);
}

async function clickCoordinates(payload: Record<string, unknown>) {
  const x = boundedNumber(payload.x, "x", 0, 10_000);
  const y = boundedNumber(payload.y, "y", 0, 10_000);
  const window = await requireAbletonWindow();
  const result = await powershellJson(`
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
'@
    $handle = [IntPtr]${window.handle}
    $rect = New-Object RECT
    [void][Win32]::GetWindowRect($handle, [ref]$rect)
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if (${x} -gt $width -or ${y} -gt $height) { throw "Coordinates are outside the Ableton window." }
    $screenX = $rect.Left + ${x}
    $screenY = $rect.Top + ${y}
    [void][Win32]::ShowWindowAsync($handle, 9)
    [void][Win32]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 100
    [void][Win32]::SetCursorPos($screenX, $screenY)
    [Win32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [Win32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    [PSCustomObject]@{ ok = $true; x = ${x}; y = ${y}; coordinateSpace = "ableton_window"; title = ${psString(window.title)} } | ConvertTo-Json -Compress
  `);
  return { window, click: result };
}

async function typeText(payload: Record<string, unknown>) {
  const text = String(payload.text ?? "");
  if (!text || text.length > 500) throw new Error("text is required and must be 500 characters or fewer.");
  if (/[\r\n\t+^%~(){}[\]]/.test(text)) throw new Error("text contains SendKeys control characters; literal text injection for those characters is not enabled yet.");
  const window = await requireAbletonWindow();
  const result = await powershellJson(`
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@
    $handle = [IntPtr]${window.handle}
    [void][Win32]::ShowWindowAsync($handle, 9)
    [void][Win32]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait(${psString(text)})
    [PSCustomObject]@{ ok = $true; chars = ${text.length}; title = ${psString(window.title)} } | ConvertTo-Json -Compress
  `);
  return { window, type: result };
}

async function getWindowRect(window: AbletonWindow): Promise<WindowRect> {
  const result = await powershellJson(`
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
'@
    $handle = [IntPtr]${window.handle}
    $rect = New-Object RECT
    if (-not [Win32]::GetWindowRect($handle, [ref]$rect)) { throw "Unable to read Ableton window bounds." }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    [PSCustomObject]@{ left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom; width = $width; height = $height } | ConvertTo-Json -Compress
  `);
  const rect = result as Partial<WindowRect> | null;
  const left = rect?.left;
  const top = rect?.top;
  const right = rect?.right;
  const bottom = rect?.bottom;
  const width = rect?.width;
  const height = rect?.height;
  if (
    !rect ||
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    left === undefined ||
    top === undefined ||
    right === undefined ||
    bottom === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Ableton window bounds were invalid.");
  }
  return {
    left,
    top,
    right,
    bottom,
    width,
    height
  };
}

async function captureAbletonScreenshot(payload: Record<string, unknown>, regionOnly: boolean) {
  const window = await requireAbletonWindow();
  const rect = await getWindowRect(window);
  const x = regionOnly ? boundedNumber(payload.x, "x", 0, rect.width) : 0;
  const y = regionOnly ? boundedNumber(payload.y, "y", 0, rect.height) : 0;
  const width = regionOnly ? boundedNumber(payload.width, "width", 1, Math.min(rect.width - x, 3000)) : Math.min(rect.width, 3000);
  const height = regionOnly ? boundedNumber(payload.height, "height", 1, Math.min(rect.height - y, 3000)) : Math.min(rect.height, 3000);
  if (x + width > rect.width || y + height > rect.height) {
    throw new Error("Capture region is outside the Ableton window.");
  }

  const screenshotsDir = path.join(LOCAL_PATHS.diagnostics, "screenshots");
  const fileName = `ableton-ui-${new Date().toISOString().replace(/[:.]/g, "-")}-${regionOnly ? "region" : "window"}.png`;
  const outputPath = path.join(screenshotsDir, fileName);
  const result = await powershellJson(`
    Add-Type -AssemblyName System.Drawing
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@
    $handle = [IntPtr]${window.handle}
    [void][Win32]::ShowWindowAsync($handle, 9)
    [void][Win32]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 150
    $dir = ${psString(screenshotsDir)}
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $path = ${psString(outputPath)}
    $bitmap = New-Object System.Drawing.Bitmap(${width}, ${height})
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen(${rect.left + x}, ${rect.top + y}, 0, 0, (New-Object System.Drawing.Size(${width}, ${height})))
      $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
    $info = Get-Item -LiteralPath $path
    [PSCustomObject]@{
      ok = $true
      path = $info.FullName
      bytes = $info.Length
      x = ${x}
      y = ${y}
      width = ${width}
      height = ${height}
      coordinateSpace = "ableton_window"
      title = ${psString(window.title)}
    } | ConvertTo-Json -Compress
  `);
  return { window, rect, capture: result };
}

async function runSafeUiAction(id: string, payload: Record<string, unknown>) {
  const action = findSafeUiAction(id);
  if (!action) {
    return {
      unsupported: true,
      action: id,
      reason: "Named UI action is not in the reviewed allowlist."
    };
  }

  if (payload.dry_run !== false) {
    return {
      ok: true,
      dry_run: true,
      action: action.id,
      planned: action
    };
  }

  if (action.kind === "focus") return focusWindow();
  if (action.kind === "screenshot") return captureAbletonScreenshot({}, false);
  if (action.kind === "region_capture") return captureAbletonScreenshot(action.payload ?? {}, true);

  return {
    unsupported: true,
    action: action.id,
    reason: "Safe UI action kind is not implemented."
  };
}

async function dispatch(action: string, payload: Record<string, unknown>) {
  if (action === "ping") return { startedAt, protocol: "ableton-ui-driver-v1", authRequired: true };
  if (action === "status") return { startedAt, requestCount, lastAction, windows: await listAbletonWindows(), auth: { ...authRuntime, source: auth.source } };
  if (action === "window_status") return { windows: await listAbletonWindows() };
  if (action === "focus_window") return focusWindow();
  if (action === "click_coordinates") return clickCoordinates(payload);
  if (action === "type_text") return typeText(payload);
  if (action === "capture_screenshot") return captureAbletonScreenshot(payload, false);
  if (action === "capture_region") return captureAbletonScreenshot(payload, true);
  if (action === "list_safe_ui_actions") return { actions: getSafeUiActions() };
  if (action === "plan_ui_action_sequence") return planSafeUiActionSequence(Array.isArray(payload.actions) ? payload.actions.map(String) : []);
  if (action === "click_named_safe_action") return runSafeUiAction(String(payload.action ?? ""), payload);
  if (action === "run_ui_action_sequence") {
    const planned = planSafeUiActionSequence(Array.isArray(payload.actions) ? payload.actions.map(String) : []);
    if (payload.dry_run !== false) return planned;
    const results = [];
    for (const plannedAction of planned.actions) {
      results.push(await runSafeUiAction(plannedAction.id, { dry_run: false }));
    }
    return { ok: true, actions: planned.actions, results };
  }
  return { unsupported: true, action };
}

const server = http.createServer((req, res) => {
  if (!isLoopbackRemote(req.socket.remoteAddress)) {
    jsonResponse(res, 403, { ok: false, error: "Ableton UI driver accepts loopback requests only." });
    return;
  }
  if (req.method !== "POST" || req.url !== "/ableton-ui-driver") {
    jsonResponse(res, 404, { ok: false, error: "Not found." });
    return;
  }
  if (!isAuthorizedUiDriverRequest(req.headers.authorization, auth.token)) {
    jsonResponse(res, 401, uiDriverUnauthorizedResponse());
    return;
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  let requestTooLarge = false;
  req.on("data", (chunk: Buffer) => {
    if (requestTooLarge) return;
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) {
      requestTooLarge = true;
      chunks.length = 0;
      jsonResponse(res, 413, {
        ok: false,
        code: "UI_DRIVER_REQUEST_TOO_LARGE",
        error: "Ableton UI driver request body exceeds the 64 KiB limit."
      });
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (requestTooLarge || res.writableEnded) return;
    void (async () => {
      const started = Date.now();
      let id: string | undefined;
      let action = "unknown";
      try {
        const parsed = parseJson(Buffer.concat(chunks).toString("utf8"));
        id = parsed.id;
        action = parsed.action ?? "unknown";
        requestCount += 1;
        const data = await dispatch(action, parsed.payload ?? {});
        lastAction = { action, at: new Date().toISOString(), ok: true, durationMs: Date.now() - started };
        jsonResponse(res, 200, { id, ok: true, data });
      } catch (error) {
        lastAction = { action, at: new Date().toISOString(), ok: false, durationMs: Date.now() - started };
        jsonResponse(res, 400, { id, ok: false, error: error instanceof Error ? error.message : "Unknown error." });
      }
    })();
  });
});

server.listen(port, host, () => {
  console.error(`Ableton UI driver listening on ${host}:${port} with bearer-token auth`);
});
