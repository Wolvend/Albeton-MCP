import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const userProfile = process.env.USERPROFILE || os.homedir();
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

function detectProjectRoot() {
  const parent = path.basename(path.dirname(here)).toLowerCase();
  if (parent === "dist") return path.resolve(here, "..", "..");
  return path.resolve(here, "..");
}

export const PROJECT_ROOT = detectProjectRoot();

function envPath(name: string, fallback: string) {
  return process.env[name] && process.env[name]!.trim().length > 0
    ? process.env[name]!
    : fallback;
}

function defaultLiveInstall() {
  if (isWindows) return "C:\\ProgramData\\Ableton\\Live 12 Trial";
  if (isMac) return "/Applications/Ableton Live 12 Trial.app";
  return "";
}

function defaultLiveExecutable() {
  if (isWindows) return "C:\\ProgramData\\Ableton\\Live 12 Trial\\Program\\Ableton Live 12 Trial.exe";
  if (isMac) return "/Applications/Ableton Live 12 Trial.app/Contents/MacOS/Live";
  return "";
}

function defaultMaxExecutable() {
  if (isWindows) return "C:\\ProgramData\\Ableton\\Live 12 Trial\\Resources\\Max\\Max.exe";
  if (isMac) return "/Applications/Ableton Live 12 Trial.app/Contents/App-Resources/Max.app/Contents/MacOS/Max";
  return "";
}

function defaultAbletonDocumentsRoot() {
  if (isMac) return path.join(userProfile, "Music", "Ableton");
  return path.join(userProfile, "Documents", "Ableton");
}

function defaultPreferences() {
  if (isWindows) return path.join(userProfile, "AppData", "Roaming", "Ableton", "Live 12.4", "Preferences");
  if (isMac) return path.join(userProfile, "Library", "Preferences", "Ableton", "Live 12.4");
  return path.join(userProfile, ".config", "Ableton");
}

function defaultLiveDatabase() {
  if (isWindows) return path.join(userProfile, "AppData", "Local", "Ableton", "Live Database");
  if (isMac) return path.join(userProfile, "Library", "Application Support", "Ableton", "Live Database");
  return path.join(userProfile, ".local", "share", "Ableton", "Live Database");
}

export const PLATFORM = {
  nodePlatform: process.platform,
  isWindows,
  isMac,
  isLinux: process.platform === "linux",
  isWsl: Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP),
  userHome: userProfile
} as const;

const abletonDocumentsRoot = envPath("ABLETON_MCP_ABLETON_ROOT", defaultAbletonDocumentsRoot());

export const LOCAL_PATHS = {
  projectRoot: PROJECT_ROOT,
  abletonRoot: abletonDocumentsRoot,
  liveInstall: envPath("ABLETON_MCP_LIVE_INSTALL", defaultLiveInstall()),
  liveExecutable: envPath("ABLETON_MCP_LIVE_EXECUTABLE", defaultLiveExecutable()),
  maxExecutable: envPath("ABLETON_MCP_MAX_EXECUTABLE", defaultMaxExecutable()),
  userLibrary: envPath("ABLETON_MCP_USER_LIBRARY", path.join(abletonDocumentsRoot, "User Library")),
  factoryPacks: envPath("ABLETON_MCP_FACTORY_PACKS", path.join(abletonDocumentsRoot, "Factory Packs")),
  liveRecordings: envPath("ABLETON_MCP_LIVE_RECORDINGS", path.join(abletonDocumentsRoot, "Live Recordings")),
  preferences: envPath("ABLETON_MCP_PREFERENCES", defaultPreferences()),
  liveDatabase: envPath("ABLETON_MCP_LIVE_DATABASE", defaultLiveDatabase()),
  imports: envPath("ABLETON_MCP_IMPORTS", path.join(abletonDocumentsRoot, "User Library", "Samples", "Codex Imports")),
  staging: path.join(PROJECT_ROOT, "samples", "staging"),
  diagnostics: path.join(PROJECT_ROOT, "diagnostics")
} as const;

export const TOOL_PATHS = {
  node: envPath("ABLETON_MCP_NODE", process.execPath),
  npm: envPath("ABLETON_MCP_NPM", isWindows ? "C:\\Program Files\\nodejs\\npm.cmd" : "npm"),
  git: envPath("ABLETON_MCP_GIT", isWindows ? "C:\\Program Files\\Git\\cmd\\git.exe" : "git"),
  ffmpeg: envPath("ABLETON_MCP_FFMPEG", isWindows ? "C:\\ffmpeg_latest\\ffmpeg.exe" : "ffmpeg"),
  ffprobe: envPath("ABLETON_MCP_FFPROBE", isWindows ? "C:\\ffmpeg_latest\\ffprobe.exe" : "ffprobe"),
  powershell: envPath("ABLETON_MCP_POWERSHELL", isWindows ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" : "pwsh")
} as const;

export type AllowedRoot = {
  path: string;
  mode: "readwrite" | "readonly";
};

export function getAllowedRoots(): AllowedRoot[] {
  const baseline = [
    LOCAL_PATHS.projectRoot,
    LOCAL_PATHS.abletonRoot,
    LOCAL_PATHS.liveInstall
  ].filter(Boolean).map((root) => path.resolve(root));
  const explicit = process.env.ABLETON_MCP_ALLOWED_ROOTS;
  const roots = explicit?.split(";").map((value) => value.trim()).filter(Boolean) ?? [
    ...baseline
  ];
  const liveInstallRoot = LOCAL_PATHS.liveInstall ? path.resolve(LOCAL_PATHS.liveInstall).toLowerCase() : null;
  return roots.map((root) => path.resolve(root)).filter((root) => {
    const lower = root.toLowerCase();
    return baseline.some((allowed) => lower === allowed.toLowerCase());
  }).map((root) => ({
    path: root,
    mode: liveInstallRoot && root.toLowerCase() === liveInstallRoot
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
