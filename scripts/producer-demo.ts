import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
};

type ProducerDemoOptions = {
  brief: string;
  title?: string;
  style?: string;
  target_duration_seconds: number;
  intensity: number;
  source_policy: "procedural_only" | "local_only" | "metadata_search" | "download_gated";
};

type StepResult = {
  name: string;
  ok: boolean;
  isError: boolean;
  structuredContent?: unknown;
  error?: string;
};

const defaultOptions: ProducerDemoOptions = {
  brief: "sad dark liminal mall dreamcore cue with a memorable vaporwave motif and no real Ableton writes",
  style: "dark dreamcore vaporwave",
  target_duration_seconds: 150,
  intensity: 7,
  source_policy: "local_only"
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function getNested(value: unknown, keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function parseIntOption(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseSourcePolicy(value: string | undefined): ProducerDemoOptions["source_policy"] {
  const allowed = new Set<ProducerDemoOptions["source_policy"]>(["procedural_only", "local_only", "metadata_search", "download_gated"]);
  return allowed.has(value as ProducerDemoOptions["source_policy"]) ? value as ProducerDemoOptions["source_policy"] : defaultOptions.source_policy;
}

export function parseProducerDemoArgs(args: string[]): ProducerDemoOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;
    const raw = arg.slice(2);
    const equals = raw.indexOf("=");
    if (equals >= 0) {
      values.set(raw.slice(0, equals), raw.slice(equals + 1));
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(raw, next);
      index += 1;
    }
  }
  const title = values.get("title");
  const style = values.get("style") ?? defaultOptions.style;
  const options: ProducerDemoOptions = {
    brief: values.get("brief") ?? values.get("concept") ?? defaultOptions.brief,
    target_duration_seconds: parseIntOption(values.get("duration"), defaultOptions.target_duration_seconds, 30, 900),
    intensity: parseIntOption(values.get("intensity"), defaultOptions.intensity, 1, 10),
    source_policy: parseSourcePolicy(values.get("source-policy"))
  };
  if (title) options.title = title;
  if (style) options.style = style;
  return options;
}

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<StepResult> {
  try {
    const result = await client.callTool({ name, arguments: args }) as ToolResult;
    const isError = Boolean(result.isError);
    return { name, ok: !isError, isError, structuredContent: result.structuredContent };
  } catch (error) {
    return { name, ok: false, isError: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function collectReport(options: ProducerDemoOptions, results: StepResult[]) {
  const createResult = results.find((result) => result.name === "ableton_create_production_session")?.structuredContent;
  const blueprintResult = results.find((result) => result.name === "ableton_generate_song_blueprint")?.structuredContent;
  const executionResult = results.find((result) => result.name === "ableton_create_execution_plan")?.structuredContent;
  const sessionId = getNested(createResult, ["productionSession", "session", "id"]);
  const arrangementId = getNested(executionResult, ["executionPlan", "executionPlan", "arrangement", "id"]);
  const failures = results.filter((result) => !result.ok);
  return {
    ok: failures.length === 0 && typeof sessionId === "string",
    mode: "producer_demo",
    brief: options.brief,
    ids: { sessionId, arrangementId },
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      remoteHttp: false,
      note: "Producer demo uses stdio MCP with write, download, and UI-control gates forced off."
    },
    counts: {
      blueprintLayers: Array.isArray(getNested(blueprintResult, ["blueprint", "blueprint", "layers", "layers"]))
        ? (getNested(blueprintResult, ["blueprint", "blueprint", "layers", "layers"]) as unknown[]).length
        : null,
      plannedActions: getNested(executionResult, ["executionPlan", "executionPlan", "summary", "actionCount"]) ?? null,
      runbookPhases: getNested(executionResult, ["executionPlan", "executionPlan", "summary", "runbookPhaseCount"]) ?? null
    },
    results: results.map((result) => ({
      name: result.name,
      ok: result.ok,
      isError: result.isError,
      ...(result.error ? { error: result.error } : {})
    })),
    nextSteps: [
      "Review the stored production session.",
      "Use ableton_review_render_and_revise after a rough render exists.",
      "Use real Ableton writes only through existing approval and ABLETON_MCP_ENABLE_WRITE gates."
    ]
  };
}

export async function runProducerDemo(options: ProducerDemoOptions) {
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
  const client = new Client({ name: "ableton-mcp-producer-demo", version: "0.1.0" });
  await client.connect(transport);
  try {
    const results: StepResult[] = [];
    results.push(await callTool(client, "ableton_mcp_get_tool_packs", {}));
    results.push(await callTool(client, "ableton_create_production_session", {
      brief: options.brief,
      title: options.title,
      style: options.style,
      target_duration_seconds: options.target_duration_seconds,
      intensity: options.intensity,
      usage_mode: "private_experiment",
      source_policy: options.source_policy,
      check_bridge: false
    }));
    const sessionId = getNested(results[1]?.structuredContent, ["productionSession", "session", "id"]);
    if (typeof sessionId === "string") {
      results.push(await callTool(client, "ableton_generate_song_blueprint", { session_id: sessionId }));
      results.push(await callTool(client, "ableton_design_signature_sound_palette", { session_id: sessionId }));
      results.push(await callTool(client, "ableton_prepare_production_assets", { session_id: sessionId }));
      results.push(await callTool(client, "ableton_create_execution_plan", { session_id: sessionId, check_bridge: false }));
      results.push(await callTool(client, "ableton_score_track_professionalism", { session_id: sessionId }));
    }
    return collectReport(options, results);
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runProducerDemo(parseProducerDemoArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
