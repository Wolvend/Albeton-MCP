import http from "node:http";
import { AbletonMcpError } from "./errors.js";

export type BridgeRequest = {
  action: string;
  payload?: Record<string, unknown>;
};

const bridgeHost = "127.0.0.1";
const configuredBridgePort = Number(process.env.ABLETON_MCP_BRIDGE_PORT ?? "17364");
const bridgePort = Number.isInteger(configuredBridgePort) && configuredBridgePort > 0 && configuredBridgePort <= 65535
  ? configuredBridgePort
  : 17364;
const MAX_BRIDGE_RESPONSE_BYTES = 128_000;
const allowedActionPattern = /^[a-z][a-z0-9_]{0,63}$/;

function assertSafeBridgeAction(action: string) {
  if (!allowedActionPattern.test(action)) {
    throw new AbletonMcpError("Bridge action rejected by allowlist pattern.", "BRIDGE_ACTION_REJECTED", ["Use a fixed bridge action id registered by the MCP server."]);
  }
}

function bridgeCall<T>(request: BridgeRequest, timeoutMs = 2_500): Promise<T> {
  assertSafeBridgeAction(request.action);
  const body = JSON.stringify({ id: crypto.randomUUID(), ...request });
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: bridgeHost,
      port: bridgePort,
      method: "POST",
      path: "/ableton-mcp",
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
        if (bytes > MAX_BRIDGE_RESPONSE_BYTES) {
          req.destroy(new AbletonMcpError("Ableton bridge response exceeded size limit.", "BRIDGE_RESPONSE_TOO_LARGE", ["Request a narrower snapshot or bridge operation."]));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 500) >= 400) {
          reject(new AbletonMcpError(`Ableton bridge returned HTTP ${res.statusCode}: ${text}`, "BRIDGE_HTTP_ERROR", ["Confirm the Max for Live bridge device is loaded and listening on 127.0.0.1."]));
          return;
        }
        try {
          resolve(JSON.parse(text) as T);
        } catch {
          reject(new AbletonMcpError("Ableton bridge returned invalid JSON.", "BRIDGE_INVALID_JSON", ["Restart the bridge device and retry."]));
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new AbletonMcpError("Ableton bridge request timed out.", "BRIDGE_TIMEOUT", ["Open Ableton Live, load the bridge device, then run ableton_bridge_ping."]));
    });
    req.on("error", (error) => reject(error instanceof AbletonMcpError ? error : new AbletonMcpError(`Ableton bridge is not reachable at ${bridgeHost}:${bridgePort}.`, "BRIDGE_UNREACHABLE", ["Open Ableton Live.", "Install/load the Max for Live bridge from bridge/max-for-live.", "Retry ableton_bridge_ping."])));
    req.write(body);
    req.end();
  });
}

export async function pingBridge() {
  return bridgeCall({ action: "ping" });
}

export async function getBridgeSnapshot(diff = false) {
  return bridgeCall({ action: diff ? "snapshot_diff" : "full_snapshot" });
}

export async function bridgeAction(action: string, payload: Record<string, unknown> = {}) {
  return bridgeCall({ action, payload });
}
