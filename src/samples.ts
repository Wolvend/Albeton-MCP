import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FLAGS, LOCAL_PATHS } from "./config.js";
import { AbletonMcpError, requireFlag } from "./errors.js";
import { analyzeAudioFile } from "./analysis.js";
import { fetchAllowedSampleUrl } from "./network.js";
import { readJsonBounded } from "./network.js";
import { isImportTarget, redactPath, resolveSafePath } from "./security.js";

const allowedLicenses = ["CC0", "Creative Commons 0", "creativecommons.org/publicdomain/zero", "CC BY", "creativecommons.org/licenses/by", "Attribution", "Public Domain", "Public Domain Mark"];
const MAX_ATTRIBUTION_SIDECARS = 500;
const MAX_ATTRIBUTION_BYTES = 128_000;
const IA_AUDIO_EXTENSIONS = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg", ".opus"]);
const MAX_IA_AUDIO_FILES = 100;

type AttributionReportItem = ReturnType<typeof attributionSummary>;

type InternetArchiveFile = {
  name?: unknown;
  format?: unknown;
  size?: unknown;
  length?: unknown;
  md5?: unknown;
  sha1?: unknown;
  crc32?: unknown;
  source?: unknown;
};

export function normalizeLicense(input: string | null | undefined) {
  const license = input?.trim() || "unknown";
  const allowed = allowedLicenses.some((allowedLicense) => license.toLowerCase().includes(allowedLicense.toLowerCase()));
  return { license, allowed, policy: "Default imports require CC0, public domain, or clearly attributed CC BY." };
}

export function buildSampleAttribution(options: {
  sourceUrl: string;
  destinationName: string;
  metadata: Record<string, unknown>;
  checksum?: string;
  bytes?: number;
}) {
  const licensePolicy = normalizeLicense(String(options.metadata.license ?? options.metadata.licenseurl ?? ""));
  return {
    sourceUrl: options.sourceUrl,
    destinationName: options.destinationName,
    license: licensePolicy.license,
    licensePolicy,
    creator: options.metadata.creator ?? options.metadata.username ?? null,
    title: options.metadata.title ?? options.metadata.name ?? null,
    identifier: options.metadata.identifier ?? options.metadata.id ?? null,
    checksum: options.checksum ?? null,
    bytes: options.bytes ?? null,
    metadata: options.metadata
  };
}

