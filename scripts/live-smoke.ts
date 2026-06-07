import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
};

type SmokeCall = {
  name: string;
  arguments: Record<string, unknown>;
  required: boolean;
};

type SmokeResult = {
  name: string;
  ok: boolean;
  isError: boolean;
  structuredContent?: unknown;
  error?: string;
};

type PublicSmokeResult = {
  name: string;
  ok: boolean;
  isError: boolean;
  error?: string;
};

export type LiveSmokeReport = {
  ok: boolean;
  bridgeReachable: boolean;
  dryRunWriteConfirmed: boolean;
  counts: {
    tracks: number | null;
    scenes: number | null;
    devices: number | null;
  };
  setupHints: string[];
  results: PublicSmokeResult[];
};

export const liveSmokeCalls: SmokeCall[] = [
  { name: "ableton_live_status", arguments: {}, required: true },
  { name: "ableton_bridge_status", arguments: {}, required: true },
  { name: "ableton_bridge_ping", arguments: {}, required: true },
  { name: "ableton_get_full_snapshot", arguments: {}, required: true },
  { name: "ableton_list_tracks", arguments: {}, required: true },
  { name: "ableton_list_scenes", arguments: {}, required: true },
  { name: "ableton_list_devices", arguments: {}, required: true },
  {
    name: "ableton_duplicate_clip",
    arguments: { track_index: 0, clip_slot_index: 0, destination_clip_slot_index: 1, dry_run: true },
    required: true
  },
  { name: "ableton_control_mode_status", arguments: {}, required: true }
];

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

function arrayLengthAt(value: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const candidate = getNested(value, path);
    if (Array.isArray(candidate)) return candidate.length;
  }
  return null;
}

function numberAt(value: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const candidate = getNested(value, path);
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function resultByName(results: SmokeResult[], name: string) {
  return results.find((result) => result.name === name);
}

function collectSetupHints(results: SmokeResult[]) {
  const hints = new Set<string>();
  for (const result of results) {
    if (result.ok) continue;
    const structured = asRecord(result.structuredContent);
    const directHints = structured?.nextSteps ?? structured?.nextStep;
    if (Array.isArray(directHints)) {
      for (const hint of directHints) if (typeof hint === "string") hints.add(hint);
    } else if (typeof directHints === "string") {
      hints.add(directHints);
    }
    if (result.error?.includes("BRIDGE_UNREACHABLE") || result.error?.includes("not reachable")) {
      hints.add("Open Ableton Live and load the Ableton MCP Bridge Max for Live device.");
      hints.add("Run ableton_bridge_ping after the bridge device reports it is listening on 127.0.0.1:17364.");
    }
  }
  return [...hints];
}

export function buildLiveSmokeReport(results: SmokeResult[]): LiveSmokeReport {
  const snapshot = resultByName(results, "ableton_get_full_snapshot")?.structuredContent;
  const tracks = resultByName(results, "ableton_list_tracks")?.structuredContent;
  const scenes = resultByName(results, "ableton_list_scenes")?.structuredContent;
  const devices = resultByName(results, "ableton_list_devices")?.structuredContent;
  const dryRun = resultByName(results, "ableton_duplicate_clip")?.structuredContent;

  const counts = {
    tracks: arrayLengthAt(tracks, [["tracks", "data"], ["tracks"], ["data", "tracks"]])
      ?? arrayLengthAt(snapshot, [["snapshot", "data", "tracks"]])
      ?? numberAt(snapshot, [["snapshot", "data", "state", "track_count"]]),
    scenes: arrayLengthAt(scenes, [["scenes", "data"], ["scenes"], ["data", "scenes"]])
      ?? arrayLengthAt(snapshot, [["snapshot", "data", "scenes"]])
      ?? numberAt(snapshot, [["snapshot", "data", "state", "scene_count"]]),
    devices: arrayLengthAt(devices, [["bridge", "data", "devices"], ["devices", "data"], ["devices"], ["data", "devices"]])
      ?? numberAt(snapshot, [["snapshot", "data", "state", "device_count"]])
  };

  const bridgePing = resultByName(results, "ableton_bridge_ping");
  const bridgeReachable = Boolean(bridgePing?.ok);
  const dryRunWriteConfirmed = getNested(dryRun, ["dry_run"]) === true
    || getNested(dryRun, ["runtime", "tool"]) === "ableton_duplicate_clip";
  const requiredFailures = results.filter((result) => !result.ok).map((result) => result.name);

  return {
    ok: requiredFailures.length === 0 && bridgeReachable && dryRunWriteConfirmed,
    bridgeReachable,
    dryRunWriteConfirmed,
    counts,
    setupHints: collectSetupHints(results),
    results: results.map((result) => ({
      name: result.name,
      ok: result.ok,
      isError: result.isError,
      ...(result.error ? { error: result.error } : {})
    }))
  };
}

async function callTool(client: Client, call: SmokeCall): Promise<SmokeResult> {
  try {
    const result = await client.callTool({ name: call.name, arguments: call.arguments }) as ToolResult;
    const isError = Boolean(result.isError);
    return {
      name: call.name,
      ok: !isError,
      isError,
      structuredContent: result.structuredContent
    };
  } catch (error) {
    return {
      name: call.name,
      ok: false,
      isError: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function runLiveSmoke() {
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

  const client = new Client({ name: "ableton-mcp-live-smoke", version: "0.1.0" });
  await client.connect(transport);
  try {
    const results = [];
    for (const call of liveSmokeCalls) {
      results.push(await callTool(client, call));
    }
    return buildLiveSmokeReport(results);
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runLiveSmoke();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
