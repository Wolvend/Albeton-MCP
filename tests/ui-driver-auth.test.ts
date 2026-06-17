import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";
import {
  ensureUiDriverServerToken,
  generateUiDriverToken,
  getUiDriverAuthRuntimeState,
  isAuthorizedUiDriverRequest,
  MIN_UI_DRIVER_TOKEN_LENGTH,
  readUiDriverTokenFromEnv,
  readUiDriverTokenFile,
  UI_DRIVER_TOKEN_ENV
} from "../src/ui-driver-auth.js";

const testTokenDir = path.join(LOCAL_PATHS.diagnostics, "runtime", "ui-driver-auth-test");
const testTokenFile = path.join(testTokenDir, "session-token.json");

function listen(server: http.Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await fs.rm(testTokenDir, { recursive: true, force: true });
});

describe("UI driver bearer token helper", () => {
  it("generates base64url session tokens with enough entropy for bearer auth", () => {
    const token = generateUiDriverToken();
    expect(token.length).toBeGreaterThanOrEqual(MIN_UI_DRIVER_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects short explicit UI driver tokens", () => {
    vi.stubEnv(UI_DRIVER_TOKEN_ENV, "short-token");
    expect(() => readUiDriverTokenFromEnv()).toThrow(/at least 32 characters/i);
  });

  it("generates a local runtime token file without exposing the raw token in status state", async () => {
    const serverToken = await ensureUiDriverServerToken(testTokenFile);
    const storedToken = await readUiDriverTokenFile(testTokenFile);
    const runtime = getUiDriverAuthRuntimeState(testTokenFile);
    const runtimeText = JSON.stringify(runtime);

    expect(serverToken.source).toBe("generated");
    expect(storedToken).toBe(serverToken.token);
    expect(runtime.authRequired).toBe(true);
    expect(runtime.tokenFile).toContain("%ABLETON_MCP_PROJECT_ROOT%");
    expect(runtimeText).not.toContain(serverToken.token);
  });

  it("requires Authorization: Bearer for standalone driver requests", () => {
    const token = "a".repeat(32);
    expect(isAuthorizedUiDriverRequest(undefined, token)).toBe(false);
    expect(isAuthorizedUiDriverRequest("Bearer wrong-token", token)).toBe(false);
    expect(isAuthorizedUiDriverRequest(`Bearer ${token}`, token)).toBe(true);
  });
});

describe("MCP UI driver client auth", () => {
  it("sends a bearer authorization header when a UI driver token is available", async () => {
    const port = 17465;
    const token = "b".repeat(32);
    let capturedAuthorization: string | string[] | undefined;
    const server = http.createServer((req, res) => {
      capturedAuthorization = req.headers.authorization;
      req.resume();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ id: "mock", ok: true, data: { pong: true } }));
    });

    await listen(server, port);
    try {
      vi.stubEnv("ABLETON_MCP_UI_DRIVER_PORT", String(port));
      vi.stubEnv(UI_DRIVER_TOKEN_ENV, token);
      vi.resetModules();
      const { uiDriverAction } = await import("../src/ui-driver.js");
      await uiDriverAction("ping");
      expect(capturedAuthorization).toBe(`Bearer ${token}`);
    } finally {
      await close(server);
    }
  });

  it("surfaces stale or missing UI driver token failures as actionable unauthorized errors", async () => {
    const port = 17466;
    const token = "c".repeat(32);
    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, code: "UI_DRIVER_UNAUTHORIZED" }));
    });

    await listen(server, port);
    try {
      vi.stubEnv("ABLETON_MCP_UI_DRIVER_PORT", String(port));
      vi.stubEnv(UI_DRIVER_TOKEN_ENV, token);
      vi.resetModules();
      const { uiDriverAction } = await import("../src/ui-driver.js");
      await expect(uiDriverAction("ping")).rejects.toMatchObject({ code: "UI_DRIVER_UNAUTHORIZED" });
    } finally {
      await close(server);
    }
  });
});
