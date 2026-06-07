import { describe, expect, it } from "vitest";
import { createAbletonMcpServer } from "../src/server.js";

describe("server factory", () => {
  it("creates an MCP server instance for alternate transports", () => {
    expect(createAbletonMcpServer()).toBeTruthy();
  });
});
