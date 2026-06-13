import http from "node:http";
import { AbletonMcpError } from "./errors.js";

export type BridgeRequest = {
  action: string;
  payload?: Record<string, unknown>;
};

export type BridgeActionCapability = {
  action: string;
  tool?: string;
  status: "read_only" | "write_gated" | "unsupported" | "diagnostic";
  domain: string;
  requiresWriteGate?: boolean;
  dryRunFirst?: boolean;
  notes?: string;
};

const bridgeHost = "127.0.0.1";
const configuredBridgePort = Number(process.env.ABLETON_MCP_BRIDGE_PORT ?? "17364");
const bridgePort = Number.isInteger(configuredBridgePort) && configuredBridgePort > 0 && configuredBridgePort <= 65535
  ? configuredBridgePort
  : 17364;
const MAX_BRIDGE_RESPONSE_BYTES = 128_000;
const allowedActionPattern = /^[a-z][a-z0-9_]{0,63}$/;
const BRIDGE_QUEUE_TIMEOUT_MS = 30_000;
let queuedBridgeWork: Promise<unknown> = Promise.resolve();
let bridgeQueueDepth = 0;
let bridgeRequestSequence = 0;
let lastBridgeAction: { action: string; at: string; durationMs: number; ok: boolean } | null = null;

const bridgeCapabilities: BridgeActionCapability[] = [
  { action: "ping", tool: "ableton_bridge_ping", status: "diagnostic", domain: "bridge", notes: "Heartbeat and bridge identity only." },
  { action: "bridge_capabilities", tool: "ableton_get_bridge_capabilities", status: "diagnostic", domain: "bridge", notes: "Static bridge-side capability report." },
  { action: "live_state", tool: "ableton_get_live_state", status: "read_only", domain: "set" },
  { action: "full_snapshot", tool: "ableton_get_full_snapshot", status: "read_only", domain: "set" },
  { action: "snapshot_diff", tool: "ableton_get_snapshot_diff", status: "read_only", domain: "set" },
  { action: "list_tracks", tool: "ableton_list_tracks", status: "read_only", domain: "tracks" },
  { action: "list_return_tracks", tool: "ableton_list_return_tracks", status: "read_only", domain: "returns" },
  { action: "master_track", tool: "ableton_get_master_track", status: "read_only", domain: "master" },
  { action: "track_mixer", tool: "ableton_get_track_mixer", status: "read_only", domain: "mixer" },
  { action: "return_track_mixer", tool: "ableton_get_return_track_mixer", status: "read_only", domain: "mixer" },
  { action: "list_scenes", tool: "ableton_list_scenes", status: "read_only", domain: "scenes" },
  { action: "list_clips", tool: "ableton_list_clips", status: "read_only", domain: "clips" },
  { action: "list_clip_slots", tool: "ableton_list_clip_slots", status: "read_only", domain: "clips" },
  { action: "list_devices", tool: "ableton_list_devices", status: "read_only", domain: "devices" },
  { action: "list_device_parameters", tool: "ableton_list_device_parameters", status: "read_only", domain: "devices" },
  { action: "arrangement_markers", tool: "ableton_list_arrangement_markers", status: "read_only", domain: "arrangement" },
  { action: "clip_notes", tool: "ableton_get_clip_notes", status: "read_only", domain: "clips", notes: "Returns unsupported when the current clip/API cannot expose notes reliably." },
  { action: "clip_envelopes", tool: "ableton_get_clip_envelopes", status: "unsupported", domain: "automation", notes: "Detailed clip envelope enumeration needs a reviewed LiveAPI mapping." },
  { action: "device_parameter_map", tool: "ableton_get_device_parameter_map", status: "read_only", domain: "devices" },
  { action: "automation_summary", tool: "ableton_extract_automation_summary", status: "read_only", domain: "automation", notes: "Enumerates live mixer and device parameter targets; automation breakpoint writes remain unsupported." },
  { action: "ui_overview", tool: "ableton_get_ui_overview", status: "unsupported", domain: "ui", notes: "Live UI overview is handled by the separate user-enabled UI driver." },
  { action: "selected_track", tool: "ableton_get_selected_track", status: "read_only", domain: "selection" },
  { action: "selected_device", tool: "ableton_get_selected_device", status: "read_only", domain: "selection" },
  { action: "tempo", tool: "ableton_get_tempo", status: "read_only", domain: "transport" },
  { action: "transport", tool: "ableton_get_transport", status: "read_only", domain: "transport" },
  { action: "ableton_set_tempo", tool: "ableton_set_tempo", status: "write_gated", domain: "transport", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_transport_control", tool: "ableton_transport_control", status: "write_gated", domain: "transport", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_create_audio_track", tool: "ableton_create_audio_track", status: "write_gated", domain: "tracks", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_create_midi_track", tool: "ableton_create_midi_track", status: "write_gated", domain: "tracks", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_create_return_track", tool: "ableton_create_return_track", status: "write_gated", domain: "returns", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_create_scene", tool: "ableton_create_scene", status: "write_gated", domain: "scenes", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_fire_scene", tool: "ableton_fire_scene", status: "write_gated", domain: "scenes", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_scene_tempo", tool: "ableton_set_scene_tempo", status: "write_gated", domain: "scenes", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_scene_time_signature", tool: "ableton_set_scene_time_signature", status: "write_gated", domain: "scenes", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_scene_color", tool: "ableton_set_scene_color", status: "write_gated", domain: "scenes", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_create_clip", tool: "ableton_create_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_create_midi_clip", tool: "ableton_create_midi_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_insert_midi_notes", tool: "ableton_insert_midi_notes", status: "write_gated", domain: "midi", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_load_preset_or_sample", tool: "ableton_load_preset_or_sample", status: "write_gated", domain: "samples", requiresWriteGate: true, dryRunFirst: true, notes: "Audio-clip mode only, using approved local paths." },
  { action: "ableton_set_clip_loop", tool: "ableton_set_clip_loop", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_clip_gain", tool: "ableton_set_clip_gain", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_transpose_clip", tool: "ableton_transpose_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_clip_warp", tool: "ableton_set_clip_warp", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_clip_markers", tool: "ableton_set_clip_markers", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_clip_color", tool: "ableton_set_clip_color", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_fire_clip", tool: "ableton_fire_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_stop_clip", tool: "ableton_stop_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_duplicate_scene", tool: "ableton_duplicate_scene", status: "write_gated", domain: "scenes", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_duplicate_clip", tool: "ableton_duplicate_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_move_clip", tool: "ableton_move_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_arm_track", tool: "ableton_arm_track", status: "write_gated", domain: "tracks", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_mute_track", tool: "ableton_mute_track", status: "write_gated", domain: "tracks", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_solo_track", tool: "ableton_solo_track", status: "write_gated", domain: "tracks", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_track_color", tool: "ableton_set_track_color", status: "write_gated", domain: "tracks", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_track_volume", tool: "ableton_set_track_volume", status: "write_gated", domain: "mixer", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_track_pan", tool: "ableton_set_track_pan", status: "write_gated", domain: "mixer", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_track_send", tool: "ableton_set_track_send", status: "write_gated", domain: "mixer", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_return_track_color", tool: "ableton_set_return_track_color", status: "write_gated", domain: "returns", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_return_track_volume", tool: "ableton_set_return_track_volume", status: "write_gated", domain: "mixer", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_return_track_pan", tool: "ableton_set_return_track_pan", status: "write_gated", domain: "mixer", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_master_volume", tool: "ableton_set_master_volume", status: "write_gated", domain: "mixer", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_master_pan", tool: "ableton_set_master_pan", status: "write_gated", domain: "mixer", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_set_device_parameter", tool: "ableton_set_device_parameter", status: "write_gated", domain: "devices", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_rename_track", tool: "ableton_rename_track", status: "write_gated", domain: "tracks", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_rename_return_track", tool: "ableton_rename_return_track", status: "write_gated", domain: "returns", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_rename_scene", tool: "ableton_rename_scene", status: "write_gated", domain: "scenes", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_rename_clip", tool: "ableton_rename_clip", status: "write_gated", domain: "clips", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_create_arrangement_marker", tool: "ableton_create_arrangement_marker", status: "write_gated", domain: "arrangement", requiresWriteGate: true, dryRunFirst: true },
  { action: "ableton_insert_instrument", tool: "ableton_insert_instrument", status: "unsupported", domain: "devices", notes: "Needs a verified Browser/hot-swap target for the running Ableton version." },
  { action: "ableton_insert_effect", tool: "ableton_insert_effect", status: "unsupported", domain: "devices", notes: "Needs a verified Browser/hot-swap target for the running Ableton version." },
  { action: "ableton_map_macro", tool: "ableton_map_macro", status: "unsupported", domain: "devices", notes: "Rack macro mapping needs a verified rack/device mapping path for this Ableton version." },
  { action: "ableton_apply_groove", tool: "ableton_apply_groove", status: "unsupported", domain: "groove", notes: "Groove application needs a verified groove-pool and clip mapping path for this Ableton version." },
  { action: "ableton_create_automation_envelope", tool: "ableton_create_automation_envelope", status: "unsupported", domain: "automation", notes: "LiveAPI envelope creation is not exposed reliably from this bridge context." },
  { action: "ableton_set_automation_point", tool: "ableton_set_automation_point", status: "unsupported", domain: "automation", notes: "LiveAPI breakpoint writing is not exposed reliably from this bridge context." },
  { action: "ableton_simplify_automation", tool: "ableton_simplify_automation", status: "unsupported", domain: "automation", notes: "LiveAPI automation simplification is not exposed reliably from this bridge context." },
  { action: "ableton_quantize_clip", tool: "ableton_quantize_clip", status: "unsupported", domain: "midi", notes: "Quantization enum values vary by context." },
  { action: "ableton_humanize_midi_clip", tool: "ableton_humanize_midi_clip", status: "unsupported", domain: "midi", notes: "Needs verified note read/rewrite support." }
];

export function getBridgeCapabilityMatrix() {
  const summary = bridgeCapabilities.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1;
    return acc;
  }, {} as Record<BridgeActionCapability["status"], number>);
  return {
    protocol: "ableton-mcp-liveapi-v1",
    host: bridgeHost,
    port: bridgePort,
    defaultControl: "background_liveapi_bridge",
    serialized: true,
    gates: {
      writes: "ABLETON_MCP_ENABLE_WRITE=1 and dry_run=false",
      downloads: "ABLETON_MCP_ENABLE_DOWNLOADS=1",
      uiControl: "ABLETON_MCP_ENABLE_UI_CONTROL=1"
    },
    summary,
    actions: bridgeCapabilities.map((entry) => ({ ...entry }))
  };
}

