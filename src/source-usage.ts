import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_PATHS } from "./config.js";
import { AbletonMcpError } from "./errors.js";
import { redactPath, resolveSafePath } from "./security.js";

export type SourceUsageMode = "private_experiment" | "release_candidate";
export type SourceStatus = "user_provided" | "public_domain" | "cc_licensed" | "generated" | "unverified" | "experiment_only";

export type SourceManifestEntryInput = {
  source_path?: string;
  source_url?: string;
  title?: string;
  role?: string;
  status?: SourceStatus;
  attribution?: string;
  notes?: string[];
};

const ModeFile = "ableton-mcp-source-usage-mode.json";
const SourceManifestPrefix = "ableton-source-manifest";
const ReleaseSafeStatuses = new Set<SourceStatus>(["user_provided", "public_domain", "cc_licensed", "generated"]);

function reportsDir() {
  return path.join(LOCAL_PATHS.diagnostics, "reports");
}

function slugify(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "ableton-project";
}

function sourceId(input: SourceManifestEntryInput) {
  return crypto.createHash("sha256").update(JSON.stringify({
    source_path: input.source_path ?? null,
    source_url: input.source_url ?? null,
    title: input.title ?? null,
    role: input.role ?? null
  })).digest("hex").slice(0, 16);
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, any>;
}

async function normalizeSource(input: SourceManifestEntryInput, defaultStatus: SourceStatus) {
  if (!input.source_path && !input.source_url && !input.title) {
    throw new AbletonMcpError("Source entries need source_path, source_url, or title.", "SOURCE_IDENTITY_REQUIRED", ["Record at least one traceable source identifier."]);
  }
  let pathReport: Record<string, unknown> | null = null;
  if (input.source_path) {
    const safe = await resolveSafePath(input.source_path, { mustExist: false });
    pathReport = {
      requested: redactPath(safe.requested),
      path: redactPath(safe.real),
      rootMode: safe.root.mode
    };
  }
  const status = input.status ?? defaultStatus;
  return {
    id: sourceId(input),
    title: input.title ?? path.basename(input.source_path ?? input.source_url ?? "source"),
    role: input.role ?? "unassigned",
    status,
    sourcePath: pathReport,
    sourceUrl: input.source_url ?? null,
    attribution: input.attribution ?? null,
    canUseForPrivateExperiment: true,
    releaseNeedsReview: !ReleaseSafeStatuses.has(status),
    notes: [
      ...(input.notes ?? []),
      status === "unverified" ? "Private experiment use is allowed; release candidate review must clear or replace this source." : null,
      status === "experiment_only" ? "Experiment-only source must be removed, replaced, or explicitly reviewed before release packaging." : null
    ].filter(Boolean)
  };
}

async function writeJsonExclusive(filePath: string, value: Record<string, unknown>) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

