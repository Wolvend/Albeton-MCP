import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { LOCAL_PATHS, FLAGS, getAllowedRoots, TOOL_PATHS } from "./config.js";
import { rootsForReport } from "./security.js";

const execFileAsync = promisify(execFile);

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandVersion(command: string, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 5_000, env: { SystemRoot: process.env.SystemRoot } });
    return { ok: true, output: `${stdout}${stderr}`.split(/\r?\n/).find(Boolean) ?? "" };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}

export async function getLiveProcesses() {
  const { stdout } = await execFileAsync(TOOL_PATHS.powershell, [
    "-NoProfile",
    "-Command",
    "Get-Process | Where-Object { $_.ProcessName -like '*Ableton*' -or $_.Path -like '*Ableton Live*' } | Select-Object ProcessName,Id,Path | ConvertTo-Json -Compress"
  ], { timeout: 5_000, env: { SystemRoot: process.env.SystemRoot } });
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function environmentSnapshot() {
  const paths = Object.fromEntries(await Promise.all(Object.entries(LOCAL_PATHS).map(async ([key, value]) => [key, { path: value, exists: await exists(value) }])));
  const processes = await getLiveProcesses();
  return {
    paths,
    liveRunning: processes.some((proc) => String(proc.ProcessName ?? "").toLowerCase().includes("ableton live")),
    abletonProcesses: processes,
    tools: {
      node: await commandVersion(TOOL_PATHS.node, ["--version"]),
      npm: await commandVersion(TOOL_PATHS.npm, ["--version"]),
      git: await commandVersion(TOOL_PATHS.git, ["--version"]),
      ffmpeg: await commandVersion(TOOL_PATHS.ffmpeg, ["-version"]),
      ffprobe: await commandVersion(TOOL_PATHS.ffprobe, ["-version"])
    },
    flags: {
      write: FLAGS.write,
      uiControl: FLAGS.uiControl,
      downloads: FLAGS.downloads,
      freesoundApiKeyConfigured: Boolean(FLAGS.freesoundApiKey),
      internetArchiveAccessKeyConfigured: Boolean(FLAGS.internetArchiveAccessKey)
    },
    allowedRoots: rootsForReport(),
    configuredAllowedRoots: getAllowedRoots().length
  };
}
