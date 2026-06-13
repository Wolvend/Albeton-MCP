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
  objectiveReadiness: {
    overallStatus: string | null;
    okForDefaultClientUse: boolean | null;
    okForFullLiveMusicProduction: boolean | null;
    hardFailures: string[];
    pendingRuntime: string[];
  };
  launchReadiness: {
    mode: string | null;
    okForDefaultClientUse: boolean | null;
    safeToolCount: number | null;
    liveControlCoverage: {
      areas: number | null;
      writeGatedSupported: number | null;
      unsupported: number | null;
      nativeDeviceInsertion: string | null;
      automationBreakpointWrites: string | null;
    };
  };
  bridgeCapabilitySummary: Record<string, unknown> | null;
  counts: {
    tracks: number | null;
    scenes: number | null;
    devices: number | null;
    routingRows: number | null;
  };
  setupHints: string[];
  results: PublicSmokeResult[];
};

export const liveSmokeCalls: SmokeCall[] = [
  { name: "ableton_mcp_get_objective_readiness_report", arguments: { check_bridge: false }, required: true },
  { name: "ableton_mcp_get_launch_readiness_audit", arguments: { check_bridge: false }, required: true },
  { name: "ableton_get_bridge_capabilities", arguments: { check_bridge: false }, required: true },
  { name: "ableton_live_status", arguments: {}, required: true },
  { name: "ableton_bridge_status", arguments: {}, required: true },
  { name: "ableton_bridge_ping", arguments: {}, required: true },
  { name: "ableton_get_live_state", arguments: {}, required: true },
  { name: "ableton_get_full_snapshot", arguments: {}, required: true },
  { name: "ableton_list_tracks", arguments: {}, required: true },
  { name: "ableton_list_scenes", arguments: {}, required: true },
  { name: "ableton_list_devices", arguments: {}, required: true },
  { name: "ableton_get_routing_overview", arguments: { include_devices: false }, required: true },
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

function stringAt(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const candidate = getNested(value, path);
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

function booleanAt(value: unknown, paths: string[][]): boolean | null {
  for (const path of paths) {
    const candidate = getNested(value, path);
    if (typeof candidate === "boolean") return candidate;
  }
  return null;
}

function stringArrayAt(value: unknown, paths: string[][]): string[] {
  for (const path of paths) {
    const candidate = getNested(value, path);
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) return candidate;
  }
  return [];
}

function resultByName(results: SmokeResult[], name: string) {
  return results.find((result) => result.name === name);
}

function coverageAreaStatus(launchReadiness: unknown, areaId: string) {
  const areas = getNested(launchReadiness, ["launchReadiness", "liveControlCoverage", "areas"]);
  if (!Array.isArray(areas)) return null;
  const match = areas.find((area) => asRecord(area)?.id === areaId);
  const status = asRecord(match)?.status;
  return typeof status === "string" ? status : null;
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
  const objectiveReadiness = resultByName(results, "ableton_mcp_get_objective_readiness_report")?.structuredContent;
  const launchReadiness = resultByName(results, "ableton_mcp_get_launch_readiness_audit")?.structuredContent;
  const bridgeCapabilities = resultByName(results, "ableton_get_bridge_capabilities")?.structuredContent;
  const snapshot = resultByName(results, "ableton_get_full_snapshot")?.structuredContent;
  const tracks = resultByName(results, "ableton_list_tracks")?.structuredContent;
  const scenes = resultByName(results, "ableton_list_scenes")?.structuredContent;
  const devices = resultByName(results, "ableton_list_devices")?.structuredContent;
  const routing = resultByName(results, "ableton_get_routing_overview")?.structuredContent;
  const dryRun = resultByName(results, "ableton_duplicate_clip")?.structuredContent;

  const counts = {
    tracks: arrayLengthAt(tracks, [["tracks", "data"], ["tracks"], ["data", "tracks"]])
      ?? arrayLengthAt(snapshot, [["snapshot", "data", "tracks"]])
      ?? numberAt(snapshot, [["snapshot", "data", "state", "track_count"]]),
    scenes: arrayLengthAt(scenes, [["scenes", "data"], ["scenes"], ["data", "scenes"]])
      ?? arrayLengthAt(snapshot, [["snapshot", "data", "scenes"]])
      ?? numberAt(snapshot, [["snapshot", "data", "state", "scene_count"]]),
    devices: arrayLengthAt(devices, [["bridge", "data", "devices"], ["devices", "data"], ["devices"], ["data", "devices"]])
      ?? numberAt(snapshot, [["snapshot", "data", "state", "device_count"]]),
    routingRows: arrayLengthAt(routing, [["bridge", "data", "send_matrix"], ["bridge", "send_matrix"], ["data", "send_matrix"], ["send_matrix"]])
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
    objectiveReadiness: {
      overallStatus: stringAt(objectiveReadiness, [["objectiveReadiness", "overallStatus"]]),
      okForDefaultClientUse: booleanAt(objectiveReadiness, [["objectiveReadiness", "okForDefaultClientUse"]]),
      okForFullLiveMusicProduction: booleanAt(objectiveReadiness, [["objectiveReadiness", "okForFullLiveMusicProduction"]]),
      hardFailures: stringArrayAt(objectiveReadiness, [["objectiveReadiness", "summary", "hardFailures"]]),
      pendingRuntime: stringArrayAt(objectiveReadiness, [["objectiveReadiness", "summary", "pendingRuntime"]])
    },
    launchReadiness: {
      mode: stringAt(launchReadiness, [["launchReadiness", "mode"]]),
      okForDefaultClientUse: booleanAt(launchReadiness, [["launchReadiness", "okForDefaultClientUse"]]),
      safeToolCount: numberAt(launchReadiness, [["launchReadiness", "summary", "safeToolCount"]]),
      liveControlCoverage: {
        areas: numberAt(launchReadiness, [["launchReadiness", "liveControlCoverage", "summary", "areas"]]),
        writeGatedSupported: numberAt(launchReadiness, [["launchReadiness", "liveControlCoverage", "summary", "writeGatedSupported"]]),
        unsupported: numberAt(launchReadiness, [["launchReadiness", "liveControlCoverage", "summary", "unsupported"]]),
        nativeDeviceInsertion: coverageAreaStatus(launchReadiness, "native_device_insertion"),
        automationBreakpointWrites: coverageAreaStatus(launchReadiness, "automation_breakpoint_writes")
      }
    },
    bridgeCapabilitySummary: asRecord(getNested(bridgeCapabilities, ["capabilities", "summary"])) ?? null,
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
