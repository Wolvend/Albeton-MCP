import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";

describe("GitHub Actions workflow", () => {
  it("uses the Node 24-era official action majors", async () => {
    const workflow = await fs.readFile(path.join(LOCAL_PATHS.projectRoot, ".github", "workflows", "ci.yml"), "utf8");
    expect(workflow).toContain("actions/checkout@v5");
    expect(workflow).toContain("actions/setup-node@v6");
    expect(workflow).not.toContain("actions/checkout@v4");
    expect(workflow).not.toContain("actions/setup-node@v4");
  });
});
