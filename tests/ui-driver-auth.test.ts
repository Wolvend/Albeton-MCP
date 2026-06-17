import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";
import {
  ensureUiDriverServerToken,
  generateUiDriverToken,
  getUiDriverAuthRuntimeState,
  isAuthorizedUiDriverRequest,
  MAX_UI_DRIVER_TOKEN_FILE_BYTES,
  MIN_UI_DRIVER_TOKEN_LENGTH,
  readUiDriverTokenFromEnv,
  readUiDriverTokenFile,
  UI_DRIVER_TOKEN_ENV,
  writeGeneratedUiDriverTokenFile
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

function post(port: number, body: string, headers: http.OutgoingHttpHeaders = {}) {
  return new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/ableton-ui-driver",
      timeout: 3_000,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...headers
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.end(body);
  });
}

async function waitForOutput(getOutput: () => string, pattern: RegExp) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (pattern.test(getOutput())) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for output matching ${pattern}: ${getOutput()}`);
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

  it("rejects malformed, oversized, directory, and symlink token files", async () => {
    await fs.mkdir(testTokenDir, { recursive: true });

    await fs.writeFile(testTokenFile, "not-json", "utf8");
    await expect(readUiDriverTokenFile(testTokenFile)).rejects.toMatchObject({ code: "UI_DRIVER_TOKEN_FILE_INVALID" });

    await fs.writeFile(testTokenFile, JSON.stringify({ token: "x".repeat(MAX_UI_DRIVER_TOKEN_FILE_BYTES) }), "utf8");
    await expect(readUiDriverTokenFile(testTokenFile)).rejects.toMatchObject({ code: "UI_DRIVER_TOKEN_FILE_INVALID" });

    await fs.rm(testTokenFile, { force: true });
    await fs.mkdir(testTokenFile);
    await expect(readUiDriverTokenFile(testTokenFile)).rejects.toMatchObject({ code: "UI_DRIVER_TOKEN_FILE_INVALID" });

    await fs.rm(testTokenFile, { force: true, recursive: true });
    const symlinkTarget = path.join(testTokenDir, "target.json");
    await fs.writeFile(symlinkTarget, JSON.stringify({ token: "d".repeat(32) }), "utf8");
    try {
      await fs.symlink(symlinkTarget, testTokenFile, "file");
    } catch (error) {
      if (["EPERM", "ENOTSUP", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
      throw error;
    }
    await expect(readUiDriverTokenFile(testTokenFile)).rejects.toMatchObject({ code: "UI_DRIVER_TOKEN_FILE_INVALID" });
  });

  it("rejects generated token writes when the token path is not a regular file", async () => {
    await fs.mkdir(testTokenFile, { recursive: true });
    await expect(writeGeneratedUiDriverTokenFile("f".repeat(32), testTokenFile)).rejects.toMatchObject({ code: "UI_DRIVER_TOKEN_FILE_INVALID" });
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

  it("returns structured 413 JSON for oversized standalone UI driver POST bodies", async () => {
    const port = 17468;
    const token = "e".repeat(32);
    const tsxCli = path.join(LOCAL_PATHS.projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [tsxCli, "scripts/ableton-ui-driver.ts"], {
      cwd: LOCAL_PATHS.projectRoot,
      env: {
        ...process.env,
        ABLETON_MCP_UI_DRIVER_PORT: String(port),
        ABLETON_MCP_UI_DRIVER_TOKEN: token,
        ABLETON_MCP_ENABLE_UI_CONTROL: "1"
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    let childExited = false;
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("exit", () => { childExited = true; });

    try {
      await waitForOutput(() => stderr, /listening/i);
      const oversizedBody = JSON.stringify({ id: "oversized", action: "ping", payload: { text: "x".repeat(70_000) } });
      const response = await post(port, oversizedBody, { authorization: `Bearer ${token}` });
      expect(response.statusCode).toBe(413);
      expect(JSON.parse(response.body)).toMatchObject({ ok: false, code: "UI_DRIVER_REQUEST_TOO_LARGE" });
      expect(stderr).not.toContain(token);
    } finally {
      if (!childExited) {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
      }
    }
  });
});
