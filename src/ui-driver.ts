import http from "node:http";
import { AbletonMcpError } from "./errors.js";

export type UiDriverRequest = {
  action: string;
  payload?: Record<string, unknown>;
};

const uiDriverHost = "127.0.0.1";
const configuredUiDriverPort = Number(process.env.ABLETON_MCP_UI_DRIVER_PORT ?? "17365");
const uiDriverPort = Number.isInteger(configuredUiDriverPort) && configuredUiDriverPort > 0 && configuredUiDriverPort <= 65535
  ? configuredUiDriverPort
  : 17365;
const MAX_UI_DRIVER_RESPONSE_BYTES = 128_000;
const UI_DRIVER_QUEUE_TIMEOUT_MS = 30_000;
const allowedUiActionPattern = /^[a-z][a-z0-9_]{0,63}$/;
let queuedUiWork: Promise<unknown> = Promise.resolve();
let uiQueueDepth = 0;
let uiRequestSequence = 0;
let lastUiAction: { action: string; at: string; durationMs: number; ok: boolean } | null = null;

function assertSafeUiAction(action: string) {
  if (!allowedUiActionPattern.test(action)) {
    throw new AbletonMcpError("UI driver action rejected by allowlist pattern.", "UI_DRIVER_ACTION_REJECTED", ["Use a fixed UI driver action id registered by the MCP server."]);
  }
}

function uiDriverCall<T>(request: UiDriverRequest, timeoutMs = 5_000): Promise<T> {
  assertSafeUiAction(request.action);
  const body = JSON.stringify({ id: crypto.randomUUID(), ...request });
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: uiDriverHost,
      port: uiDriverPort,
      method: "POST",
      path: "/ableton-ui-driver",
      timeout: timeoutMs,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_UI_DRIVER_RESPONSE_BYTES) {
          req.destroy(new AbletonMcpError("Ableton UI driver response exceeded size limit.", "UI_DRIVER_RESPONSE_TOO_LARGE", ["Request a narrower screenshot, region, or UI operation."]));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 500) >= 400) {
          reject(new AbletonMcpError(`Ableton UI driver returned HTTP ${res.statusCode}: ${text}`, "UI_DRIVER_HTTP_ERROR", ["Confirm the Ableton UI driver is attached and listening on loopback."]));
          return;
        }
        try {
          resolve(JSON.parse(text) as T);
        } catch {
          reject(new AbletonMcpError("Ableton UI driver returned invalid JSON.", "UI_DRIVER_INVALID_JSON", ["Restart the UI driver and retry."]));
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new AbletonMcpError("Ableton UI driver request timed out.", "UI_DRIVER_TIMEOUT", ["Confirm Ableton is responsive.", "Retry after the active UI operation finishes."]));
    });
    req.on("error", (error) => reject(error instanceof AbletonMcpError ? error : new AbletonMcpError(`Ableton UI driver is not reachable at ${uiDriverHost}:${uiDriverPort}.`, "UI_DRIVER_UNREACHABLE", ["Start or attach the Ableton UI driver.", "Keep it bound to 127.0.0.1.", "Retry ableton_ui_driver_status."])));
    req.write(body);
    req.end();
  });
}

async function enqueueUiDriverCall<T>(request: UiDriverRequest, timeoutMs?: number): Promise<T> {
  assertSafeUiAction(request.action);
  uiRequestSequence += 1;
  uiQueueDepth += 1;
  const startedAt = Date.now();
  const run = async () => {
    const waitedMs = Date.now() - startedAt;
    if (waitedMs > UI_DRIVER_QUEUE_TIMEOUT_MS) {
      throw new AbletonMcpError("Ableton UI driver command waited too long in the local queue.", "UI_DRIVER_QUEUE_TIMEOUT", ["Retry after the active UI operation finishes.", "Use ableton_ui_driver_status to inspect queue state."]);
    }
    const actionStartedAt = Date.now();
    try {
      const result = await uiDriverCall<T>(request, timeoutMs);
      lastUiAction = { action: request.action, at: new Date().toISOString(), durationMs: Date.now() - actionStartedAt, ok: true };
      return result;
    } catch (error) {
      lastUiAction = { action: request.action, at: new Date().toISOString(), durationMs: Date.now() - actionStartedAt, ok: false };
      throw error;
    } finally {
      uiQueueDepth = Math.max(0, uiQueueDepth - 1);
    }
  };
  const next = queuedUiWork.then(run, run);
  queuedUiWork = next.catch(() => undefined);
  return next;
}

export async function uiDriverAction(action: string, payload: Record<string, unknown> = {}) {
  return enqueueUiDriverCall({ action, payload });
}

export async function pingUiDriver() {
  return enqueueUiDriverCall({ action: "ping" }, 1_500);
}

export function getUiDriverRuntimeState() {
  return {
    host: uiDriverHost,
    port: uiDriverPort,
    endpoint: "/ableton-ui-driver",
    protocol: "ableton-ui-driver-v1",
    queueDepth: uiQueueDepth,
    serialized: true,
    queueTimeoutMs: UI_DRIVER_QUEUE_TIMEOUT_MS,
    requestSequence: uiRequestSequence,
    lastUiAction
  };
}
