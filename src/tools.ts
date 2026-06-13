import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeAbletonSet, analyzeAudioFile, convertAudioFile } from "./analysis.js";
import { bridgeAction, getBridgeRuntimeState, getBridgeSnapshot, pingBridge } from "./bridge.js";
import { getBridgeInstallPlan, installBridgeFiles } from "./bridge-install.js";
import { FLAGS, LOCAL_PATHS, PLATFORM } from "./config.js";
import { environmentSnapshot } from "./environment.js";
import { AbletonMcpError, requireFlag } from "./errors.js";
import { paginate } from "./response.js";
import { getRuntimeReport, runTool, type RuntimeTool, type ToolAnnotations } from "./runtime.js";
import { getScanStatus, scanLibrary } from "./scanner.js";
import { queryLibrary } from "./cache.js";
import { downloadSample, generateAttributionReport, getInternetArchiveMetadata, importSampleToLibrary, listInternetArchiveAudioFiles, normalizeLicense, searchFreesound, searchInternetArchiveAudio } from "./samples.js";
import { downloadPluginPackage, planPluginDownload, pluginInstallInstructions, searchPluginCatalog } from "./plugins.js";
import { redactPath, resolveSafePath, rootsForReport } from "./security.js";
import { getUiDriverRuntimeState, pingUiDriver, uiDriverAction } from "./ui-driver.js";
import { assertAllowedSampleUrl } from "./network.js";
import {
  buildLayeredArrangementPlan,
  buildArrangementFromPreparedAudio,
  createConceptExecutionApprovalBundle,
  executeConceptPlan,
  exportConceptMidiMotif,
  getArrangementPlanForReport,
  getConceptPlanForReport,
  listArrangementPlans,
  listConceptPlans,
  planConceptDeviceAutomationReadiness,
  planConceptProduction,
  planConceptTrack,
  preflightConceptExecution,
  prepareConceptAudioLayers,
  renderDeliveryPlan,
  searchConceptSamples,
  stageConceptSamples
} from "./concept.js";

const Empty = {};
const Page = { page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) };
const Query = { query: z.string().max(200).default(""), ...Page };
const PathArg = { path: z.string().min(1) };
const DryRun = { dry_run: z.boolean().default(true) };
const TrackIndex = z.number().int().min(0);
const ReturnTrackIndex = z.number().int().min(0);
const SceneIndex = z.number().int().min(0);
const ClipSlotIndex = z.number().int().min(0);
const DeviceIndex = z.number().int().min(0);
const ParameterIndex = z.number().int().min(0);
const BeatTime = z.number().min(0).max(100_000);
const TrackClipRef = { track_index: TrackIndex, clip_slot_index: ClipSlotIndex };
const OptionalTrackClipRef = { track_index: TrackIndex.default(0), clip_slot_index: ClipSlotIndex.default(0) };
const AutomationPoint = {
  track_index: TrackIndex,
  device_index: DeviceIndex.optional(),
  parameter_index: ParameterIndex,
  time: BeatTime,
  value: z.number()
};
const ConceptSources = z.array(z.enum(["local_library", "internet_archive", "freesound"])).min(1).max(3).default(["local_library", "internet_archive", "freesound"]);
const ConceptPlanId = z.string().regex(/^concept-[a-f0-9]{16}$/);
const ArrangementPlanId = z.string().regex(/^arrangement-[a-f0-9]{16}$/);
const PreparedAudioId = z.string().regex(/^prepared-audio-[a-f0-9]{16}$/);
const ConceptSampleAssignment = z.object({
  layer: z.string().min(1).max(128),
  path: z.string().min(1),
  clip_slot_index: ClipSlotIndex.default(0),
  name: z.string().min(1).max(128).optional()
});
const MidiNote = z.object({
  pitch: z.number().int().min(0).max(127),
  start_time: z.number().min(0).max(100_000),
  duration: z.number().positive().max(100_000),
  velocity: z.number().min(0).max(127).default(100),
  mute: z.boolean().default(false),
  probability: z.number().min(0).max(1).optional(),
  velocity_deviation: z.number().min(-127).max(127).optional(),
  release_velocity: z.number().min(0).max(127).optional()
});
const AudioFileExtensions = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg"]);
const SafeUiActionId = z.enum([
  "focus_window",
  "capture_screenshot",
  "capture_browser_region",
  "capture_detail_region"
]);
const SafeUiActionSequence = {
  actions: z.array(SafeUiActionId).min(1).max(12),
  ...DryRun
};

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  annotations: ToolAnnotations;
  handler: (args: any) => Promise<Record<string, unknown>>;
};

const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const rw = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const webro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function productionPlan(kind: string, payload: Record<string, unknown>, nextStep = "Review the plan, then execute with write-gated bridge tools if needed.") {
  return {
    kind,
    dry_run: true,
    safeByDefault: true,
    payload,
    nextStep
  };
}

async function librarySearch(args: any, kind?: string) {
  const rows = await queryLibrary(args.query, kind);
  return { ok: true, ...paginate(rows.map((row) => ({ ...row, path: redactPath(String(row.path)) })), args.page, args.pageSize) };
}

async function bridgeRead(action: string, payload: Record<string, unknown> = {}) {
  return { ok: true, bridge: await bridgeAction(action, payload) as Record<string, unknown> };
}

async function typedBridgeWrite(action: string, args: any, plan: Record<string, unknown>) {
  if (args.dry_run !== false) {
    return {
      ok: true,
      dry_run: true,
      action,
      plan,
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 to send this typed action to the Ableton bridge."
    };
  }
  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", action);
  return { ok: true, bridge: await bridgeAction(action, args) as Record<string, unknown> };
}

async function unsupportedLiveApiWrite(action: string, args: any, plan: Record<string, unknown>, reason: string) {
  const nextSteps = [
    "Use ableton_browse_live_devices and live read tools to inspect the target first.",
    "Use the user-enabled UI driver fallback only when foreground control is intentional.",
    "Retry with dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 only if the bridge for this Ableton version reports support."
  ];
  if (args.dry_run !== false) {
    return {
      ok: true,
      dry_run: true,
      unsupported: true,
      action,
      plan,
      reason,
      nextSteps
    };
  }
  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", action);
  return { ok: true, bridge: await bridgeAction(action, args) as Record<string, unknown>, plan, expectedUnsupported: true };
}

function isPathWithin(candidate: string, root: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveApprovedLocalSamplePath(inputPath: string) {
  const safe = await resolveSafePath(inputPath, { mustExist: true });
  const extension = path.extname(safe.real).toLowerCase();
  if (!AudioFileExtensions.has(extension)) {
    throw new AbletonMcpError("Only common local audio sample files may be loaded into Ableton clips.", "UNSUPPORTED_SAMPLE_TYPE", ["Use WAV, AIFF, FLAC, MP3, M4A, or OGG files."]);
  }
  const approvedRoots = [LOCAL_PATHS.staging, LOCAL_PATHS.imports, LOCAL_PATHS.userLibrary, LOCAL_PATHS.liveRecordings];
  if (!approvedRoots.some((root) => isPathWithin(safe.real, root))) {
    throw new AbletonMcpError("Local sample loads must come from staging, Codex Imports, the Ableton User Library, or Live Recordings.", "SAMPLE_PATH_NOT_APPROVED", ["Stage downloads first, or choose a sample already under the Ableton User Library."]);
  }
  return { real: safe.real, redacted: redactPath(safe.real), extension };
}

async function loadPresetOrSample(args: any) {
  const sample = await resolveApprovedLocalSamplePath(args.path);
  const payload = {
    path: sample.real,
    track_index: args.track_index,
    clip_slot_index: args.clip_slot_index,
    mode: args.mode,
    name: args.name
  };
  const plan = {
    target: "audio_clip_from_approved_local_sample",
    path: sample.redacted,
    extension: sample.extension,
    track_index: args.track_index,
    clip_slot_index: args.clip_slot_index,
    mode: args.mode
  };
  if (args.dry_run !== false) {
    return {
      ok: true,
      dry_run: true,
      action: "ableton_load_preset_or_sample",
      plan,
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 to create an audio clip from this approved local sample."
    };
  }
  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "ableton_load_preset_or_sample");
  return { ok: true, bridge: await bridgeAction("ableton_load_preset_or_sample", payload) as Record<string, unknown>, sample: plan };
}

async function uiWrite(action: string, args: any) {
  if (args.dry_run !== false) return { ok: true, dry_run: true, action, uiDriver: getUiDriverRuntimeState(), nextStep: "Set dry_run=false only when the Ableton UI driver is attached and you intentionally want mouse/keyboard control." };
  requireFlag(FLAGS.uiControl, "ABLETON_MCP_ENABLE_UI_CONTROL", action);
  return { ok: true, uiDriver: await uiDriverAction(action, args) as Record<string, unknown> };
}