export async function setProjectUsageMode(options: { mode: SourceUsageMode; project_name?: string; dry_run?: boolean }) {
  const state = {
    mode: options.mode,
    projectName: options.project_name ?? "Ableton MCP project",
    updatedAt: new Date().toISOString(),
    policy: usageModePolicy(options.mode)
  };
  const output = path.join(reportsDir(), ModeFile);
  if (options.dry_run === true) {
    return { dry_run: true, state, output: redactPath(output), nextStep: "Call with dry_run=false to persist this project usage mode." };
  }
  await fs.mkdir(reportsDir(), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(state, null, 2)}\n`);
  return { dry_run: false, state, output: redactPath(output) };
}

export async function getProjectUsageMode() {
  const output = path.join(reportsDir(), ModeFile);
  try {
    const state = await readJson(output);
    const mode = state.mode === "release_candidate" ? "release_candidate" : "private_experiment";
    return { configured: true, mode, state: { ...state, policy: usageModePolicy(mode) }, output: redactPath(output) };
  } catch {
    const mode: SourceUsageMode = "private_experiment";
    return {
      configured: false,
      mode,
      state: {
        mode,
        projectName: "Ableton MCP project",
        policy: usageModePolicy(mode)
      },
      output: redactPath(output)
    };
  }
}

export function usageModePolicy(mode: SourceUsageMode) {
  return {
    mode,
    privateExperiment: {
      unverifiedSourcesAllowed: true,
      blocksCreativeDrafting: false,
      requiresManifestEntry: true
    },
    releaseCandidate: {
      unverifiedSourcesAllowed: false,
      blocksReleasePackaging: true,
      requiresReviewFor: ["unverified", "experiment_only"]
    },
    unchangedSecurityGates: {
      downloads: "ABLETON_MCP_ENABLE_DOWNLOADS=1",
      liveWrites: "ABLETON_MCP_ENABLE_WRITE=1 plus dry_run=false",
      uiMouse: "ABLETON_MCP_ENABLE_UI_CONTROL=1"
    }
  };
}

export async function createSourceManifest(options: {
  project_name: string;
  usage_mode?: SourceUsageMode;
  sources: SourceManifestEntryInput[];
  dry_run?: boolean;
}) {
  const mode: SourceUsageMode = options.usage_mode ?? (await getProjectUsageMode()).mode as SourceUsageMode;
  const defaultStatus: SourceStatus = mode === "private_experiment" ? "unverified" : "unverified";
  const sources = await Promise.all(options.sources.map((source) => normalizeSource(source, source.status ?? defaultStatus)));
  const manifest = {
    schema: "ableton-mcp-source-manifest-v1",
    projectName: options.project_name,
    usageMode: mode,
    createdAt: new Date().toISOString(),
    policy: usageModePolicy(mode),
    summary: summarizeSources(sources),
    sources
  };
  const fileName = `${SourceManifestPrefix}-${slugify(options.project_name)}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.json`;
  const output = path.join(reportsDir(), fileName);
  if (options.dry_run === true) {
    return { dry_run: true, manifest, output: redactPath(output), nextStep: "Call with dry_run=false to write this source manifest under diagnostics/reports." };
  }
  await writeJsonExclusive(output, manifest);
  return { dry_run: false, manifest, output: redactPath(output) };
}

async function readManifest(manifestPath: string) {
  const safe = await resolveSafePath(manifestPath, { mustExist: true });
  if (path.extname(safe.real).toLowerCase() !== ".json") {
    throw new AbletonMcpError("Source manifest must be a JSON file.", "SOURCE_MANIFEST_NOT_JSON");
  }
  const manifest = await readJson(safe.real);
  if (manifest.schema !== "ableton-mcp-source-manifest-v1") {
    throw new AbletonMcpError("File is not an Ableton MCP source manifest.", "SOURCE_MANIFEST_SCHEMA_MISMATCH");
  }
  return { safe, manifest };
}

export async function appendSourceToManifest(options: {
  manifest_path?: string;
  project_name?: string;
  source: SourceManifestEntryInput;
  status: SourceStatus;
  dry_run?: boolean;
}) {
  const source = await normalizeSource({ ...options.source, status: options.status }, options.status);
  if (!options.manifest_path) {
    const manifestOptions: {
      project_name: string;
      usage_mode?: SourceUsageMode;
      sources: SourceManifestEntryInput[];
      dry_run?: boolean;
    } = {
      project_name: options.project_name ?? source.title,
      sources: [{ ...options.source, status: options.status }]
    };
    if (options.status === "experiment_only") manifestOptions.usage_mode = "private_experiment";
    if (typeof options.dry_run === "boolean") manifestOptions.dry_run = options.dry_run;
    return createSourceManifest(manifestOptions);
  }
  const { safe, manifest } = await readManifest(options.manifest_path);
  const nextSources = [...(Array.isArray(manifest.sources) ? manifest.sources : []), source];
  const updated = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    summary: summarizeSources(nextSources),
    sources: nextSources
  };
  if (options.dry_run === true) {
    return { dry_run: true, manifest: updated, output: redactPath(safe.real), nextStep: "Call with dry_run=false to append this source entry." };
  }
  await fs.writeFile(safe.real, `${JSON.stringify(updated, null, 2)}\n`);
  return { dry_run: false, manifest: updated, output: redactPath(safe.real) };
}

function summarizeSources(sources: any[]) {
  const byStatus: Record<string, number> = {};
  for (const source of sources) byStatus[String(source.status)] = (byStatus[String(source.status)] ?? 0) + 1;
  const blockers = sources.filter((source) => source.releaseNeedsReview);
  return {
    total: sources.length,
    byStatus,
    privateExperimentUsable: true,
    releaseReady: blockers.length === 0,
    releaseReviewNeeded: blockers.length,
    blockers: blockers.map((source) => ({ id: source.id, title: source.title, status: source.status, role: source.role }))
  };
}

export async function checkReleaseSourceReadiness(options: { manifest_path: string; usage_mode?: SourceUsageMode }) {
  const { safe, manifest } = await readManifest(options.manifest_path);
  const mode = options.usage_mode ?? (manifest.usageMode === "release_candidate" ? "release_candidate" : "private_experiment");
  const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
  const summary = summarizeSources(sources);
  return {
    manifest: redactPath(safe.real),
    usageMode: mode,
    canContinuePrivateExperiment: true,
    releaseReady: summary.releaseReady,
    summary,
    warnings: mode === "private_experiment"
      ? ["Private experiment mode does not block drafting, but release packaging must review unverified or experiment-only sources."]
      : [],
    blockers: summary.releaseReady ? [] : summary.blockers,
    nextSteps: summary.releaseReady
      ? ["Run delivery package checks and keep the manifest with the final export."]
      : ["Replace, clear, or document unverified/experiment-only sources before release_candidate delivery."]
  };
}
