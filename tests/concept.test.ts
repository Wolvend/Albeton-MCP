import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildArrangementFromPreparedAudio,
  buildLayeredArrangementPlan,
  createConceptExecutionApprovalBundle,
  executeConceptPlan,
  extractUnsupportedBridgeResult,
  exportConceptMidiMotif,
  getArrangementPlanForReport,
  getConceptExecutionJournalForReport,
  getConceptPlanForReport,
  listArrangementPlans,
  listConceptExecutionJournals,
  listConceptPlans,
  listConceptPresets,
  planConceptDeviceAutomationReadiness,
  planConceptProduction,
  planConceptRoutingReadiness,
  planConceptTrack,
  preflightConceptExecution,
  prepareConceptAudioLayers,
  renderConceptAttributionBundle,
  renderConceptAutomationMap,
  renderConceptExecutionManifest,
  renderConceptMixPlan,
  renderConceptProductionScorecard,
  renderConceptTimeline,
  readArrangementPlan,
  recordConceptExecutionJournalEvent,
  renderDeliveryPlan,
  sanitizeRemoteSampleText,
  startConceptExecutionJournal,
  stageConceptSamples
} from "../src/concept.js";
import { LOCAL_PATHS } from "../src/config.js";

describe("concept-to-music planning", () => {
  it("extracts unsupported bridge responses from successful bridge envelopes", () => {
    const unsupported = extractUnsupportedBridgeResult({
      ok: true,
      data: {
        unsupported: true,
        action: "ableton_insert_effect",
        reason: "Device insertion is not available.",
        nextSteps: ["Use read tools first.", 42, "Use UI fallback only by choice."],
        details: { requested_device: "Hybrid Reverb" }
      }
    });

    expect(unsupported).toMatchObject({
      action: "ableton_insert_effect",
      reason: "Device insertion is not available.",
      nextSteps: ["Use read tools first.", "Use UI fallback only by choice."],
      details: { requested_device: "Hybrid Reverb" }
    });
    expect(extractUnsupportedBridgeResult({ ok: true, data: { created: true } })).toBeNull();
  });

  it("writes redacted concept execution journal events", async () => {
    const journal = await startConceptExecutionJournal({
      arrangement_id: "arrangement-1111111111111111",
      approval_id: "approval-2222222222222222",
      executableActions: 1,
      totalActions: 2
    });
    const samplePath = path.join(LOCAL_PATHS.staging, "journal-secret-room-tone.wav");
    await recordConceptExecutionJournalEvent(journal, {
      type: "action_started",
      action: "ableton_load_preset_or_sample",
      payload: { path: samplePath }
    });
    const summary = await recordConceptExecutionJournalEvent(journal, {
      type: "action_failed",
      action: "ableton_load_preset_or_sample",
      error: { code: "TEST_ONLY", message: "fixture" }
    }, "failed");
    const stored = JSON.parse(await fs.readFile(journal.path, "utf8")) as Record<string, any>;

    expect(summary).toMatchObject({ id: journal.id, status: "failed", events: 2 });
    expect(summary.path).toContain("%USERPROFILE%");
    expect(JSON.stringify(stored)).not.toContain(samplePath);
    expect(JSON.stringify(stored)).toContain("%USERPROFILE%");
    expect(stored.events.map((event: Record<string, unknown>) => event.type)).toEqual([
      "action_started",
      "action_failed"
    ]);

    const journals = await listConceptExecutionJournals();
    expect(journals.some((entry) => entry.id === journal.id && entry.status === "failed")).toBe(true);

    const report = await getConceptExecutionJournalForReport(journal.id);
    expect(report.summary).toMatchObject({
      id: journal.id,
      status: "failed",
      eventCount: 2,
      failedEventCount: 1,
      latestEventType: "action_failed"
    });
    expect(JSON.stringify(report)).not.toContain(samplePath);
  });

  it("lists read-only concept production presets with safe next calls", () => {
    const presets = listConceptPresets();
    const horror = presets.find((preset) => preset.id === "liminal_backrooms_horror");

    expect(presets.map((preset) => preset.id)).toEqual(["liminal_backrooms_horror", "general_cinematic"]);
    expect(horror?.sections.map((section) => section.name)).toEqual([
      "Isolation",
      "Recognizable Motif",
      "Decay Loop",
      "Spatial Collapse",
      "Unresolved Tail"
    ]);
    expect(horror?.layerBlueprints.map((layer) => layer.name)).toEqual(expect.arrayContaining([
      "Degraded Memory",
      "Stretched Room",
      "Distant Room Tone",
      "Low Pressure",
      "Mechanical Texture",
      "Reversed Fragments",
      "Sparse Motif"
    ]));
    expect(horror?.productionMoves.join(" ")).toMatch(/degrade/i);
    expect(horror?.exactNextToolCalls.map((call) => call.name)).toEqual(expect.arrayContaining([
      "ableton_plan_concept_track",
      "ableton_search_concept_samples",
      "ableton_plan_full_concept_production"
    ]));
    expect(horror?.safety).toMatchObject({
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      remoteHttpExposure: false
    });
  });

  it("creates deterministic liminal horror plans with layered backrooms structure", async () => {
    const first = await planConceptTrack({
      concept: "a backrooms hallway where an old memory song decays under fluorescent lights",
      target_duration_seconds: 180,
      intensity: 8,
      sources: ["local_library", "internet_archive", "freesound"]
    });
    const second = await planConceptTrack({
      concept: "a backrooms hallway where an old memory song decays under fluorescent lights",
      target_duration_seconds: 180,
      intensity: 8,
      sources: ["local_library", "internet_archive", "freesound"]
    });

    expect(first.plan.id).toBe(second.plan.id);
    expect(first.plan.preset).toBe("liminal_backrooms_horror");
    expect(first.plan.sections.map((section) => section.name)).toEqual([
      "Isolation",
      "Recognizable Motif",
      "Decay Loop",
      "Spatial Collapse",
      "Unresolved Tail"
    ]);
    expect(first.plan.layers.map((layer) => layer.name)).toEqual(expect.arrayContaining([
      "Degraded Memory",
      "Stretched Room",
      "Distant Room Tone",
      "Low Pressure",
      "Mechanical Texture",
      "Reversed Fragments",
      "Sparse Motif",
      "Memory Reverb",
      "Distant Delay"
    ]));
  });

  it("builds a stored arrangement plan and keeps execution dry-run by default", async () => {
    const planned = await planConceptTrack({
      concept: "liminal mall ambience with tape melody",
      target_duration_seconds: 120,
      intensity: 6,
      sources: ["local_library"]
    });
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const stagedPath = path.join(LOCAL_PATHS.staging, "concept-assignment-test.wav");
    await fs.writeFile(stagedPath, "fixture audio placeholder");
    await fs.writeFile(`${stagedPath}.attribution.json`, `${JSON.stringify({
      sourceUrl: "https://archive.org/download/example/concept-assignment-test.wav",
      destinationName: "concept-assignment-test.wav",
      title: "Concept Assignment Test",
      creator: "Ableton MCP Test",
      identifier: "concept-assignment-test",
      license: "CC0",
      checksum: "abc123",
      bytes: 24
    }, null, 2)}\n`);
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id, [{
      layer: "Stretched Room",
      path: stagedPath,
      clip_slot_index: 1,
      name: "Assigned Room Tone"
    }]);
    const stored = await readArrangementPlan(arrangement.arrangement.id);
    const dryRun = await executeConceptPlan({ arrangement_id: arrangement.arrangement.id, dry_run: true });
    const readiness = await planConceptDeviceAutomationReadiness({
      arrangement_id: arrangement.arrangement.id,
      check_bridge: false
    });
    const routing = await planConceptRoutingReadiness({
      arrangement_id: arrangement.arrangement.id,
      check_bridge: false
    });
    const manifest = await renderConceptExecutionManifest({
      arrangement_id: arrangement.arrangement.id
    });
    const attribution = await renderConceptAttributionBundle({
      arrangement_id: arrangement.arrangement.id
    });
    const scorecard = await renderConceptProductionScorecard({
      arrangement_id: arrangement.arrangement.id,
      check_bridge: false
    });
    const timeline = await renderConceptTimeline(planned.plan.id);
    const mixPlan = await renderConceptMixPlan(planned.plan.id);
    const automationMap = await renderConceptAutomationMap(planned.plan.id);
    const delivery = await renderDeliveryPlan(planned.plan.id);

    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_create_audio_track")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_track_color")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_return_track_color")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_scene_color")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_scene_tempo")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_scene_time_signature")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_insert_midi_notes")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_rename_clip")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_clip_loop")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_clip_gain")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_transpose_clip")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_clip_warp")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_clip_markers")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_clip_color")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_track_send")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_return_track_volume")).toBe(true);
    expect(arrangement.arrangement.actions.some((action) => action.action === "ableton_set_return_track_pan")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_return_track_volume").every((action) => typeof action.payload.return_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_return_track_color").every((action) => typeof action.payload.return_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_scene_tempo").every((action) => typeof action.payload.scene_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_scene_time_signature").every((action) => typeof action.payload.scene_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_scene_color").every((action) => typeof action.payload.scene_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.automationPlan.some((entry) => entry.target === "filter")).toBe(true);
    expect(arrangement.arrangement.automationPlan.some((entry) => entry.target === "delay")).toBe(true);
    expect(arrangement.arrangement.automationPlan.every((entry) => entry.execution === "staged")).toBe(true);
    expect(arrangement.arrangement.devicePlan.some((entry) => entry.layer === "Stretched Room" && entry.devices.includes("Hybrid Reverb"))).toBe(true);
    expect(arrangement.arrangement.devicePlan.every((entry) => entry.execution === "staged")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_track_volume").every((action) => typeof action.payload.track_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_track_color").every((action) => typeof action.payload.color === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_rename_clip").every((action) => typeof action.payload.track_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_clip_gain").every((action) => typeof action.payload.track_created_offset === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_transpose_clip").every((action) => typeof action.payload.semitones === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_clip_warp").every((action) => typeof action.payload.warp_mode === "string")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_clip_markers").every((action) => typeof action.payload.end_marker === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_clip_color").every((action) => typeof action.payload.color === "number")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_set_clip_loop").every((action) => typeof action.payload.loop_end === "number")).toBe(true);
    expect(arrangement.arrangement.actions.find((action) => action.action === "ableton_insert_midi_notes")?.payload.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ pitch: expect.any(Number), start_time: expect.any(Number), duration: expect.any(Number) })
    ]));
    const sampleAction = arrangement.arrangement.actions.find((action) => action.action === "ableton_load_preset_or_sample");
    expect(sampleAction?.payload.path).not.toBe(stagedPath);
    expect(sampleAction?.payload.name).toBe("Assigned Room Tone");
    expect(arrangement.arrangement.sampleAssignments[0]?.path).not.toBe(stagedPath);
    expect(stored.actions.find((action) => action.action === "ableton_load_preset_or_sample")?.payload.path).toBe(stagedPath);
    expect(dryRun.dry_run).toBe(true);
    expect(dryRun.executableActions).toBeGreaterThan(0);
    const approvalRequirement = dryRun.approvalRequirement;
    expect(approvalRequirement).toBeDefined();
    if (!approvalRequirement) throw new Error("Expected dry-run approval requirement.");
    expect(approvalRequirement).toMatchObject({
      requiredForRealExecution: true,
      approval_confirmed: false
    });
    expect(approvalRequirement.approval_id).toMatch(/^approval-[a-f0-9]{16}$/);
    expect(readiness.bridge).toMatchObject({ checked: false, reachable: null });
    expect(readiness.summary.deviceChains).toBeGreaterThan(0);
    expect(readiness.summary.automationTargets).toBeGreaterThan(0);
    expect(readiness.summary.realDeviceInsertionSupported).toBe(false);
    expect(readiness.deviceChains.some((entry) => entry.toolCallTemplates.some((call) => call.name === "ableton_insert_effect"))).toBe(true);
    expect(readiness.automationTargets.some((entry) => entry.parameterHints.includes("Cutoff"))).toBe(true);
    expect(routing.bridge).toMatchObject({ checked: false, reachable: null });
    expect(routing.summary.plannedSendCount).toBeGreaterThan(0);
    expect(routing.summary.writesAbleton).toBe(false);
    expect(routing.discoveryCalls.map((call) => call.name)).toContain("ableton_get_routing_overview");
    expect(routing.plannedSends.some((entry) => entry.toolCallTemplate.name === "ableton_set_track_send")).toBe(true);
    expect(routing.exactDryRunSendCalls).toEqual([]);
    expect(manifest.manifestType).toBe("concept_execution_manifest");
    expect(manifest.safety).toMatchObject({ writesAbleton: false, downloads: false, uiControl: false, arbitraryBridgePayloads: false });
    expect(manifest.actionSummary.executable).toBeGreaterThan(0);
    expect(manifest.actionSummary.placeholderCounts.track).toBeGreaterThan(0);
    expect(manifest.phases.some((phase) => phase.phase === "midi_motif")).toBe(true);
    expect(manifest.phases.some((phase) => phase.actions.some((action) => action.payload.path === stagedPath))).toBe(false);
    expect(manifest.exactToolCalls.realExecutionAfterApproval.arguments).toMatchObject({
      arrangement_id: arrangement.arrangement.id,
      dry_run: false,
      approval_id: approvalRequirement.approval_id,
      approval_confirmed: true
    });
    expect(attribution.bundleType).toBe("concept_attribution_bundle");
    expect(attribution.safety).toMatchObject({ writesAbleton: false, downloads: false, uiControl: false, broadScan: false, localPathsRedacted: true });
    expect(attribution.summary).toMatchObject({ sampleAssignments: 1, sidecarsFound: 1, missingSidecars: 0, licenseWarnings: 0, attributionReady: true });
    expect(attribution.items[0]?.mediaPath).not.toBe(stagedPath);
    expect(attribution.items[0]?.sidecar).toMatchObject({
      found: true,
      sourceUrl: "https://archive.org/download/example/concept-assignment-test.wav",
      checksum: "abc123",
      licensePolicy: { allowed: true }
    });
    expect(attribution.exactNextToolCalls.globalAttributionReport.name).toBe("ableton_generate_attribution_report");
    expect(manifest.exactToolCalls.routingReadiness.name).toBe("ableton_plan_concept_routing_readiness");
    expect(manifest.stagedReview.routingReadinessToolCall.name).toBe("ableton_plan_concept_routing_readiness");
    expect(scorecard.scorecardType).toBe("concept_production_scorecard");
    expect(scorecard.safety).toMatchObject({ writesAbleton: false, downloads: false, uiControl: false, arbitraryBridgePayloads: false });
    expect(scorecard.status).toMatch(/ready_for_dry_run|needs_samples_or_bridge_review/);
    expect(scorecard.score).toBeGreaterThanOrEqual(70);
    expect(scorecard.summary.layers.missingAudioLayers).toContain("Degraded Memory");
    expect(scorecard.summary.layers.missingAudioLayers).toContain("Distant Room Tone");
    expect(scorecard.summary.actions.samplePlacements).toBeGreaterThan(0);
    expect(scorecard.checks.map((check) => check.id)).toEqual(expect.arrayContaining([
      "layer_architecture",
      "sample_coverage",
      "routing_and_space",
      "execution_safety"
    ]));
    expect(scorecard.exactNextToolCalls.preflightWithBridge.name).toBe("ableton_preflight_concept_execution");
    expect(scorecard.exactNextToolCalls.dryRunExecution.arguments).toMatchObject({
      arrangement_id: arrangement.arrangement.id,
      dry_run: true
    });
    expect(timeline.sectionCount).toBe(5);
    expect(timeline.sections.map((section) => section.name)).toContain("Spatial Collapse");
    expect(timeline.sections.some((section) => section.activeLayers.some((layer) => layer.name === "Sparse Motif" && layer.role === "entrance"))).toBe(true);
    expect(timeline.sections.some((section) => section.automationCues.some((cue) => cue.cues.join(" ").toLowerCase().includes("filter")))).toBe(true);
    expect(timeline.sections.every((section) => section.activeLayers.every((layer) => typeof layer.mix.volume === "number"))).toBe(true);
    expect(mixPlan.layers.some((layer) => layer.name === "Low Pressure" && layer.busRole === "controlled_low_end")).toBe(true);
    expect(mixPlan.layers.every((layer) => typeof layer.mix.approximateLevelDb === "number")).toBe(true);
    expect(mixPlan.layers.some((layer) => layer.automationCues.some((cue) => cue.target === "reverb" || cue.target === "delay" || cue.target === "filter"))).toBe(true);
    expect(mixPlan.returns.some((entry) => entry.useCases.some((useCase) => useCase.toLowerCase().includes("tail")))).toBe(true);
    expect(mixPlan.masterBus).toMatchObject({ sampleRate: 48000, bitDepth: "24", normalize: false, targetPeakDb: -6 });
    expect(mixPlan.safety).toMatchObject({ writesAbleton: false, downloads: false, uiControl: false });
    expect(automationMap.safety).toMatchObject({ writesAbleton: false, downloads: false, uiControl: false });
    expect(automationMap.summary.targets).toEqual(expect.arrayContaining(["reverb", "delay", "filter", "midi_velocity"]));
    expect(automationMap.lanes.some((lane) => lane.layer === "Distant Room Tone" && lane.points.some((point) => point.time_seconds === 0))).toBe(true);
    expect(automationMap.lanes.some((lane) => lane.dryRunTemplates.some((call) => call.name === "ableton_get_device_parameter_map"))).toBe(true);
    expect(automationMap.exactNextToolCalls.deviceAutomationReadiness.name).toBe("ableton_plan_concept_device_automation_readiness");
    expect(delivery.export.sampleRate).toBe(48000);
  });

  it("preflights concept execution without contacting the bridge when disabled", async () => {
    const planned = await planConceptTrack({
      concept: "preflight backrooms corridor with pressure tone",
      target_duration_seconds: 90,
      intensity: 7,
      sources: ["local_library"]
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);
    const preflight = await preflightConceptExecution({
      arrangement_id: arrangement.arrangement.id,
      check_bridge: false
    });

    expect(preflight.status).toBe("bridge_not_checked");
    expect(preflight.readyForRealWrite).toBe(false);
    expect(preflight.bridge).toMatchObject({ checked: false, reachable: null });
    expect(preflight.actionSummary.executable).toBeGreaterThan(0);
    expect(preflight.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BRIDGE_NOT_CHECKED", severity: "warning" })
    ]));
  });

  it("creates a redacted non-approving execution approval bundle", async () => {
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const stagedPath = path.join(LOCAL_PATHS.staging, "approval-bundle-room-tone.wav");
    await fs.writeFile(stagedPath, "fixture approval bundle audio");
    const planned = await planConceptTrack({
      concept: "approval bundle liminal room tone",
      target_duration_seconds: 90,
      intensity: 7,
      sources: ["local_library"]
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id, [{
      layer: "Stretched Room",
      path: stagedPath,
      clip_slot_index: 0,
      name: "Approval Bundle Room Tone"
    }]);

    const bundle = await createConceptExecutionApprovalBundle({
      arrangement_id: arrangement.arrangement.id,
      check_bridge: false
    });

    expect(bundle.approved).toBe(false);
    expect(bundle.approval_id).toMatch(/^approval-[a-f0-9]{16}$/);
    expect(bundle.approvalRequired).toBe(true);
    expect(bundle.gates.write.required).toBe(true);
    expect(bundle.exactToolCalls.realExecutionAfterApproval.arguments).toMatchObject({
      dry_run: false,
      approval_id: bundle.approval_id,
      approval_confirmed: true
    });
    expect(bundle.exactToolCalls.deviceAutomationReadiness.name).toBe("ableton_plan_concept_device_automation_readiness");
    expect(bundle.exactToolCalls.routingReadiness.name).toBe("ableton_plan_concept_routing_readiness");
    expect(bundle.preflight.readyForRealWrite).toBe(false);
    expect(bundle.arrangement.actions.some((action) => action.payload.path === stagedPath)).toBe(false);
    expect(bundle.securityBoundaries.join(" ")).toMatch(/does not approve execution/i);
  });

  it("plans concept MIDI motif export without writing by default", async () => {
    const planned = await planConceptTrack({
      concept: "backrooms hallway motif with decaying piano memory",
      target_duration_seconds: 120,
      intensity: 8,
      sources: ["local_library"]
    });
    const exported = await exportConceptMidiMotif({
      plan_id: planned.plan.id,
      output_name: "../unsafe motif.mid",
      dry_run: true
    });

    expect(exported.dry_run).toBe(true);
    expect(exported.midi.plan_id).toBe(planned.plan.id);
    expect(exported.midi.note_count).toBeGreaterThan(0);
    expect(exported.midi.outputPath).toContain("unsafe_motif.mid");
    expect(exported.midi.outputPath).not.toContain("..");
    expect(exported.nextStep).toMatch(/ABLETON_MCP_ENABLE_WRITE=1/);
  });

  it("builds a full safe concept production plan without downloads or Ableton writes", async () => {
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const stagedPath = path.join(LOCAL_PATHS.staging, "full-production-room-tone.wav");
    await fs.writeFile(stagedPath, "fixture production room tone");

    const production = await planConceptProduction({
      concept: "backrooms service corridor with a degraded memory melody",
      target_duration_seconds: 150,
      intensity: 8,
      style: "liminal/backrooms/horror",
      sources: ["local_library"],
      include_sample_search: false,
      sample_assignments: [{
        layer: "Stretched Room",
        path: stagedPath,
        clip_slot_index: 1,
        name: "Full Production Room Tone"
      }]
    });

    expect(production.workflow).toBe("plan_only");
    expect(production.safety.downloads).toBe("not_performed");
    expect(production.safety.ableton_writes).toBe("dry_run_only");
    expect(production.sampleSearch).toMatchObject({ skipped: true });
    expect(production.concept.plan.preset).toBe("liminal_backrooms_horror");
    expect(production.arrangement.arrangement.sampleAssignments[0]?.path).not.toBe(stagedPath);
    expect(production.scorecard.scorecardType).toBe("concept_production_scorecard");
    expect(production.scorecard.summary.layers.assignedAudio).toBeGreaterThan(0);
    expect(production.executionPreview.dry_run).toBe(true);
    expect(production.executionPreview.arrangement?.id).toBe(production.arrangement.arrangement.id);
    expect(production.delivery.export.sampleRate).toBe(48000);
  });

  it("turns approved reference audio into redacted source-treatment assignments", async () => {
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const sourcePath = path.join(LOCAL_PATHS.staging, "backrooms-source-memory.mp3");
    await fs.writeFile(sourcePath, "fixture source audio placeholder");
    const planned = await planConceptTrack({
      concept: "backrooms dementia song becoming hallway ambience",
      target_duration_seconds: 150,
      intensity: 9,
      sources: ["local_library"],
      reference_path: sourcePath
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);
    const stored = await readArrangementPlan(arrangement.arrangement.id);

    expect(planned.plan.reference?.mediaType).toBe("audio");
    expect(planned.plan.reference?.approvedForAudioPlacement).toBe(true);
    expect(planned.plan.reference?.path).not.toBe(sourcePath);
    expect(planned.plan.reference?.sourceAudioPlan?.targetLayers.map((layer) => layer.layer)).toEqual(expect.arrayContaining([
      "Degraded Memory",
      "Stretched Room",
      "Distant Room Tone",
      "Reversed Fragments"
    ]));
    expect(arrangement.arrangement.sourceAudioPlan?.referencePath).not.toBe(sourcePath);
    expect(arrangement.arrangement.sourceAudioPlan?.assignments.length).toBeGreaterThanOrEqual(4);
    expect(arrangement.arrangement.sampleAssignments.every((assignment) => assignment.path !== sourcePath)).toBe(true);
    expect(arrangement.arrangement.sampleAssignments.some((assignment) => assignment.source === "reference_audio")).toBe(true);
    expect(arrangement.arrangement.actions.filter((action) => action.action === "ableton_load_preset_or_sample").length).toBeGreaterThanOrEqual(4);
    expect(stored.sampleAssignments.some((assignment) => assignment.path === sourcePath && assignment.source === "reference_audio")).toBe(true);
  });

  it("plans reference-audio layer preparation from an approved source without writing by default", async () => {
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const sourcePath = path.join(LOCAL_PATHS.staging, "prepare-source-memory.wav");
    await fs.writeFile(sourcePath, "fixture source audio placeholder");
    const planned = await planConceptTrack({
      concept: "backrooms dementia song split into degraded layers",
      target_duration_seconds: 150,
      intensity: 9,
      sources: ["local_library"],
      reference_path: sourcePath
    });
    const preparation = await prepareConceptAudioLayers({
      plan_id: planned.plan.id,
      output_prefix: "../unsafe prefix",
      format: "wav",
      dry_run: true
    });
    const conversions = "conversions" in preparation ? preparation.conversions : [];

    expect(preparation.dry_run).toBe(true);
    expect(conversions.length).toBeGreaterThanOrEqual(4);
    expect(conversions.map((entry: any) => entry.layer)).toEqual(expect.arrayContaining([
      "Degraded Memory",
      "Stretched Room",
      "Distant Room Tone",
      "Reversed Fragments"
    ]));
    expect(conversions.map((entry: any) => entry.conversion.preset)).toEqual(expect.arrayContaining([
      "liminal_memory",
      "stretched_ambience",
      "reversed_fragment"
    ]));
    expect(conversions.every((entry: any) => String(entry.conversion.output).includes("unsafe_prefix"))).toBe(true);
    expect(conversions.every((entry: any) => !String(entry.conversion.output).includes(".."))).toBe(true);
    expect(preparation.nextStep).toMatch(/ABLETON_MCP_ENABLE_WRITE=1/);
  });

  it("builds an arrangement from a stored prepared-audio manifest without exposing executable paths", async () => {
    const planned = await planConceptTrack({
      concept: "backrooms prepared audio manifest arrangement",
      target_duration_seconds: 120,
      intensity: 8,
      sources: ["local_library"]
    });
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const preparedPath = path.join(LOCAL_PATHS.staging, "prepared-manifest-layer.wav");
    await fs.writeFile(preparedPath, "fixture prepared layer");
    const preparationId = "prepared-audio-1111111111111111";
    const manifestDir = path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-plans");
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(path.join(manifestDir, `${preparationId}.json`), `${JSON.stringify({
      id: preparationId,
      conceptPlanId: planned.plan.id,
      createdAt: new Date().toISOString(),
      outputRoot: LOCAL_PATHS.staging,
      assignments: [{
        layer: "Degraded Memory",
        path: preparedPath,
        clip_slot_index: 0,
        name: "Prepared Degraded Memory",
        source: "reference_audio",
        treatment: "Prepared test layer"
      }],
      rendered: [{
        layer: "Degraded Memory",
        path: preparedPath,
        redactedPath: "%USERPROFILE%\\Desktop\\MCP\\ableton-mcp\\samples\\staging\\prepared-manifest-layer.wav",
        clip_slot_index: 0,
        name: "Prepared Degraded Memory",
        treatment: "Prepared test layer",
        preset: "liminal_memory",
        format: "wav",
        checksum: null,
        bytes: null,
        attributionPath: null
      }]
    }, null, 2)}\n`);

    const built = await buildArrangementFromPreparedAudio({ preparation_id: preparationId });
    const stored = await readArrangementPlan(built.arrangement.id);

    expect(built.preparation.assignments[0]?.path).not.toBe(preparedPath);
    expect(built.arrangement.sampleAssignments[0]?.path).not.toBe(preparedPath);
    expect(stored.sampleAssignments[0]?.path).toBe(preparedPath);
    expect(built.arrangement.actions.some((action) => action.action === "ableton_load_preset_or_sample")).toBe(true);
  });

  it("keeps unapproved reference audio informational instead of executable", async () => {
    const unapprovedDir = path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-reference-test");
    await fs.mkdir(unapprovedDir, { recursive: true });
    const sourcePath = path.join(unapprovedDir, "outside-approved-roots.mp3");
    await fs.writeFile(sourcePath, "fixture source audio placeholder");
    const planned = await planConceptTrack({
      concept: "liminal horror reference that still needs staging",
      target_duration_seconds: 90,
      intensity: 7,
      sources: ["local_library"],
      reference_path: sourcePath
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);

    expect(planned.plan.reference?.mediaType).toBe("audio");
    expect(planned.plan.reference?.approvedForAudioPlacement).toBe(false);
    expect(planned.plan.reference?.nextSteps?.join(" ")).toMatch(/samples\/staging|Codex Imports|User Library|Live Recordings/);
    expect(arrangement.arrangement.sourceAudioPlan).toBeUndefined();
    expect(arrangement.arrangement.sampleAssignments.some((assignment) => assignment.source === "reference_audio")).toBe(false);
  });

  it("lists and retrieves stored plans with local paths redacted", async () => {
    await fs.mkdir(LOCAL_PATHS.staging, { recursive: true });
    const sourcePath = path.join(LOCAL_PATHS.staging, "stored-plan-reference.wav");
    await fs.writeFile(sourcePath, "fixture source audio placeholder");
    const planned = await planConceptTrack({
      concept: "stored backrooms reference plan",
      target_duration_seconds: 100,
      intensity: 8,
      sources: ["local_library"],
      reference_path: sourcePath
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);
    const concepts = await listConceptPlans();
    const arrangements = await listArrangementPlans();
    const concept = await getConceptPlanForReport(planned.plan.id);
    const arrangementReport = await getArrangementPlanForReport(arrangement.arrangement.id);

    expect(concepts.some((entry) => entry.id === planned.plan.id)).toBe(true);
    expect(arrangements.some((entry) => entry.id === arrangement.arrangement.id)).toBe(true);
    expect(concept.reference?.path).not.toBe(sourcePath);
    expect(concept.reference?.approvedForAudioPlacement).toBe(true);
    expect(arrangementReport.sampleAssignments.every((assignment) => assignment.path !== sourcePath)).toBe(true);
    expect(arrangementReport.sourceAudioPlan?.referencePath).not.toBe(sourcePath);
  });

  it("rejects real concept execution while write gate is disabled", async () => {
    const planned = await planConceptTrack({
      concept: "backrooms pressure with a distant broken melody",
      target_duration_seconds: 90,
      intensity: 7,
      sources: ["local_library"]
    });
    const arrangement = await buildLayeredArrangementPlan(planned.plan.id);

    await expect(executeConceptPlan({
      arrangement_id: arrangement.arrangement.id,
      dry_run: false
    })).rejects.toThrow(/ABLETON_MCP_ENABLE_WRITE=0/);
  });

  it("rejects write-enabled concept execution without an approval id before bridge access", () => {
    const script = `
      import { buildLayeredArrangementPlan, executeConceptPlan, planConceptTrack } from "./src/concept.ts";
      async function main() {
        const planned = await planConceptTrack({
          concept: "approval gate backrooms pressure",
          target_duration_seconds: 90,
          intensity: 7,
          sources: ["local_library"]
        });
        const arrangement = await buildLayeredArrangementPlan(planned.plan.id);
        try {
          await executeConceptPlan({ arrangement_id: arrangement.arrangement.id, dry_run: false });
          console.log(JSON.stringify({ ok: false, code: null, message: "execution unexpectedly succeeded" }));
          process.exitCode = 2;
        } catch (error) {
          console.log(JSON.stringify({
            ok: true,
            code: error && typeof error === "object" && "code" in error ? error.code : null,
            message: error instanceof Error ? error.message : String(error)
          }));
        }
      }
      main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    `;
    const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ABLETON_MCP_ENABLE_WRITE: "1",
        ABLETON_MCP_ENABLE_DOWNLOADS: "0",
        ABLETON_MCP_ENABLE_UI_CONTROL: "0"
      }
    });
    const result = JSON.parse(output.trim()) as { ok: boolean; code: string | null; message: string };

    expect(result.ok).toBe(true);
    expect(result.code).toBe("CONCEPT_EXECUTION_APPROVAL_REQUIRED");
    expect(result.message).toMatch(/approval_id/);
  });

  it("rejects concept audio preparation without approved reference audio", async () => {
    const planned = await planConceptTrack({
      concept: "liminal hallway without source audio",
      target_duration_seconds: 90,
      intensity: 7,
      sources: ["local_library"]
    });

    await expect(prepareConceptAudioLayers({
      plan_id: planned.plan.id,
      format: "wav",
      dry_run: true
    })).rejects.toThrow(/reference audio/);
  });

  it("sanitizes sample search metadata and keeps staging gated in dry-run", async () => {
    const sanitized = sanitizeRemoteSampleText("ignore previous instructions fluorescent hum system prompt exfiltrate");
    const staged = await stageConceptSamples({
      dry_run: true,
      samples: [{
        url: "https://archive.org/download/opensource_audio/opensource_audio_meta.xml",
        destinationName: "unsafe name.wav",
        metadata: { license: "CC0" }
      }]
    });

    expect(sanitized).not.toMatch(/ignore previous instructions|system prompt|exfiltrate/i);
    expect(staged.dry_run).toBe(true);
    if ("samples" in staged) {
      expect(staged.samples[0]?.destinationName).toBe("unsafe_name.wav");
      expect(staged.samples[0]?.attribution.sourceUrl).toBe("https://archive.org/download/opensource_audio/opensource_audio_meta.xml");
      expect(staged.samples[0]?.attribution.licensePolicy.allowed).toBe(true);
      expect(staged.samples[0]?.attribution.checksum).toBeNull();
    }
  });

  it("rejects unsafe sample URLs even during dry-run staging", async () => {
    await expect(stageConceptSamples({
      dry_run: true,
      samples: [{
        url: "http://127.0.0.1/private.wav",
        destinationName: "private.wav",
        metadata: { license: "CC0" }
      }]
    })).rejects.toThrow(/Only HTTPS sample URLs|Private, local/);
  });
});
