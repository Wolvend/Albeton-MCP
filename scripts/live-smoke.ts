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
  required: boolean;
  structuredContent?: unknown;
  error?: string;
};

type PublicSmokeResult = {
  name: string;
  ok: boolean;
  isError: boolean;
  required: boolean;
  error?: string;
};

export type LiveSmokeReport = {
  ok: boolean;
  bridgeReachable: boolean;
  bridgeNeedsReload: boolean;
  dryRunWriteConfirmed: boolean;
  deepProbe: boolean;
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
  bridgeSetup: {
    status: string | null;
    installReady: boolean | null;
    liveRunning: boolean | null;
    checked: boolean | null;
    reachable: boolean | null;
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
  { name: "ableton_mcp_get_objective_readiness_report", arguments: { check_bridge: true }, required: true },
  { name: "ableton_mcp_get_launch_readiness_audit", arguments: { check_bridge: true }, required: true },
  { name: "ableton_get_bridge_capabilities", arguments: { check_bridge: true }, required: true },
  { name: "ableton_live_status", arguments: {}, required: true },
  { name: "ableton_bridge_status", arguments: {}, required: true },
  { name: "ableton_bridge_setup_status", arguments: { check_bridge: true }, required: true },
  { name: "ableton_bridge_ping", arguments: {}, required: true },
  { name: "ableton_get_live_state", arguments: {}, required: true },
  { name: "ableton_list_tracks_compact", arguments: { page: 1, pageSize: 16 }, required: true },
  { name: "ableton_get_track_detail", arguments: { track_index: 0, include_mixer: true, include_devices: false, include_clip_slots: false, page: 1, pageSize: 8 }, required: true },
  { name: "ableton_list_scenes", arguments: {}, required: true },
  {
    name: "ableton_duplicate_clip",
    arguments: { track_index: 0, clip_slot_index: 0, destination_clip_slot_index: 1, dry_run: true },
    required: true
  },
  { name: "ableton_control_mode_status", arguments: {}, required: true }
];

export const liveSmokeDeepCalls: SmokeCall[] = [
  { name: "ableton_list_devices", arguments: { track_index: 0, page: 1, pageSize: 1 }, required: false }
];

const bridgeReadCalls = new Set([
  "ableton_get_live_state",
  "ableton_list_tracks_compact",
  "ableton_get_track_detail",
  "ableton_list_scenes",
  "ableton_list_devices"
]);

const skipWhenBridgePingFails = bridgeReadCalls;

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

function isTimeoutError(result: SmokeResult) {
  const error = publicError(result) ?? "";
  return /BRIDGE_TIMEOUT|LIVEAPI_TIMEOUT|timed out/i.test(error);
}

export function chooseDeviceProbeTrackIndex(results: SmokeResult[]) {
  const tracks = getNested(resultByName(results, "ableton_list_tracks_compact")?.structuredContent, ["bridge", "data", "tracks"]);
  if (!Array.isArray(tracks)) return 0;

  const trackRecords = tracks
    .map((track) => asRecord(track))
    .filter((track): track is Record<string, unknown> => Boolean(track));
  const safeTrack = trackRecords.find((track) => {
    const name = typeof track.name === "string" ? track.name.toLowerCase() : "";
    return !name.includes("mcp bridge") && track.device_count === 0;
  }) ?? trackRecords.find((track) => {
    const name = typeof track.name === "string" ? track.name.toLowerCase() : "";
    return !name.includes("mcp bridge");
  }) ?? trackRecords[0];

  const index = safeTrack?.index;
  return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : 0;
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
  const bridgeSetup = resultByName(results, "ableton_bridge_setup_status")?.structuredContent;
  const setupStatus = stringAt(bridgeSetup, [["bridgeSetup", "status"]]);
  const installReady = booleanAt(bridgeSetup, [["bridgeSetup", "install", "ready"]]);
  const liveRunning = booleanAt(bridgeSetup, [["bridgeSetup", "live", "running"]]);
  const addHint = (hint: string) => {
    const normalized = hint.trim().toLowerCase();
    if (liveRunning === true && normalized === "open ableton live.") return;
    if (
      setupStatus === "bridge_device_not_loaded"
      && installReady === true
      && normalized === "install/load the max for live bridge from bridge/max-for-live."
    ) return;
    if (
      setupStatus
      && setupStatus !== "ready"
      && normalized === "open ableton live and load the ableton mcp bridge max for live device."
    ) return;
    hints.add(hint);
  };
  for (const result of results) {
    const structured = asRecord(result.structuredContent);
    if (result.ok && result.name === "ableton_bridge_setup_status") {
      const setupHints = getNested(structured, ["bridgeSetup", "nextSteps"]);
      if (setupStatus !== "ready" && Array.isArray(setupHints)) {
        for (const hint of setupHints) if (typeof hint === "string") addHint(hint);
      }
    }
    if (isTimeoutError(result)) {
      addHint("Reload the Ableton MCP Bridge Max for Live device, then rerun npm run live-smoke.");
    }
    if (result.ok || result.required === false) continue;
    const directHints = structured?.nextSteps ?? structured?.nextStep;
    if (Array.isArray(directHints)) {
      for (const hint of directHints) if (typeof hint === "string") addHint(hint);
    } else if (typeof directHints === "string") {
      addHint(directHints);
    }
    if (result.error?.includes("BRIDGE_UNREACHABLE") || result.error?.includes("not reachable")) {
      addHint("Open Ableton Live and load the Ableton MCP Bridge Max for Live device.");
      addHint("Run ableton_bridge_ping after the bridge device reports it is listening on 127.0.0.1:17364.");
    }
  }
  return [...hints];
}

function publicError(result: SmokeResult) {
  if (result.error) return result.error;
  const structured = asRecord(result.structuredContent);
  const code = typeof structured?.code === "string" ? structured.code : null;
  const message = typeof structured?.error === "string" ? structured.error : null;
  if (code && message) return `${code}: ${message}`;
  return message ?? code ?? undefined;
}

export function buildLiveSmokeReport(results: SmokeResult[], options: { deep?: boolean } = {}): LiveSmokeReport {
  const objectiveReadiness = resultByName(results, "ableton_mcp_get_objective_readiness_report")?.structuredContent;
  const launchReadiness = resultByName(results, "ableton_mcp_get_launch_readiness_audit")?.structuredContent;
  const bridgeCapabilities = resultByName(results, "ableton_get_bridge_capabilities")?.structuredContent;
  const bridgeSetup = resultByName(results, "ableton_bridge_setup_status")?.structuredContent;
  const liveState = resultByName(results, "ableton_get_live_state")?.structuredContent;
  const tracks = resultByName(results, "ableton_list_tracks_compact")?.structuredContent;
  const scenes = resultByName(results, "ableton_list_scenes")?.structuredContent;
  const devices = resultByName(results, "ableton_list_devices")?.structuredContent;
  const dryRun = resultByName(results, "ableton_duplicate_clip")?.structuredContent;

  const counts = {
    tracks: arrayLengthAt(tracks, [["bridge", "data", "tracks"], ["tracks", "data"], ["tracks"], ["data", "tracks"]])
      ?? numberAt(tracks, [["bridge", "data", "track_count"], ["track_count"]])
      ?? numberAt(liveState, [["bridge", "data", "track_count"]]),
    scenes: arrayLengthAt(scenes, [["scenes", "data"], ["scenes"], ["data", "scenes"]])
      ?? arrayLengthAt(scenes, [["bridge", "data", "scenes"]])
      ?? numberAt(liveState, [["bridge", "data", "scene_count"]]),
    devices: arrayLengthAt(devices, [["bridge", "data", "devices"], ["devices", "data"], ["devices"], ["data", "devices"]])
      ?? numberAt(devices, [["bridge", "data", "device_count"]]),
    routingRows: null
  };

  const bridgePing = resultByName(results, "ableton_bridge_ping");
  const bridgeReachable = Boolean(bridgePing?.ok);
  const bridgeNeedsReload = results.some((result) => bridgeReadCalls.has(result.name) && isTimeoutError(result));
  const dryRunWriteConfirmed = getNested(dryRun, ["dry_run"]) === true
    || getNested(dryRun, ["runtime", "tool"]) === "ableton_duplicate_clip";
  const requiredFailures = results.filter((result) => result.required !== false && !result.ok).map((result) => result.name);

  return {
    ok: requiredFailures.length === 0 && bridgeReachable && dryRunWriteConfirmed && !bridgeNeedsReload,
    bridgeReachable,
    bridgeNeedsReload,
    dryRunWriteConfirmed,
    deepProbe: Boolean(options.deep),
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
    bridgeSetup: {
      status: stringAt(bridgeSetup, [["bridgeSetup", "status"]]),
      installReady: booleanAt(bridgeSetup, [["bridgeSetup", "install", "ready"]]),
      liveRunning: booleanAt(bridgeSetup, [["bridgeSetup", "live", "running"]]),
      checked: booleanAt(bridgeSetup, [["bridgeSetup", "bridge", "checked"]]),
      reachable: booleanAt(bridgeSetup, [["bridgeSetup", "bridge", "reachable"]])
    },
    bridgeCapabilitySummary: asRecord(getNested(bridgeCapabilities, ["capabilities", "summary"])) ?? null,
    counts,
    setupHints: collectSetupHints(results),
    results: results.map((result) => {
      const error = publicError(result);
      return {
        name: result.name,
        ok: result.ok,
        isError: result.isError,
        required: result.required,
        ...(error ? { error } : {})
      };
    })
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
      required: call.required,
      structuredContent: result.structuredContent
    };
  } catch (error) {
    return {
      name: call.name,
      ok: false,
      isError: true,
      required: call.required,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function skippedBridgeResult(call: SmokeCall): SmokeResult {
  return {
    name: call.name,
    ok: false,
    isError: true,
    required: call.required,
    error: "SKIPPED_BRIDGE_UNREACHABLE: ableton_bridge_ping failed, so live bridge read probes were not queued."
  };
}

function skippedBridgeTimeoutResult(call: SmokeCall): SmokeResult {
  return {
    name: call.name,
    ok: false,
    isError: true,
    required: call.required,
    error: "SKIPPED_BRIDGE_TIMEOUT: a previous LiveAPI read timed out, so remaining bridge read probes were not queued. Reload the Ableton MCP Bridge Max for Live device."
  };
}

export function parseLiveSmokeArgs(argv = process.argv.slice(2)) {
  return {
    deep: argv.includes("--deep")
  };
}

export async function runLiveSmoke(options: { deep?: boolean } = {}) {
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
    let bridgePingFailed = false;
    let bridgeReadTimedOut = false;
    const calls = options.deep ? [...liveSmokeCalls, ...liveSmokeDeepCalls] : liveSmokeCalls;
    for (const baseCall of calls) {
      if (bridgePingFailed && skipWhenBridgePingFails.has(baseCall.name)) {
        results.push(skippedBridgeResult(baseCall));
        continue;
      }
      if (bridgeReadTimedOut && bridgeReadCalls.has(baseCall.name)) {
        results.push(skippedBridgeTimeoutResult(baseCall));
        continue;
      }
      let call: SmokeCall = baseCall;
      if (baseCall.name === "ableton_list_devices") {
        call = {
          ...baseCall,
          arguments: {
            ...baseCall.arguments,
            track_index: chooseDeviceProbeTrackIndex(results)
          }
        };
      }
      const result = await callTool(client, call);
      results.push(result);
      if (baseCall.name === "ableton_bridge_ping" && !result.ok) bridgePingFailed = true;
      if (bridgeReadCalls.has(baseCall.name) && isTimeoutError(result)) bridgeReadTimedOut = true;
    }
    return buildLiveSmokeReport(results, options);
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runLiveSmoke(parseLiveSmokeArgs());
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
