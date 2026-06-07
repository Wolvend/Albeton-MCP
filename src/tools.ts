import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeAbletonSet, analyzeAudioFile } from "./analysis.js";
import { bridgeAction, getBridgeRuntimeState, getBridgeSnapshot, pingBridge } from "./bridge.js";
import { getBridgeInstallPlan, installBridgeFiles } from "./bridge-install.js";
import { FLAGS, LOCAL_PATHS, PLATFORM } from "./config.js";
import { environmentSnapshot } from "./environment.js";
import { requireFlag } from "./errors.js";
import { paginate } from "./response.js";
import { getRuntimeReport, runTool, type RuntimeTool, type ToolAnnotations } from "./runtime.js";
import { getScanStatus, scanLibrary } from "./scanner.js";
import { queryLibrary } from "./cache.js";
import { downloadSample, getInternetArchiveMetadata, importSampleToLibrary, normalizeLicense, searchFreesound, searchInternetArchiveAudio } from "./samples.js";
import { downloadPluginPackage, planPluginDownload, pluginInstallInstructions, searchPluginCatalog } from "./plugins.js";
import { redactPath, resolveSafePath, rootsForReport } from "./security.js";
import { getUiDriverRuntimeState, pingUiDriver, uiDriverAction } from "./ui-driver.js";

const Empty = {};
const Page = { page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) };
const Query = { query: z.string().max(200).default(""), ...Page };
const PathArg = { path: z.string().min(1) };
const DryRun = { dry_run: z.boolean().default(true) };

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

async function librarySearch(args: any, kind?: string) {
  const rows = await queryLibrary(args.query, kind);
  return { ok: true, ...paginate(rows.map((row) => ({ ...row, path: redactPath(String(row.path)) })), args.page, args.pageSize) };
}

async function bridgeRead(action: string, payload: Record<string, unknown> = {}) {
  return { ok: true, bridge: await bridgeAction(action, payload) as Record<string, unknown> };
}

async function bridgeWrite(action: string, args: any) {
  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", action);
  if (args.dry_run !== false) return { ok: true, dry_run: true, action, nextStep: "Set dry_run=false to send this action to the Ableton bridge." };
  return { ok: true, bridge: await bridgeAction(action, args) as Record<string, unknown> };
}

