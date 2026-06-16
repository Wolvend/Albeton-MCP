import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FLAGS, LOCAL_PATHS } from "./config.js";
import { AbletonMcpError, requireFlag } from "./errors.js";
import { analyzeAudioFile } from "./analysis.js";
import { fetchAllowedSampleUrl } from "./network.js";
import { readJsonBounded } from "./network.js";
import { isImportTarget, redactPath, resolveSafePath } from "./security.js";

const MAX_ATTRIBUTION_SIDECARS = 500;
const MAX_ATTRIBUTION_BYTES = 128_000;
const ATTRIBUTION_SKIP_DIRS = new Set(["online-treasure-trove", "renders", "plugins", "__macosx"]);
const IA_AUDIO_EXTENSIONS = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg", ".opus"]);
const MAX_IA_AUDIO_FILES = 100;
const MAX_UNIVERSAL_SOURCE_RESULTS = 50;

export const FREE_SAMPLE_SOURCE_IDS = [
  "freesound",
  "internet_archive",
  "openverse",
  "wikimedia_commons",
  "musopen",
  "open_music_archive",
  "pixabay",
  "mixkit",
  "sonniss_gdc",
  "opengameart",
  "sounds_99",
  "sampleradar",
  "adobe_audition_sfx",
  "free_to_use_sounds",
  "youtube_audio_library",
  "youtube_user_provided",
  "soundcloud_user_provided"
] as const;

export type FreeSampleSourceId = typeof FREE_SAMPLE_SOURCE_IDS[number];

type FreeSampleSourcePolicy = {
  id: FreeSampleSourceId;
  label: string;
  tier: "A" | "B" | "manual";
  status: "live_api" | "manual_search" | "local_or_manual_proof";
  searchMode: "api" | "manual";
  downloadMode: "direct_download_gated" | "manual_review" | "manual_proof_only" | "reference_only";
  allowedLicenses: string[];
  searchUrl: string;
  bestFor: string[];
  notes: string[];
  approvedHosts: string[];
};

