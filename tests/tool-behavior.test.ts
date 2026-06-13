import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const INTEGRATION_TIMEOUT_MS = 20_000;

async function withClient<T>(fn: (client: Client) => Promise<T>) {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/src/index.js"] });
  const client = new Client({ name: "tool-behavior-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function callStructured(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return result.structuredContent as Record<string, unknown>;
}

describe("MCP tool behavior", () => {
  it("reports production readiness across clients, gates, concept workflow, and bridge state", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_get_production_readiness", { check_bridge: false });
      const readiness = structured.readiness as Record<string, any>;

      expect(structured.ok).toBe(true);
      expect(readiness.status).toMatch(/ready_for_/);
      expect(readiness.gates).toMatchObject({
        writeEnabled: false,
        downloadsEnabled: false,
        uiControlEnabled: false
      });
      expect(readiness.clients.hypernimbus).toMatchObject({
        profile: "hypernimbus",
        endpoint: "http://127.0.0.1:17366/mcp",
        safeToolCount: expect.any(Number)
      });
      expect(readiness.clients.openclaw.role).toBe("consumer");
      expect(readiness.bridge).toMatchObject({ checked: false, reachable: null });
      expect(readiness.conceptToMusic).toMatchObject({
        preset: "liminal_backrooms_horror",
        planningReady: true,
        dryRunExecutionReady: true
      });
      expect(readiness.conceptToMusic.exactNextToolCalls.map((call: Record<string, unknown>) => call.name)).toEqual(expect.arrayContaining([
        "ableton_plan_concept_track",
        "ableton_render_concept_automation_map",
        "ableton_preflight_concept_execution"
      ]));
      expect(readiness.safety).toMatchObject({
        arbitraryShell: false,
        arbitraryUrlFetch: false,
        broadFilesystemScan: false,
        uiMouseByDefault: false
      });
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("reports a launch readiness audit for safe agent startup decisions", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_mcp_get_launch_readiness_audit", { check_bridge: false });
      const audit = structured.launchReadiness as Record<string, any>;
      const checks = audit.checks as Record<string, any>[];
      const coverage = audit.liveControlCoverage as Record<string, any>;
      const coverageAreas = coverage.areas as Record<string, any>[];

      expect(structured.ok).toBe(true);
      expect(audit.mode).toMatch(/ready_for_|needs_attention/);
      expect(audit.okForDefaultClientUse).toBe(true);
      expect(audit.summary.safeToolCount).toBeGreaterThan(100);
      expect(audit.summary.bridgeReachable).toBe(false);
      expect(coverage.summary.areas).toBeGreaterThanOrEqual(8);
      expect(coverage.summary.writeGatedSupported).toBeGreaterThanOrEqual(4);
      expect(coverage.dryRunSmokeSequence.map((call: Record<string, unknown>) => call.name)).toEqual(expect.arrayContaining([
        "ableton_create_audio_track",
        "ableton_insert_midi_notes",
        "ableton_create_arrangement_marker"
      ]));
      expect(coverageAreas.find((area) => area.id === "native_device_insertion")).toMatchObject({
        status: "unsupported_by_current_bridge"
      });
      expect(coverageAreas.find((area) => area.id === "automation_breakpoint_writes")).toMatchObject({
        status: "partially_supported"
      });
      expect(checks.map((check) => check.id)).toEqual(expect.arrayContaining([
        "safe_defaults",
        "client_profiles",
        "concept_workflow",
        "background_live_bridge",
        "optional_ui_driver"
      ]));
      expect(checks.find((check) => check.id === "background_live_bridge")).toMatchObject({
        status: "warn",
        evidence: {
          checked: false,
          reachable: null
        }
      });
      expect(checks.find((check) => check.id === "optional_ui_driver")).toMatchObject({
        status: "pass",
        evidence: {
          enabledByDefault: false,
          excludedFromSafeToolAllowlist: true
        }
      });
      expect(audit.guardrails).toContain("This audit is read-only.");
      expect(audit.exactNextToolCalls.map((call: Record<string, unknown>) => call.name)).toEqual(expect.arrayContaining([
        "ableton_plan_agent_music_session",
        "ableton_plan_full_concept_production"
      ]));
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("reports objective readiness without claiming live bridge completion", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_mcp_get_objective_readiness_report", { check_bridge: false });
      const report = structured.objectiveReadiness as Record<string, any>;
      const requirements = report.requirements as Record<string, any>[];

      expect(structured.ok).toBe(true);
      expect(report.objective).toContain("Primary secured Ableton MCP");
      expect(report.overallStatus).toMatch(/ready_for_|needs_attention/);
      expect(report.okForDefaultClientUse).toBe(true);
      expect(report.okForMusicPlanningAndDryRun).toBe(true);
      expect(report.okForFullLiveMusicProduction).toBe(false);
      expect(report.summary.safeToolCount).toBeGreaterThan(100);
      expect(report.summary.bridgeReachable).toBe(false);
      expect(report.blockingProof.join("\n")).toContain("Max for Live bridge");
      expect(requirements.map((requirement) => requirement.id)).toEqual(expect.arrayContaining([
        "secure_default_runtime",
        "hypernimbus_openclaw_safe_profile",
        "concept_to_music_workflow",
        "background_liveapi_bridge",
        "real_execution_gate",
        "optional_ui_mouse_control"
      ]));
      expect(requirements.find((requirement) => requirement.id === "hypernimbus_openclaw_safe_profile")).toMatchObject({
        status: "pass",
        evidence: {
          includesObjectiveReport: true,
          excludesRealExecution: true,
          excludesUiSession: true
        },
        verificationCommand: "npm run docker:hypernimbus:verify"
      });
      expect(requirements.find((requirement) => requirement.id === "background_liveapi_bridge")).toMatchObject({
        status: "pending_runtime",
        evidence: {
          checked: false,
          reachable: null
        }
      });
      expect(requirements.find((requirement) => requirement.id === "real_execution_gate")).toMatchObject({
        status: "dry_run_only"
      });
      expect(report.firstAgentCalls.map((call: Record<string, unknown>) => call.name)).toEqual(expect.arrayContaining([
        "ableton_mcp_get_objective_readiness_report",
        "ableton_plan_agent_music_session",
        "ableton_plan_full_concept_production"
      ]));
      expect(report.guardrails).toContain("This report is read-only and should not be treated as live-write proof.");
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("reports the safe HyperNimbus/OpenClaw tool allowlist without enabling risky tools", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_mcp_get_safe_tool_allowlist", {});
      const safeToolAllowlist = structured.safeToolAllowlist as Record<string, unknown>;
      const tools = safeToolAllowlist.tools as string[];
      const policy = safeToolAllowlist.policy as Record<string, unknown>;

      expect(structured.ok).toBe(true);
      expect(safeToolAllowlist.profile).toBe("hypernimbus");
      expect(safeToolAllowlist.endpoint).toBe("http://127.0.0.1:17366/mcp");
      expect(tools).toEqual(expect.arrayContaining([
        "ableton_plan_concept_track",
        "ableton_curate_concept_samples",
        "ableton_render_concept_execution_action_matrix",
        "ableton_render_concept_automation_map",
        "ableton_plan_concept_device_ui_placement",
        "ableton_render_concept_execution_manifest",
        "ableton_mcp_get_objective_readiness_report",
        "ableton_mcp_get_launch_readiness_audit",
        "ableton_mcp_get_safe_tool_allowlist"
      ]));
      expect(tools).not.toContain("ableton_execute_concept_plan");
      expect(tools).not.toContain("ableton_stage_concept_samples");
      expect(tools).not.toContain("ableton_download_sample");
      expect(tools).not.toContain("ableton_click_coordinates");
      expect(safeToolAllowlist.csv).toContain("ableton_plan_concept_track");
      expect(policy.permissionOwner).toBe("Ableton MCP");
      expect(policy.writesEnabled).toBe(false);
      expect(policy.downloadsEnabled).toBe(false);
      expect(policy.uiControlEnabled).toBe(false);
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("reports bridge setup status without probing or driving Ableton by default", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_bridge_setup_status", { check_bridge: false });
      const setup = structured.bridgeSetup as Record<string, any>;

      expect(structured.ok).toBe(true);
      expect(setup.status).toMatch(/bridge_files_need_install|ableton_not_running|installed_pending_bridge_check|ready/);
      expect(setup.install.files.length).toBeGreaterThanOrEqual(5);
      expect(setup.install.files[0]).toHaveProperty("sourceMatchesTarget");
      expect(setup.live).toHaveProperty("running");
      expect(setup.bridge).toMatchObject({
        checked: false,
        reachable: null
      });
      expect(setup.nextSteps.length).toBeGreaterThan(0);
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("returns offline device browsing guidance with an opt-in bridge discovery path", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_browse_live_devices", {
        category: "audio_effects",
        max_items: 8,
        max_depth: 1,
        check_bridge: false
      });
      const browser = structured.browser as Record<string, any>;

      expect(structured.ok).toBe(true);
      expect(browser.kind).toBe("live_devices");
      expect(browser.safeByDefault).toBe(true);
      expect(browser.payload.devices).toContain("Hybrid Reverb");
      expect(browser.payload.bridgeDiscovery).toMatchObject({
        available: true,
        action: "browser_device_tree",
        call: {
          name: "ableton_browse_live_devices",
          arguments: {
            category: "audio_effects",
            max_items: 8,
            max_depth: 1,
            check_bridge: true
          }
        }
      });
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("plans a side-effect-free agent music session across client runtimes", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_plan_agent_music_session", {
        concept: "a backrooms hallway where a memory song collapses under fluorescent lights",
        target_duration_seconds: 120,
        intensity: 8,
        style: "liminal/backrooms/horror",
        client: "openclaw",
        include_sample_search: true,
        include_audio_preparation: true,
        check_bridge: false
      });
      const workflow = structured.workflow as Record<string, any>;

      expect(structured.ok).toBe(true);
      expect(workflow.client).toBe("openclaw");
      expect(workflow.style).toBe("liminal/backrooms/horror");
      expect(workflow.safeToolAllowlist).toMatchObject({
        endpoint: "http://127.0.0.1:17366/mcp",
        includesThisTool: true,
        excludesUserGatedUiSession: true
      });
      expect(workflow.optionalGatedWorkflows.conceptDeviceUiSession).toMatchObject({
        enabledByDefault: false,
        excludedFromSafeToolAllowlist: true,
        requiredGate: "ABLETON_MCP_ENABLE_UI_CONTROL=1 plus user-started UI driver"
      });
      expect(workflow.optionalGatedWorkflows.conceptDeviceUiSession.calls.map((call: Record<string, unknown>) => call.name)).toContain("ableton_begin_concept_device_ui_session");
      expect(workflow.automationModel).toMatchObject({
        default: "staged_approval",
        arbitraryBridgePayloads: false
      });
      expect(workflow.automationModel.realWritesRequire).toEqual(expect.arrayContaining([
        "ABLETON_MCP_ENABLE_WRITE=1",
        "approval_id"
      ]));
      expect(workflow.phases.map((phase: Record<string, unknown>) => phase.phase)).toEqual(expect.arrayContaining([
        "concept_architecture",
        "sample_discovery",
        "live_preflight_and_approval"
      ]));
      const sampleDiscovery = workflow.phases.find((phase: Record<string, unknown>) => phase.phase === "sample_discovery");
      expect(sampleDiscovery.calls.map((call: Record<string, unknown>) => call.name)).toContain("ableton_curate_concept_samples");
      expect(workflow.nextBestCall).toMatchObject({
        name: "ableton_plan_concept_track"
      });
      expect(workflow.nextBestCall.arguments.sources).toEqual(expect.arrayContaining([
        "local_library",
        "internet_archive",
        "freesound"
      ]));
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("reports a safe client bootstrap bundle for MCP consumers", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_mcp_get_client_bootstrap_bundle", {});
      const bootstrap = structured.bootstrap as Record<string, any>;

      expect(structured.ok).toBe(true);
      expect(bootstrap.server).toBe("ableton-mcp");
      expect(bootstrap.transportDefaults.streamableHttp.url).toBe("http://127.0.0.1:17366/mcp");
      expect(bootstrap.safeToolAllowlist.tools).toContain("ableton_mcp_get_client_bootstrap_bundle");
      expect(bootstrap.safeToolAllowlist.tools).toContain("ableton_mcp_get_objective_readiness_report");
      expect(bootstrap.safeToolAllowlist.tools).toContain("ableton_mcp_get_launch_readiness_audit");
      expect(bootstrap.clients.openclaw.commands.join("\n")).toContain("openclaw mcp doctor ableton-mcp --probe");
      expect(bootstrap.clients.openRouter.note).toContain("host app");
      expect(bootstrap.clients.llamaCpp.note).toContain("wrapper");
      expect(bootstrap.optionalGatedWorkflows.conceptDeviceUiSession).toMatchObject({
        enabledByDefault: false,
        excludedFromSafeToolAllowlist: true,
        requiredGate: "ABLETON_MCP_ENABLE_UI_CONTROL=1 plus user-started UI driver"
      });
      expect(bootstrap.optionalGatedWorkflows.conceptDeviceUiSession.calls.map((call: Record<string, unknown>) => call.name)).toEqual(expect.arrayContaining([
        "ableton_plan_concept_device_ui_placement",
        "ableton_begin_concept_device_ui_session"
      ]));
      expect(bootstrap.recommendedAgentWorkflow.map((call: Record<string, unknown>) => call.name)).toEqual(expect.arrayContaining([
        "ableton_mcp_get_objective_readiness_report",
        "ableton_mcp_get_launch_readiness_audit",
        "ableton_plan_full_concept_production",
        "ableton_curate_concept_samples",
        "ableton_render_concept_device_chain_spec",
        "ableton_render_concept_device_catalog_matches",
        "ableton_plan_concept_device_ui_placement",
        "ableton_render_concept_execution_runbook",
        "ableton_render_concept_execution_action_matrix",
        "ableton_preflight_concept_execution"
      ]));
      expect(bootstrap.safetyDefaults).toMatchObject({
        writeEnabled: false,
        downloadsEnabled: false,
        uiControlEnabled: false
      });
      expect(bootstrap.guardrails).toContain("Do not expose HTTP publicly.");
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("reports unsupported dry-run status for LiveAPI controls that cannot be proven reliable", async () => {
    await withClient(async (client) => {
      const instrument = await callStructured(client, "ableton_insert_instrument", {
        track_index: 0,
        device: "Wavetable",
        dry_run: true
      });
      const automation = await callStructured(client, "ableton_set_automation_point", {
        track_index: 0,
        device_index: 0,
        parameter_index: 1,
        time: 1,
        value: 0.5,
        dry_run: true
      });
      const quantize = await callStructured(client, "ableton_quantize_clip", {
        track_index: 0,
        clip_slot_index: 0,
        grid: "1/16",
        amount: 1,
        dry_run: true
      });

      for (const structured of [instrument, automation, quantize]) {
        expect(structured.ok).toBe(true);
        expect(structured.dry_run).toBe(true);
        expect(structured.unsupported).toBe(true);
        expect(structured.nextSteps).toEqual(expect.arrayContaining([
          expect.stringMatching(/browse|inspect|driver|bridge/i)
        ]));
      }
    });
  }, INTEGRATION_TIMEOUT_MS);
});