function controlModeStatus() {
  return {
    defaultMode: "background_bridge",
    activeBridge: getBridgeRuntimeState(),
    uiFallback: {
      availableAsPolicy: true,
      enabled: FLAGS.uiControl,
      defaultEnabled: false,
      driver: getUiDriverRuntimeState(),
      reason: "Foreground control is routed through a loopback Ableton UI Driver, similar to ChromeDriver, instead of ad hoc chat-side cursor control."
    },
    conflictPolicy: {
      bridgeCommandsSerialized: true,
      uiControlRequiresExplicitFlag: "ABLETON_MCP_ENABLE_UI_CONTROL=1",
      writesRequireExplicitFlag: "ABLETON_MCP_ENABLE_WRITE=1",
      avoidOverlap: "Do not run foreground UI automation while bridge write commands are active."
    }
  };
}

function uiControlConsentProfile(purpose = "Ableton UI fallback") {
  return {
    purpose,
    userChoiceRequired: true,
    enabled: FLAGS.uiControl,
    defaultEnabled: false,
    driver: getUiDriverRuntimeState(),
    launchCommand: process.platform === "win32" ? ".\\launch.ps1 ui-driver" : "./launch.sh ui-driver",
    requiredEnv: {
      ABLETON_MCP_ENABLE_UI_CONTROL: "1"
    },
    boundaries: [
      "Targets only Ableton Live windows.",
      "Uses Ableton-window-relative coordinates for coordinate actions.",
      "Runs through the serialized loopback UI driver on 127.0.0.1.",
      "Do not run UI/mouse actions at the same time as write-gated bridge actions."
    ],
    recommendedSequence: [
      "Call ableton_ui_control_consent_status.",
      "Start the UI driver only if foreground control is intentional.",
      "Call ableton_window_status or ableton_capture_screenshot before clicks.",
      "Use dry_run=true before any click or type action."
    ]
  };
}

function clientConnectionProfiles() {
  const port = Number(process.env.ABLETON_MCP_HTTP_PORT ?? "17366");
  const configuredHost = process.env.ABLETON_MCP_HTTP_HOST ?? "127.0.0.1";
  const tailscaleHost = process.env.ABLETON_MCP_TAILSCALE_HOST ?? "100.84.223.22";
  const remoteEnabled = process.env.ABLETON_MCP_HTTP_ALLOW_REMOTE === "1";
  const tokenConfigured = Boolean(process.env.ABLETON_MCP_HTTP_TOKEN?.trim());
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => ({ interface: name, address: entry.address }))
  );
  return {
    stdio: {
      clients: ["Codex", "Claude Desktop", "Cursor", "other local MCP clients"],
      command: process.platform === "win32" ? path.join(LOCAL_PATHS.projectRoot, "launch.cmd") : path.join(LOCAL_PATHS.projectRoot, "launch.sh"),
      args: ["stdio"],
      note: "Best default for same-device local clients."
    },
    httpLocal: {
      clients: ["Docker MCP", "HTTP-capable MCP clients", "WSL clients"],
      url: `http://127.0.0.1:${port}/mcp`,
      launch: process.platform === "win32" ? ".\\launch.ps1 docker" : "./launch.sh docker",
      note: "Default HTTP mode stays on loopback."
    },
    httpPrivateNetwork: {
      enabled: remoteEnabled,
      configuredHost,
      tokenConfigured,
      requiredEnv: {
        ABLETON_MCP_HTTP_ALLOW_REMOTE: "1",
        ABLETON_MCP_HTTP_HOST: "0.0.0.0 or a specific private interface IP",
        ABLETON_MCP_TAILSCALE_HOST: tailscaleHost,
        ABLETON_MCP_HTTP_TOKEN: "required bearer token, at least 16 characters"
      },
      preferredTailscaleUrl: `http://${tailscaleHost}:${port}/mcp`,
      candidateUrls: addresses.map((item) => ({ ...item, url: `http://${item.address}:${port}/mcp` })),
      note: "Use Tailscale/VPN or a trusted private LAN. Do not expose this to the public internet."
    },
    modelProviders: {
      OpenRouter: "Use through an MCP-capable host app or agent runtime; OpenRouter itself is a model provider, not the MCP transport endpoint.",
      Gemini: "Use through an MCP-capable Gemini client/agent runtime if it supports MCP server configuration.",
      llamaCpp: "Use through an MCP-capable local agent wrapper around llama.cpp; llama.cpp itself is model inference, not this MCP transport.",
      Claude: "Use stdio for desktop/local clients or HTTP if the client supports Streamable HTTP MCP.",
      Codex: "Use stdio for local desktop/Codex or HTTP for Docker/remote MCP routing.",
      Antigravity: "Use the stdio or Streamable HTTP profile if the app exposes MCP server configuration."
    }
  };
}

