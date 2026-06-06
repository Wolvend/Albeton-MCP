import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_PATHS } from "../src/config.js";
import { queryLibrary } from "../src/cache.js";
import { scanLibrary } from "../src/scanner.js";

describe("scanner", () => {
  it("indexes a tiny fixture on demand", async () => {
    const dir = path.join(LOCAL_PATHS.projectRoot, "tests", "fixtures", "library");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "kick.wav"), Buffer.from("fixture"), { flag: "w" });
    const scan = await scanLibrary(dir, { limit: 10 });
    expect(scan.running).toBe(false);
    expect(scan.indexed).toBeGreaterThanOrEqual(1);
    const rows = await queryLibrary("kick");
    expect(rows.some((row) => String(row.name) === "kick.wav")).toBe(true);
  });
});
