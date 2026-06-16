import http from "node:http";
import { environmentSnapshot } from "../src/environment.js";
import { LOCAL_PATHS, PLATFORM } from "../src/config.js";
import { getBridgeInstallPlan } from "../src/bridge-install.js";
import { registeredToolNames } from "../src/tools.js";

function checkPort(host: string, port: number, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ host, port, method: "GET", path: "/health", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

function status(ok: boolean, warning = false) {
  if (ok) return "pass";
  return warning ? "warn" : "fail";
}

const env = await environmentSnapshot();
const bridgeInstall = await getBridgeInstallPlan({ dryRun: true });
const httpPort = Number(process.env.ABLETON_MCP_HTTP_PORT ?? "17366");
const uiPort = Number(process.env.ABLETON_MCP_UI_DRIVER_PORT ?? "17365");
const bridgePort = Number(process.env.ABLETON_MCP_BRIDGE_PORT ?? "17364");

const checks = [
  {
    name: "tool_catalog",
    status: status(registeredToolNames.length >= 100),
    detail: `${registeredToolNames.length} tools registered`
  },
  {
    name: "node",
    status: status(Boolean(env.tools.node.ok)),
    detail: env.tools.node.output
  },
  {
    name: "ffprobe",
    status: status(Boolean(env.tools.ffprobe.ok), true),
    detail: env.tools.ffprobe.output
  },
  {
    name: "ableton_paths",
    status: status(Boolean(env.paths.userLibrary.exists), true),
    detail: `${env.paths.userLibrary.path}`
  },
  {
    name: "sample_library_root",
    status: status(Boolean(env.paths.staging.exists), true),
    detail: `${env.paths.staging.path}`
  },
  {
    name: "bridge_sources",
    status: status(bridgeInstall.missingSources.length === 0),
    detail: bridgeInstall.missingSources.length ? `missing: ${bridgeInstall.missingSources.join(", ")}` : "all required bridge source files found"
  },
  {
    name: "http_transport",
    status: status(await checkPort("127.0.0.1", httpPort), true),
    detail: `127.0.0.1:${httpPort}`
  },
  {
    name: "ui_driver",
    status: status(await checkPort("127.0.0.1", uiPort), true),
    detail: `127.0.0.1:${uiPort}`
  },
  {
    name: "max_for_live_bridge",
    status: status(await checkPort("127.0.0.1", bridgePort), true),
    detail: `127.0.0.1:${bridgePort}`
  }
] as const;

const failed = checks.filter((check) => check.status === "fail");
const warned = checks.filter((check) => check.status === "warn");

console.log(JSON.stringify({
  ok: failed.length === 0,
  platform: PLATFORM,
  projectRoot: LOCAL_PATHS.projectRoot,
  summary: {
    checks: checks.length,
    failed: failed.length,
    warnings: warned.length
  },
  checks,
  nextSteps: [
    "Run npm run build, npm test, npm run lint, and npm run verify:mcp before release.",
    "Run npm run bridge:install on the Ableton host before using LiveAPI bridge tools.",
    "Keep remote HTTP disabled unless using Tailscale/VPN/private LAN with a bearer token."
  ]
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
