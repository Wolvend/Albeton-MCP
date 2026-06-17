#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { StreamableHTTPServerTransportOptions } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createAbletonMcpServer } from "./server.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17366;
const MAX_BODY_BYTES = 1024 * 1024;
const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function getPort() {
  const raw = process.env.ABLETON_MCP_HTTP_PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("ABLETON_MCP_HTTP_PORT must be an integer between 1 and 65535.");
  }
  return parsed;
}

function getHost() {
  const host = process.env.ABLETON_MCP_HTTP_HOST ?? DEFAULT_HOST;
  if (!LOCAL_HOSTS.has(host) && process.env.ABLETON_MCP_HTTP_ALLOW_REMOTE !== "1") {
    throw new Error("ABLETON_MCP_HTTP_HOST is restricted to localhost unless ABLETON_MCP_HTTP_ALLOW_REMOTE=1 is set.");
  }
  return host;
}

function getBearerToken() {
  const token = process.env.ABLETON_MCP_HTTP_TOKEN?.trim() ?? "";
  if (token && token.length < 16) {
    throw new Error("ABLETON_MCP_HTTP_TOKEN must be at least 16 characters when configured.");
  }
  if (!LOCAL_HOSTS.has(host) && token.length < 16) {
    throw new Error("ABLETON_MCP_HTTP_TOKEN with at least 16 characters is required when remote HTTP is enabled.");
  }
  return token;
}

function isAuthorized(req: http.IncomingMessage) {
  if (!httpToken) return true;
  const header = req.headers.authorization ?? "";
  const expected = Buffer.from(`Bearer ${httpToken}`);
  const actual = Buffer.from(Array.isArray(header) ? header.join(",") : header);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function readJsonBody(req: http.IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body exceeds the 1 MiB limit.");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

const host = getHost();
const port = getPort();
const httpToken = getBearerToken();
const statelessOptions = { sessionIdGenerator: undefined } as unknown as StreamableHTTPServerTransportOptions;

const httpServer = http.createServer(async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized. Provide Authorization: Bearer <ABLETON_MCP_HTTP_TOKEN>." });
      return;
    }

    if (req.url === "/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, name: "ableton-mcp", transport: "streamable-http", host, port, authRequired: Boolean(httpToken) });
      return;
    }

    if (req.url !== "/mcp") {
      sendJson(res, 404, { ok: false, error: "Not found." });
      return;
    }

    if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
    const server = createAbletonMcpServer();
    const transport = new StreamableHTTPServerTransport(statelessOptions);
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown HTTP MCP error.";
    sendJson(res, message.includes("exceeds") ? 413 : 500, { ok: false, error: message });
  }
});

httpServer.listen(port, host, () => {
  console.error(`ableton-mcp HTTP transport listening on http://${host}:${port}/mcp${httpToken ? " with bearer-token auth" : ""}`);
});
