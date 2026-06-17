import { describe, expect, it } from "vitest";
import { isAuthorizedHttpBearer, MIN_HTTP_BEARER_TOKEN_LENGTH, validateHttpBearerToken } from "../src/http-auth.js";

describe("HTTP bearer auth helper", () => {
  it("requires 32 or more characters for configured and remote HTTP tokens", () => {
    expect(() => validateHttpBearerToken("x".repeat(31), "configured")).toThrow(/at least 32 characters/i);
    expect(() => validateHttpBearerToken("x".repeat(31), "remote")).toThrow(/at least 32 characters/i);
    expect(validateHttpBearerToken("x".repeat(MIN_HTTP_BEARER_TOKEN_LENGTH), "configured")).toBe("x".repeat(32));
  });

  it("rejects missing, malformed, and non-exact Authorization headers", () => {
    const token = "a".repeat(32);
    expect(isAuthorizedHttpBearer(undefined, token)).toBe(false);
    expect(isAuthorizedHttpBearer(`Token ${token}`, token)).toBe(false);
    expect(isAuthorizedHttpBearer(`Bearer ${token}x`, token)).toBe(false);
    expect(isAuthorizedHttpBearer(`Bearer ${token}`, token)).toBe(true);
  });
});