const FREE_SAMPLE_SOURCE_POLICIES: FreeSampleSourcePolicy[] = [
  {
    id: "freesound",
    label: "Freesound",
    tier: "A",
    status: "live_api",
    searchMode: "api",
    downloadMode: "direct_download_gated",
    allowedLicenses: ["CC0", "CC BY"],
    searchUrl: "https://freesound.org/search/?q={query}",
    bestFor: ["foley", "field recordings", "impacts", "ambience", "one-shots"],
    notes: ["Use CC0 or CC BY only by default.", "CC BY-NC, CC BY-ND, and unclear licenses are rejected."],
    approvedHosts: ["freesound.org", "cdn.freesound.org"]
  },
  {
    id: "internet_archive",
    label: "Internet Archive",
    tier: "A",
    status: "live_api",
    searchMode: "api",
    downloadMode: "direct_download_gated",
    allowedLicenses: ["CC0", "CC BY", "Public Domain", "Public Domain Mark"],
    searchUrl: "https://archive.org/search?query={query}%20AND%20mediatype%3Aaudio",
    bestFor: ["78rpm", "public-domain records", "historic audio", "radio", "old ballroom"],
    notes: ["Verify item licenseurl and choose audio files through the metadata file listing first."],
    approvedHosts: ["archive.org", "www.archive.org"]
  },
  {
    id: "openverse",
    label: "Openverse",
    tier: "A",
    status: "live_api",
    searchMode: "api",
    downloadMode: "manual_review",
    allowedLicenses: ["CC0", "CC BY", "Public Domain", "Public Domain Mark"],
    searchUrl: "https://openverse.org/search/audio?q={query}",
    bestFor: ["cross-source discovery", "CC audio search", "public-domain discovery"],
    notes: ["Discovery index only; verify the original source before staging a file."],
    approvedHosts: ["api.openverse.org", "openverse.org"]
  },
  {
    id: "wikimedia_commons",
    label: "Wikimedia Commons",
    tier: "A",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["CC0", "CC BY", "Public Domain"],
    searchUrl: "https://commons.wikimedia.org/w/index.php?search={query}&title=Special:MediaSearch&type=audio",
    bestFor: ["public-domain audio", "CC audio", "speeches", "field recordings"],
    notes: ["Per-file license and attribution must be captured from the file page."],
    approvedHosts: ["commons.wikimedia.org", "upload.wikimedia.org"]
  },
  {
    id: "musopen",
    label: "Musopen",
    tier: "A",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["Public Domain", "CC0", "CC BY"],
    searchUrl: "https://musopen.org/music/?search={query}",
    bestFor: ["classical", "piano", "strings", "orchestral", "public-domain performance"],
    notes: ["Check each recording's displayed license before use."],
    approvedHosts: ["musopen.org"]
  },
  {
    id: "open_music_archive",
    label: "Open Music Archive",
    tier: "A",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["Public Domain"],
    searchUrl: "https://www.openmusicarchive.org/search.php?searchTerm={query}",
    bestFor: ["out-of-copyright recordings", "vintage songs", "historic music"],
    notes: ["Jurisdiction can matter for old recordings; preserve source proof."],
    approvedHosts: ["openmusicarchive.org", "www.openmusicarchive.org"]
  },
  {
    id: "pixabay",
    label: "Pixabay",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["Pixabay Content License"],
    searchUrl: "https://pixabay.com/sound-effects/search/{query}/",
    bestFor: ["sound effects", "music beds", "ambience", "quick SFX"],
    notes: ["No standalone resale; avoid trademark/publicity-sensitive content."],
    approvedHosts: ["pixabay.com", "cdn.pixabay.com"]
  },
  {
    id: "mixkit",
    label: "Mixkit",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["Mixkit Free License"],
    searchUrl: "https://mixkit.co/free-sound-effects/{query}/",
    bestFor: ["video SFX", "transitions", "music beds", "simple ambience"],
    notes: ["License differs by item type; capture item page and license type."],
    approvedHosts: ["mixkit.co", "assets.mixkit.co"]
  },
  {
    id: "sonniss_gdc",
    label: "Sonniss GDC Bundles",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["Sonniss royalty-free GDC license"],
    searchUrl: "https://sonniss.com/gameaudiogdc/",
    bestFor: ["cinematic impacts", "foley", "game audio", "industrial SFX"],
    notes: ["Large bundles; stage only reviewed audio files, not entire archives by default."],
    approvedHosts: ["sonniss.com", "gdc.sonniss.com"]
  },
  {
    id: "opengameart",
    label: "OpenGameArt",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["CC0", "CC BY"],
    searchUrl: "https://opengameart.org/art-search-advanced?keys={query}&field_art_type_tid%5B%5D=13",
    bestFor: ["game SFX", "chiptune", "loops", "ambience"],
    notes: ["Avoid GPL, LGPL, and share-alike assets by default unless the project explicitly accepts those obligations."],
    approvedHosts: ["opengameart.org"]
  },
  {
    id: "sounds_99",
    label: "99Sounds",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["99Sounds royalty-free license"],
    searchUrl: "https://99sounds.org/?s={query}",
    bestFor: ["cinematic textures", "glitches", "impacts", "experimental sound design"],
    notes: ["Capture the pack page and pack license notes before staging."],
    approvedHosts: ["99sounds.org"]
  },
  {
    id: "sampleradar",
    label: "MusicRadar SampleRadar",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["SampleRadar royalty-free music-use license"],
    searchUrl: "https://www.musicradar.com/search?searchTerm=SampleRadar%20{query}",
    bestFor: ["genre packs", "drums", "synth loops", "one-shots"],
    notes: ["Royalty-free for music use; do not redistribute packs or raw sample collections."],
    approvedHosts: ["musicradar.com", "www.musicradar.com"]
  },
  {
    id: "adobe_audition_sfx",
    label: "Adobe Audition SFX",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["Adobe Audition/Creative Cloud EULA"],
    searchUrl: "https://www.adobe.com/products/audition/offers/adobeauditiondlcsfx.html",
    bestFor: ["royalty-free SFX packs", "post-production effects"],
    notes: ["Use only when the local license/EULA is acceptable; preserve source page and EULA reference."],
    approvedHosts: ["adobe.com", "www.adobe.com"]
  },
  {
    id: "free_to_use_sounds",
    label: "Free To Use Sounds",
    tier: "B",
    status: "manual_search",
    searchMode: "manual",
    downloadMode: "manual_review",
    allowedLicenses: ["Free To Use Sounds royalty-free license"],
    searchUrl: "https://www.freetousesounds.com/?s={query}",
    bestFor: ["field recordings", "ambience", "world sounds", "foley"],
    notes: ["Track purchase/download proof and library license agreement."],
    approvedHosts: ["freetousesounds.com", "www.freetousesounds.com"]
  },
  {
    id: "youtube_audio_library",
    label: "YouTube Audio Library",
    tier: "manual",
    status: "local_or_manual_proof",
    searchMode: "manual",
    downloadMode: "manual_proof_only",
    allowedLicenses: ["YouTube Audio Library item license"],
    searchUrl: "https://studio.youtube.com/channel/UC/music",
    bestFor: ["video-safe music", "video-safe SFX"],
    notes: ["Do not rip arbitrary YouTube videos. Use only the YouTube Studio Audio Library download button or user-provided local files with license proof."],
    approvedHosts: ["studio.youtube.com"]
  },
  {
    id: "youtube_user_provided",
    label: "YouTube User-Provided Licensed Audio",
    tier: "manual",
    status: "local_or_manual_proof",
    searchMode: "manual",
    downloadMode: "manual_proof_only",
    allowedLicenses: ["explicit written permission", "CC BY", "CC0", "Public Domain"],
    searchUrl: "https://www.youtube.com/results?search_query={query}",
    bestFor: ["user-approved references", "creator-authorized stems"],
    notes: ["The MCP must not download or rip YouTube streams. Import only local files obtained through authorized platform features or explicit rights-holder permission."],
    approvedHosts: ["youtube.com", "www.youtube.com", "youtu.be"]
  },
  {
    id: "soundcloud_user_provided",
    label: "SoundCloud User-Provided Licensed Audio",
    tier: "manual",
    status: "local_or_manual_proof",
    searchMode: "manual",
    downloadMode: "manual_proof_only",
    allowedLicenses: ["explicit written permission", "CC BY", "CC0", "Public Domain"],
    searchUrl: "https://soundcloud.com/search/sounds?q={query}",
    bestFor: ["artist-authorized samples", "download-enabled creator uploads"],
    notes: ["SoundCloud API terms prohibit stream ripping/permanent copies of user content. Import only local files from official download buttons or explicit permission."],
    approvedHosts: ["soundcloud.com", "www.soundcloud.com"]
  }
];

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
  const lower = license.toLowerCase();
  const explicitlyBlocked = [
    "noncommercial",
    "non-commercial",
    "cc by-nc",
    "by-nc",
    "/by-nc",
    "no derivatives",
    "no-derivatives",
    "cc by-nd",
    "by-nd",
    "/by-nd",
    "sharealike",
    "share-alike",
    "cc by-sa",
    "by-sa",
    "/by-sa",
    "all rights reserved",
    "personal use"
  ].some((blocked) => lower.includes(blocked));
  const publicDomain = lower.includes("cc0")
    || lower.includes("creative commons 0")
    || lower.includes("creativecommons.org/publicdomain/zero")
    || lower.includes("public domain mark")
    || lower.includes("creativecommons.org/publicdomain/mark")
    || lower === "public domain"
    || lower.includes(" public domain ");
  const ccBy = !explicitlyBlocked && (
    /^cc\s*by(\s|$|[0-9.])/i.test(license)
    || lower.includes("creative commons attribution")
    || /creativecommons\.org\/licenses\/by\/(?:[0-9.]+\/?)?$/i.test(lower)
  );
  const allowed = !explicitlyBlocked && (publicDomain || ccBy);
  return {
    license,
    allowed,
    policy: "Default imports require CC0, public domain, Public Domain Mark, or plain CC BY. NC, ND, SA, personal-use, and unclear licenses are rejected."
  };
}

