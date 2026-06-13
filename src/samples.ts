import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FLAGS, LOCAL_PATHS } from "./config.js";
import { AbletonMcpError, requireFlag } from "./errors.js";
import { analyzeAudioFile } from "./analysis.js";
import { fetchAllowedSampleUrl } from "./network.js";
import { readJsonBounded } from "./network.js";
import { isImportTarget, redactPath, resolveSafePath } from "./security.js";

const allowedLicenses = ["CC0", "Creative Commons 0", "CC BY", "Attribution", "Public Domain", "Public Domain Mark"];

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
