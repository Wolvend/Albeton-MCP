import http from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.ABLETON_MCP_BRIDGE_PORT ?? 17364);
const MAX_REQUEST_BYTES = 64_000;

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readBody(req: http.IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isLoopback(remoteAddress: string | undefined) {
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

const server = http.createServer(async (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) {
    sendJson(res, 403, { ok: false, code: "LOOPBACK_ONLY", error: "Ableton MCP bridge setup listener accepts loopback clients only." });
    return;
  }
  if (req.method !== "POST" || req.url !== "/ableton-mcp") {
    sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Use POST /ableton-mcp." });
    return;
  }

  try {
    const raw = await readBody(req);
    const message = raw ? JSON.parse(raw) as { id?: unknown; action?: unknown } : {};
    const id = typeof message.id === "string" ? message.id : null;
    const action = typeof message.action === "string" ? message.action : "unknown";
    sendJson(res, 503, {
      id,
      ok: false,
      code: "MAX_DEVICE_NOT_CONNECTED",
      error: "Ableton MCP setup listener is reachable, but the Max for Live LiveAPI bridge device is not connected.",
      action,
      nextSteps: [
        "Open Ableton Live.",
        "Load bridge/max-for-live/ableton-mcp-bridge.maxpat in a Max for Live device.",
        "Stop this setup listener before loading the real bridge, or restart the MCP helper services after the Max device is ready.",
        "Confirm the Max console says: Ableton MCP HTTP bridge listening on 127.0.0.1:17364."
      ]
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: error instanceof Error ? error.message : "Invalid bridge request."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.error(`Ableton MCP setup listener reachable on ${HOST}:${PORT}; Max for Live bridge is not connected.`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