function sourcePolicy(source: FreeSampleSourceId) {
  const policy = FREE_SAMPLE_SOURCE_POLICIES.find((entry) => entry.id === source);
  if (!policy) {
    throw new AbletonMcpError(`Unsupported sample source: ${source}`, "SAMPLE_SOURCE_UNSUPPORTED", ["Call ableton_list_free_sample_sources to see supported source ids."]);
  }
  return policy;
}

function safeQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 200);
}

function searchUrlFor(policy: FreeSampleSourcePolicy, query: string) {
  return policy.searchUrl.replace("{query}", encodeURIComponent(query));
}

function publicSourcePolicy(policy: FreeSampleSourcePolicy) {
  return {
    ...policy,
    manualSearchUrlTemplate: policy.searchUrl,
    downloadRequiresDownloadsFlag: policy.downloadMode === "direct_download_gated" || policy.downloadMode === "manual_review",
    arbitraryRippingAllowed: false
  };
}

export function listFreeSampleSources() {
  return {
    defaultPolicy: {
      downloadsEnabled: FLAGS.downloads,
      acceptedLicenses: ["CC0", "Public Domain", "Public Domain Mark", "plain CC BY"],
      rejectedLicenses: ["NC", "ND", "SA", "personal use", "all rights reserved", "unclear"],
      youtubeAndSoundCloud: "manual_proof_only",
      noArbitraryRipping: true
    },
    sources: FREE_SAMPLE_SOURCE_POLICIES.map(publicSourcePolicy)
  };
}

