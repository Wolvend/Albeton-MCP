import fs from "node:fs/promises";
import path from "node:path";
import { getAllowedRoots, LOCAL_PATHS, PLATFORM, type AllowedRoot } from "./config.js";
import { AbletonMcpError } from "./errors.js";

const forbiddenFragments = [
  "\\.codex\\",
  "\\.ssh\\",
  "\\.aws\\",
  "\\.docker\\",
  "\\appdata\\",
  "\\browser\\",
  "\\chrome\\user data\\",
  "\\edge\\user data\\",
  "\\password"
];

function hasForbiddenFragment(resolved: string): boolean {
  const lower = `${resolved.toLowerCase().replace(/[\\/]+/g, "\\")}\\`;
  const home = `${path.resolve(PLATFORM.userHome).toLowerCase().replace(/[\\/]+/g, "\\")}\\`;
  if (lower === "c:\\" || lower === home) return true;
  return forbiddenFragments.some((fragment) => lower.includes(fragment));
}

function isWithin(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function windowsPathToWslPath(value: string) {
  const match = value.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return value;
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll("\\", "/")}`;
}

function redactionRoots() {
  const roots = new Map<string, string>();
  const addRoot = (candidate: string | undefined, token: string) => {
    if (!candidate) return;
    for (const variant of [
      candidate,
      candidate.replaceAll("\\", "/"),
      candidate.replaceAll("/", "\\"),
      windowsPathToWslPath(candidate)
    ]) {
      if (!variant || variant === path.parse(variant).root) continue;
      roots.set(variant, token);
    }
  };
  const mountedWindowsUser = LOCAL_PATHS.projectRoot.replaceAll("\\", "/").match(/^(\/mnt\/[A-Za-z]\/Users\/[^/]+)/)?.[1];
  const driveWindowsUser = LOCAL_PATHS.projectRoot.replaceAll("\\", "/").match(/^([A-Za-z]:\/Users\/[^/]+)/)?.[1];
  for (const candidate of [
    PLATFORM.userHome,
    process.env.USERPROFILE,
    process.env.HOME,
    mountedWindowsUser,
    driveWindowsUser
  ]) {
    addRoot(candidate, "%USERPROFILE%");
  }
  addRoot(LOCAL_PATHS.sampleLibraryRoot, "%ABLETON_MCP_SAMPLE_LIBRARY_ROOT%");
  addRoot(LOCAL_PATHS.pluginStaging, "%ABLETON_MCP_PLUGIN_STAGING_ROOT%");
  return [...roots.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .map(([root, token]) => ({ root, token }));
}

export async function resolveSafePath(inputPath: string, options: { mustExist?: boolean; forWrite?: boolean } = {}) {
  if (!inputPath || inputPath.trim().length === 0) {
    throw new AbletonMcpError("Path is required.", "PATH_REQUIRED");
  }
  const absolute = path.resolve(inputPath);
  if (hasForbiddenFragment(absolute)) {
    throw new AbletonMcpError(`Forbidden path rejected: ${redactPath(absolute)}`, "FORBIDDEN_PATH", ["Use a path under the configured Ableton MCP allowed roots."]);
  }

  let real = absolute;
  try {
    real = await fs.realpath(absolute);
  } catch {
    if (options.mustExist !== false) {
      throw new AbletonMcpError(`Path does not exist or cannot be resolved: ${redactPath(absolute)}`, "PATH_NOT_FOUND", ["Check the path and verify it is inside an allowed root."]);
    }
    const parent = await fs.realpath(path.dirname(absolute));
    real = path.join(parent, path.basename(absolute));
  }

  if (hasForbiddenFragment(real)) {
    throw new AbletonMcpError(`Forbidden resolved path rejected: ${redactPath(real)}`, "FORBIDDEN_PATH", ["Resolved paths cannot escape into secrets, profiles, or broad AppData."]);
  }

  const roots = getAllowedRoots();
  const root = roots.find((candidate) => isWithin(real, candidate.path));
  if (!root) {
    throw new AbletonMcpError(`Path is outside allowed roots: ${redactPath(real)}`, "PATH_OUTSIDE_ALLOWLIST", [`Allowed roots: ${roots.map((item) => redactPath(item.path)).join("; ")}`]);
  }
  if (options.forWrite && root.mode === "readonly") {
    throw new AbletonMcpError(`Path is under a read-only root: ${redactPath(real)}`, "READONLY_ROOT", ["Choose a project, staging, diagnostics, or Ableton User Library path instead."]);
  }
  return { requested: absolute, real, root };
}

export function redactPath(value: string): string {
  let redacted = value;
  for (const { root, token } of redactionRoots()) {
    redacted = redacted.replace(new RegExp(escapeRegExp(root), "gi"), token);
  }
  return redacted;
}

export function rootsForReport(): AllowedRoot[] {
  return getAllowedRoots().map((root) => ({ ...root, path: redactPath(root.path) }));
}

export function isImportTarget(value: string): boolean {
  const normalized = path.resolve(value).toLowerCase();
  return normalized.startsWith(path.resolve(LOCAL_PATHS.imports).toLowerCase());
}
