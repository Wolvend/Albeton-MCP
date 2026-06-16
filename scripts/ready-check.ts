import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PROJECT_ROOT, LOCAL_PATHS, TOOL_PATHS } from "../src/config.js";
import { environmentSnapshot } from "../src/environment.js";
import { getBridgeRuntimeState } from "../src/bridge.js";
import { registeredToolNames } from "../src/tools.js";

const execFileAsync = promisify(execFile);

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandVersion(command: string, args: string[]) {
  const options = { timeout: 15_000, env: { ...process.env } };
  const isWindowsScript = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const { stdout, stderr } = isWindowsScript
    ? await execFileAsync(TOOL_PATHS.powershell, [
      "-NoProfile",
      "-Command",
      `& ${psQuote(command)} ${args.map(psQuote).join(" ")}`
    ], options)
    : await execFileAsync(command, args, options);
  return (stdout || stderr).split(/\r?\n/).find(Boolean) ?? "ok";
}

async function checkCommand(name: string, command: string, args: string[]): Promise<Check> {
  try {
    return { name, status: "pass", detail: await commandVersion(command, args) };
  } catch (error) {
    return { name, status: "fail", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkGeneratedClients(): Promise<Check> {
  const generated = path.join(PROJECT_ROOT, "config", "generated");
  const required = ["codex.json", "claude-desktop.json", "cursor.json", "wsl-stdio.json"];
  const missing = [];
  for (const file of required) {
    if (!await exists(path.join(generated, file))) missing.push(file);
  }
  if (missing.length) {
    return { name: "generated_client_configs", status: "warn", detail: `missing: ${missing.join(", ")}; run npm run configure:clients` };
  }
  return { name: "generated_client_configs", status: "pass", detail: generated };
}

async function checkSampleRoot(): Promise<Check> {
  if (!process.env.ABLETON_MCP_SAMPLE_LIBRARY_ROOT) {
    return { name: "sample_library_root_env", status: "warn", detail: "ABLETON_MCP_SAMPLE_LIBRARY_ROOT is not set; default project staging will be used." };
  }
  if (!await exists(LOCAL_PATHS.sampleLibraryRoot)) {
    return { name: "sample_library_root", status: "fail", detail: `${LOCAL_PATHS.sampleLibraryRoot} does not exist.` };
  }
  return { name: "sample_library_root", status: "pass", detail: LOCAL_PATHS.sampleLibraryRoot };
}

async function checkBuildOutput(): Promise<Check> {
  const entry = path.join(PROJECT_ROOT, "dist", "src", "index.js");
  return await exists(entry)
    ? { name: "build_output", status: "pass", detail: entry }
    : { name: "build_output", status: "fail", detail: "dist/src/index.js missing; run npm run build." };
}

async function checkPackageScript(script: string): Promise<Check> {
  const packageJson = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  return packageJson.scripts?.[script]
    ? { name: `script:${script}`, status: "pass", detail: packageJson.scripts[script] }
    : { name: `script:${script}`, status: "fail", detail: "missing package script" };
}

async function checkFreeSpace(): Promise<Check> {
  if (process.platform !== "win32") return { name: "sample_root_free_space", status: "warn", detail: "free-space check is Windows-only in this script." };
  const drive = path.parse(LOCAL_PATHS.sampleLibraryRoot).root.replace(/\\$/, "");
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `$d=Get-PSDrive -Name '${drive.replace(":", "")}'; [math]::Round($d.Free/1GB,2)`
    ], { timeout: 15_000 });
    const freeGb = Number(stdout.trim());
    return {
      name: "sample_root_free_space",
      status: freeGb >= 10 ? "pass" : "warn",
      detail: `${freeGb} GB free on ${drive}`
    };
  } catch (error) {
    return { name: "sample_root_free_space", status: "warn", detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function buildReadyCheckReport() {
  const checks: Check[] = [];
  checks.push(await checkCommand("node", process.execPath, ["--version"]));
  checks.push(await checkCommand("npm", TOOL_PATHS.npm, ["--version"]));
  checks.push(await checkCommand("ffprobe", TOOL_PATHS.ffprobe, ["-version"]));
  checks.push(await checkBuildOutput());
  checks.push(await checkSampleRoot());
  checks.push(await checkFreeSpace());
  checks.push(await checkGeneratedClients());
  for (const script of ["build", "doctor", "verify:mcp", "sweep:safe", "sweep:all", "ready:check"]) {
    checks.push(await checkPackageScript(script));
  }
  checks.push({
    name: "tool_catalog",
    status: registeredToolNames.length >= 300 ? "pass" : "warn",
    detail: `${registeredToolNames.length} tools registered`
  });
  const bridge = getBridgeRuntimeState();
  checks.push({
    name: "bridge_listener",
    status: bridge.queueDepth === 0 ? "pass" : "warn",
    detail: `127.0.0.1:${bridge.port}, queueDepth=${bridge.queueDepth}`
  });
  const env = await environmentSnapshot();
  const failed = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  return {
    ok: failed === 0,
    generatedAt: new Date().toISOString(),
    projectRoot: PROJECT_ROOT,
    checks,
    summary: { total: checks.length, failed, warnings },
    environment: {
      platform: env.platform,
      paths: {
        projectRoot: PROJECT_ROOT,
        sampleLibraryRoot: LOCAL_PATHS.sampleLibraryRoot,
        abletonRoot: LOCAL_PATHS.abletonRoot
      }
    },
    nextSteps: [
      failed ? "Fix failed checks, then rerun npm run ready:check." : "Ready check passed for local MCP startup.",
      warnings ? "Review warning checks before live Ableton work." : "No warning checks reported.",
      "Run npm run live-smoke only after Ableton is open and the Max for Live bridge is loaded."
    ]
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const report = await buildReadyCheckReport();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