function manualSearchResult(policy: FreeSampleSourcePolicy, query: string) {
  return {
    source: policy.id,
    label: policy.label,
    status: "manual_search_required",
    searchUrl: searchUrlFor(policy, query),
    downloadMode: policy.downloadMode,
    allowedLicenses: policy.allowedLicenses,
    bestFor: policy.bestFor,
    notes: policy.notes,
    nextSteps: [
      "Open the source search URL manually or through a browser-capable client.",
      "Choose only files with a clear license that matches the source policy.",
      "Use ableton_plan_free_sample_download with url or source_url, license proof, and dry_run=true before staging."
    ]
  };
}

function universalCandidate(source: FreeSampleSourceId, item: Record<string, unknown>) {
  const license = String(item.license_url ?? item.licenseurl ?? item.license ?? "");
  const licensePolicy = normalizeLicense(license);
  const sourceUrl = String(item.foreign_landing_url ?? item.url ?? item.sourceUrl ?? "");
  return {
    source,
    id: item.id ?? item.identifier ?? null,
    title: sanitizeAttributionText(item.title ?? item.name, 240) || null,
    creator: sanitizeAttributionText(item.creator ?? item.username, 180) || null,
    sourceUrl,
    previewUrl: item.url ?? item.previews ?? null,
    license,
    licensePolicy,
    duration: numericValue(item.duration),
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 24) : [],
    raw: item
  };
}

