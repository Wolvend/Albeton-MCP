import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import fg from "fast-glob";
import { getDb, persistDb } from "./cache.js";
import { LOCAL_PATHS, TOOL_PATHS } from "./config.js";
import { AbletonMcpError } from "./errors.js";
import { paginate } from "./response.js";
import { redactPath, resolveSafePath } from "./security.js";

const execFileAsync = promisify(execFile);

const AudioExtensions = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg", ".opus"]);
const DefaultSkipDirs = new Set(["__macosx", "renders", "plugins", "node_modules", ".git"]);
const MaxIndexLimit = 5_000;

export type SampleIntelligenceBuildOptions = {
  root?: string;
  limit?: number;
  analyze_audio?: boolean;
  include_generated_renders?: boolean;
};

export type SampleIntelligenceSearchOptions = {
  query?: string;
  roles?: string[];
  source_pack?: string;
  page: number;
  pageSize: number;
};

export type SampleChopMapOptions = {
  sample_id?: string;
  path?: string;
  target_bpm?: number;
  bars?: number;
  slice_count?: number;
  role?: string;
};

type FfprobeResult = {
  streams?: Array<{
    codec_type?: string;
    sample_rate?: string;
    channels?: number;
    duration?: string;
  }>;
  format?: {
    duration?: string;
    bit_rate?: string;
  };
};

type SampleRow = {
  id: string;
  path: string;
  display_path: string;
  source_pack: string;
  name: string;
  kind: string;
  extension: string;
  size: number;
  mtime_ms: number;
  duration_seconds: number | null;
  sample_rate: number | null;
  channels: number | null;
  peak_db: number | null;
  loudness_hint: string;
  tags: string;
  roles: string;
  attribution_state: string;
  metadata: string;
  indexed_at: string;
};

let lastSampleIndex: Record<string, unknown> = {
  running: false,
  indexed: 0,
  root: null,
  startedAt: null,
  finishedAt: null
};

function isWithin(candidate: string, root: string) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function safeLimit(value: number | undefined) {
  return Math.max(1, Math.min(MaxIndexLimit, Math.trunc(value ?? 500)));
}

async function defaultSampleRoot() {
  const trove = path.join(LOCAL_PATHS.sampleLibraryRoot, "online-treasure-trove");
  try {
    await fs.access(trove);
    return trove;
  } catch {
    return LOCAL_PATHS.sampleLibraryRoot;
  }
}

function skipRelativePath(relativePath: string, includeGeneratedRenders: boolean) {
  const parts = relativePath.split(/[\\/]+/).map((part) => part.toLowerCase());
  return parts.some((part) => {
    if (part === "renders" && includeGeneratedRenders) return false;
    return DefaultSkipDirs.has(part);
  });
}

function splitTags(filePath: string, root: string) {
  const relative = path.relative(root, filePath);
  const parts = relative.split(/[\\/]+/);
  const raw = [
    ...parts.slice(0, -1),
    path.basename(filePath, path.extname(filePath))
  ].join(" ");
  return [...new Set(raw
    .replace(/[_[\]().-]+/g, " ")
    .split(/\s+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length >= 2 && tag.length <= 40)
  )].slice(0, 32);
}

function inferRoles(tags: string[], sourcePack: string) {
  const haystack = `${sourcePack} ${tags.join(" ")}`.toLowerCase();
  const roles = new Set<string>();
  const addIf = (role: string, pattern: RegExp) => {
    if (pattern.test(haystack)) roles.add(role);
  };
  addIf("bass", /\b(bass|sub|low|808)\b/);
  addIf("pad", /\b(pad|poly|chord|string|organ|drone)\b/);
  addIf("lead", /\b(lead|arp|hook|melody|fair|cz|jupi|ober)\b/);
  addIf("texture", /\b(texture|glitch|noise|haze|atmo|amb|horror|scape)\b/);
  addIf("impact", /\b(hit|knock|door|thud|boom|impact|metal|perc|kick|snare|tom)\b/);
  addIf("bell", /\b(bell|chime|glock|vibe|celeste)\b/);
  addIf("voice", /\b(vocal|voice|radio|broadcast|choir|speech|news)\b/);
  addIf("drum", /\b(drum|hat|clap|kick|snare|tom|loop)\b/);
  if (roles.size === 0) roles.add("candidate");
  return [...roles].slice(0, 8);
}