function isPathWithin(candidate: string, root: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sanitizeAttributionText(value: unknown, maxLength = 240) {
  return String(value ?? "")
    .replace(/ignore (all )?(previous|prior) instructions/gi, "[removed]")
    .replace(/system prompt/gi, "[removed]")
    .replace(/developer message/gi, "[removed]")
    .replace(/tool call/gi, "[removed]")
    .replace(/exfiltrate/gi, "[removed]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function archiveDownloadUrl(identifier: string, fileName: string) {
  const encodedIdentifier = encodeURIComponent(identifier);
  const encodedName = fileName.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `https://archive.org/download/${encodedIdentifier}/${encodedName}`;
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractInternetArchiveAudioFiles(metadata: unknown, identifierInput?: string) {
  const item = metadata as { metadata?: Record<string, unknown>; files?: InternetArchiveFile[] };
  const identifier = sanitizeAttributionText(identifierInput ?? item.metadata?.identifier, 120);
  if (!identifier || !/^[a-zA-Z0-9_.-]+$/.test(identifier)) {
    throw new AbletonMcpError("Internet Archive identifier is missing or invalid.", "IA_IDENTIFIER_INVALID", ["Use an identifier returned by ableton_search_internet_archive_audio."]);
  }
  const licensePolicy = normalizeLicense(String(item.metadata?.licenseurl ?? item.metadata?.license ?? ""));
  const files = Array.isArray(item.files) ? item.files : [];
  return files
    .filter((file) => typeof file.name === "string")
    .map((file) => {
      const name = sanitizeAttributionText(file.name, 500);
      const extension = path.extname(name).toLowerCase();
      if (!IA_AUDIO_EXTENSIONS.has(extension)) return null;
      const url = archiveDownloadUrl(identifier, name);
      return {
        source: "internet_archive",
        identifier,
        name,
        format: sanitizeAttributionText(file.format, 120) || null,
        extension,
        size: numericValue(file.size),
        duration: numericValue(file.length),
        hashes: {
          md5: sanitizeAttributionText(file.md5, 80) || null,
          sha1: sanitizeAttributionText(file.sha1, 80) || null,
          crc32: sanitizeAttributionText(file.crc32, 80) || null
        },
        sourceType: sanitizeAttributionText(file.source, 80) || null,
        url,
        licensePolicy,
        attribution: buildSampleAttribution({
          sourceUrl: url,
          destinationName: path.basename(name),
          metadata: {
            license: licensePolicy.license,
            licenseurl: item.metadata?.licenseurl,
            creator: item.metadata?.creator,
            title: item.metadata?.title,
            identifier
          }
        })
      };
    })
    .filter((file): file is NonNullable<typeof file> => file !== null)
    .slice(0, MAX_IA_AUDIO_FILES);
}

function attributionSummary(record: Record<string, unknown>, sidecarPath: string, mediaPath: string, scope: string) {
  return {
    scope,
    sidecarPath: redactPath(sidecarPath),
    mediaPath: redactPath(mediaPath),
    sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null,
    destinationName: sanitizeAttributionText(record.destinationName, 180) || path.basename(mediaPath),
    title: sanitizeAttributionText(record.title, 240) || null,
    creator: sanitizeAttributionText(record.creator, 180) || null,
    identifier: sanitizeAttributionText(record.identifier, 180) || null,
    license: sanitizeAttributionText(record.license ?? (record.licensePolicy as any)?.license, 220) || "unknown",
    licensePolicy: normalizeLicense(String(record.license ?? (record.licensePolicy as any)?.license ?? "")),
    checksum: typeof record.checksum === "string" ? record.checksum : null,
    bytes: typeof record.bytes === "number" ? record.bytes : null,
    stagedAt: typeof record.stagedAt === "string" ? record.stagedAt : null,
    importedAt: typeof record.importedAt === "string" ? record.importedAt : null
  };
}

async function collectAttributionSidecars(root: string, scope: string, accessIssues: Array<Record<string, unknown>>) {
  const items: AttributionReportItem[] = [];
  const resolvedRoot = path.resolve(root);

  async function walk(dir: string, depth: number) {
    if (items.length >= MAX_ATTRIBUTION_SIDECARS || depth > 5) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (depth === 0) accessIssues.push({ scope, path: redactPath(dir), error: error instanceof Error ? error.message : String(error) });
      return;
    }

    for (const entry of entries) {
      if (items.length >= MAX_ATTRIBUTION_SIDECARS) return;
      const candidate = path.join(dir, entry.name);
      let safe;
      try {
        safe = await resolveSafePath(candidate, { mustExist: true });
      } catch (error) {
        accessIssues.push({ scope, path: redactPath(candidate), error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (!isPathWithin(safe.real, resolvedRoot)) {
        accessIssues.push({ scope, path: redactPath(candidate), error: "Resolved path escapes attribution root." });
        continue;
      }
      if (entry.isDirectory()) {
        await walk(safe.real, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".attribution.json")) continue;
      try {
        const stat = await fs.stat(safe.real);
        if (stat.size > MAX_ATTRIBUTION_BYTES) {
          accessIssues.push({ scope, path: redactPath(safe.real), error: "Attribution sidecar exceeds size limit." });
          continue;
        }
        const parsed = JSON.parse(await fs.readFile(safe.real, "utf8")) as Record<string, unknown>;
        const mediaPath = safe.real.slice(0, -".attribution.json".length);
        items.push(attributionSummary(parsed, safe.real, mediaPath, scope));
      } catch (error) {
        accessIssues.push({ scope, path: redactPath(safe.real), error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  await walk(resolvedRoot, 0);
  return items;
}

export async function generateAttributionReport(page = 1, pageSize = 25) {
  const accessIssues: Array<Record<string, unknown>> = [];
  const roots = [
    { scope: "staging", path: LOCAL_PATHS.staging },
    { scope: "imports", path: LOCAL_PATHS.imports }
  ];
  const items = (await Promise.all(roots.map((root) => collectAttributionSidecars(root.path, root.scope, accessIssues))))
    .flat()
    .sort((left, right) => `${left.scope}:${left.destinationName}`.localeCompare(`${right.scope}:${right.destinationName}`));
  const safePage = Math.max(1, Math.trunc(page || 1));
  const safeSize = Math.max(1, Math.min(100, Math.trunc(pageSize || 25)));
  const offset = (safePage - 1) * safeSize;
  return {
    roots: roots.map((root) => ({ scope: root.scope, path: redactPath(root.path) })),
    limits: { maxSidecars: MAX_ATTRIBUTION_SIDECARS, maxSidecarBytes: MAX_ATTRIBUTION_BYTES },
    items: items.slice(offset, offset + safeSize),
    page: safePage,
    pageSize: safeSize,
    total: items.length,
    hasMore: offset + safeSize < items.length,
    accessIssues
  };
}

export async function searchFreesound(query: string, page = 1, pageSize = 15) {
  const params = new URLSearchParams({
    query,
    page: String(page),
    page_size: String(Math.min(pageSize, 50)),
    fields: "id,name,username,license,url,duration,previews,type,filesize,tags"
  });
  const headers: Record<string, string> = {};
  if (FLAGS.freesoundApiKey) headers.Authorization = `Token ${FLAGS.freesoundApiKey}`;
  const response = await fetch(`https://freesound.org/apiv2/search/text/?${params}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new AbletonMcpError(`Freesound search failed with HTTP ${response.status}.`, "FREESOUND_ERROR", ["Configure FREESOUND_API_KEY if the endpoint requires authentication or rate limits anonymous use."]);
  }
  const data = await readJsonBounded(response) as any;
  return {
    source: "freesound",
    count: data.count ?? 0,
    results: (data.results ?? []).map((item: any) => ({ ...item, licensePolicy: normalizeLicense(item.license) }))
  };
}

export async function searchInternetArchiveAudio(query: string, page = 1, rows = 15) {
  const params = new URLSearchParams({
    q: `${query} AND mediatype:audio`,
    fl: "identifier,title,creator,licenseurl,publicdate,downloads,item_size",
    output: "json",
    page: String(page),
    rows: String(Math.min(rows, 50))
  });
  const response = await fetch(`https://archive.org/advancedsearch.php?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new AbletonMcpError(`Internet Archive search failed with HTTP ${response.status}.`, "IA_SEARCH_ERROR");
  const data = await readJsonBounded(response) as any;
  return { source: "internet_archive", responseHeader: data.responseHeader, results: data.response?.docs ?? [] };
}

export async function getInternetArchiveMetadata(identifier: string) {
  const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new AbletonMcpError(`Internet Archive metadata failed with HTTP ${response.status}.`, "IA_METADATA_ERROR");
  return readJsonBounded(response);
}

export async function listInternetArchiveAudioFiles(identifier: string) {
  const metadata = await getInternetArchiveMetadata(identifier);
  return {
    source: "internet_archive",
    identifier,
    audioFiles: extractInternetArchiveAudioFiles(metadata, identifier)
  };
}

export async function downloadSample(url: string, destinationName: string, metadata: Record<string, unknown>) {
  requireFlag(FLAGS.downloads, "ABLETON_MCP_ENABLE_DOWNLOADS", "Sample download");
  const safeUrl = url;
  const license = normalizeLicense(String(metadata.license ?? metadata.licenseurl ?? ""));
  if (!license.allowed) {
    throw new AbletonMcpError(`Sample license is not allowed by default policy: ${license.license}`, "LICENSE_REJECTED", ["Use CC0, public domain, or clear CC BY material only."]);
  }
  await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
  const safeName = destinationName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const target = path.join(LOCAL_PATHS.staging, safeName);
  await resolveSafePath(target, { mustExist: false, forWrite: true });
  const response = await fetchAllowedSampleUrl(safeUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new AbletonMcpError(`Download failed with HTTP ${response.status}.`, "DOWNLOAD_ERROR");
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(target, bytes, { flag: "wx" });
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const attribution = {
    ...buildSampleAttribution({ sourceUrl: safeUrl, destinationName: safeName, metadata, checksum, bytes: bytes.length }),
    stagedAt: new Date().toISOString()
  };
  const attributionPath = `${target}.attribution.json`;
  await fs.writeFile(attributionPath, `${JSON.stringify(attribution, null, 2)}\n`, { flag: "wx" });
  return { stagedPath: redactPath(target), attributionPath: redactPath(attributionPath), checksum, bytes: bytes.length, metadata, attribution };
}

export async function importSampleToLibrary(stagedPath: string, attribution: Record<string, unknown>) {
  requireFlag(FLAGS.downloads, "ABLETON_MCP_ENABLE_DOWNLOADS", "Sample import");
  const safe = await resolveSafePath(stagedPath, { mustExist: true });
  await fs.mkdir(LOCAL_PATHS.imports, { recursive: true });
  const target = path.join(LOCAL_PATHS.imports, path.basename(safe.real));
  if (!isImportTarget(target)) throw new AbletonMcpError("Import target is outside Codex Imports.", "IMPORT_TARGET_REJECTED");
  await resolveSafePath(target, { mustExist: false, forWrite: true });
  await fs.copyFile(safe.real, target, fs.constants.COPYFILE_EXCL);
  await fs.writeFile(`${target}.attribution.json`, JSON.stringify({ ...attribution, importedAt: new Date().toISOString() }, null, 2), { flag: "wx" });
  return { importedPath: redactPath(target), attributionPath: redactPath(`${target}.attribution.json`), analysis: await analyzeAudioFile(target) };
}
