import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TOOL_PATHS } from "../src/config.js";

const execFileAsync = promisify(execFile);
const host = "127.0.0.1";
const configuredPort = Number(process.env.ABLETON_MCP_UI_DRIVER_PORT ?? "17365");
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 17365;
const MAX_REQUEST_BYTES = 64_000;
const startedAt = new Date().toISOString();
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

function jsonResponse(res: http.ServerResponse, statusCode: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
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
    [PSCustomObject]@{ ok = $ok; handle = ${window.handle}; title = ${JSON.stringify(window.title)} } | ConvertTo-Json -Compress
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
    [PSCustomObject]@{ ok = $true; x = ${x}; y = ${y}; coordinateSpace = "ableton_window"; title = ${JSON.stringify(window.title)} } | ConvertTo-Json -Compress
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
    [System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(text)})
    [PSCustomObject]@{ ok = $true; chars = ${text.length}; title = ${JSON.stringify(window.title)} } | ConvertTo-Json -Compress
  `);
  return { window, type: result };
}

async function dispatch(action: string, payload: Record<string, unknown>) {
  if (action === "ping") return { startedAt, protocol: "ableton-ui-driver-v1" };
  if (action === "status") return { startedAt, requestCount, lastAction, windows: await listAbletonWindows() };
  if (action === "window_status") return { windows: await listAbletonWindows() };
  if (action === "focus_window") return focusWindow();
  if (action === "click_coordinates") return clickCoordinates(payload);
  if (action === "type_text") return typeText(payload);
  if (action === "capture_screenshot" || action === "capture_region") {
    return {
      unsupported: true,
      action,
      reason: "Screenshot capture is blocked until the driver can guarantee Ableton-window-only bounds.",
      nextSteps: ["Use window_status first.", "Add bounded Ableton window capture before enabling screenshot output."]
    };
  }
  if (action === "click_named_safe_action") {
    return {
      unsupported: true,
      action,
      reason: "Named UI actions need a reviewed selector map before execution.",
      nextSteps: ["Use background LiveAPI bridge actions first.", "Add reviewed named action mappings for Ableton UI-only controls."]
    };
  }
  return { unsupported: true, action };
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/ableton-ui-driver") {
    jsonResponse(res, 404, { ok: false, error: "Not found." });
    return;
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  req.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) {
      req.destroy(new Error("Request too large."));
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
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
  console.error(`Ableton UI driver listening on ${host}:${port}`);
});
