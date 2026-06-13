import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
};

export type AgentMusicDryRunOptions = {
  concept: string;
  target_duration_seconds: number;
  intensity: number;
  style: string;
  client: "codex" | "docker_mcp" | "openclaw" | "claude" | "openrouter" | "gemini" | "llama.cpp" | "antigravity";
  sources: Array<"local_library" | "internet_archive" | "freesound">;
  search_samples: boolean;
  reference_path?: string;
};

type PlannedStep = {
  phase: string;
  name: string;
  arguments: Record<string, unknown>;
  dynamic?: boolean;
};

type StepResult = {
  phase: string;
  name: string;
  ok: boolean;
  isError: boolean;
  structuredContent?: unknown;
  error?: string;
};

export const defaultAgentMusicDryRunOptions: AgentMusicDryRunOptions = {
  concept: "a backrooms hallway where an old memory song decays under fluorescent lights",
  target_duration_seconds: 150,
  intensity: 8,
  style: "liminal/backrooms/horror",
  client: "codex",
  sources: ["local_library", "internet_archive", "freesound"],
  search_samples: false
};

export function buildAgentMusicDryRunToolPlan(options: AgentMusicDryRunOptions): PlannedStep[] {
  const conceptArgs = {
    concept: options.concept,
    target_duration_seconds: options.target_duration_seconds,
    intensity: options.intensity,
    style: options.style,
    sources: options.sources,
    ...(options.reference_path ? { reference_path: options.reference_path } : {})
  };

  return [
    { phase: "readiness", name: "ableton_mcp_get_objective_readiness_report", arguments: { check_bridge: false } },
    { phase: "readiness", name: "ableton_mcp_get_launch_readiness_audit", arguments: { check_bridge: false } },
    { phase: "readiness", name: "ableton_get_production_readiness", arguments: { check_bridge: false } },
    {
      phase: "agent_workflow",
      name: "ableton_plan_agent_music_session",
      arguments: {
        ...conceptArgs,
        client: options.client,
        include_sample_search: true,
        include_audio_preparation: Boolean(options.reference_path),
        check_bridge: false
      }
    },
    { phase: "concept", name: "ableton_plan_concept_track", arguments: conceptArgs },
    {
      phase: "sample_curation",
      name: "ableton_curate_concept_samples",
      arguments: { plan_id: "concept-...", search: options.search_samples, allowed_only: true, max_layers: 8, page: 1, pageSize: 5 },
      dynamic: true
    },
    {
      phase: "arrangement",
      name: "ableton_build_layered_arrangement_plan",
      arguments: { plan_id: "concept-...", sample_assignments: [] },
      dynamic: true
    },
    {
      phase: "execution_review",
      name: "ableton_render_concept_execution_action_matrix",
      arguments: { arrangement_id: "arrangement-...", check_bridge: false },
      dynamic: true
    },
    {
      phase: "execution_review",
      name: "ableton_render_concept_execution_manifest",
      arguments: { arrangement_id: "arrangement-..." },
      dynamic: true
    },
    {
      phase: "execution_review",
      name: "ableton_render_concept_execution_runbook",
      arguments: { arrangement_id: "arrangement-...", check_bridge: false },
      dynamic: true
    },
    {
      phase: "mix",
      name: "ableton_render_concept_mix_plan",
      arguments: { plan_id: "concept-..." },
      dynamic: true
    },
    {
      phase: "automation",
      name: "ableton_render_concept_automation_map",
      arguments: { plan_id: "concept-..." },
      dynamic: true
    },
    {
      phase: "device_review",
      name: "ableton_render_concept_device_chain_spec",
      arguments: { arrangement_id: "arrangement-..." },
      dynamic: true
    },
    {
      phase: "device_review",
      name: "ableton_render_concept_device_catalog_matches",
      arguments: { arrangement_id: "arrangement-...", max_candidates_per_device: 3, include_plugin_presets: false },
      dynamic: true
    },
    {
      phase: "device_review",
      name: "ableton_plan_concept_device_ui_placement",
      arguments: { arrangement_id: "arrangement-...", max_devices: 12, include_catalog_matches: true },
      dynamic: true
    },
    {
      phase: "qa",
      name: "ableton_render_concept_production_scorecard",
      arguments: { arrangement_id: "arrangement-...", check_bridge: false },
      dynamic: true
    },
    {
      phase: "approval",
      name: "ableton_preflight_concept_execution",
      arguments: { arrangement_id: "arrangement-...", check_bridge: false },
      dynamic: true
    },
    {
      phase: "approval",
      name: "ableton_create_concept_execution_approval_bundle",
      arguments: { arrangement_id: "arrangement-...", check_bridge: false },
      dynamic: true
    },
    {
      phase: "approval",
      name: "ableton_execute_concept_plan",
      arguments: { arrangement_id: "arrangement-...", dry_run: true },
      dynamic: true
    },
    {
      phase: "delivery",
      name: "ableton_render_delivery_plan",
      arguments: { plan_id: "concept-..." },
      dynamic: true
    }
  ];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function getNested(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : null;
}

function parseIntOption(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseSources(value: string | undefined): AgentMusicDryRunOptions["sources"] {
  if (!value) return defaultAgentMusicDryRunOptions.sources;
  const allowed = new Set(defaultAgentMusicDryRunOptions.sources);
  const sources = value.split(",")
    .map((source) => source.trim())
    .filter((source): source is AgentMusicDryRunOptions["sources"][number] => allowed.has(source as AgentMusicDryRunOptions["sources"][number]));
  return sources.length > 0 ? [...new Set(sources)] : defaultAgentMusicDryRunOptions.sources;
}

function parseClient(value: string | undefined): AgentMusicDryRunOptions["client"] {
  const allowed = new Set<AgentMusicDryRunOptions["client"]>([
    "codex",
    "docker_mcp",
    "openclaw",
    "claude",
    "openrouter",
    "gemini",
    "llama.cpp",
    "antigravity"
  ]);
  return allowed.has(value as AgentMusicDryRunOptions["client"])
    ? value as AgentMusicDryRunOptions["client"]
    : defaultAgentMusicDryRunOptions.client;
}

export function parseAgentMusicDryRunArgs(args: string[]): AgentMusicDryRunOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      values.set(withoutPrefix.slice(0, equalsIndex), withoutPrefix.slice(equalsIndex + 1));
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(withoutPrefix, next);
      index += 1;
    } else {
      flags.add(withoutPrefix);
    }
  }

  const referencePath = values.get("reference");
  const options: AgentMusicDryRunOptions = {
    concept: values.get("concept") ?? defaultAgentMusicDryRunOptions.concept,
    target_duration_seconds: parseIntOption(values.get("duration"), defaultAgentMusicDryRunOptions.target_duration_seconds, 30, 900),
    intensity: parseIntOption(values.get("intensity"), defaultAgentMusicDryRunOptions.intensity, 1, 10),
    style: values.get("style") ?? defaultAgentMusicDryRunOptions.style,
    client: parseClient(values.get("client")),
    sources: parseSources(values.get("sources")),
    search_samples: flags.has("search-samples") || values.get("search-samples") === "true"
  };
  if (referencePath) options.reference_path = referencePath;
  return options;
}

