import http from "node:http";
import { AbletonMcpError } from "./errors.js";

export type BridgeRequest = {
  action: string;
  payload?: Record<string, unknown>;
};

const bridgeHost = "127.0.0.1";
const bridgePort = Number(process.env.ABLETON_MCP_BRIDGE_PORT ?? "17364");

function bridgeCall<T>(request: BridgeRequest, timeoutMs = 2_500): Promise<T> {
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
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
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