function sourcePackFor(filePath: string, root: string) {
  const relative = path.relative(root, filePath);
  const first = relative.split(/[\\/]+/).find(Boolean);
  return first ?? "root";
}

type ProbeSummary = Omit<Partial<SampleRow>, "metadata"> & { metadata: Record<string, unknown> };

async function ffprobeAudio(filePath: string): Promise<ProbeSummary> {
  const { stdout } = await execFileAsync(TOOL_PATHS.ffprobe, [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-print_format", "json",
    filePath
  ], { timeout: 15_000, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
  const parsed = JSON.parse(stdout) as FfprobeResult;
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio") ?? parsed.streams?.[0];
  const duration = Number(parsed.format?.duration ?? audio?.duration);
  const sampleRate = Number(audio?.sample_rate);
  return {
    duration_seconds: Number.isFinite(duration) ? duration : null,
    sample_rate: Number.isFinite(sampleRate) ? sampleRate : null,
    channels: typeof audio?.channels === "number" ? audio.channels : null,
    peak_db: null,
    loudness_hint: "not_measured",
    metadata: {
      formatDuration: parsed.format?.duration ?? null,
      bitRate: parsed.format?.bit_rate ?? null,
      codecType: audio?.codec_type ?? "audio"
    }
  };
}

async function attributionState(filePath: string, sourcePack: string) {
  try {
    await fs.access(`${filePath}.attribution.json`);
    return "sidecar_present";
  } catch {
    const lower = sourcePack.toLowerCase();
    if (lower.includes("internet-archive")) return "source_pack_internet_archive";
    if (lower.includes("musicradar") || lower.includes("sampleradar")) return "source_pack_policy";
    return "unverified";
  }
}

function rowForReport(row: SampleRow) {
  return {
    id: row.id,
    path: row.display_path,
    sourcePack: row.source_pack,
    name: row.name,
    kind: row.kind,
    extension: row.extension,
    size: row.size,
    mtimeMs: row.mtime_ms,
    durationSeconds: row.duration_seconds,
    sampleRate: row.sample_rate,
    channels: row.channels,
    peakDb: row.peak_db,
    loudnessHint: row.loudness_hint,
    tags: JSON.parse(row.tags) as string[],
    roles: JSON.parse(row.roles) as string[],
    attributionState: row.attribution_state,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    indexedAt: row.indexed_at
  };
}

export function getSampleIntelligenceStatus() {
  return lastSampleIndex;
}

export async function buildSampleIntelligenceIndex(options: SampleIntelligenceBuildOptions = {}) {
  const requestedRoot = options.root ?? await defaultSampleRoot();
  const safeRoot = await resolveSafePath(requestedRoot, { mustExist: true });
  const sampleRoot = path.resolve(LOCAL_PATHS.sampleLibraryRoot);
  if (!isWithin(path.resolve(safeRoot.real), sampleRoot)) {
    throw new AbletonMcpError("Sample intelligence can only index the configured sample-library root.", "SAMPLE_INDEX_ROOT_NOT_APPROVED", [
      `Use ${redactPath(LOCAL_PATHS.sampleLibraryRoot)} or a child directory.`
    ]);
  }
  const limit = safeLimit(options.limit);
  const startedAt = new Date().toISOString();
  lastSampleIndex = {
    running: true,
    root: redactPath(safeRoot.real),
    indexed: 0,
    limit,
    startedAt,
    finishedAt: null
  };

  const entries = await fg(["**/*.{wav,aif,aiff,flac,mp3,m4a,ogg,opus}"], {
    cwd: safeRoot.real,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    unique: true,
    absolute: true,
    suppressErrors: true
  });
  const eligible = entries
    .filter((entry) => !skipRelativePath(path.relative(safeRoot.real, entry), Boolean(options.include_generated_renders)));
  const selected = eligible.slice(0, limit);

  const rows: SampleRow[] = [];
  const accessIssues: Array<Record<string, unknown>> = [];
  for (const entry of selected) {
    try {
      const safe = await resolveSafePath(entry, { mustExist: true });
      if (!isWithin(safe.real, safeRoot.real)) {
        accessIssues.push({ path: redactPath(entry), error: "Resolved path escaped sample index root." });
        continue;
      }
      const extension = path.extname(safe.real).toLowerCase();
      if (!AudioExtensions.has(extension)) continue;
      const stat = await fs.stat(safe.real);
      const sourcePack = sourcePackFor(safe.real, safeRoot.real);
      const tags = splitTags(safe.real, safeRoot.real);
      const roles = inferRoles(tags, sourcePack);
      const probe = options.analyze_audio === false
        ? { metadata: { skipped: true }, duration_seconds: null, sample_rate: null, channels: null, peak_db: null, loudness_hint: "not_measured" }
        : await ffprobeAudio(safe.real);
      rows.push({
        id: crypto.createHash("sha256").update(`${safe.real}:${stat.size}:${stat.mtimeMs}`).digest("hex"),
        path: safe.real,
        display_path: redactPath(safe.real),
        source_pack: sourcePack,
        name: path.basename(safe.real),
        kind: "sample",
        extension,
        size: stat.size,
        mtime_ms: Math.trunc(stat.mtimeMs),
        duration_seconds: probe.duration_seconds ?? null,
        sample_rate: probe.sample_rate ?? null,
        channels: probe.channels ?? null,
        peak_db: probe.peak_db ?? null,
        loudness_hint: probe.loudness_hint ?? "not_measured",
        tags: JSON.stringify(tags),
        roles: JSON.stringify(roles),
        attribution_state: await attributionState(safe.real, sourcePack),
        metadata: JSON.stringify(probe.metadata ?? {}),
        indexed_at: startedAt
      });
    } catch (error) {
      accessIssues.push({ path: redactPath(entry), error: error instanceof Error ? error.message : String(error) });
    }
  }

  const db = await getDb();
  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sample_intelligence
    (id,path,display_path,source_pack,name,kind,extension,size,mtime_ms,duration_seconds,sample_rate,channels,peak_db,loudness_hint,tags,roles,attribution_state,metadata,indexed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const row of rows) {
    stmt.run([
      row.id,
      row.path,
      row.display_path,
      row.source_pack,
      row.name,
      row.kind,
      row.extension,
      row.size,
      row.mtime_ms,
      row.duration_seconds,
      row.sample_rate,
      row.channels,
      row.peak_db,
      row.loudness_hint,
      row.tags,
      row.roles,
      row.attribution_state,
      row.metadata,
      row.indexed_at
    ]);
  }
  stmt.free();
  db.run("COMMIT");
  await persistDb();
  lastSampleIndex = {
    running: false,
    root: redactPath(safeRoot.real),
    indexed: rows.length,
    totalSeen: entries.length,
    eligible: eligible.length,
    selected: selected.length,
    truncated: eligible.length > selected.length,
    accessIssues,
    startedAt,
    finishedAt: new Date().toISOString()
  };
  return lastSampleIndex;
}

function getAllRows() {
  return getDb().then((db) => {
    const stmt = db.prepare("SELECT * FROM sample_intelligence ORDER BY indexed_at DESC, name ASC LIMIT 2000");
    const rows: SampleRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as SampleRow);
    stmt.free();
    return rows;
  });
}

export async function searchSampleIntelligence(options: SampleIntelligenceSearchOptions) {
  const query = (options.query ?? "").trim().toLowerCase();
  const roleFilters = (options.roles ?? []).map((role) => role.toLowerCase());
  const sourcePack = options.source_pack?.trim().toLowerCase();
  const rows = await getAllRows();
  const filtered = rows.filter((row) => {
    const tags = JSON.parse(row.tags) as string[];
    const roles = JSON.parse(row.roles) as string[];
    const haystack = `${row.name} ${row.source_pack} ${tags.join(" ")} ${roles.join(" ")}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (sourcePack && !row.source_pack.toLowerCase().includes(sourcePack)) return false;
    if (roleFilters.length > 0 && !roleFilters.some((role) => roles.map((item) => item.toLowerCase()).includes(role))) return false;
    return true;
  }).map(rowForReport);
  return {
    status: lastSampleIndex,
    ...paginate(filtered, options.page, options.pageSize)
  };
}

export async function getSampleIntelligenceItem(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) {
    throw new AbletonMcpError("Invalid sample intelligence id.", "SAMPLE_INDEX_ID_INVALID");
  }
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM sample_intelligence WHERE id=? LIMIT 1");
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() as unknown as SampleRow : null;
  stmt.free();
  if (!row) {
    throw new AbletonMcpError("Sample intelligence item was not found.", "SAMPLE_INDEX_ITEM_NOT_FOUND", ["Build or refresh the sample intelligence index first."]);
  }
  return rowForReport(row);
}

async function itemForChop(options: SampleChopMapOptions) {
  if (options.sample_id) return getSampleIntelligenceItem(options.sample_id);
  if (!options.path) throw new AbletonMcpError("sample_id or path is required.", "SAMPLE_CHOP_TARGET_REQUIRED");
  const safe = await resolveSafePath(options.path, { mustExist: true });
  const probe = await ffprobeAudio(safe.real);
  return {
    id: null,
    path: redactPath(safe.real),
    name: path.basename(safe.real),
    durationSeconds: probe.duration_seconds,
    sampleRate: probe.sample_rate,
    channels: probe.channels,
    roles: inferRoles(splitTags(safe.real, path.dirname(safe.real)), path.basename(path.dirname(safe.real))),
    tags: splitTags(safe.real, path.dirname(safe.real))
  };
}

export async function planSampleChopMap(options: SampleChopMapOptions) {
  const item = await itemForChop(options);
  const duration = Number(item.durationSeconds ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new AbletonMcpError("Sample duration is required for chop planning.", "SAMPLE_CHOP_DURATION_UNKNOWN", ["Run the index with analyze_audio=true or choose a decodable audio file."]);
  }
  const bpm = options.target_bpm;
  const bars = Math.max(1, Math.min(64, Math.trunc(options.bars ?? 4)));
  const requestedSlices = Math.max(1, Math.min(64, Math.trunc(options.slice_count ?? 8)));
  const phraseSeconds = bpm ? 60 / bpm * 4 * bars : duration;
  const workingLength = Math.min(duration, phraseSeconds);
  const sliceCount = Math.min(requestedSlices, Math.max(1, Math.floor(workingLength / 0.25)));
  const sliceLength = workingLength / sliceCount;
  const role = options.role ?? (Array.isArray(item.roles) ? item.roles[0] : "sample");
  const slices = Array.from({ length: sliceCount }, (_, index) => ({
    index,
    startSeconds: Number((index * sliceLength).toFixed(3)),
    durationSeconds: Number(sliceLength.toFixed(3)),
    role: index % 4 === 0 ? `${role}_anchor` : index % 2 === 0 ? `${role}_variation` : `${role}_connector`,
    suggestedTreatment: index % 3 === 0 ? "reverse_tail_or_filter_fade" : index % 3 === 1 ? "pitch_or_formant_shift" : "clean_chop"
  }));
  return {
    sample: item,
    dryRun: true,
    target: { bpm: bpm ?? null, bars, requestedSlices, workingLengthSeconds: Number(workingLength.toFixed(3)) },
    slices,
    nextToolCalls: [
      { name: "ableton_convert_audio_file", arguments: { input: item.path, output: "%ABLETON_MCP_SAMPLE_LIBRARY_ROOT%\\concepts\\<project>\\chop.wav", format: "wav", preset: "clean", dry_run: true } },
      { name: "ableton_design_sampler_instrument", arguments: { samples: [{ path: item.path, title: item.name }], role: role ?? "sample_chops" } }
    ],
    safety: {
      writes: false,
      downloads: false,
      uiMouse: false,
      note: "This is a chop plan only; it does not render, write, import, or move audio."
    }
  };
}
