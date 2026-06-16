import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";

const forbidden = [
  "node_modules",
  "diagnostics/screenshots",
  "diagnostics/runtime",
  "data/cache",
  ".env",
  ".codex",
  ".ssh",
  ".aws",
  ".docker"
];

const required = [
  "package.json",
  "package-lock.json",
  "README.md",
  "SECURITY.md",
  "launch.sh",
  "launch.ps1",
  "launch.cmd",
  "src/index.ts",
  "src/http.ts",
  "bridge/max-for-live/Ableton MCP Bridge.amxd",
  "docs/CLIENTS.md",
  "docs/CONCEPT_TO_MUSIC.md",
  "docs/DOCKER_MCP_PROFILE.md",
  "docs/PORTABILITY.md"
];

const missing = [];
for (const item of required) {
  try {
    await fs.access(path.join(PROJECT_ROOT, item));
  } catch {
    missing.push(item);
  }
}

const presentForbidden = [];
for (const item of forbidden) {
  try {
    await fs.access(path.join(PROJECT_ROOT, item));
    presentForbidden.push(item);
  } catch {
    // absent is good
  }
}

const packageJson = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
};

const scriptChecks = ["build", "test", "lint", "verify:mcp", "doctor", "ready:check", "configure:clients", "docker:profile:plan", "docker:profile:apply", "docker:profile:verify", "sweep:safe", "sweep:all", "live-ready", "live-smoke", "demo:concept", "demo:producer"];
const missingScripts = scriptChecks.filter((script) => !packageJson.scripts?.[script]);

const ok = missing.length === 0 && missingScripts.length === 0;
console.log(JSON.stringify({
  ok,
  missing,
  missingScripts,
  presentForbidden,
  note: "presentForbidden are expected in a working tree but must be excluded from packaged release archives.",
  releaseExcludes: forbidden
}, null, 2));

if (!ok) {
  process.exitCode = 1;
}