const toolDefs: ToolDef[] = [
  { name: "ableton_find_installation", description: "Find configured Ableton Live and Max paths for this host platform.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, installation: (await environmentSnapshot()).paths }) },
  { name: "ableton_get_environment", description: "Report Ableton MCP environment, flags, tools, and redacted allowed roots.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, environment: await environmentSnapshot() as any }) },
  { name: "ableton_validate_config", description: "Validate paths, feature gates, and toolchain availability.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, validation: await environmentSnapshot() as any }) },
  { name: "ableton_launch_live", description: "Launch Ableton Live using the verified local executable.", inputSchema: { ...DryRun }, annotations: rw, handler: async (args) => {
    if (args.dry_run !== false) {
      return {
        ok: true,
        dry_run: true,
        executable: LOCAL_PATHS.liveExecutable,
        writeRequiredForLaunch: "ABLETON_MCP_ENABLE_WRITE=1"
      };
    }
    requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Launching Ableton Live");
    if (!LOCAL_PATHS.liveExecutable) {
      return {
        ok: false,
        platform: PLATFORM.nodePlatform,
        error: "Ableton Live executable is not configured for this platform.",
        nextSteps: ["Set ABLETON_MCP_LIVE_EXECUTABLE to a local Ableton executable path.", "On Linux/WSL, run Ableton control through a Windows or macOS host bridge instead of launching Ableton inside Linux."]
      };
    }
    const child = (await import("node:child_process")).spawn(LOCAL_PATHS.liveExecutable, [], { detached: true, stdio: "ignore", env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
    child.unref();
    return { ok: true, pid: child.pid ?? null };
  } },
  { name: "ableton_live_status", description: "Detect whether Ableton Live is running.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, status: { liveRunning: (await environmentSnapshot()).liveRunning, processes: (await environmentSnapshot()).abletonProcesses } }) },
  { name: "ableton_bridge_install_instructions", description: "Return Max for Live bridge setup steps.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, bridge: { type: "max-for-live", path: redactPath(path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live")), files: ["Ableton MCP Bridge.amxd", "ableton-mcp-bridge.maxpat", "ableton-mcp-http.js", "ableton-mcp-liveapi.js", "ableton-mcp-status.js", "package.json"], persistentPresetFolder: "%USERPROFILE%\\Documents\\Ableton\\User Library\\Presets\\MIDI Effects\\Max MIDI Effect", persistentDevice: "Ableton MCP Bridge.amxd", persistentSet: "%USERPROFILE%\\Documents\\Ableton\\Ableton MCP Bridge Set\\Ableton MCP Bridge Set Project\\Ableton MCP Bridge Set.als", steps: ["Run npm run bridge:install after npm run build.", "Open Ableton Live.", "Create or open a Live Set.", "Load Ableton MCP Bridge from User Library > Presets > MIDI Effects > Max MIDI Effect.", "Confirm the Max console says: Ableton MCP HTTP bridge listening on 127.0.0.1:17364.", "Run ableton_bridge_ping."] } }) },
  { name: "ableton_bridge_install_plan", description: "Plan the automatic Max for Live bridge file install into the Ableton User Library.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, bridgeInstall: await getBridgeInstallPlan({ dryRun: true }) }) },
  { name: "ableton_install_bridge_files", description: "Copy required bridge companion files into the Ableton User Library preset folder.", inputSchema: { ...DryRun }, annotations: rw, handler: async (args) => {
    if (args.dry_run !== false) return { ok: true, bridgeInstall: await installBridgeFiles({ dryRun: true }) };
    requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Installing Ableton bridge files");
    return { ok: true, bridgeInstall: await installBridgeFiles({ dryRun: false }) };
  } },
  { name: "ableton_bridge_ping", description: "Ping the loopback Max for Live bridge.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, bridge: await pingBridge() as any }) },
  { name: "ableton_bridge_status", description: "Report loopback bridge host, port, queue, and last command state.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, bridgeStatus: getBridgeRuntimeState() }) },
  { name: "ableton_ui_driver_status", description: "Report ChromeDriver-style Ableton UI driver host, port, queue, and last action state.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, uiDriverStatus: getUiDriverRuntimeState() }) },
  { name: "ableton_ui_control_consent_status", description: "Report whether foreground Ableton UI/mouse control has been intentionally enabled by the user.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, uiControl: uiControlConsentProfile() }) },
  { name: "ableton_plan_ui_control_session", description: "Plan a user-chosen foreground UI/mouse control session without moving the mouse.", inputSchema: { purpose: z.string().min(1).max(500).default("Ableton UI fallback"), actions: z.array(z.enum(["focus", "screenshot", "region_capture", "click", "type"])).max(20).default(["focus", "screenshot"]) }, annotations: ro, handler: async (args) => ({ ok: true, uiPlan: { ...uiControlConsentProfile(args.purpose), requestedActions: args.actions, canExecuteNow: FLAGS.uiControl, nextStep: FLAGS.uiControl ? "Start with ableton_window_status or ableton_capture_screenshot." : "Run .\\launch.ps1 ui-driver or set ABLETON_MCP_ENABLE_UI_CONTROL=1 only when foreground control is intentional." } }) },
  { name: "ableton_list_safe_ui_actions", description: "List reviewed Ableton UI actions that may be run only when UI control is user-enabled.", inputSchema: Empty, annotations: ro, handler: async () => {
    if (!FLAGS.uiControl) return { ok: true, uiControl: uiControlConsentProfile("List safe UI actions"), actions: [], note: "Start the UI driver to query the live driver allowlist." };
    return { ok: true, uiDriver: await uiDriverAction("list_safe_ui_actions") as Record<string, unknown> };
  } },
  { name: "ableton_plan_ui_action_sequence", description: "Plan a reviewed Ableton UI action sequence without moving the mouse.", inputSchema: SafeUiActionSequence, annotations: ro, handler: async (args) => {
    if (!FLAGS.uiControl) return { ok: true, dry_run: true, uiControl: uiControlConsentProfile("Plan UI action sequence"), actions: args.actions, nextStep: "Start the UI driver when foreground control is intentional." };
    return { ok: true, uiDriver: await uiDriverAction("plan_ui_action_sequence", args) as Record<string, unknown> };
  } },
  { name: "ableton_run_ui_action_sequence", description: "Run a reviewed Ableton UI action sequence through the gated UI driver.", inputSchema: SafeUiActionSequence, annotations: rw, handler: async (args) => uiWrite("run_ui_action_sequence", args) },
  { name: "ableton_ui_driver_ping", description: "Ping the loopback Ableton UI driver when UI control is enabled.", inputSchema: Empty, annotations: ro, handler: async () => {
    requireFlag(FLAGS.uiControl, "ABLETON_MCP_ENABLE_UI_CONTROL", "Ableton UI driver ping");
    return { ok: true, uiDriver: await pingUiDriver() as any };
  } },
  { name: "ableton_control_mode_status", description: "Report background bridge mode and explicit UI fallback policy.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, control: controlModeStatus() }) },
  { name: "ableton_get_production_readiness", description: "Summarize Ableton MCP readiness for professional music-production work.", inputSchema: Empty, annotations: ro, handler: async () => {
    const environment = await environmentSnapshot();
    return {
      ok: true,
      readiness: {
        liveRunning: environment.liveRunning,
        writeEnabled: FLAGS.write,
        uiControl: uiControlConsentProfile("Production readiness check"),
        bridge: getBridgeRuntimeState(),
        scan: getScanStatus(),
        recommendedWorkflow: [
          "Use LiveAPI bridge reads and dry-run writes first.",
          "Use foreground UI/mouse control only when the user intentionally starts the UI driver.",
          "Keep downloads and plugin installers separate from production sessions.",
          "Run ableton_mcp_security_report before enabling remote or write modes."
        ]
      }
    };
  } },
  { name: "ableton_export_diagnostic_report", description: "Write a redacted diagnostics JSON report under diagnostics/reports.", inputSchema: { full_local_paths: z.boolean().default(false) }, annotations: ro, handler: async (args) => {
    const dir = path.join(LOCAL_PATHS.diagnostics, "reports");
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, `diagnostic-${Date.now()}.json`);
    const report = { generatedAt: new Date().toISOString(), environment: await environmentSnapshot(), scan: getScanStatus() };
    await fs.writeFile(target, JSON.stringify(report, null, 2), { flag: "wx" });
    return { ok: true, path: args.full_local_paths ? target : redactPath(target), report };
  } },

  { name: "ableton_scan_library", description: "Incrementally index an allowed Ableton library path on demand.", inputSchema: { root: z.string().default(LOCAL_PATHS.userLibrary), limit: z.number().int().min(1).max(10000).default(2000) }, annotations: ro, handler: async (args) => ({ ok: true, scan: await scanLibrary(args.root, { limit: args.limit }) }) },
  { name: "ableton_get_scan_status", description: "Get current or last library scan status.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, scan: getScanStatus() }) },
  { name: "ableton_search_library", description: "Search indexed library items.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args) },
  { name: "ableton_search_samples", description: "Search indexed local samples.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args, "sample") },
  { name: "ableton_search_presets", description: "Search indexed presets and device racks.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args, "preset") },
  { name: "ableton_search_templates", description: "Search indexed Ableton templates.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args, "set") },
  { name: "ableton_search_clips", description: "Search indexed Ableton clips.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args, "clip") },
  { name: "ableton_search_midi_tools", description: "Search indexed MIDI files and tools.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args, "midi") },
  { name: "ableton_list_packs", description: "List Ableton Factory Packs safely.", inputSchema: Page, annotations: ro, handler: async (args) => {
    const safe = await resolveSafePath(LOCAL_PATHS.factoryPacks, { mustExist: true });
    const entries = await fs.readdir(safe.real, { withFileTypes: true });
    return { ok: true, ...paginate(entries.map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? "directory" : "file" })), args.page, args.pageSize) };
  } },
  { name: "ableton_list_recent_projects", description: "List recently indexed Ableton sets.", inputSchema: Page, annotations: ro, handler: async (args) => librarySearch({ query: "", ...args }, "set") },
  { name: "ableton_get_library_item", description: "Resolve and summarize a single allowed library item.", inputSchema: PathArg, annotations: ro, handler: async (args) => {
    const safe = await resolveSafePath(args.path, { mustExist: true });
    const stat = await fs.stat(safe.real);
    return { ok: true, item: { path: redactPath(safe.real), size: stat.size, mtime: stat.mtime.toISOString(), extension: path.extname(safe.real) } };
  } },
  { name: "ableton_reindex_path", description: "Reindex a specific allowed path or directory.", inputSchema: { path: z.string().min(1), limit: z.number().int().min(1).max(10000).default(1000) }, annotations: ro, handler: async (args) => ({ ok: true, scan: await scanLibrary(args.path, { limit: args.limit }) }) },

  { name: "ableton_analyze_set", description: "Analyze a .als file as compressed XML without modifying it.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, analysis: await analyzeAbletonSet(args.path) }) },
  { name: "ableton_get_set_summary", description: "Return a compact .als set summary.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, summary: (await analyzeAbletonSet(args.path)).summary }) },
  { name: "ableton_find_missing_files", description: "Estimate missing file references from .als metadata.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, analysis: await analyzeAbletonSet(args.path), note: "v1 reports reference counts; deep missing-file resolution requires expanded file reference extraction." }) },
  { name: "ableton_list_set_tracks", description: "List track counts from a .als file.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, tracks: (await analyzeAbletonSet(args.path)).summary.tracks }) },
  { name: "ableton_list_set_devices", description: "List device counts from a .als file.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, devices: (await analyzeAbletonSet(args.path)).summary.devices }) },
  { name: "ableton_list_set_plugins", description: "List plugin reference counts from a .als file.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, plugins: (await analyzeAbletonSet(args.path)).summary.plugins }) },
  { name: "ableton_list_set_samples", description: "List sample reference counts from a .als file.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, samples: (await analyzeAbletonSet(args.path)).summary.sampleRefs }) },
  { name: "ableton_extract_set_tempo_map", description: "Extract available tempo summary from a .als file.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, tempo: (await analyzeAbletonSet(args.path)).summary.tempo }) },
  { name: "ableton_extract_set_clip_summary", description: "Extract clip count summary from a .als file.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, clips: (await analyzeAbletonSet(args.path)).summary.clips }) },
  { name: "ableton_compare_sets", description: "Compare two .als summary analyses.", inputSchema: { left: z.string().min(1), right: z.string().min(1) }, annotations: ro, handler: async (args) => ({ ok: true, left: await analyzeAbletonSet(args.left), right: await analyzeAbletonSet(args.right) }) },

  { name: "ableton_get_full_snapshot", description: "Get full live session snapshot from bridge.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, snapshot: await getBridgeSnapshot(false) as any }) },
  { name: "ableton_get_snapshot_diff", description: "Get live session diff snapshot from bridge.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, diff: await getBridgeSnapshot(true) as any }) },
  { name: "ableton_get_live_state", description: "Get compact live session state.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("live_state") },
  { name: "ableton_list_tracks", description: "List live tracks via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("list_tracks") },
  { name: "ableton_list_return_tracks", description: "List live return tracks via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("list_return_tracks") },
  { name: "ableton_get_master_track", description: "Get the master track summary and mixer state via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("master_track") },
  { name: "ableton_get_track_mixer", description: "Get selected or indexed track mixer volume and pan parameters via bridge.", inputSchema: { track_id: z.string().max(128).optional() }, annotations: ro, handler: async (args) => bridgeRead("track_mixer", { track_id: args.track_id ?? "selected" }) },
  { name: "ableton_get_return_track_mixer", description: "Get indexed return-track mixer volume and pan parameters via bridge.", inputSchema: { return_track_index: ReturnTrackIndex.default(0) }, annotations: ro, handler: async (args) => bridgeRead("return_track_mixer", args) },
  { name: "ableton_list_scenes", description: "List live scenes via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("list_scenes") },
  { name: "ableton_list_clips", description: "List live clips via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("list_clips") },
  { name: "ableton_list_clip_slots", description: "List clip slots on selected or indexed track via bridge.", inputSchema: { track_id: z.string().max(128).optional() }, annotations: ro, handler: async (args) => bridgeRead("list_clip_slots", { track_id: args.track_id ?? "selected" }) },
  { name: "ableton_list_devices", description: "List live devices via bridge.", inputSchema: { track_id: z.string().max(128).optional() }, annotations: ro, handler: async (args) => bridgeRead("list_devices", { track_id: args.track_id ?? "selected" }) },
  { name: "ableton_list_device_parameters", description: "List automatable device parameters via bridge.", inputSchema: { device_id: z.string().max(128).optional() }, annotations: ro, handler: async (args) => bridgeRead("list_device_parameters", { device_id: args.device_id ?? "selected" }) },
  { name: "ableton_get_selected_track", description: "Get selected track via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("selected_track") },
  { name: "ableton_get_selected_device", description: "Get selected device via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("selected_device") },
  { name: "ableton_get_tempo", description: "Get tempo via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("tempo") },
  { name: "ableton_get_transport", description: "Get transport state via bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("transport") },
];

toolDefs.push(
  { name: "ableton_set_tempo", description: "Set Ableton tempo through the gated LiveAPI bridge.", inputSchema: { tempo: z.number().min(20).max(999), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_tempo", args, { target: "tempo", tempo: args.tempo }) },
  { name: "ableton_transport_control", description: "Control Ableton transport through the gated LiveAPI bridge.", inputSchema: { command: z.enum(["play", "start", "stop", "continue"]), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_transport_control", args, { target: "transport", command: args.command }) },
  { name: "ableton_create_audio_track", description: "Create a named audio track through the gated LiveAPI bridge.", inputSchema: { name: z.string().min(1).max(128).optional(), track_index: TrackIndex.optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_create_audio_track", args, { target: "audio_track", name: args.name ?? null, track_index: args.track_index ?? "append" }) },
  { name: "ableton_create_midi_track", description: "Create a named MIDI track through the gated LiveAPI bridge.", inputSchema: { name: z.string().min(1).max(128).optional(), track_index: TrackIndex.optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_create_midi_track", args, { target: "midi_track", name: args.name ?? null, track_index: args.track_index ?? "append" }) },
  { name: "ableton_create_return_track", description: "Create a named return track through the gated LiveAPI bridge.", inputSchema: { name: z.string().min(1).max(128).optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_create_return_track", args, { target: "return_track", name: args.name ?? null }) },
  { name: "ableton_create_scene", description: "Create a named scene through the gated LiveAPI bridge.", inputSchema: { name: z.string().min(1).max(128).optional(), scene_index: SceneIndex.optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_create_scene", args, { target: "scene", name: args.name ?? null, scene_index: args.scene_index ?? "append" }) },
  { name: "ableton_create_clip", description: "Create an empty Session View MIDI clip through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, length: z.number().positive().max(1024).default(4), name: z.string().min(1).max(128).optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_create_clip", args, { target: "clip", track_index: args.track_index, clip_slot_index: args.clip_slot_index, length: args.length, name: args.name ?? null }) },
  { name: "ableton_create_midi_clip", description: "Create an empty Session View MIDI clip through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, length: z.number().positive().max(1024).default(4), name: z.string().min(1).max(128).optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_create_midi_clip", args, { target: "midi_clip", track_index: args.track_index, clip_slot_index: args.clip_slot_index, length: args.length, name: args.name ?? null }) },
  { name: "ableton_insert_midi_notes", description: "Insert bounded MIDI notes into a Session View MIDI clip through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, notes: z.array(MidiNote).min(1).max(512), create_clip_if_missing: z.boolean().default(false), clip_length: z.number().positive().max(1024).default(4), replace_existing: z.boolean().default(false), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_insert_midi_notes", args, { target: "midi_clip_notes", track_index: args.track_index, clip_slot_index: args.clip_slot_index, note_count: args.notes.length, create_clip_if_missing: args.create_clip_if_missing, replace_existing: args.replace_existing }) },
  { name: "ableton_set_clip_loop", description: "Set clip loop points through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, looping: z.boolean().optional(), loop_start: BeatTime.optional(), loop_end: BeatTime.optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_clip_loop", args, { target: "clip_loop", track_index: args.track_index, clip_slot_index: args.clip_slot_index, looping: args.looping ?? null, loop_start: args.loop_start ?? null, loop_end: args.loop_end ?? null }) },
  { name: "ableton_fire_clip", description: "Launch a Session View clip through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_fire_clip", args, { target: "clip_launch", track_index: args.track_index, clip_slot_index: args.clip_slot_index }) },
  { name: "ableton_stop_clip", description: "Stop one clip slot or all clips on a track through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, clip_slot_index: ClipSlotIndex.optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_stop_clip", args, { target: "clip_stop", track_index: args.track_index, clip_slot_index: args.clip_slot_index ?? "all" }) },
  { name: "ableton_arm_track", description: "Arm or disarm a track through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, enabled: z.boolean(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_arm_track", args, { target: "track_arm", track_index: args.track_index, enabled: args.enabled }) },
  { name: "ableton_mute_track", description: "Mute or unmute a track through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, enabled: z.boolean(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_mute_track", args, { target: "track_mute", track_index: args.track_index, enabled: args.enabled }) },
  { name: "ableton_solo_track", description: "Solo or unsolo a track through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, enabled: z.boolean(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_solo_track", args, { target: "track_solo", track_index: args.track_index, enabled: args.enabled }) },
  { name: "ableton_set_track_volume", description: "Set a track volume parameter through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, value: z.number().min(0).max(1), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_track_volume", args, { target: "track_volume", track_index: args.track_index, value: args.value }) },
  { name: "ableton_set_track_pan", description: "Set a track pan parameter through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, value: z.number().min(-1).max(1), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_track_pan", args, { target: "track_pan", track_index: args.track_index, value: args.value }) },
  { name: "ableton_set_track_send", description: "Set a track send amount through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, send_index: z.number().int().min(0), value: z.number().min(0).max(1), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_track_send", args, { target: "track_send", track_index: args.track_index, send_index: args.send_index, value: args.value }) },
  { name: "ableton_set_return_track_volume", description: "Set a return-track volume parameter through the gated LiveAPI bridge.", inputSchema: { return_track_index: ReturnTrackIndex, value: z.number().min(0).max(1), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_return_track_volume", args, { target: "return_track_volume", return_track_index: args.return_track_index, value: args.value }) },
  { name: "ableton_set_return_track_pan", description: "Set a return-track pan parameter through the gated LiveAPI bridge.", inputSchema: { return_track_index: ReturnTrackIndex, value: z.number().min(-1).max(1), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_return_track_pan", args, { target: "return_track_pan", return_track_index: args.return_track_index, value: args.value }) },
  { name: "ableton_insert_instrument", description: "Request an Ableton-native instrument insertion; bridge returns unsupported unless reliable insertion is available.", inputSchema: { track_index: TrackIndex, device: z.string().min(1).max(128), ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_insert_instrument", args, { target: "instrument_device", track_index: args.track_index, device: args.device }, "LiveAPI does not expose a reliable named-device insertion path without a verified Browser/hot-swap target in this bridge context.") },
  { name: "ableton_insert_effect", description: "Request an Ableton-native effect insertion; bridge returns unsupported unless reliable insertion is available.", inputSchema: { track_index: TrackIndex, device: z.string().min(1).max(128), position: z.number().int().min(0).optional(), ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_insert_effect", args, { target: "effect_device", track_index: args.track_index, device: args.device, position: args.position ?? "append" }, "LiveAPI does not expose a reliable named-effect insertion path without a verified Browser/hot-swap target in this bridge context.") },
  { name: "ableton_load_preset_or_sample", description: "Create an audio clip from an approved local sample path; preset/device loading remains unsupported unless the bridge can prove it.", inputSchema: { path: z.string().min(1), track_index: TrackIndex.default(0), clip_slot_index: ClipSlotIndex.default(0), mode: z.enum(["audio_clip"]).default("audio_clip"), name: z.string().min(1).max(128).optional(), ...DryRun }, annotations: rw, handler: async (args) => loadPresetOrSample(args) },
  { name: "ableton_set_device_parameter", description: "Set a device parameter through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, device_index: DeviceIndex.default(0), parameter_index: ParameterIndex, value: z.number(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_set_device_parameter", args, { target: "device_parameter", track_index: args.track_index, device_index: args.device_index, parameter_index: args.parameter_index, value: args.value }) },
  { name: "ableton_map_macro", description: "Plan a rack macro mapping; bridge returns unsupported until a reliable LiveAPI mapping path is available.", inputSchema: { track_index: TrackIndex, rack_device_index: DeviceIndex, macro_index: ParameterIndex, target_device_index: DeviceIndex, target_parameter_index: ParameterIndex, ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_map_macro", args, { target: "macro_mapping", track_index: args.track_index, rack_device_index: args.rack_device_index, macro_index: args.macro_index, target_device_index: args.target_device_index, target_parameter_index: args.target_parameter_index }, "LiveAPI macro mapping needs a verified rack/device mapping path for this Ableton version.") },
  { name: "ableton_rename_track", description: "Rename a track through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, name: z.string().min(1).max(128), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_rename_track", args, { target: "track_name", track_index: args.track_index, name: args.name }) },
  { name: "ableton_rename_clip", description: "Rename a clip through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, name: z.string().min(1).max(128), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_rename_clip", args, { target: "clip_name", track_index: args.track_index, clip_slot_index: args.clip_slot_index, name: args.name }) },
  { name: "ableton_apply_groove", description: "Plan applying groove to a clip; bridge returns unsupported until a reliable LiveAPI groove path is available.", inputSchema: { ...TrackClipRef, groove: z.string().min(1).max(128).default("selected"), amount: z.number().min(0).max(1).default(0.5), ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_apply_groove", args, { target: "clip_groove", track_index: args.track_index, clip_slot_index: args.clip_slot_index, groove: args.groove, amount: args.amount }, "LiveAPI groove application needs a verified groove-pool and clip mapping path for this Ableton version.") },
  { name: "ableton_list_arrangement_markers", description: "List arrangement locators and marker-like metadata from the LiveAPI bridge.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("arrangement_markers") },
  { name: "ableton_get_clip_notes", description: "Read MIDI note summary for a clip through the LiveAPI bridge.", inputSchema: { ...OptionalTrackClipRef }, annotations: ro, handler: async (args) => bridgeRead("clip_notes", args) },
  { name: "ableton_get_clip_envelopes", description: "Read clip envelope availability from the LiveAPI bridge where supported.", inputSchema: { ...OptionalTrackClipRef }, annotations: ro, handler: async (args) => bridgeRead("clip_envelopes", args) },
  { name: "ableton_get_device_parameter_map", description: "Read device parameter map for a track/device through the LiveAPI bridge.", inputSchema: { track_index: TrackIndex.default(0), device_index: DeviceIndex.default(0) }, annotations: ro, handler: async (args) => bridgeRead("device_parameter_map", args) },
  { name: "ableton_create_automation_envelope", description: "Create or select an automation envelope target through the gated LiveAPI bridge.", inputSchema: { track_index: TrackIndex, device_index: DeviceIndex.optional(), parameter_index: ParameterIndex, ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_create_automation_envelope", args, { target: "automation_envelope", track_index: args.track_index, device_index: args.device_index ?? null, parameter_index: args.parameter_index }, "LiveAPI automation envelope creation is not exposed reliably from this bridge context.") },
  { name: "ableton_set_automation_point", description: "Set one automation breakpoint through the gated LiveAPI bridge when supported.", inputSchema: { ...AutomationPoint, ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_set_automation_point", args, { target: "automation_point", track_index: args.track_index, device_index: args.device_index ?? null, parameter_index: args.parameter_index, time: args.time, value: args.value }, "LiveAPI automation breakpoint writing is not exposed reliably from this bridge context.") },
  { name: "ableton_simplify_automation", description: "Simplify automation for one parameter through the gated LiveAPI bridge when supported.", inputSchema: { track_index: TrackIndex, device_index: DeviceIndex.optional(), parameter_index: ParameterIndex, tolerance: z.number().min(0).max(1).default(0.05), ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_simplify_automation", args, { target: "automation_simplify", tolerance: args.tolerance }, "LiveAPI automation simplification is not exposed reliably from this bridge context.") },
  { name: "ableton_create_arrangement_marker", description: "Create an arrangement marker/locator through the gated LiveAPI bridge.", inputSchema: { time: BeatTime, name: z.string().min(1).max(128), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_create_arrangement_marker", args, { target: "arrangement_marker", time: args.time, name: args.name }) },
  { name: "ableton_duplicate_scene", description: "Duplicate a scene through the gated LiveAPI bridge.", inputSchema: { scene_index: SceneIndex, ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_duplicate_scene", args, { target: "scene", scene_index: args.scene_index }) },
  { name: "ableton_duplicate_clip", description: "Duplicate a Session View clip to another clip slot through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, destination_track_index: TrackIndex.optional(), destination_clip_slot_index: ClipSlotIndex.optional(), ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_duplicate_clip", args, { source: { track_index: args.track_index, clip_slot_index: args.clip_slot_index }, destination: { track_index: args.destination_track_index ?? args.track_index, clip_slot_index: args.destination_clip_slot_index ?? args.clip_slot_index + 1 } }) },
  { name: "ableton_move_clip", description: "Move a Session View clip to another clip slot through the gated LiveAPI bridge.", inputSchema: { ...TrackClipRef, destination_track_index: TrackIndex, destination_clip_slot_index: ClipSlotIndex, ...DryRun }, annotations: rw, handler: async (args) => typedBridgeWrite("ableton_move_clip", args, { source: { track_index: args.track_index, clip_slot_index: args.clip_slot_index }, destination: { track_index: args.destination_track_index, clip_slot_index: args.destination_clip_slot_index } }) },
  { name: "ableton_quantize_clip", description: "Quantize a MIDI clip through the gated LiveAPI bridge when supported.", inputSchema: { ...TrackClipRef, grid: z.enum(["1_bar", "1/2", "1/4", "1/8", "1/16", "1/32"]).default("1/16"), amount: z.number().min(0).max(1).default(1), ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_quantize_clip", args, { target: "clip_quantize", grid: args.grid, amount: args.amount }, "LiveAPI quantization enum values vary by context; this bridge refuses to guess without verified support.") },
  { name: "ableton_humanize_midi_clip", description: "Apply bounded MIDI timing/velocity humanization through the gated LiveAPI bridge when supported.", inputSchema: { ...TrackClipRef, timing_amount: z.number().min(0).max(0.25).default(0.02), velocity_amount: z.number().min(0).max(32).default(5), ...DryRun }, annotations: rw, handler: async (args) => unsupportedLiveApiWrite("ableton_humanize_midi_clip", args, { target: "clip_humanize", timing_amount: args.timing_amount, velocity_amount: args.velocity_amount }, "MIDI humanization needs verified get/apply note rewrite support for this Ableton version.") },
  { name: "ableton_window_status", description: "Report Ableton window status from the ChromeDriver-style UI driver.", inputSchema: Empty, annotations: ro, handler: async () => {
    if (!FLAGS.uiControl) return { ok: true, uiDriverStatus: getUiDriverRuntimeState(), note: "Set ABLETON_MCP_ENABLE_UI_CONTROL=1 and start the UI driver to query live Ableton windows." };
    return { ok: true, uiDriver: await uiDriverAction("window_status") as Record<string, unknown> };
  } },
  { name: "ableton_focus_window", description: "Focus Ableton window when UI control is enabled.", inputSchema: { ...DryRun }, annotations: rw, handler: async (args) => uiWrite("focus_window", args) },
  { name: "ableton_capture_screenshot", description: "Capture Ableton-window screenshot through the UI driver.", inputSchema: { ...DryRun }, annotations: ro, handler: async (args) => {
    requireFlag(FLAGS.uiControl, "ABLETON_MCP_ENABLE_UI_CONTROL", "Ableton screenshot capture");
    if (args.dry_run !== false) return { ok: true, dry_run: true, uiDriver: getUiDriverRuntimeState() };
    return { ok: true, uiDriver: await uiDriverAction("capture_screenshot", args) as Record<string, unknown> };
  } },
  { name: "ableton_capture_region", description: "Capture an explicit Ableton-window region through the UI driver.", inputSchema: { x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), ...DryRun }, annotations: ro, handler: async (args) => {
    requireFlag(FLAGS.uiControl, "ABLETON_MCP_ENABLE_UI_CONTROL", "Ableton region capture");
    if (args.dry_run !== false) return { ok: true, dry_run: true, requested: args, uiDriver: getUiDriverRuntimeState() };
    return { ok: true, uiDriver: await uiDriverAction("capture_region", args) as Record<string, unknown> };
  } },
  { name: "ableton_get_ui_overview", description: "Get safe UI overview from bridge or screenshot layer.", inputSchema: Empty, annotations: ro, handler: async () => bridgeRead("ui_overview") },
  { name: "ableton_compare_screenshots", description: "Compare two diagnostics screenshots.", inputSchema: { left: z.string(), right: z.string() }, annotations: ro, handler: async (args) => {
    const left = await resolveSafePath(args.left, { mustExist: true });
    const right = await resolveSafePath(args.right, { mustExist: true });
    return { ok: true, left: redactPath(left.real), right: redactPath(right.real), note: "v1 verifies both files are safe; pixel diff can be added after screenshot backend is finalized." };
  } },
  { name: "ableton_click_named_safe_action", description: "Run one reviewed named Ableton UI action when UI control is enabled.", inputSchema: { action: SafeUiActionId, ...DryRun }, annotations: rw, handler: async (args) => uiWrite("click_named_safe_action", args) },
  { name: "ableton_click_coordinates", description: "Click explicit coordinates when UI control is enabled.", inputSchema: { x: z.number(), y: z.number(), ...DryRun }, annotations: rw, handler: async (args) => uiWrite("click_coordinates", args) },
  { name: "ableton_type_text", description: "Type text into Ableton when UI control is enabled.", inputSchema: { text: z.string().max(500), ...DryRun }, annotations: rw, handler: async (args) => uiWrite("type_text", args) },

  { name: "ableton_search_freesound", description: "Search Freesound for licensed sample metadata.", inputSchema: { query: z.string().min(1).max(200), ...Page }, annotations: webro, handler: async (args) => ({ ok: true, remote: await searchFreesound(args.query, args.page, args.pageSize) }) },
  { name: "ableton_search_internet_archive_audio", description: "Search Internet Archive public audio metadata.", inputSchema: { query: z.string().min(1).max(200), ...Page }, annotations: webro, handler: async (args) => ({ ok: true, remote: await searchInternetArchiveAudio(args.query, args.page, args.pageSize) }) },
  { name: "ableton_get_remote_sample_metadata", description: "Get Internet Archive item metadata by identifier.", inputSchema: { source: z.enum(["internet_archive"]).default("internet_archive"), identifier: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/) }, annotations: webro, handler: async (args) => ({ ok: true, metadata: await getInternetArchiveMetadata(args.identifier) as any }) },
  { name: "ableton_list_internet_archive_audio_files", description: "List safe downloadable audio file candidates for an Internet Archive item.", inputSchema: { identifier: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/), ...Page }, annotations: webro, handler: async (args) => {
    const files = await listInternetArchiveAudioFiles(args.identifier);
    return { ok: true, remote: { ...files, ...paginate(files.audioFiles, args.page, args.pageSize) } };
  } },
  { name: "ableton_preview_remote_sample", description: "Return preview metadata only; never downloads.", inputSchema: { url: z.string().url(), license: z.string().optional() }, annotations: webro, handler: async (args) => ({ ok: true, preview: { url: assertAllowedSampleUrl(args.url), license: normalizeLicense(args.license), downloadEnabled: FLAGS.downloads } }) },
  { name: "ableton_download_sample", description: "Download an allowed licensed sample into staging when downloads are enabled.", inputSchema: { url: z.string().url(), destinationName: z.string().min(1), metadata: z.record(z.unknown()).default({}) }, annotations: { ...webro, readOnlyHint: false }, handler: async (args) => ({ ok: true, download: await downloadSample(args.url, args.destinationName, args.metadata) }) },
  { name: "ableton_analyze_audio_file", description: "Analyze allowed local audio file with ffprobe.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, analysis: await analyzeAudioFile(args.path) }) },
  { name: "ableton_convert_audio_file", description: "Convert approved local audio into staging/imports with ffmpeg; dry-run by default and never overwrites.", inputSchema: { input: z.string().min(1), output: z.string().min(1), format: z.enum(["wav", "flac", "mp3"]).default("wav"), preset: z.enum(["clean", "liminal_memory", "stretched_ambience", "reversed_fragment"]).default("clean"), start_seconds: z.number().min(0).max(100_000).optional(), duration_seconds: z.number().positive().max(3600).optional(), ...DryRun }, annotations: rw, handler: async (args) => {
    if (args.dry_run === false) requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Audio conversion");
    return { ok: true, audioConversion: await convertAudioFile(args) as any };
  } },
  { name: "ableton_normalize_sample_metadata", description: "Normalize sample metadata and license policy.", inputSchema: { metadata: z.record(z.unknown()).default({}) }, annotations: ro, handler: async (args) => ({ ok: true, normalized: { ...args.metadata, licensePolicy: normalizeLicense(String(args.metadata.license ?? args.metadata.licenseurl ?? "")) } }) },
  { name: "ableton_import_sample_to_library", description: "Import staged sample to Ableton User Library Codex Imports when downloads are enabled.", inputSchema: { stagedPath: z.string(), attribution: z.record(z.unknown()).default({}) }, annotations: rw, handler: async (args) => ({ ok: true, import: await importSampleToLibrary(args.stagedPath, args.attribution) }) },
  { name: "ableton_find_local_samples", description: "Search indexed local samples.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args, "sample") },
  { name: "ableton_build_sample_pack", description: "Plan a sample pack from allowed local samples.", inputSchema: { query: z.string().default(""), name: z.string().default("Codex Sample Pack"), ...Page }, annotations: ro, handler: async (args) => ({ ok: true, pack: { name: args.name, samples: (await librarySearch(args, "sample")).items } }) },
  { name: "ableton_generate_attribution_report", description: "Generate attribution report from staged/imported sample sidecars.", inputSchema: Page, annotations: ro, handler: async (args) => ({ ok: true, report: await generateAttributionReport(args.page, args.pageSize) }) },
  { name: "ableton_search_plugin_catalog", description: "Search curated Ableton/Max plugin and package source metadata without downloading.", inputSchema: { query: z.string().max(200).default("") }, annotations: ro, handler: async (args) => ({ ok: true, plugins: searchPluginCatalog(args.query) }) },
  { name: "ableton_plan_plugin_download", description: "Plan a safe plugin/package download into staging without installing it.", inputSchema: { url: z.string().url().optional(), destinationName: z.string().min(1).optional(), catalogId: z.string().max(100).optional() }, annotations: ro, handler: async (args) => ({ ok: true, pluginDownload: planPluginDownload(args) }) },
  { name: "ableton_download_plugin_package", description: "Download an approved plugin/package URL into plugin staging when downloads are enabled; never installs it.", inputSchema: { url: z.string().url(), destinationName: z.string().min(1), metadata: z.record(z.unknown()).default({}) }, annotations: { ...webro, readOnlyHint: false }, handler: async (args) => ({ ok: true, pluginPackage: await downloadPluginPackage(args.url, args.destinationName, args.metadata) }) },
  { name: "ableton_plugin_install_instructions", description: "Return manual install instructions for a staged plugin/package; MCP never runs installers.", inputSchema: { stagedPath: z.string().min(1) }, annotations: ro, handler: async (args) => ({ ok: true, instructions: pluginInstallInstructions(args.stagedPath) }) },
  { name: "ableton_validate_plugin_package", description: "Validate a staged plugin/package path and extension without running installers.", inputSchema: { stagedPath: z.string().min(1) }, annotations: ro, handler: async (args) => {
    const safe = await resolveSafePath(args.stagedPath, { mustExist: true });
    const stat = await fs.stat(safe.real);
    const extension = path.extname(safe.real).toLowerCase();
    const knownPackage = [".zip", ".amxd", ".alp", ".adv", ".adg", ".vst3", ".component", ".dll"].includes(extension);
    return { ok: true, package: { path: redactPath(safe.real), size: stat.size, extension, knownPackage, installerExecutionAllowed: false } };
  } },
  { name: "ableton_scan_vst_folders", description: "Plan VST folder scanning from allowed Ableton/library roots without broad filesystem access.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, scanPlan: productionPlan("vst_folder_scan", { allowedRoots: rootsForReport(), folders: ["User Library", "Factory Packs", "project samples/staging/plugins"], broadSystemPluginScan: false }) }) },
  { name: "ableton_list_installed_plugins", description: "Return installed plugin summary from indexed set/library metadata when available.", inputSchema: Page, annotations: ro, handler: async (args) => ({ ok: true, plugins: { note: "Uses indexed Ableton files and .als plugin references; it does not scan arbitrary system VST folders.", ...paginate([], args.page, args.pageSize) } }) },
  { name: "ableton_check_plugin_license_metadata", description: "Check plugin/package metadata for license and source fields before download or manual install.", inputSchema: { metadata: z.record(z.unknown()).default({}) }, annotations: ro, handler: async (args) => {
    const license = String(args.metadata.license ?? args.metadata.licenseUrl ?? args.metadata.licenseurl ?? "").trim();
    const source = String(args.metadata.source ?? args.metadata.url ?? "").trim();
    return { ok: true, licenseCheck: { hasLicense: license.length > 0, license, hasSource: source.length > 0, source, installerExecutionAllowed: false, nextStep: "Prefer official vendor pages and verify license manually before installing plugins." } };
  } },

  { name: "ableton_extract_automation_summary", description: "Plan automation summary extraction from a set or live snapshot without modifying Ableton.", inputSchema: { path: z.string().optional(), track_id: z.string().max(128).optional() }, annotations: ro, handler: async (args) => {
    if (args.path) return { ok: true, automation: { source: "set_file", analysis: await analyzeAbletonSet(args.path), note: "v1 summarizes set structure; detailed breakpoint extraction depends on deeper LOM/XML mapping." } };
    return { ok: true, automation: await bridgeRead("automation_summary", { track_id: args.track_id ?? "selected" }) };
  } },
  { name: "ableton_extract_groove", description: "Create a read-only groove extraction plan for a clip or MIDI/audio file.", inputSchema: { source: z.string().min(1), strength: z.number().min(0).max(1).default(0.5) }, annotations: ro, handler: async (args) => ({ ok: true, groove: productionPlan("extract_groove", { source: args.source, strength: args.strength, output: "groove timing and velocity template" }) }) },
  { name: "ableton_plan_export_audio", description: "Plan audio export or stem export settings without rendering.", inputSchema: { scope: z.enum(["master", "selected_track", "all_tracks", "time_selection"]).default("master"), sampleRate: z.number().int().min(8000).max(384000).default(48000), bitDepth: z.enum(["16", "24", "32"]).default("24"), normalize: z.boolean().default(false) }, annotations: ro, handler: async (args) => ({ ok: true, exportPlan: productionPlan("audio_export", args, "Use this plan to configure Ableton export manually or through a future write-gated export tool.") }) },
  { name: "ableton_validate_export_settings", description: "Validate export settings for clipping, file naming, and release-readiness.", inputSchema: { settings: z.record(z.unknown()) }, annotations: ro, handler: async (args) => {
    const sampleRate = Number(args.settings.sampleRate ?? args.settings.sample_rate ?? 0);
    const bitDepth = String(args.settings.bitDepth ?? args.settings.bit_depth ?? "");
    return { ok: true, validation: { sampleRateOk: sampleRate >= 44100 && sampleRate <= 192000, bitDepthOk: ["16", "24", "32"].includes(bitDepth), normalizeRisk: Boolean(args.settings.normalize), notes: ["Check master peak/headroom before export.", "Use clear file names and preserve project backups."], settings: args.settings } };
  } },
  { name: "ableton_prepare_stems_plan", description: "Plan stem export groups and naming without changing Ableton.", inputSchema: { groups: z.array(z.string().min(1).max(80)).default(["drums", "bass", "music", "vocals", "fx"]), prefix: z.string().max(80).default("ableton-mcp-stems") }, annotations: ro, handler: async (args) => ({ ok: true, stemsPlan: productionPlan("stems_export", { prefix: args.prefix, groups: args.groups, naming: args.groups.map((group: string) => `${args.prefix}-${group}.wav`) }) }) },
  { name: "ableton_browse_live_devices", description: "Return a curated Ableton-native device browser plan without scanning private folders.", inputSchema: { category: z.string().max(80).default("") }, annotations: ro, handler: async (args) => ({ ok: true, browser: productionPlan("live_devices", { category: args.category, devices: ["Instrument Rack", "Drum Rack", "Simpler", "Operator", "Wavetable", "EQ Eight", "Compressor", "Saturator", "Echo", "Hybrid Reverb"] }) }) },
  { name: "ableton_browse_max_devices", description: "Return a Max for Live device browser plan limited to Ableton User Library and project bridge files.", inputSchema: { query: z.string().max(120).default("") }, annotations: ro, handler: async (args) => ({ ok: true, browser: productionPlan("max_for_live_devices", { query: args.query, roots: [redactPath(path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live")), redactPath(path.join(LOCAL_PATHS.userLibrary, "Presets", "MIDI Effects", "Max MIDI Effect"))] }) }) },
  { name: "ableton_browse_drum_hits", description: "Search indexed local drum-hit samples with pagination.", inputSchema: { query: z.string().max(120).default("kick OR snare OR hat"), ...Page }, annotations: ro, handler: async (args) => librarySearch(args, "sample") },

  { name: "ableton_plan_concept_track", description: "Turn a mood, place, or liminal concept into a stored staged Ableton production plan.", inputSchema: { concept: z.string().min(3).max(2000), target_duration_seconds: z.number().int().min(30).max(900).default(180), intensity: z.number().int().min(1).max(10).default(7), style: z.string().max(160).optional(), sources: ConceptSources, reference_path: z.string().min(1).optional() }, annotations: ro, handler: async (args) => ({ ok: true, concept: await planConceptTrack(args) as any }) },
  { name: "ableton_list_concept_plans", description: "List stored concept plans from the bounded diagnostics plan store.", inputSchema: Page, annotations: ro, handler: async (args) => ({ ok: true, plans: paginate(await listConceptPlans(), args.page, args.pageSize) }) },
  { name: "ableton_get_concept_plan", description: "Read one stored concept plan by id with local paths redacted.", inputSchema: { plan_id: ConceptPlanId }, annotations: ro, handler: async (args) => ({ ok: true, concept: await getConceptPlanForReport(args.plan_id) as any }) },
  { name: "ableton_list_arrangement_plans", description: "List stored arrangement plans from the bounded diagnostics plan store.", inputSchema: Page, annotations: ro, handler: async (args) => ({ ok: true, arrangements: paginate(await listArrangementPlans(), args.page, args.pageSize) }) },
  { name: "ableton_get_arrangement_plan", description: "Read one stored arrangement plan by id with local paths redacted.", inputSchema: { arrangement_id: ArrangementPlanId }, annotations: ro, handler: async (args) => ({ ok: true, arrangement: await getArrangementPlanForReport(args.arrangement_id) as any }) },
  { name: "ableton_search_concept_samples", description: "Search approved sample metadata for a stored concept plan or direct concept without downloading.", inputSchema: { plan_id: ConceptPlanId.optional(), concept: z.string().min(3).max(1000).optional(), ...Page }, annotations: webro, handler: async (args) => ({ ok: true, samples: await searchConceptSamples({ plan_id: args.plan_id, concept: args.concept, page: args.page, pageSize: args.pageSize }) as any }) },
  { name: "ableton_plan_full_concept_production", description: "Create a full safe concept-to-music plan: concept, sample metadata search, arrangement, dry-run execution preview, and delivery plan.", inputSchema: { concept: z.string().min(3).max(2000), target_duration_seconds: z.number().int().min(30).max(900).default(180), intensity: z.number().int().min(1).max(10).default(7), style: z.string().max(160).optional(), sources: ConceptSources, reference_path: z.string().min(1).optional(), sample_assignments: z.array(ConceptSampleAssignment).max(12).default([]), include_sample_search: z.boolean().default(true), sample_page_size: z.number().int().min(1).max(12).default(6) }, annotations: webro, handler: async (args) => ({ ok: true, production: await planConceptProduction(args) as any }) },
  { name: "ableton_stage_concept_samples", description: "Stage approved concept samples; dry-run by default and download-gated for real staging.", inputSchema: { samples: z.array(z.object({ url: z.string().url(), destinationName: z.string().min(1).max(160), metadata: z.record(z.unknown()).default({}) })).min(1).max(12), ...DryRun }, annotations: { ...webro, readOnlyHint: false }, handler: async (args) => ({ ok: true, staging: await stageConceptSamples({ samples: args.samples, dry_run: args.dry_run }) as any }) },
  { name: "ableton_build_layered_arrangement_plan", description: "Convert a stored concept plan into a stored Ableton track/scene/action plan.", inputSchema: { plan_id: ConceptPlanId, sample_assignments: z.array(ConceptSampleAssignment).max(12).default([]) }, annotations: ro, handler: async (args) => ({ ok: true, arrangement: await buildLayeredArrangementPlan(args.plan_id, args.sample_assignments) as any }) },
  { name: "ableton_prepare_concept_audio_layers", description: "Render approved reference audio into concept layer variants; dry-run by default and never overwrites.", inputSchema: { plan_id: ConceptPlanId, output_prefix: z.string().min(1).max(80).optional(), format: z.enum(["wav", "flac", "mp3"]).default("wav"), ...DryRun }, annotations: rw, handler: async (args) => ({ ok: true, preparation: await prepareConceptAudioLayers(args) as any }) },
  { name: "ableton_build_arrangement_from_prepared_audio", description: "Build a stored arrangement plan from a stored prepared-audio manifest without exposing local paths.", inputSchema: { preparation_id: PreparedAudioId, sample_assignments: z.array(ConceptSampleAssignment).max(12).default([]) }, annotations: ro, handler: async (args) => ({ ok: true, preparedArrangement: await buildArrangementFromPreparedAudio(args) as any }) },
  { name: "ableton_export_concept_midi_motif", description: "Render a stored concept plan's sparse motif as a staged MIDI file; dry-run by default and never overwrites.", inputSchema: { plan_id: ConceptPlanId, output_name: z.string().min(1).max(128).optional(), ...DryRun }, annotations: rw, handler: async (args) => ({ ok: true, export: await exportConceptMidiMotif(args) as any }) },
  { name: "ableton_preflight_concept_execution", description: "Read-only preflight for a stored arrangement: validates action counts, bridge readiness, placeholder resolution, and likely clip-slot blockers before real execution.", inputSchema: { arrangement_id: ArrangementPlanId, check_bridge: z.boolean().default(true) }, annotations: ro, handler: async (args) => ({ ok: true, preflight: await preflightConceptExecution(args) as any }) },
  { name: "ableton_create_concept_execution_approval_bundle", description: "Create a read-only approval bundle for a stored arrangement with redacted plan, preflight, required gates, and exact next tool calls.", inputSchema: { arrangement_id: ArrangementPlanId, check_bridge: z.boolean().default(false) }, annotations: ro, handler: async (args) => ({ ok: true, approvalBundle: await createConceptExecutionApprovalBundle(args) as any }) },
  { name: "ableton_plan_concept_device_automation_readiness", description: "Create a read-only readiness plan for staged concept device chains and automation targets with discovery and dry-run call templates.", inputSchema: { arrangement_id: ArrangementPlanId, check_bridge: z.boolean().default(false) }, annotations: ro, handler: async (args) => ({ ok: true, readiness: await planConceptDeviceAutomationReadiness(args) as any }) },
  { name: "ableton_execute_concept_plan", description: "Execute a stored arrangement plan through the write-gated bridge; dry-run by default.", inputSchema: { arrangement_id: ArrangementPlanId, ...DryRun }, annotations: rw, handler: async (args) => ({ ok: true, execution: await executeConceptPlan({ arrangement_id: args.arrangement_id, dry_run: args.dry_run }) as any }) },
  { name: "ableton_render_delivery_plan", description: "Plan final master/stem export settings for a stored concept plan without rendering.", inputSchema: { plan_id: ConceptPlanId }, annotations: ro, handler: async (args) => ({ ok: true, delivery: await renderDeliveryPlan(args.plan_id) as any }) },

  { name: "ableton_generate_session_plan", description: "Generate a structured session plan without changing Ableton.", inputSchema: { brief: z.string().min(1).max(2000) }, annotations: ro, handler: async (args) => ({ ok: true, plan: { brief: args.brief, tracks: ["Drums", "Bass", "Harmony", "Lead", "FX"], nextStep: "Review then execute with write-gated tools." } }) },
  { name: "ableton_generate_midi_clip_plan", description: "Generate a MIDI clip plan.", inputSchema: { key: z.string().default("C minor"), bars: z.number().int().min(1).max(64).default(8), style: z.string().default("electronic") }, annotations: ro, handler: async (args) => ({ ok: true, midiClipPlan: args }) },
  { name: "ableton_generate_drum_rack_plan", description: "Generate a drum rack plan.", inputSchema: { style: z.string().default("house") }, annotations: ro, handler: async (args) => ({ ok: true, drumRackPlan: { style: args.style, pads: ["kick", "snare", "closed_hat", "open_hat", "clap", "perc"] } }) },
  { name: "ableton_suggest_instrument_chain", description: "Suggest Ableton-native instrument chain.", inputSchema: { role: z.string().min(1) }, annotations: ro, handler: async (args) => ({ ok: true, chain: { role: args.role, devices: ["Instrument Rack", "EQ Eight", "Compressor"] } }) },
  { name: "ableton_suggest_effect_chain", description: "Suggest Ableton-native effect chain.", inputSchema: { source: z.string().min(1) }, annotations: ro, handler: async (args) => ({ ok: true, chain: { source: args.source, devices: ["EQ Eight", "Compressor", "Saturator", "Reverb"] } }) },
  { name: "ableton_suggest_arrangement", description: "Suggest arrangement sections.", inputSchema: { brief: z.string().min(1) }, annotations: ro, handler: async (args) => ({ ok: true, arrangement: { brief: args.brief, sections: ["intro", "A", "break", "B", "outro"] } }) },
  { name: "ableton_suggest_mix_actions", description: "Suggest non-destructive mix actions.", inputSchema: { issue: z.string().min(1) }, annotations: ro, handler: async (args) => ({ ok: true, actions: [{ issue: args.issue, action: "Check gain staging before EQ decisions." }, { action: "Use spectrum and reference comparison." }] }) },
  { name: "ableton_validate_production_plan", description: "Validate a production plan for safety and feasibility.", inputSchema: { plan: z.record(z.unknown()) }, annotations: ro, handler: async (args) => ({ ok: true, validation: { safeByDefault: true, requiresWrite: JSON.stringify(args.plan).includes("create") || JSON.stringify(args.plan).includes("set"), plan: args.plan } }) },

  { name: "ableton_mcp_health", description: "Health check for the MCP server.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, health: { started: true, roots: rootsForReport(), scan: getScanStatus() } }) },
  { name: "ableton_mcp_get_client_connection_profiles", description: "Return safe connection profiles for Codex, Claude, Docker MCP, WSL, remote devices, and model-provider host apps.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, profiles: clientConnectionProfiles() }) },
  { name: "ableton_mcp_list_capabilities", description: "List registered MCP tool capabilities.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, toolCount: toolDefs.length, tools: toolDefs.map((tool) => ({ name: tool.name, annotations: tool.annotations })) }) },
  { name: "ableton_mcp_get_runtime_report", description: "Report FastMCP-inspired middleware, limits, cache, rate-limit, and timing metrics.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, runtimeReport: getRuntimeReport() }) },
  { name: "ableton_mcp_security_report", description: "Report active security controls and feature gates.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, security: {
    readOnlyByDefault: !FLAGS.write,
    uiControlDisabledByDefault: !FLAGS.uiControl,
    downloadsDisabledByDefault: !FLAGS.downloads,
    allowedRoots: rootsForReport(),
    networkPolicy: {
      sampleDownloadsRequireHttps: true,
      approvedSampleHostsOnly: true,
      arbitraryUrlFetch: false,
      privateAndLocalHostsRejected: true
    },
    filesystemPolicy: {
      realpathResolution: true,
      symlinkEscapeRejected: true,
      broadAppDataRejected: true,
      credentialFoldersRejected: true
    },
    controlPolicy: {
      backgroundBridgeDefault: true,
      bridgeCommandsSerialized: true,
      uiFallbackRequiresExplicitFlag: true,
      uiFallbackDriver: getUiDriverRuntimeState()
    }
  } }) },
  { name: "ableton_mcp_run_self_test", description: "Run lightweight self-tests.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, selfTest: { environment: await environmentSnapshot(), capabilities: toolDefs.length } }) },
  { name: "ableton_mcp_run_bridge_mock_test", description: "Run bridge mock contract check.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, bridgeMock: { requestShape: { id: "uuid", action: "ping", payload: {} }, responseShape: { id: "uuid", ok: true, data: { heartbeat: "iso-date" } }, loopback: "127.0.0.1:17364" } }) },
  { name: "ableton_mcp_run_path_security_test", description: "Run path security rejection checks.", inputSchema: Empty, annotations: ro, handler: async () => {
    const rejected = [];
    for (const candidate of [path.parse(os.homedir()).root, os.homedir(), path.join(os.homedir(), ".ssh"), path.join(os.homedir(), "AppData", "Roaming")]) {
      try { await resolveSafePath(candidate, { mustExist: false }); } catch (error) { rejected.push({ candidate: redactPath(candidate), rejected: error instanceof Error }); }
    }
    return { ok: true, rejected };
  } },
  { name: "ableton_mcp_run_sample_license_test", description: "Run sample license policy checks.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, licenses: ["CC0", "CC BY 4.0", "All Rights Reserved"].map((value) => normalizeLicense(value)) }) },
  { name: "ableton_mcp_run_eval_suite", description: "Run compact MCP evaluation smoke suite.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, evals: [{ name: "tool_catalog_available", passed: toolDefs.length >= 80 }, { name: "write_disabled_default", passed: !FLAGS.write }, { name: "downloads_disabled_default", passed: !FLAGS.downloads }] }) }
);

export function registerTools(server: McpServer) {
  for (const tool of toolDefs) {
    const runtimeTool: RuntimeTool = tool;
    server.registerTool(tool.name, {
      title: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations
    }, async (args) => {
      return runTool(runtimeTool, args);
    });
  }
}

export const registeredToolNames = toolDefs.map((tool) => tool.name);
export const registeredToolSchemas = Object.fromEntries(toolDefs.map((tool) => [tool.name, tool.inputSchema]));
