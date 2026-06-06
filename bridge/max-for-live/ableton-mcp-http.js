const http = require("http");
const crypto = require("crypto");
const Max = require("max-api");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ABLETON_MCP_BRIDGE_PORT || 17364);
const MAX_REQUEST_BYTES = 64_000;
const REQUEST_TIMEOUT_MS = 2500;
const pending = new Map();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

function fail(res, status, code, message, id = null) {
  sendJson(res, status, { id, ok: false, code, error: message });
}

function safeAction(action) {
  return typeof action === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(action);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

Max.addHandler("response", (id, json) => {
  const key = String(id);
  const item = pending.get(key);
  if (!item) return;
  clearTimeout(item.timeout);
  pending.delete(key);
  try {
    sendJson(item.res, 200, JSON.parse(String(json)));
  } catch (error) {
    fail(item.res, 502, "LIVEAPI_INVALID_RESPONSE", String(error), key);
  }
});

const server = http.createServer(async (req, res) => {
  if (req.socket.remoteAddress !== "127.0.0.1" && req.socket.remoteAddress !== "::1" && req.socket.remoteAddress !== "::ffff:127.0.0.1") {
    fail(res, 403, "LOOPBACK_ONLY", "Ableton MCP bridge accepts loopback clients only.");
    return;
  }
  if (req.method !== "POST" || req.url !== "/ableton-mcp") {
    fail(res, 404, "NOT_FOUND", "Use POST /ableton-mcp.");
    return;
  }
  try {
    const body = await readRequestBody(req);
    const message = JSON.parse(body);
    const id = String(message.id || crypto.randomUUID());
    const action = String(message.action || "");
    const payload = message.payload && typeof message.payload === "object" ? message.payload : {};
    if (!safeAction(action)) {
      fail(res, 400, "ACTION_REJECTED", "Bridge action rejected by allowlist pattern.", id);
      return;
    }
    const timeout = setTimeout(() => {
      pending.delete(id);
      fail(res, 504, "LIVEAPI_TIMEOUT", "LiveAPI handler timed out.", id);
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { res, timeout });
    Max.outlet("request", id, action, JSON.stringify(payload));
  } catch (error) {
    fail(res, 400, "BAD_REQUEST", String(error));
  }
});

server.listen(PORT, HOST, () => {
  Max.post(`Ableton MCP HTTP bridge listening on ${HOST}:${PORT}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
