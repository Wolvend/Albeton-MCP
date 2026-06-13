import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLiveSmokeReport, liveSmokeCalls } from "../scripts/live-smoke.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("live smoke workflow", () => {
  it("is exposed through package scripts and launchers", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const launchPs1 = fs.readFileSync(path.join(projectRoot, "launch.ps1"), "utf8");
    const launchSh = fs.readFileSync(path.join(projectRoot, "launch.sh"), "utf8");

    expect(packageJson.scripts["live-smoke"]).toBe("node dist/scripts/live-smoke.js");
    expect(packageJson.scripts["bridge:status"]).toBe("node dist/scripts/bridge-setup-status.js");
    expect(launchPs1).toContain('"live-smoke"');
    expect(launchPs1).toContain("npm.cmd run live-smoke");
    expect(launchPs1).toContain('"bridge-status"');
    expect(launchPs1).toContain("npm.cmd run bridge:status");
    expect(launchSh).toContain("live-smoke)");
    expect(launchSh).toContain("npm run live-smoke");
    expect(launchSh).toContain("bridge-status)");
    expect(launchSh).toContain("npm run bridge:status");
  });

  it("keeps the write probe dry-run only", () => {
    const dryRunWrite = liveSmokeCalls.find((call) => call.name === "ableton_duplicate_clip");
    expect(dryRunWrite?.arguments).toMatchObject({ dry_run: true });
    expect(liveSmokeCalls.map((call) => call.name)).not.toContain("ableton_capture_screenshot");
    expect(liveSmokeCalls.map((call) => call.name)).not.toContain("ableton_download_sample");
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_mcp_get_objective_readiness_report");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_mcp_get_objective_readiness_report")?.arguments)
      .toMatchObject({ check_bridge: false });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_mcp_get_launch_readiness_audit");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_mcp_get_launch_readiness_audit")?.arguments)
      .toMatchObject({ check_bridge: false });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_get_bridge_capabilities");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_get_bridge_capabilities")?.arguments)
      .toMatchObject({ check_bridge: false });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_bridge_setup_status");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_bridge_setup_status")?.arguments)
      .toMatchObject({ check_bridge: false });
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_get_live_state");
    expect(liveSmokeCalls.map((call) => call.name)).toContain("ableton_get_routing_overview");
    expect(liveSmokeCalls.find((call) => call.name === "ableton_get_routing_overview")?.arguments)
      .toMatchObject({ include_devices: false });
  });

  it("builds a compact success report from mocked MCP results", () => {
    const results = liveSmokeCalls.map((call) => ({
      name: call.name,
      ok: true,
      isError: false,
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
          ? { bridgeSetup: { status: "ready", install: { ready: true }, live: { running: true }, bridge: { checked: false, reachable: null } } }
        : call.name === "ableton_get_full_snapshot"
        ? { snapshot: { data: { state: { track_count: 4, scene_count: 9 }, tracks: [{}, {}], scenes: [{}, {}, {}] } } }
        : call.name === "ableton_duplicate_clip"
          ? { ok: true, dry_run: true }
          : call.name === "ableton_get_routing_overview"
            ? { ok: true, bridge: { data: { send_matrix: [{}, {}] } } }
          : call.name === "ableton_list_devices"
            ? { bridge: { data: { devices: [{}] } } }
          : { ok: true }
    }));

    const report = buildLiveSmokeReport(results);

    expect(report.ok).toBe(true);
    expect(report.bridgeReachable).toBe(true);
    expect(report.dryRunWriteConfirmed).toBe(true);
    expect(report.counts.tracks).toBe(2);
    expect(report.counts.scenes).toBe(3);
    expect(report.counts.devices).toBe(1);
    expect(report.counts.routingRows).toBe(2);
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
      checked: false,
      reachable: null
    });
    expect(report.bridgeCapabilitySummary).toMatchObject({ read_only: 10, write_gated: 20, unsupported: 4, diagnostic: 2 });
    expect(report.setupHints).toEqual([]);
  });

  it("reports setup hints when the bridge is unreachable", () => {
    const results = liveSmokeCalls.map((call) => ({
      name: call.name,
      ok: call.name !== "ableton_bridge_ping",
      isError: call.name === "ableton_bridge_ping",
      structuredContent: call.name === "ableton_duplicate_clip" ? { ok: true, dry_run: true } : { ok: true }
    })).map((result) => result.name === "ableton_bridge_ping" ? { ...result, error: "BRIDGE_UNREACHABLE" } : result);

    const report = buildLiveSmokeReport(results);

    expect(report.ok).toBe(false);
    expect(report.bridgeReachable).toBe(false);
    expect(report.setupHints.join(" ")).toMatch(/Open Ableton Live/);
  });
});
