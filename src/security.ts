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
  const home = path.resolve(PLATFORM.userHome);
  if (!home || home === path.parse(home).root) return value;
  return value.replace(new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "%USERPROFILE%");
}

export function rootsForReport(): AllowedRoot[] {
  return getAllowedRoots().map((root) => ({ ...root, path: redactPath(root.path) }));
}

export function isImportTarget(value: string): boolean {
  const normalized = path.resolve(value).toLowerCase();
  return normalized.startsWith(path.resolve(LOCAL_PATHS.imports).toLowerCase());
}
