import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(here, "..");

export const LOCAL_PATHS = {
  projectRoot: PROJECT_ROOT,
  liveInstall: "C:\\ProgramData\\Ableton\\Live 12 Trial",
  liveExecutable: "C:\\ProgramData\\Ableton\\Live 12 Trial\\Program\\Ableton Live 12 Trial.exe",
  maxExecutable: "C:\\ProgramData\\Ableton\\Live 12 Trial\\Resources\\Max\\Max.exe",
  userLibrary: "C:\\Users\\LIZ\\Documents\\Ableton\\User Library",
  factoryPacks: "C:\\Users\\LIZ\\Documents\\Ableton\\Factory Packs",
  liveRecordings: "C:\\Users\\LIZ\\Documents\\Ableton\\Live Recordings",
  preferences: "C:\\Users\\LIZ\\AppData\\Roaming\\Ableton\\Live 12.4\\Preferences",
  liveDatabase: "C:\\Users\\LIZ\\AppData\\Local\\Ableton\\Live Database",
  imports: "C:\\Users\\LIZ\\Documents\\Ableton\\User Library\\Samples\\Codex Imports",
  staging: path.join(PROJECT_ROOT, "samples", "staging"),
  diagnostics: path.join(PROJECT_ROOT, "diagnostics")
} as const;

export type AllowedRoot = {
  path: string;
  mode: "readwrite" | "readonly";
};

export function getAllowedRoots(): AllowedRoot[] {
  const explicit = process.env.ABLETON_MCP_ALLOWED_ROOTS;
  const roots = explicit?.split(";").map((value) => value.trim()).filter(Boolean) ?? [
    LOCAL_PATHS.projectRoot,
    "C:\\Users\\LIZ\\Documents\\Ableton",
    LOCAL_PATHS.liveInstall
  ];
  return roots.map((root) => ({
    path: path.resolve(root),
    mode: path.resolve(root).toLowerCase() === path.resolve(LOCAL_PATHS.liveInstall).toLowerCase()
      ? "readonly"
      : "readwrite"
  }));
}

export const FLAGS = {
  write: process.env.ABLETON_MCP_ENABLE_WRITE === "1",
  uiControl: process.env.ABLETON_MCP_ENABLE_UI_CONTROL === "1",
  downloads: process.env.ABLETON_MCP_ENABLE_DOWNLOADS === "1",
  freesoundApiKey: process.env.FREESOUND_API_KEY,
  internetArchiveAccessKey: process.env.INTERNET_ARCHIVE_ACCESS_KEY
} as const;

export const TOOL_TIMEOUT_MS = 10_000;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