async function callTool(client: Client, step: PlannedStep): Promise<StepResult> {
  try {
    const result = await client.callTool({ name: step.name, arguments: step.arguments }) as ToolResult;
    const isError = Boolean(result.isError);
    return {
      phase: step.phase,
      name: step.name,
      ok: !isError,
      isError,
      structuredContent: result.structuredContent
    };
  } catch (error) {
    return {
      phase: step.phase,
      name: step.name,
      ok: false,
      isError: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function replaceIds(argumentsTemplate: Record<string, unknown>, conceptPlanId: string | null, arrangementId: string | null): Record<string, unknown> {
  const entries = Object.entries(argumentsTemplate).map(([key, value]): [string, unknown] => {
    if (value === "concept-...") return [key, conceptPlanId];
    if (value === "arrangement-...") return [key, arrangementId];
    return [key, value];
  });
  return Object.fromEntries(entries);
}

function collectReport(options: AgentMusicDryRunOptions, results: StepResult[], conceptPlanId: string | null, arrangementId: string | null) {
  const conceptResult = results.find((result) => result.name === "ableton_plan_concept_track")?.structuredContent;
  const matrixResult = results.find((result) => result.name === "ableton_render_concept_execution_action_matrix")?.structuredContent;
  const curationResult = results.find((result) => result.name === "ableton_curate_concept_samples")?.structuredContent;
  const runbookResult = results.find((result) => result.name === "ableton_render_concept_execution_runbook")?.structuredContent;
  const deviceSpecResult = results.find((result) => result.name === "ableton_render_concept_device_chain_spec")?.structuredContent;
  const deviceCatalogResult = results.find((result) => result.name === "ableton_render_concept_device_catalog_matches")?.structuredContent;
  const deviceUiPlacementResult = results.find((result) => result.name === "ableton_plan_concept_device_ui_placement")?.structuredContent;
  const preflightResult = results.find((result) => result.name === "ableton_preflight_concept_execution")?.structuredContent;
  const failures = results.filter((result) => !result.ok);

  return {
    ok: failures.length === 0 && Boolean(conceptPlanId) && Boolean(arrangementId),
    mode: "agent_music_dry_run",
    client: options.client,
    concept: options.concept,
    ids: {
      conceptPlanId,
      arrangementId
    },
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      remoteHttp: false,
      searchSamples: options.search_samples,
      note: "This workflow uses the stdio MCP server with WRITE, DOWNLOADS, and UI_CONTROL forced off."
    },
    counts: {
      layers: arrayLength(getNested(conceptResult, ["concept", "plan", "layers"])),
      sections: arrayLength(getNested(conceptResult, ["concept", "plan", "sections"])),
      curationLayers: arrayLength(getNested(curationResult, ["curation", "layerCuration"])),
      actionMatrixActions: getNested(matrixResult, ["actionMatrix", "summary", "totalActions"]) ?? null,
      writeGatedActions: getNested(matrixResult, ["actionMatrix", "summary", "bridgeStatusCounts", "write_gated"]) ?? null,
      runbookPhases: getNested(runbookResult, ["runbook", "summary", "phases"]) ?? null,
      deviceSpecChains: getNested(deviceSpecResult, ["deviceChainSpec", "summary", "deviceChains"]) ?? null,
      deviceSpecDevices: getNested(deviceSpecResult, ["deviceChainSpec", "summary", "totalDevices"]) ?? null,
      deviceCatalogMatched: getNested(deviceCatalogResult, ["catalogMatches", "summary", "matchedDevices"]) ?? null,
      deviceCatalogMissing: getNested(deviceCatalogResult, ["catalogMatches", "summary", "missingDevices"]) ?? null,
      deviceUiPlacements: getNested(deviceUiPlacementResult, ["uiPlacement", "summary", "plannedPlacements"]) ?? null,
      deviceUiExecutionIncluded: getNested(deviceUiPlacementResult, ["uiPlacement", "summary", "uiExecutionIncluded"]) ?? null,
      stagedDeviceChains: getNested(matrixResult, ["actionMatrix", "summary", "stagedDeviceChains"]) ?? null,
      stagedAutomationTargets: getNested(matrixResult, ["actionMatrix", "summary", "stagedAutomationTargets"]) ?? null
    },
    preflight: {
      status: getNested(preflightResult, ["preflight", "status"]) ?? null,
      readyForRealWrite: getNested(preflightResult, ["preflight", "readyForRealWrite"]) ?? null
    },
    results: results.map((result) => ({
      phase: result.phase,
      name: result.name,
      ok: result.ok,
      isError: result.isError,
      ...(result.error ? { error: result.error } : {})
    })),
    nextSteps: [
      "Review the action matrix, execution manifest, execution runbook, device-chain spec, device catalog matches, and UI placement plan.",
      "Stage only licensed samples after metadata review.",
      "Open Ableton and load the Max for Live bridge, then run live-smoke.",
      "Use ableton_execute_concept_plan with dry_run=false only after approval and ABLETON_MCP_ENABLE_WRITE=1 are intentional."
    ]
  };
}

export async function runAgentMusicDryRun(options: AgentMusicDryRunOptions) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/src/index.js"],
    env: {
      ...process.env,
      ABLETON_MCP_ENABLE_WRITE: "0",
      ABLETON_MCP_ENABLE_UI_CONTROL: "0",
      ABLETON_MCP_ENABLE_DOWNLOADS: "0"
    }
  });
  const client = new Client({ name: "ableton-mcp-agent-music-dry-run", version: "0.1.0" });
  await client.connect(transport);
  try {
    const results: StepResult[] = [];
    let conceptPlanId: string | null = null;
    let arrangementId: string | null = null;
    for (const step of buildAgentMusicDryRunToolPlan(options)) {
      const call = step.dynamic
        ? { ...step, arguments: replaceIds(step.arguments, conceptPlanId, arrangementId) }
        : step;
      if (Object.values(call.arguments).some((value) => value === null || value === undefined)) {
        results.push({ phase: step.phase, name: step.name, ok: false, isError: true, error: "Missing dynamic concept or arrangement id." });
        continue;
      }
      const result = await callTool(client, call);
      results.push(result);
      if (step.name === "ableton_plan_concept_track") {
        const id = getNested(result.structuredContent, ["concept", "plan", "id"]);
        if (typeof id === "string") conceptPlanId = id;
      }
      if (step.name === "ableton_build_layered_arrangement_plan") {
        const id = getNested(result.structuredContent, ["arrangement", "arrangement", "id"]);
        if (typeof id === "string") arrangementId = id;
      }
    }
    return collectReport(options, results, conceptPlanId, arrangementId);
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runAgentMusicDryRun(parseAgentMusicDryRunArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