async function searchOpenverseAudio(query: string, page = 1, pageSize = 15) {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: String(Math.min(pageSize, 50))
  });
  const response = await fetch(`https://api.openverse.org/v1/audio/?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new AbletonMcpError(`Openverse audio search failed with HTTP ${response.status}.`, "OPENVERSE_SEARCH_ERROR");
  const data = await readJsonBounded(response) as any;
  return {
    source: "openverse",
    count: data.result_count ?? 0,
    results: (data.results ?? []).map((item: Record<string, unknown>) => universalCandidate("openverse", item))
  };
}

export async function searchFreeSampleSources(options: {
  query: string;
  sources?: FreeSampleSourceId[];
  page?: number;
  pageSize?: number;
  allowedOnly?: boolean;
}) {
  const query = safeQuery(options.query);
  if (!query) throw new AbletonMcpError("Sample search query is required.", "QUERY_REQUIRED");
  const sources = (options.sources?.length ? options.sources : ["freesound", "internet_archive", "openverse"]) as FreeSampleSourceId[];
  const page = Math.max(1, Math.trunc(options.page || 1));
  const pageSize = Math.max(1, Math.min(50, Math.trunc(options.pageSize || 15)));
  const results: Array<Record<string, unknown>> = [];
  const accessIssues: Array<Record<string, unknown>> = [];

  for (const source of sources.slice(0, 16)) {
    const policy = sourcePolicy(source);
    if (policy.searchMode === "manual") {
      results.push(manualSearchResult(policy, query));
      continue;
    }

    try {
      if (source === "freesound") {
        const remote = await searchFreesound(query, page, pageSize);
        results.push(...(remote.results ?? []).map((item: Record<string, unknown>) => universalCandidate("freesound", item)));
      } else if (source === "internet_archive") {
        const remote = await searchInternetArchiveAudio(query, page, pageSize);
        results.push(...(remote.results ?? []).map((item: Record<string, unknown>) => universalCandidate("internet_archive", item)));
      } else if (source === "openverse") {
        const remote = await searchOpenverseAudio(query, page, pageSize);
        results.push(...remote.results);
      }
    } catch (error) {
      accessIssues.push({ source, query, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const filtered = options.allowedOnly === false ? results : results.filter((item) => {
    const licensePolicy = (item as any).licensePolicy;
    return item.status === "manual_search_required" || licensePolicy?.allowed === true;
  });

  return {
    query,
    sources: sources.map((source) => publicSourcePolicy(sourcePolicy(source))),
    results: filtered.slice(0, MAX_UNIVERSAL_SOURCE_RESULTS),
    resultCount: filtered.length,
    accessIssues,
    nextSteps: [
      "Use candidates with licensePolicy.allowed=true, or manual-search results after reviewing the source page.",
      "Call ableton_plan_free_sample_download with dry_run=true before staging a selected file.",
      "Downloads still require ABLETON_MCP_ENABLE_DOWNLOADS=1 and approved source/proof metadata."
    ]
  };
}

function assertSourceUrlMatchesPolicy(source: FreeSampleSourceId, input: string) {
  const policy = sourcePolicy(source);
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new AbletonMcpError("Invalid sample source URL.", "INVALID_URL");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = policy.approvedHosts.some((approved) => host === approved || host.endsWith(`.${approved}`));
  if (!allowed) {
    throw new AbletonMcpError(`URL host ${host} does not match source policy ${source}.`, "SAMPLE_SOURCE_HOST_REJECTED", [`Use URLs from: ${policy.approvedHosts.join(", ")}`]);
  }
  return parsed.toString();
}

export async function planFreeSampleDownload(options: {
  source: FreeSampleSourceId;
  url?: string;
  source_url?: string;
  destinationName?: string;
  metadata?: Record<string, unknown>;
  dry_run?: boolean;
}) {
  const policy = sourcePolicy(options.source);
  const metadata = options.metadata ?? {};
  const licensePolicy = normalizeLicense(String(metadata.license ?? metadata.licenseurl ?? metadata.license_url ?? ""));
  const sourceUrlInput = options.url ?? options.source_url;
  const sourceUrl = sourceUrlInput ? assertSourceUrlMatchesPolicy(options.source, sourceUrlInput) : "";
  const destinationName = (options.destinationName || `${policy.id}-sample`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const plan = {
    source: publicSourcePolicy(policy),
    sourceUrl,
    destinationName,
    licensePolicy,
    downloadsEnabled: FLAGS.downloads,
    metadata,
    allowedToAutoDownload: policy.downloadMode === "direct_download_gated" && licensePolicy.allowed && Boolean(sourceUrl),
    manualReviewRequired: policy.downloadMode !== "direct_download_gated",
    youtubeOrSoundCloudRippingAllowed: false
  };

  if (options.dry_run !== false) {
    return {
      ok: true,
      dry_run: true,
      plan,
      nextSteps: policy.downloadMode === "manual_proof_only"
        ? ["Do not rip streams. Download only through the platform's official download feature or rights-holder permission, then import the local file with proof metadata."]
        : ["Review the license/source proof, then set dry_run=false with ABLETON_MCP_ENABLE_DOWNLOADS=1 if this source supports direct gated staging."]
    };
  }

  if (policy.downloadMode === "manual_proof_only" || policy.downloadMode === "reference_only") {
    throw new AbletonMcpError(`${policy.label} is not eligible for automated stream downloading.`, "SAMPLE_SOURCE_MANUAL_PROOF_ONLY", policy.notes);
  }
  if (policy.downloadMode !== "direct_download_gated") {
    throw new AbletonMcpError(`${policy.label} requires manual review before automated staging.`, "SAMPLE_SOURCE_MANUAL_REVIEW_REQUIRED", ["Use a reviewed local file or add a source-specific implementation after verifying direct download terms."]);
  }
  if (!sourceUrl) throw new AbletonMcpError("A source URL is required for sample download staging.", "SOURCE_URL_REQUIRED");
  return { ok: true, dry_run: false, download: await downloadSample(sourceUrl, destinationName, metadata) };
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
        if (scope === "staging" && depth === 0 && ATTRIBUTION_SKIP_DIRS.has(entry.name.toLowerCase())) {
          continue;
        }
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