function assertSafeBridgeAction(action: string) {
  if (!allowedActionPattern.test(action)) {
    throw new AbletonMcpError("Bridge action rejected by allowlist pattern.", "BRIDGE_ACTION_REJECTED", ["Use a fixed bridge action id registered by the MCP server."]);
  }
}

function bridgeCall<T>(request: BridgeRequest, timeoutMs = 2_500): Promise<T> {
  assertSafeBridgeAction(request.action);
  const body = JSON.stringify({ id: crypto.randomUUID(), ...request });
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: bridgeHost,
      port: bridgePort,
      method: "POST",
      path: "/ableton-mcp",
      timeout: timeoutMs,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BRIDGE_RESPONSE_BYTES) {
          req.destroy(new AbletonMcpError("Ableton bridge response exceeded size limit.", "BRIDGE_RESPONSE_TOO_LARGE", ["Request a narrower snapshot or bridge operation."]));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 500) >= 400) {
          try {
            const parsed = JSON.parse(text) as { code?: string; error?: string; nextSteps?: string[] };
            reject(new AbletonMcpError(
              parsed.error ?? `Ableton bridge returned HTTP ${res.statusCode}.`,
              parsed.code ?? "BRIDGE_HTTP_ERROR",
              Array.isArray(parsed.nextSteps) ? parsed.nextSteps : ["Confirm the Max for Live bridge device is loaded and listening on 127.0.0.1."]
            ));
          } catch {
            reject(new AbletonMcpError(`Ableton bridge returned HTTP ${res.statusCode}: ${text}`, "BRIDGE_HTTP_ERROR", ["Confirm the Max for Live bridge device is loaded and listening on 127.0.0.1."]));
          }
          return;
        }
        try {
          const parsed = JSON.parse(text) as { ok?: boolean; code?: string; error?: string; nextSteps?: string[] };
          if (parsed.ok === false) {
            reject(new AbletonMcpError(
              parsed.error ?? "Ableton bridge returned an execution error.",
              parsed.code ?? "BRIDGE_EXECUTION_ERROR",
              Array.isArray(parsed.nextSteps) ? parsed.nextSteps : ["Check the Ableton bridge logs and retry."]
            ));
            return;
          }
          resolve(parsed as T);
        } catch {
          reject(new AbletonMcpError("Ableton bridge returned invalid JSON.", "BRIDGE_INVALID_JSON", ["Restart the bridge device and retry."]));
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new AbletonMcpError("Ableton bridge request timed out.", "BRIDGE_TIMEOUT", ["Open Ableton Live, load the bridge device, then run ableton_bridge_ping."]));
    });
    req.on("error", (error) => reject(error instanceof AbletonMcpError ? error : new AbletonMcpError(`Ableton bridge is not reachable at ${bridgeHost}:${bridgePort}.`, "BRIDGE_UNREACHABLE", ["Open Ableton Live.", "Install/load the Max for Live bridge from bridge/max-for-live.", "Retry ableton_bridge_ping."])));
    req.write(body);
    req.end();
  });
}

