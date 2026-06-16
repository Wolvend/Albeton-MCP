import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLiveSmokeReport, chooseDeviceProbeTrackIndex, liveSmokeCalls, liveSmokeDeepCalls, parseLiveSmokeArgs } from "../scripts/live-smoke.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("live smoke workflow", () => {
  it("is exposed through package scripts and launchers", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const launchPs1 = fs.readFileSync(path.join(projectRoot, "launch.ps1"), "utf8");
    const launchSh = fs.readFileSync(path.join(projectRoot, "launch.sh"), "utf8");
    const liveReady = fs.readFileSync(path.join(projectRoot, "scripts", "live-ready.ts"), "utf8");
    const liveSmoke = fs.readFileSync(path.join(projectRoot, "scripts", "live-smoke.ts"), "utf8");
    const bridgeSetup = fs.readFileSync(path.join(projectRoot, "src", "bridge-setup.ts"), "utf8");

    expect(packageJson.scripts["live-ready"]).toBe("node dist/scripts/live-ready.js");
    expect(packageJson.scripts["live-smoke"]).toBe("node dist/scripts/live-smoke.js");
    expect(packageJson.scripts["ready:check"]).toBe("node dist/scripts/ready-check.js");
    expect(packageJson.scripts["bridge:status"]).toBe("node dist/scripts/bridge-setup-status.js");
    expect(launchPs1).toContain('"live-ready"');
    expect(launchPs1).toContain("npm.cmd run live-ready");
    expect(launchPs1).toContain("-StartLive");
    expect(launchPs1).toContain("-OpenBridge");
    expect(launchPs1).toContain('"live-smoke"');
    expect(launchPs1).toContain("npm.cmd run live-smoke");
    expect(launchPs1).toContain('"ready"');
    expect(launchPs1).toContain("npm.cmd run ready:check");
    expect(launchPs1).toContain('"bridge-status"');
    expect(launchPs1).toContain("npm.cmd run bridge:status");
    expect(launchSh).toContain("live-ready)");
    expect(launchSh).toContain("npm run live-ready");
    expect(launchSh).toContain("--start-live");
    expect(launchSh).toContain("--open-bridge");
    expect(launchSh).toContain("live-smoke)");
    expect(launchSh).toContain("npm run live-smoke");
    expect(launchSh).toContain("ready)");
    expect(launchSh).toContain("npm run ready:check");
    expect(launchSh).toContain("bridge-status)");
    expect(launchSh).toContain("npm run bridge:status");
    expect(liveReady).toContain("bridgeDevice");
    expect(liveReady).toContain("bridgeOpen");
    expect(liveReady).toContain("bridgeListener");
    expect(liveReady).toContain("safeNextCommands");
    expect(liveSmoke).toContain('ABLETON_MCP_ENABLE_WRITE: "0"');
    expect(liveSmoke).toContain('ABLETON_MCP_ENABLE_UI_CONTROL: "0"');
    expect(liveSmoke).toContain('ABLETON_MCP_ENABLE_DOWNLOADS: "0"');
    expect(bridgeSetup).toContain("User Library > Presets > MIDI Effects > Max MIDI Effect > Ableton MCP Bridge");
  });

  it("keeps the write probe dry-run only", () => {
    const dryRunWrite = liveSmokeCalls.find((call) => call.name === "ableton_duplicate_clip");
    expect(dryRunWrite?.arguments).toMatchObject({ dry_run: true });
    expect(liveSmokeCalls.map((call) => call.name)).not.toContain("ableton_capture_screenshot");
    expect(liveSmokeCalls.map((call) => call.name)).not.toContain("ableton_download_sample");
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_mcp_get_objective_readiness_report");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_mcp_get_objective_readiness_report")?.arguments)
      .toMatchObject({ check_bridge: true });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_mcp_get_launch_readiness_audit");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_mcp_get_launch_readiness_audit")?.arguments)
      .toMatchObject({ check_bridge: true });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_get_bridge_capabilities");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_get_bridge_capabilities")?.arguments)
      .toMatchObject({ check_bridge: true });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_bridge_setup_status");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_bridge_setup_status")?.arguments)
      .toMatchObject({ check_bridge: true });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_get_live_state");
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_list_tracks_compact");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_list_tracks_compact")?.arguments)
      .toMatchObject({ page: 1, pageSize: 16 });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_get_track_detail");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_get_track_detail")?.arguments)
      .toMatchObject({ track_index: 0, include_devices: false, include_clip_slots: false });
    expect(liveSmokeCalls.map((call) => call.name)).not.toContain("ableton_list_devices");
    expect(liveSmokeDeepCalls).toEqual([
      { name: "ableton_list_devices", arguments: { track_index: 0, page: 1, pageSize: 1 }, required: false }
    ]);
    expect(parseLiveSmokeArgs(["--deep"])).toEqual({ deep: true });
    expect(parseLiveSmokeArgs([])).toEqual({ deep: false });
    expect(liveSmokeCalls.map((call) => call.name)).not.toContain("ableton_get_routing_overview");
  });

  it("chooses a non-bridge track for the live device probe", () => {
    expect(chooseDeviceProbeTrackIndex([
      {
        name: "ableton_list_tracks_compact",
        ok: true,
        isError: false,
        required: true,
        structuredContent: {
          bridge: {
            data: {
              tracks: [
                { index: 0, name: "MCP BRIDGE - keep muted", device_count: 1 },
                { index: 1, name: "2-MIDI", device_count: 0 },
                { index: 2, name: "Memory Lead", device_count: 2 }
              ]
            }
          }
        }
      }
    ])).toBe(1);
  });

  it("builds a compact success report from mocked MCP results", () => {
    const results = liveSmokeCalls.map((call) => ({
      name: call.name,
      ok: true,
      isError: false,
      required: call.required,
      structuredContent: call.name === "ableton_mcp_get_objective_readiness_report"
        ? {
            objectiveReadiness: {
              overallStatus: "ready_for_live_reads_and_dry_runs",
              okForDefaultClientUse: true,
              okForFullLiveMusicProduction: false,
              summary: {
                hardFailures: [],
                pendingRuntime: ["real_execution_gate"]
              }
            }
          }
        : call.name === "ableton_mcp_get_launch_readiness_audit"
        ? {
            launchReadiness: {
              mode: "ready_for_live_read_dry_run",
              okForDefaultClientUse: true,
              summary: { safeToolCount: 140 },
              liveControlCoverage: {
                summary: { areas: 9, writeGatedSupported: 4, unsupported: 1 },
                areas: [
                  { id: "native_device_insertion", status: "unsupported_by_current_bridge" },
                  { id: "automation_breakpoint_writes", status: "partially_supported" }
                ]
              }
            }
          }
        : call.name === "ableton_get_bridge_capabilities"
          ? { capabilities: { summary: { read_only: 10, write_gated: 20, unsupported: 4, diagnostic: 2 } } }
        : call.name === "ableton_bridge_setup_status"
          ? { bridgeSetup: { status: "ready", install: { ready: true }, live: { running: true }, bridge: { checked: true, reachable: true } } }
        : call.name === "ableton_get_live_state"
        ? { bridge: { data: { track_count: 4, scene_count: 9 } } }
        : call.name === "ableton_list_tracks_compact"
        ? { bridge: { data: { track_count: 4, tracks: [{}, {}] } } }
        : call.name === "ableton_list_scenes"
        ? { bridge: { data: { scenes: [{}, {}, {}] } } }
        : call.name === "ableton_duplicate_clip"
          ? { ok: true, dry_run: true }
          : call.name === "ableton_list_devices"
            ? { bridge: { data: { devices: [{}] } } }
          : { ok: true }
    }));

    const report = buildLiveSmokeReport(results);

    expect(report.ok).toBe(true);
    expect(report.bridgeReachable).toBe(true);
    expect(report.bridgeNeedsReload).toBe(false);
    expect(report.deepProbe).toBe(false);
    expect(report.dryRunWriteConfirmed).toBe(true);
    expect(report.counts.tracks).toBe(2);
    expect(report.counts.scenes).toBe(3);
    expect(report.counts.devices).toBeNull();
    expect(report.counts.routingRows).toBeNull();
    expect(report.objectiveReadiness).toMatchObject({
      overallStatus: "ready_for_live_reads_and_dry_runs",
      okForDefaultClientUse: true,
      okForFullLiveMusicProduction: false,
      hardFailures: [],
      pendingRuntime: ["real_execution_gate"]
    });
    expect(report.launchReadiness).toMatchObject({
      mode: "ready_for_live_read_dry_run",
      okForDefaultClientUse: true,
      safeToolCount: 140,
      liveControlCoverage: {
        areas: 9,
        writeGatedSupported: 4,
        unsupported: 1,
        nativeDeviceInsertion: "unsupported_by_current_bridge",
        automationBreakpointWrites: "partially_supported"
      }
    });
    expect(report.bridgeSetup).toMatchObject({
      status: "ready",
      installReady: true,
      liveRunning: true,
      checked: true,
      reachable: true
    });
    expect(report.bridgeCapabilitySummary).toMatchObject({ read_only: 10, write_gated: 20, unsupported: 4, diagnostic: 2 });
    expect(report.setupHints).toEqual([]);
  });

  it("reports setup hints when the bridge is unreachable", () => {
    const results = liveSmokeCalls.map((call) => ({
      name: call.name,
      ok: call.name !== "ableton_bridge_ping",
      isError: call.name === "ableton_bridge_ping",
      required: call.required,
      structuredContent: call.name === "ableton_duplicate_clip"
        ? { ok: true, dry_run: true }
        : call.name === "ableton_bridge_setup_status"
          ? {
              bridgeSetup: {
                status: "bridge_device_not_loaded",
                install: { ready: true },
                live: { running: true },
                nextSteps: ["Load Ableton MCP Bridge from User Library > Presets > MIDI Effects > Max MIDI Effect."]
              }
            }
          : { ok: true }
    })).map((result) => result.name === "ableton_bridge_ping" ? { ...result, error: "BRIDGE_UNREACHABLE" } : result);

    const report = buildLiveSmokeReport(results);

    expect(report.ok).toBe(false);
    expect(report.bridgeReachable).toBe(false);
    expect(report.bridgeSetup.status).toBe("bridge_device_not_loaded");
    expect(report.setupHints.join(" ")).not.toMatch(/Open Ableton Live/);
    expect(report.setupHints.join(" ")).toMatch(/Load Ableton MCP Bridge/);
  });

  it("marks bridge reload needed when bridge ping times out", () => {
    const results = liveSmokeCalls.map((call) => ({
      name: call.name,
      ok: call.name !== "ableton_bridge_ping",
      isError: call.name === "ableton_bridge_ping",
      required: call.required,
      structuredContent: call.name === "ableton_duplicate_clip" ? { ok: true, dry_run: true } : { ok: true },
      ...(call.name === "ableton_bridge_ping" ? { error: "BRIDGE_TIMEOUT: Ableton bridge request timed out." } : {})
    }));

    const report = buildLiveSmokeReport(results);

    expect(report.ok).toBe(false);
    expect(report.bridgeReachable).toBe(false);
    expect(report.bridgeNeedsReload).toBe(true);
    expect(report.setupHints.join(" ")).toMatch(/Reload the Ableton MCP Bridge/);
  });

  it("marks bridge reload needed and fails fast after a LiveAPI timeout", () => {
    const results = [
      ...liveSmokeCalls.map((call) => ({
        name: call.name,
        ok: true,
        isError: false,
        required: call.required,
        structuredContent: call.name === "ableton_bridge_setup_status"
          ? { bridgeSetup: { status: "ready", install: { ready: true }, live: { running: true }, bridge: { checked: true, reachable: true } } }
          : call.name === "ableton_duplicate_clip"
            ? { ok: true, dry_run: true }
            : { ok: true }
      })),
      {
        name: "ableton_list_devices",
        ok: false,
        isError: true,
        required: false,
        structuredContent: {
          ok: false,
          code: "LIVEAPI_TIMEOUT",
          error: "LiveAPI handler timed out."
        }
      }
    ];

    const report = buildLiveSmokeReport(results, { deep: true });

    expect(report.ok).toBe(false);
    expect(report.bridgeReachable).toBe(true);
    expect(report.bridgeNeedsReload).toBe(true);
    expect(report.deepProbe).toBe(true);
    expect(report.results.find((result) => result.name === "ableton_list_devices")).toMatchObject({
      ok: false,
      required: false,
      error: "LIVEAPI_TIMEOUT: LiveAPI handler timed out."
    });
    expect(report.setupHints.join(" ")).toMatch(/Reload the Ableton MCP Bridge/);
  });
});