async function uiWrite(action: string, args: any) {
  requireFlag(FLAGS.uiControl, "ABLETON_MCP_ENABLE_UI_CONTROL", action);
  if (args.dry_run !== false) return { ok: true, dry_run: true, action, uiDriver: getUiDriverRuntimeState(), nextStep: "Set dry_run=false only when the Ableton UI driver is attached and you intentionally want mouse/keyboard control." };
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

function clientConnectionProfiles() {
  const port = Number(process.env.ABLETON_MCP_HTTP_PORT ?? "17366");
  const configuredHost = process.env.ABLETON_MCP_HTTP_HOST ?? "127.0.0.1";
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
        ABLETON_MCP_HTTP_TOKEN: "required bearer token, at least 16 characters"
      },
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
    requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Launching Ableton Live");
    if (args.dry_run !== false) return { ok: true, dry_run: true, executable: LOCAL_PATHS.liveExecutable };
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
  { name: "ableton_ui_driver_ping", description: "Ping the loopback Ableton UI driver when UI control is enabled.", inputSchema: Empty, annotations: ro, handler: async () => {
    requireFlag(FLAGS.uiControl, "ABLETON_MCP_ENABLE_UI_CONTROL", "Ableton UI driver ping");
    return { ok: true, uiDriver: await pingUiDriver() as any };
  } },
  { name: "ableton_control_mode_status", description: "Report background bridge mode and explicit UI fallback policy.", inputSchema: Empty, annotations: ro, handler: async () => ({ ok: true, control: controlModeStatus() }) },
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

const writeToolNames = [
  "ableton_set_tempo", "ableton_transport_control", "ableton_create_audio_track", "ableton_create_midi_track",
  "ableton_create_return_track", "ableton_create_scene", "ableton_create_clip", "ableton_create_midi_clip",
  "ableton_insert_midi_notes", "ableton_set_clip_loop", "ableton_fire_clip", "ableton_stop_clip",
  "ableton_arm_track", "ableton_mute_track", "ableton_solo_track", "ableton_set_track_volume",
  "ableton_set_track_pan", "ableton_insert_instrument", "ableton_insert_effect", "ableton_load_preset_or_sample",
  "ableton_set_device_parameter", "ableton_map_macro", "ableton_rename_track", "ableton_rename_clip"
];

for (const name of writeToolNames) {
  toolDefs.push({ name, description: `${name.replaceAll("_", " ")} through the gated Ableton bridge.`, inputSchema: { payload: z.record(z.unknown()).default({}), ...DryRun }, annotations: rw, handler: async (args) => bridgeWrite(name, { ...args.payload, dry_run: args.dry_run }) });
}

toolDefs.push(
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
  { name: "ableton_click_named_safe_action", description: "Click a named safe UI action when UI control is enabled.", inputSchema: { action: z.string(), ...DryRun }, annotations: rw, handler: async (args) => uiWrite("click_named_safe_action", args) },
  { name: "ableton_click_coordinates", description: "Click explicit coordinates when UI control is enabled.", inputSchema: { x: z.number(), y: z.number(), ...DryRun }, annotations: rw, handler: async (args) => uiWrite("click_coordinates", args) },
  { name: "ableton_type_text", description: "Type text into Ableton when UI control is enabled.", inputSchema: { text: z.string().max(500), ...DryRun }, annotations: rw, handler: async (args) => uiWrite("type_text", args) },

  { name: "ableton_search_freesound", description: "Search Freesound for licensed sample metadata.", inputSchema: { query: z.string().min(1).max(200), ...Page }, annotations: webro, handler: async (args) => ({ ok: true, remote: await searchFreesound(args.query, args.page, args.pageSize) }) },
  { name: "ableton_search_internet_archive_audio", description: "Search Internet Archive public audio metadata.", inputSchema: { query: z.string().min(1).max(200), ...Page }, annotations: webro, handler: async (args) => ({ ok: true, remote: await searchInternetArchiveAudio(args.query, args.page, args.pageSize) }) },
  { name: "ableton_get_remote_sample_metadata", description: "Get Internet Archive item metadata by identifier.", inputSchema: { source: z.enum(["internet_archive"]).default("internet_archive"), identifier: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/) }, annotations: webro, handler: async (args) => ({ ok: true, metadata: await getInternetArchiveMetadata(args.identifier) as any }) },
  { name: "ableton_preview_remote_sample", description: "Return preview metadata only; never downloads.", inputSchema: { url: z.string().url(), license: z.string().optional() }, annotations: webro, handler: async (args) => ({ ok: true, preview: { url: args.url, license: normalizeLicense(args.license), downloadEnabled: FLAGS.downloads } }) },
  { name: "ableton_download_sample", description: "Download an allowed licensed sample into staging when downloads are enabled.", inputSchema: { url: z.string().url(), destinationName: z.string().min(1), metadata: z.record(z.unknown()).default({}) }, annotations: { ...webro, readOnlyHint: false }, handler: async (args) => ({ ok: true, download: await downloadSample(args.url, args.destinationName, args.metadata) }) },
  { name: "ableton_analyze_audio_file", description: "Analyze allowed local audio file with ffprobe.", inputSchema: PathArg, annotations: ro, handler: async (args) => ({ ok: true, analysis: await analyzeAudioFile(args.path) }) },
  { name: "ableton_convert_audio_file", description: "Plan safe audio conversion; actual conversion is disabled in v1.", inputSchema: { input: z.string(), output: z.string(), format: z.string().default("wav"), ...DryRun }, annotations: rw, handler: async (args) => ({ ok: true, dry_run: true, input: redactPath((await resolveSafePath(args.input, { mustExist: true })).real), output: redactPath((await resolveSafePath(args.output, { mustExist: false, forWrite: true })).real), note: "Conversion execution will use ffmpeg after overwrite policy and fixture tests are added." }) },
  { name: "ableton_normalize_sample_metadata", description: "Normalize sample metadata and license policy.", inputSchema: { metadata: z.record(z.unknown()).default({}) }, annotations: ro, handler: async (args) => ({ ok: true, normalized: { ...args.metadata, licensePolicy: normalizeLicense(String(args.metadata.license ?? args.metadata.licenseurl ?? "")) } }) },
  { name: "ableton_import_sample_to_library", description: "Import staged sample to Ableton User Library Codex Imports when downloads are enabled.", inputSchema: { stagedPath: z.string(), attribution: z.record(z.unknown()).default({}) }, annotations: rw, handler: async (args) => ({ ok: true, import: await importSampleToLibrary(args.stagedPath, args.attribution) }) },
  { name: "ableton_find_local_samples", description: "Search indexed local samples.", inputSchema: Query, annotations: ro, handler: async (args) => librarySearch(args, "sample") },
  { name: "ableton_build_sample_pack", description: "Plan a sample pack from allowed local samples.", inputSchema: { query: z.string().default(""), name: z.string().default("Codex Sample Pack"), ...Page }, annotations: ro, handler: async (args) => ({ ok: true, pack: { name: args.name, samples: (await librarySearch(args, "sample")).items } }) },
  { name: "ableton_generate_attribution_report", description: "Generate attribution report from imported sample sidecars.", inputSchema: Page, annotations: ro, handler: async (args) => ({ ok: true, report: { importsRoot: redactPath(LOCAL_PATHS.imports), note: "Attribution sidecars are written as .attribution.json during imports.", ...paginate([], args.page, args.pageSize) } }) },
  { name: "ableton_search_plugin_catalog", description: "Search curated Ableton/Max plugin and package source metadata without downloading.", inputSchema: { query: z.string().max(200).default("") }, annotations: ro, handler: async (args) => ({ ok: true, plugins: searchPluginCatalog(args.query) }) },
  { name: "ableton_plan_plugin_download", description: "Plan a safe plugin/package download into staging without installing it.", inputSchema: { url: z.string().url().optional(), destinationName: z.string().min(1).optional(), catalogId: z.string().max(100).optional() }, annotations: ro, handler: async (args) => ({ ok: true, pluginDownload: planPluginDownload(args) }) },
  { name: "ableton_download_plugin_package", description: "Download an approved plugin/package URL into plugin staging when downloads are enabled; never installs it.", inputSchema: { url: z.string().url(), destinationName: z.string().min(1), metadata: z.record(z.unknown()).default({}) }, annotations: { ...webro, readOnlyHint: false }, handler: async (args) => ({ ok: true, pluginPackage: await downloadPluginPackage(args.url, args.destinationName, args.metadata) }) },
  { name: "ableton_plugin_install_instructions", description: "Return manual install instructions for a staged plugin/package; MCP never runs installers.", inputSchema: { stagedPath: z.string().min(1) }, annotations: ro, handler: async (args) => ({ ok: true, instructions: pluginInstallInstructions(args.stagedPath) }) },

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
