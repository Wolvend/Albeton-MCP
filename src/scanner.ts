import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { LOCAL_PATHS } from "./config.js";
import { resolveSafePath, redactPath } from "./security.js";
import { upsertLibraryItems } from "./cache.js";

const kindByExtension: Record<string, string> = {
  ".wav": "sample",
  ".aif": "sample",
  ".aiff": "sample",
  ".flac": "sample",
  ".mp3": "sample",
  ".ogg": "sample",
  ".mid": "midi",
  ".midi": "midi",
  ".als": "set",
  ".alc": "clip",
  ".adg": "preset",
  ".adv": "preset",
  ".amxd": "max_device",
  ".agr": "groove",
  ".alp": "pack",
  ".ascl": "tuning",
  ".ablbundle": "pack",
  ".vstpreset": "plugin_preset",
  ".vst3": "plugin",
  ".component": "plugin"
};

let lastScan: Record<string, unknown> = { running: false, indexed: 0, startedAt: null, finishedAt: null };

export function classifyFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return kindByExtension[ext] ?? "other";
}

export async function scanLibrary(root: string = LOCAL_PATHS.userLibrary, options: { limit?: number } = {}) {
  const safe = await resolveSafePath(root, { mustExist: true });
  lastScan = { running: true, indexed: 0, root: redactPath(safe.real), startedAt: new Date().toISOString(), finishedAt: null };
  const entries = await fg(["**/*"], {
    cwd: safe.real,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    unique: true,
    absolute: true,
    suppressErrors: true
  });
  const limit = Math.min(options.limit ?? 2_000, 10_000);
  const selected = entries.slice(0, limit);
  const items = [];
  for (const file of selected) {
    const resolved = await resolveSafePath(file, { mustExist: true });
    const stat = await fs.stat(resolved.real);
    const hash = crypto.createHash("sha256").update(`${resolved.real}:${stat.size}:${stat.mtimeMs}`).digest("hex");
    items.push({
      id: hash,
      path: resolved.real,
      displayPath: redactPath(resolved.real),
      name: path.basename(resolved.real),
      kind: classifyFile(resolved.real),
      size: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
      indexedAt: new Date().toISOString(),
      metadata: { extension: path.extname(resolved.real).toLowerCase() }
    });
  }
  await upsertLibraryItems(items);
  lastScan = { ...lastScan, running: false, indexed: items.length, totalSeen: entries.length, truncated: entries.length > selected.length, finishedAt: new Date().toISOString() };
  return lastScan;
}

export function getScanStatus() {
  return lastScan;
}