async function enqueueBridgeCall<T>(request: BridgeRequest, timeoutMs?: number): Promise<T> {
  assertSafeBridgeAction(request.action);
  bridgeRequestSequence += 1;
  bridgeQueueDepth += 1;
  const startedAt = Date.now();
  const run = async () => {
    const waitedMs = Date.now() - startedAt;
    if (waitedMs > BRIDGE_QUEUE_TIMEOUT_MS) {
      throw new AbletonMcpError("Ableton bridge command waited too long in the local queue.", "BRIDGE_QUEUE_TIMEOUT", ["Retry after the active Ableton command finishes.", "Use ableton_control_mode_status to inspect queue state."]);
    }
    const actionStartedAt = Date.now();
    try {
      const result = await bridgeCall<T>(request, timeoutMs);
      lastBridgeAction = { action: request.action, at: new Date().toISOString(), durationMs: Date.now() - actionStartedAt, ok: true };
      return result;
    } catch (error) {
      lastBridgeAction = { action: request.action, at: new Date().toISOString(), durationMs: Date.now() - actionStartedAt, ok: false };
      throw error;
    } finally {
      bridgeQueueDepth = Math.max(0, bridgeQueueDepth - 1);
    }
  };
  const next = queuedBridgeWork.then(run, run);
  queuedBridgeWork = next.catch(() => undefined);
  return next;
}

export async function pingBridge() {
  return enqueueBridgeCall({ action: "ping" });
}

export async function getBridgeSnapshot(diff = false) {
  return enqueueBridgeCall({ action: diff ? "snapshot_diff" : "full_snapshot" });
}

export async function bridgeAction(action: string, payload: Record<string, unknown> = {}) {
  return enqueueBridgeCall({ action, payload });
}

export function getBridgeRuntimeState() {
  return {
    host: bridgeHost,
    port: bridgePort,
    queueDepth: bridgeQueueDepth,
    serialized: true,
    queueTimeoutMs: BRIDGE_QUEUE_TIMEOUT_MS,
    requestSequence: bridgeRequestSequence,
    lastBridgeAction
  };
}
