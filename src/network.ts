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
