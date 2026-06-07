import net from "node:net";
import { AbletonMcpError } from "./errors.js";

const exactHosts = new Set([
  "archive.org",
  "www.archive.org",
  "freesound.org",
  "www.freesound.org",
  "cdn.freesound.org"
]);

const suffixHosts = [
  ".archive.org",
  ".freesound.org"
];

const exactPluginHosts = new Set([
  "ableton.com",
  "www.ableton.com",
  "cdn-downloads.ableton.com",
  "cycling74.com",
  "www.cycling74.com",
  "github.com",
  "objects.githubusercontent.com"
]);

const suffixPluginHosts = [
  ".ableton.com",
  ".cycling74.com",
  ".githubusercontent.com"
];

function isPrivateOrLocalAddress(hostname: string) {
  const lower = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(lower)) return true;
  if (net.isIP(lower) === 4) {
    const parts = lower.split(".").map(Number);
    const a = parts[0] ?? -1;
    const b = parts[1] ?? -1;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 169 && b === 254;
  }
  if (net.isIP(lower) === 6) {
    return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80") || lower === "::";
  }
  return false;
}

export function assertAllowedSampleUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new AbletonMcpError("Invalid URL.", "INVALID_URL", ["Use a complete HTTPS URL from Freesound or Internet Archive."]);
  }
  if (parsed.protocol !== "https:") {
    throw new AbletonMcpError("Only HTTPS sample URLs are allowed.", "URL_SCHEME_REJECTED", ["Use HTTPS URLs from approved sample sources."]);
  }
  if (parsed.username || parsed.password) {
    throw new AbletonMcpError("URLs with embedded credentials are rejected.", "URL_CREDENTIALS_REJECTED");
  }
  if (isPrivateOrLocalAddress(parsed.hostname)) {
    throw new AbletonMcpError("Private, local, and raw IP sample URLs are rejected.", "URL_HOST_REJECTED");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = exactHosts.has(host) || suffixHosts.some((suffix) => host.endsWith(suffix));
  if (!allowed) {
    throw new AbletonMcpError(
      `Sample URL host is not approved: ${host}`,
      "URL_HOST_REJECTED",
      ["Use Freesound or Internet Archive URLs returned by the MCP sample search/metadata tools."]
    );
  }
  return parsed.toString();
}

export function assertAllowedPluginUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new AbletonMcpError("Invalid plugin URL.", "INVALID_URL", ["Use a complete HTTPS URL from an approved plugin/package source."]);
  }
  if (parsed.protocol !== "https:") {
    throw new AbletonMcpError("Only HTTPS plugin/package URLs are allowed.", "URL_SCHEME_REJECTED");
  }
  if (parsed.username || parsed.password) {
    throw new AbletonMcpError("URLs with embedded credentials are rejected.", "URL_CREDENTIALS_REJECTED");
  }
  if (isPrivateOrLocalAddress(parsed.hostname)) {
    throw new AbletonMcpError("Private, local, and raw IP plugin URLs are rejected.", "URL_HOST_REJECTED");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = exactPluginHosts.has(host) || suffixPluginHosts.some((suffix) => host.endsWith(suffix));
  if (!allowed) {
    throw new AbletonMcpError(
      `Plugin URL host is not approved: ${host}`,
      "URL_HOST_REJECTED",
      ["Use official Ableton/Cycling '74 URLs or reviewed GitHub release asset URLs."]
    );
  }
  return parsed.toString();
}

export async function fetchAllowedPluginUrl(input: string, init: RequestInit = {}) {
  const safeUrl = assertAllowedPluginUrl(input);
  const response = await fetch(safeUrl, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new AbletonMcpError("Plugin download redirect did not include a Location header.", "URL_REDIRECT_REJECTED");
    }
    const redirected = new URL(location, safeUrl).toString();
    assertAllowedPluginUrl(redirected);
    throw new AbletonMcpError("Plugin download redirects are rejected by default.", "URL_REDIRECT_REJECTED", ["Use the final approved HTTPS URL directly."]);
  }
  return response;
}

export async function fetchAllowedSampleUrl(input: string, init: RequestInit = {}) {
  const safeUrl = assertAllowedSampleUrl(input);
  const response = await fetch(safeUrl, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new AbletonMcpError("Sample download redirect did not include a Location header.", "URL_REDIRECT_REJECTED");
    }
    const redirected = new URL(location, safeUrl).toString();
    assertAllowedSampleUrl(redirected);
    throw new AbletonMcpError("Sample download redirects are rejected by default.", "URL_REDIRECT_REJECTED", ["Use the final approved Freesound or Internet Archive HTTPS URL directly."]);
  }
  return response;
}

export async function readJsonBounded(response: Response, maxBytes = 512_000) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new AbletonMcpError("Remote response did not include a readable body.", "REMOTE_BODY_MISSING");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AbletonMcpError("Remote JSON response exceeded size limit.", "REMOTE_RESPONSE_TOO_LARGE", ["Use a narrower query or smaller page size."]);
    }
    chunks.push(value);
  }
  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return JSON.parse(merged.toString("utf8")) as unknown;
}
