import crypto from "node:crypto";

export const MIN_HTTP_BEARER_TOKEN_LENGTH = 32;

export function validateHttpBearerToken(token: string, context: "configured" | "remote") {
  const trimmed = token.trim();
  if (trimmed.length < MIN_HTTP_BEARER_TOKEN_LENGTH) {
    const reason = context === "remote"
      ? "required when remote HTTP is enabled"
      : "when configured";
    throw new Error(`ABLETON_MCP_HTTP_TOKEN must be at least ${MIN_HTTP_BEARER_TOKEN_LENGTH} characters ${reason}.`);
  }
  if (/\s/.test(trimmed)) {
    throw new Error("ABLETON_MCP_HTTP_TOKEN must not contain whitespace.");
  }
  return trimmed;
}

export function isAuthorizedHttpBearer(authorizationHeader: string | string[] | undefined, expectedToken: string) {
  const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length).trim();
  if (!supplied || /\s/.test(supplied)) return false;

  const expected = crypto.createHash("sha256").update(expectedToken, "utf8").digest();
  const actual = crypto.createHash("sha256").update(supplied, "utf8").digest();
  return crypto.timingSafeEqual(actual, expected);
}
