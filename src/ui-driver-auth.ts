import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_PATHS } from "./config.js";
import { AbletonMcpError } from "./errors.js";
import { redactPath } from "./security.js";

export const UI_DRIVER_TOKEN_ENV = "ABLETON_MCP_UI_DRIVER_TOKEN";
export const UI_DRIVER_TOKEN_BYTES = 32;
export const MIN_UI_DRIVER_TOKEN_LENGTH = 32;

export type UiDriverTokenRecord = {
  token: string;
};

export type UiDriverServerToken = {
  token: string;
  source: "env" | "generated";
  tokenFile: string;
};

export function getUiDriverTokenFilePath() {
  return path.join(LOCAL_PATHS.diagnostics, "runtime", "ui-driver", "session-token.json");
}

export function generateUiDriverToken() {
  return crypto.randomBytes(UI_DRIVER_TOKEN_BYTES).toString("base64url");
}

export function validateUiDriverToken(token: string) {
  const trimmed = token.trim();
  if (trimmed.length < MIN_UI_DRIVER_TOKEN_LENGTH) {
    throw new AbletonMcpError(
      "ABLETON_MCP_UI_DRIVER_TOKEN must be at least 32 characters.",
      "UI_DRIVER_TOKEN_TOO_SHORT",
      ["Use a high-entropy 32+ character token or let the launcher-generated UI driver session token be created automatically."]
    );
  }
  if (/\s/.test(trimmed)) {
    throw new AbletonMcpError(
      "ABLETON_MCP_UI_DRIVER_TOKEN must not contain whitespace.",
      "UI_DRIVER_TOKEN_INVALID",
      ["Use a single opaque token value without spaces or line breaks."]
    );
  }
  return trimmed;
}

export function readUiDriverTokenFromEnv() {
  const token = process.env[UI_DRIVER_TOKEN_ENV]?.trim();
  return token ? validateUiDriverToken(token) : null;
}

export async function writeGeneratedUiDriverTokenFile(token: string, tokenFile = getUiDriverTokenFilePath()) {
  const record: UiDriverTokenRecord = { token: validateUiDriverToken(token) };
  await fs.mkdir(path.dirname(tokenFile), { recursive: true });
  await fs.writeFile(tokenFile, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.chmod(tokenFile, 0o600);
  } catch {
    // Windows does not reliably map POSIX chmod modes; the file still lives under ignored local runtime state.
  }
  return tokenFile;
}

export async function readUiDriverTokenFile(tokenFile = getUiDriverTokenFilePath()) {
  try {
    const parsed = JSON.parse(await fs.readFile(tokenFile, "utf8")) as Partial<UiDriverTokenRecord>;
    return typeof parsed.token === "string" ? validateUiDriverToken(parsed.token) : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AbletonMcpError(
      `Unable to read Ableton UI driver token file: ${redactPath(tokenFile)}`,
      "UI_DRIVER_TOKEN_FILE_INVALID",
      ["Restart .\\launch.ps1 ui-driver to regenerate the local UI driver token file.", "Remove a stale diagnostics/runtime/ui-driver/session-token.json file and retry."]
    );
  }
}

export async function ensureUiDriverServerToken(tokenFile = getUiDriverTokenFilePath()): Promise<UiDriverServerToken> {
  const envToken = readUiDriverTokenFromEnv();
  if (envToken) {
    return { token: envToken, source: "env", tokenFile };
  }

  const token = generateUiDriverToken();
  await writeGeneratedUiDriverTokenFile(token, tokenFile);
  return { token, source: "generated", tokenFile };
}

export async function readUiDriverClientToken(tokenFile = getUiDriverTokenFilePath()) {
  return readUiDriverTokenFromEnv() ?? await readUiDriverTokenFile(tokenFile);
}

export function isAuthorizedUiDriverRequest(authorizationHeader: string | string[] | undefined, expectedToken: string) {
  const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length).trim();
  if (!supplied || /\s/.test(supplied)) return false;

  const expected = crypto.createHash("sha256").update(expectedToken, "utf8").digest();
  const actual = crypto.createHash("sha256").update(supplied, "utf8").digest();
  return crypto.timingSafeEqual(actual, expected);
}

export function uiDriverUnauthorizedResponse() {
  return {
    ok: false,
    code: "UI_DRIVER_UNAUTHORIZED",
    error: "Ableton UI driver requires a valid loopback bearer token.",
    nextSteps: [
      "Restart .\\launch.ps1 ui-driver so the launcher-backed driver regenerates the local session token.",
      "If the token file is stale, remove diagnostics/runtime/ui-driver/session-token.json and start the UI driver again.",
      "For advanced manual workflows, set ABLETON_MCP_UI_DRIVER_TOKEN to the same 32+ character value for both processes."
    ]
  };
}

export function getUiDriverAuthRuntimeState(tokenFile = getUiDriverTokenFilePath()) {
  return {
    authRequired: true,
    tokenFile: redactPath(tokenFile),
    tokenEnvConfigured: Boolean(process.env[UI_DRIVER_TOKEN_ENV]?.trim())
  };
}
