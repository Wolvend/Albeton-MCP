import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getBridgeCapabilityMatrix } from "./bridge.js";
import { LOCAL_PATHS, FLAGS } from "./config.js";
import {
  buildLayeredArrangementPlan,
  type ConceptSource,
  planConceptTrack,
  renderConceptAutomationMap,
  renderConceptExecutionActionMatrix,
  renderConceptExecutionRunbook,
  renderConceptMixPlan,
  renderConceptProductionScorecard,
  renderConceptTimeline,
  renderDeliveryPlan
} from "./concept.js";
import { AbletonMcpError } from "./errors.js";
import {
  analyzeRenderQuality,
  classifyRenderFailure,
  compileMoodPalette,
  detectFrequencyMasking,
  detectMudHarshnessSibilance,
  detectPhaseMonoIssues,
  generateHarmonicPalette,
  generateMotifSystem,
  generateNextRevisionPass,
  generateRevisionPass,
  parseMusicBrief,
  planLayerStack,
  planNegativeSpace,
  planStereoDepthStage,
  planTempoGrid,
  scoreDepthImage,
  scoreHookMemorability,
  scoreLowEndControl,
  scoreMixBalance,
  scoreMixTranslation,
  scoreSoundDesignMaturity
} from "./producer-brain.js";
import { paginate } from "./response.js";
import { getProjectUsageMode, type SourceUsageMode, usageModePolicy } from "./source-usage.js";
import { redactPath, resolveSafePath, rootsForReport } from "./security.js";

export type ProductionSourcePolicy = "procedural_only" | "local_only" | "metadata_search" | "download_gated";
export type ProductionPhase = "readiness" | "blueprint" | "sound_palette" | "assets" | "execution_plan" | "render_review" | "revision" | "delivery";

export type ProductionSessionInput = {
  brief: string;
  title?: string;
  style?: string;
  target_duration_seconds?: number;
  intensity?: number;
  usage_mode?: SourceUsageMode;
  source_policy?: ProductionSourcePolicy;
  check_bridge?: boolean;
};

export type ProductionSession = {
  schema: "ableton-mcp-production-session-v1";
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  brief: string;
  style: string | null;
  targetDurationSeconds: number;
  intensity: number;
  usageMode: SourceUsageMode;
  sourcePolicy: ProductionSourcePolicy;
  safety: ReturnType<typeof safetyProfile>;
  capabilitySnapshot: Record<string, unknown>;
  conceptPlanId: string | null;
  arrangementId: string | null;
  blueprint: Record<string, unknown> | null;
  soundPalette: Record<string, unknown> | null;
  assetPlan: Record<string, unknown> | null;
  executionPlan: Record<string, unknown> | null;
  renderReviews: Record<string, unknown>[];
  revisionHistory: Record<string, unknown>[];
  professionalismScore: Record<string, unknown> | null;
  nextRecommendedCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
};

const SessionIdPattern = /^prod-[a-f0-9]{16}$/;
const MaxStoredArray = 12;

function sessionDir() {
  return path.join(LOCAL_PATHS.diagnostics, "runtime", "production-sessions");
}

function sessionPath(sessionId: string) {
  assertSessionId(sessionId);
  return path.join(sessionDir(), `${sessionId}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function trimText(value: string, max = 2000) {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function titleFromBrief(brief: string) {
  const first = trimText(brief, 80);
  return first || "Ableton MCP production";
}

function assertSessionId(sessionId: string) {
  if (!SessionIdPattern.test(sessionId)) {
    throw new AbletonMcpError("Invalid production session id.", "PRODUCTION_SESSION_ID_INVALID", ["Use an id returned by ableton_create_production_session."]);
  }
}

function safetyProfile() {
  return {
    writesEnabled: FLAGS.write,
    downloadsEnabled: FLAGS.downloads,
    uiControlEnabled: FLAGS.uiControl,
    defaultDryRun: true,
    unchangedGates: {
      liveWrites: "ABLETON_MCP_ENABLE_WRITE=1 plus dry_run=false and approval paths where required.",
      downloads: "ABLETON_MCP_ENABLE_DOWNLOADS=1.",
      uiMouse: "ABLETON_MCP_ENABLE_UI_CONTROL=1."
    }
  };
}

function capabilitySnapshot(checkBridge: boolean) {
  return {
    checkedAt: nowIso(),
    checkBridge,
    allowedRoots: rootsForReport(),
    bridgeCapabilities: getBridgeCapabilityMatrix(),
    gates: safetyProfile()
  };
}

function sanitizeForStore(value: unknown): unknown {
  if (typeof value === "string") {
    const redacted = redactPath(value);
    return redacted.length > 4000 ? `${redacted.slice(0, 4000)}...` : redacted;
  }
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeForStore(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 120);
    return Object.fromEntries(entries.map(([key, entry]) => [key, sanitizeForStore(entry)]));
  }
  return value;
}

function reportSession(session: ProductionSession) {
  const compact: ProductionSession = {
    ...session,
    executionPlan: session.executionPlan
      ? {
        summary: session.executionPlan.summary,
        arrangement: session.executionPlan.arrangement
          ? {
            id: (session.executionPlan.arrangement as any).id,
            actionCount: Array.isArray((session.executionPlan.arrangement as any).actions) ? (session.executionPlan.arrangement as any).actions.length : null
          }
          : null,
        dryRunOnly: session.executionPlan.dryRunOnly,
        nextToolCalls: session.executionPlan.nextToolCalls
      }
      : null,
    renderReviews: session.renderReviews.slice(0, 4),
    revisionHistory: session.revisionHistory.slice(0, 4)
  };
  return sanitizeForStore(compact) as ProductionSession;
}

async function writeSession(session: ProductionSession) {
  await fs.mkdir(sessionDir(), { recursive: true });
  session.updatedAt = nowIso();
  await fs.writeFile(sessionPath(session.id), `${JSON.stringify(reportSession(session), null, 2)}\n`);
}

async function readStoredSession(sessionId: string): Promise<ProductionSession> {
  try {
    const parsed = JSON.parse(await fs.readFile(sessionPath(sessionId), "utf8")) as ProductionSession;
    if (parsed.schema !== "ableton-mcp-production-session-v1") {
      throw new AbletonMcpError("File is not an Ableton MCP production session.", "PRODUCTION_SESSION_SCHEMA_MISMATCH");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AbletonMcpError) throw error;
    throw new AbletonMcpError("Production session was not found.", "PRODUCTION_SESSION_NOT_FOUND", ["Create a session with ableton_create_production_session or list sessions with ableton_list_production_sessions."]);
  }
}

async function allocateSessionId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = `prod-${crypto.randomBytes(8).toString("hex")}`;
    try {
      await fs.access(sessionPath(id));
    } catch {
      return id;
    }
  }
  throw new AbletonMcpError("Could not allocate a production session id.", "PRODUCTION_SESSION_ID_COLLISION");
}

function addNext(session: ProductionSession, calls: Array<{ name: string; arguments: Record<string, unknown> }>) {
  const deduped = new Map<string, { name: string; arguments: Record<string, unknown> }>();
  for (const call of [...calls, ...session.nextRecommendedCalls]) {
    deduped.set(`${call.name}:${JSON.stringify(call.arguments)}`, call);
  }
  session.nextRecommendedCalls = [...deduped.values()].slice(0, 12);
}

function sessionBaseArgs(session: ProductionSession) {
  return {
    concept: session.brief,
    target_duration_seconds: session.targetDurationSeconds,
    intensity: session.intensity,
    ...(session.style ? { style: session.style } : {})
  };
}

function soundPatchPlanForRole(role: string, sourcePolicy: ProductionSourcePolicy, _brief: string) {
  const lower = role.toLowerCase();
  const sampleStrategy = sourcePolicy === "procedural_only"
    ? "procedural synthesis, generated noise, or resynthesized material only"
    : sourcePolicy === "local_only"
      ? "approved local samples, user-provided files, or staged imports"
      : sourcePolicy === "metadata_search"
        ? "metadata-reviewed samples with manual proof"
        : "dry-run download plans with approved staging only";

  if (/(sub|bass|low)/.test(lower)) {
    return { family: "foundation", plan: { device: "Operator or Sampler", purpose: "mono-safe sub pressure with a human attack shape", macro: "pressure", sampleStrategy }, notes: ["keep the core centered", "avoid square-wave-only low end"] };
  }
  if (/(hook|lead|melody|motif|theme)/.test(lower)) {
    return { family: "identity", plan: { device: "Wavetable or Operator", purpose: "clear musical identity with overtone motion", macro: "identity", sampleStrategy }, notes: ["make the line singable", "reserve one recognisable contour"] };
  }
  if (/(pad|chord|harmony|body|bed)/.test(lower)) {
    return { family: "harmony", plan: { device: "Drift or Wavetable", purpose: "warm harmonic body with slow detune and width", macro: "warmth", sampleStrategy }, notes: ["keep the harmony supportive", "use borrowed tones only where they matter"] };
  }
  if (/(vocal|choir|voice|breath|human)/.test(lower)) {
    return { family: "human", plan: { device: "Sampler or Granular", purpose: "human presence, vowel ghosts, and breath texture", macro: "presence", sampleStrategy }, notes: ["avoid intelligible hidden commands", "treat voice as arrangement material"] };
  }
  if (/(texture|air|room|noise|smear|atmos|ambient)/.test(lower)) {
    return { family: "texture", plan: { device: "Granular or Drift", purpose: "room-scale atmosphere, smear, and distance", macro: "distance", sampleStrategy }, notes: ["let the room move", "use width for reflections, not the whole core"] };
  }
  if (/(impact|hit|drum|percussion|pulse|thump|transient)/.test(lower)) {
    return { family: "impact", plan: { device: "Sampler or Drum Rack", purpose: "transient punctuation and rhythmic motion", macro: "strike", sampleStrategy }, notes: ["give every hit a job", "prefer a few strong impacts over constant fill"] };
  }
  if (/(transition|fx|moment|ear candy|lift|rise|fall)/.test(lower)) {
    return { family: "motion", plan: { device: "Wavetable or Effect Rack", purpose: "filter motion, reverse tails, and scene changes", macro: "motion", sampleStrategy }, notes: ["save transitions for section changes", "avoid novelty without structure"] };
  }
  return { family: "support", plan: { device: "Drift, Operator, or Sampler", purpose: "supporting layer with a clear role and motion", macro: "age", sampleStrategy }, notes: ["assign a role before stacking more sounds"] };
}

function summarizeExecutionPlan(executionPlan: Record<string, unknown>) {
  const actionMatrix = executionPlan.actionMatrix as any;
  const runbook = executionPlan.runbook as any;
  const arrangement = executionPlan.arrangement as any;
  return {
    arrangementId: arrangement?.id ?? null,
    actionCount: Array.isArray(arrangement?.actions) ? arrangement.actions.length : null,
    runbookPhaseCount: Array.isArray(runbook?.phases) ? runbook.phases.length : null,
    readyForRealWrite: Boolean(actionMatrix?.readyForRealWrite),
    requiresUserApproval: true
  };
}

export async function createProductionSession(input: ProductionSessionInput) {
  const brief = trimText(input.brief);
  if (!brief) {
    throw new AbletonMcpError("Production brief cannot be empty.", "PRODUCTION_BRIEF_EMPTY");
  }
  const id = await allocateSessionId();
  const mode = input.usage_mode ?? (await getProjectUsageMode()).mode as SourceUsageMode;
  const sourcePolicy = input.source_policy ?? "local_only";
  const session: ProductionSession = {
    schema: "ableton-mcp-production-session-v1",
    id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    title: trimText(input.title ?? titleFromBrief(brief), 160),
    brief,
    style: input.style ? trimText(input.style, 160) : null,
    targetDurationSeconds: clamp(input.target_duration_seconds ?? 180, 30, 900),
    intensity: clamp(input.intensity ?? 6, 1, 10),
    usageMode: mode,
    sourcePolicy,
    safety: safetyProfile(),
    capabilitySnapshot: capabilitySnapshot(Boolean(input.check_bridge)),
    conceptPlanId: null,
    arrangementId: null,
    blueprint: null,
    soundPalette: null,
    assetPlan: null,
    executionPlan: null,
    renderReviews: [],
    revisionHistory: [],
    professionalismScore: null,
    nextRecommendedCalls: [
      { name: "ableton_generate_song_blueprint", arguments: { session_id: id } },
      { name: "ableton_design_signature_sound_palette", arguments: { session_id: id } },
      { name: "ableton_create_execution_plan", arguments: { session_id: id } }
    ]
  };
  await writeSession(session);
  return {
    session: reportSession(session),
    output: redactPath(sessionPath(id)),
    nextRecommendedCalls: session.nextRecommendedCalls
  };
}

export async function getProductionSession(sessionId: string) {
  return {
    session: reportSession(await readStoredSession(sessionId))
  };
}

export async function listProductionSessions(options: { page: number; pageSize: number }) {
  await fs.mkdir(sessionDir(), { recursive: true });
  const entries = await fs.readdir(sessionDir(), { withFileTypes: true });
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^prod-[a-f0-9]{16}\.json$/.test(entry.name)) continue;
    const session = await readStoredSession(entry.name.replace(/\.json$/, ""));
    sessions.push({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      usageMode: session.usageMode,
      sourcePolicy: session.sourcePolicy,
      hasBlueprint: Boolean(session.blueprint),
      hasExecutionPlan: Boolean(session.executionPlan),
      renderReviewCount: session.renderReviews.length,
      nextRecommendedCalls: session.nextRecommendedCalls.slice(0, 4)
    });
  }
  sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return paginate(sessions, options.page, options.pageSize);
}

export async function generateSongBlueprint(options: { session_id: string }) {
  const session = await readStoredSession(options.session_id);
  const args = sessionBaseArgs(session);
  const parsed = parseMusicBrief(args);
  const mood = compileMoodPalette(args);
  const tempo = planTempoGrid(args);
  const harmony = generateHarmonicPalette({ concept: session.brief, mood: (parsed.moodTags as string[]).join(", "), complexity: "medium" });
  const motif = generateMotifSystem({ concept: session.brief, key: harmony.key as string, bpm: tempo.bpm as number, length_beats: 8 });
  const hookScore = scoreHookMemorability({ motif: (motif.motif as Array<{ pitch: number }>).map((note) => note.pitch), concept: session.brief });
  const layers = planLayerStack({ concept: session.brief, intensity: session.intensity });
  const moments = {
    timeline: planNegativeSpace({ concept: session.brief, intensity: session.intensity }),
    depth: planStereoDepthStage({ concept: session.brief, tracks: (layers.layers as Array<{ role: string }>).map((layer) => layer.role) })
  };
  const sources: ConceptSource[] = session.sourcePolicy === "procedural_only" ? ["local_library"] : ["local_library", "internet_archive"];
  const conceptArgs = {
    concept: session.brief,
    target_duration_seconds: session.targetDurationSeconds,
    intensity: session.intensity,
    sources,
    ...(session.style ? { style: session.style } : {})
  };
  const conceptPlan = await planConceptTrack(conceptArgs);
  session.conceptPlanId = conceptPlan.plan.id;
  session.blueprint = {
    parsed,
    mood,
    tempo,
    harmony,
    motif,
    hookScore,
    layers,
    moments,
    conceptPlan: conceptPlan.plan
  };
  addNext(session, [
    { name: "ableton_design_signature_sound_palette", arguments: { session_id: session.id } },
    { name: "ableton_prepare_production_assets", arguments: { session_id: session.id } },
    { name: "ableton_create_execution_plan", arguments: { session_id: session.id } }
  ]);
  await writeSession(session);
  return {
    session_id: session.id,
    blueprint: session.blueprint,
    nextRecommendedCalls: session.nextRecommendedCalls
  };
}

export async function designSignatureSoundPalette(options: { session_id: string }) {
  const session = await readStoredSession(options.session_id);
  if (!session.blueprint) await generateSongBlueprint({ session_id: session.id });
  const refreshed = await readStoredSession(session.id);
  const layers = ((refreshed.blueprint?.layers as any)?.layers ?? [
    { role: "hook_memory" },
    { role: "harmonic_body" },
    { role: "sub_foundation" },
    { role: "texture_air" },
    { role: "transition_moments" }
  ]) as Array<{ role: string }>;
  const patches = layers.slice(0, 8).map((layer) => {
    const role = layer.role;
    const patchInfo = soundPatchPlanForRole(role, refreshed.sourcePolicy, refreshed.brief);
    const patch = { role, family: patchInfo.family, plan: patchInfo.plan, notes: patchInfo.notes };
    return {
      ...patch,
      maturity: scoreSoundDesignMaturity({ concept: refreshed.brief, role, patch_plan: patch.plan })
    };
  });
  const deviceFamilies = [...new Set(patches.map((patch) => patch.plan.device))];
  const roleFamilies = [...new Set(patches.map((patch) => patch.family))];
  refreshed.soundPalette = {
    concept: refreshed.brief,
    sourcePolicy: refreshed.sourcePolicy,
    layerPatches: patches,
    varietyPlan: {
      deviceFamilies,
      roleFamilies,
      sampleStrategy: refreshed.sourcePolicy === "procedural_only"
        ? "procedural synthesis and generated textures only"
        : "approved sources plus staged imports, with at least one sample role for human or mechanical detail",
      antiSamenessRules: [
        "Reserve one foundation layer, one identity layer, one human layer, one texture layer, and one motion layer.",
        "Use at least one sample-derived or mechanically sourced layer when the source policy permits it.",
        "Avoid square-wave-only leads and blanket reverb on every layer.",
        "Change register, device family, or rhythmic role between sections."
      ]
    },
    sampler: {
      policy: refreshed.sourcePolicy,
      rule: "Only use approved local, generated, or manifest-tracked experiment sources."
    },
    spaceNetwork: planStereoDepthStage({ concept: refreshed.brief, tracks: layers.map((layer) => layer.role) }),
    nextToolCalls: [
      { name: "ableton_create_execution_plan", arguments: { session_id: refreshed.id } },
      { name: "ableton_score_track_professionalism", arguments: { session_id: refreshed.id } }
    ]
  };
  addNext(refreshed, refreshed.soundPalette.nextToolCalls as Array<{ name: string; arguments: Record<string, unknown> }>);
  await writeSession(refreshed);
  return {
    session_id: refreshed.id,
    soundPalette: refreshed.soundPalette,
    nextRecommendedCalls: refreshed.nextRecommendedCalls
  };
}

export async function prepareProductionAssets(options: { session_id: string }) {
  const session = await readStoredSession(options.session_id);
  if (!session.blueprint) await generateSongBlueprint({ session_id: session.id });
  const refreshed = await readStoredSession(session.id);
  const assetPlan = {
    sourcePolicy: refreshed.sourcePolicy,
    usageMode: refreshed.usageMode,
    policy: usageModePolicy(refreshed.usageMode),
    downloadGate: "ABLETON_MCP_ENABLE_DOWNLOADS=1 required for real staging or downloads.",
    recommendedStrategy: refreshed.sourcePolicy === "procedural_only"
      ? "Use generated MIDI, synthesized patches, and generated one-shots; do not search or download samples."
      : refreshed.sourcePolicy === "metadata_search"
        ? "Search metadata-only sources first, then stage only approved candidates."
        : refreshed.sourcePolicy === "download_gated"
          ? "Search and plan downloads, but keep real downloads gated and dry-run first."
          : "Prefer approved local library, User Library, staging, or user-provided files.",
    nextToolCalls: refreshed.sourcePolicy === "procedural_only"
      ? [
        { name: "ableton_generate_midi_clip_plan", arguments: { concept: refreshed.brief, key: "C minor", bars: 8, intensity: refreshed.intensity } },
        { name: "ableton_design_signature_sound_palette", arguments: { session_id: refreshed.id } }
      ]
      : [
        { name: "ableton_curate_concept_samples", arguments: { plan_id: refreshed.conceptPlanId, search: refreshed.sourcePolicy !== "local_only", allowed_only: true } },
        { name: "ableton_render_concept_attribution_bundle", arguments: { arrangement_id: refreshed.arrangementId ?? "arrangement-<after execution plan>" } }
      ],
    releaseNotes: refreshed.usageMode === "release_candidate"
      ? ["Unverified or experiment-only sources should block delivery readiness."]
      : ["Unverified sources are allowed for private experiment but must be tracked before release."]
  };
  refreshed.assetPlan = assetPlan;
  addNext(refreshed, assetPlan.nextToolCalls.filter((call) => !JSON.stringify(call).includes("<after execution plan>")) as Array<{ name: string; arguments: Record<string, unknown> }>);
  await writeSession(refreshed);
  return {
    session_id: refreshed.id,
    assetPlan,
    nextRecommendedCalls: refreshed.nextRecommendedCalls
  };
}

export async function createExecutionPlan(options: { session_id: string; check_bridge?: boolean }) {
  const session = await readStoredSession(options.session_id);
  if (!session.blueprint) await generateSongBlueprint({ session_id: session.id });
  if (!session.soundPalette) await designSignatureSoundPalette({ session_id: session.id });
  const refreshed = await readStoredSession(session.id);
  if (!refreshed.conceptPlanId) throw new AbletonMcpError("Production session has no concept plan id.", "PRODUCTION_CONCEPT_MISSING");
  const arrangementResult = await buildLayeredArrangementPlan(refreshed.conceptPlanId);
  const arrangement = arrangementResult.arrangement;
  refreshed.arrangementId = arrangement.id;
  const [timeline, mixPlan, automationMap, actionMatrix, runbook, scorecard, delivery] = await Promise.all([
    renderConceptTimeline(refreshed.conceptPlanId),
    renderConceptMixPlan(refreshed.conceptPlanId),
    renderConceptAutomationMap(refreshed.conceptPlanId),
    renderConceptExecutionActionMatrix({ arrangement_id: arrangement.id, check_bridge: Boolean(options.check_bridge) }),
    renderConceptExecutionRunbook({ arrangement_id: arrangement.id, check_bridge: Boolean(options.check_bridge) }),
    renderConceptProductionScorecard({ arrangement_id: arrangement.id, check_bridge: Boolean(options.check_bridge) }),
    renderDeliveryPlan(refreshed.conceptPlanId)
  ]);
  const nextToolCalls = [
    { name: "ableton_render_concept_execution_action_matrix", arguments: { arrangement_id: arrangement.id, check_bridge: false } },
    { name: "ableton_create_concept_execution_approval_bundle", arguments: { arrangement_id: arrangement.id, check_bridge: false } },
    { name: "ableton_execute_concept_plan", arguments: { arrangement_id: arrangement.id, dry_run: true } }
  ];
  refreshed.executionPlan = {
    arrangement: {
      id: arrangement.id,
      actionCount: arrangement.actions.length,
      sampleAssignmentCount: arrangement.sampleAssignments.length,
      stagedDeviceChains: arrangement.devicePlan.length,
      stagedAutomationTargets: arrangement.automationPlan.length
    },
    summary: summarizeExecutionPlan({ arrangement, actionMatrix, runbook }),
    timelineSummary: {
      sections: Array.isArray((timeline as any).timeline?.sections) ? (timeline as any).timeline.sections.length : null
    },
    mixPlanSummary: (mixPlan as any).summary ?? null,
    automationMapSummary: (automationMap as any).summary ?? null,
    actionMatrixSummary: (actionMatrix as any).summary ?? null,
    runbookSummary: (runbook as any).summary ?? null,
    scorecardSummary: (scorecard as any).summary ?? null,
    deliverySummary: (delivery as any).summary ?? null,
    dryRunOnly: true,
    nextToolCalls
  };
  addNext(refreshed, nextToolCalls);
  await writeSession(refreshed);
  return {
    session_id: refreshed.id,
    executionPlan: refreshed.executionPlan,
    nextRecommendedCalls: refreshed.nextRecommendedCalls
  };
}

async function resolveAudioPaths(paths: string[] | undefined) {
  const resolved = [];
  for (const item of (paths ?? []).slice(0, 12)) {
    const safe = await resolveSafePath(item, { mustExist: true });
    resolved.push(safe.real);
  }
  return resolved;
}

export async function reviewRenderAndRevise(options: { session_id: string; render_path: string; stem_paths?: string[]; duration_seconds?: number }) {
  const session = await readStoredSession(options.session_id);
  const renderSafe = await resolveSafePath(options.render_path, { mustExist: true });
  const stems = await resolveAudioPaths(options.stem_paths);
  const [quality, mudHarsh, phase, lowEnd, mixBalance, translation, depth] = await Promise.all([
    analyzeRenderQuality({ path: renderSafe.real, concept: session.brief, duration_seconds: options.duration_seconds ?? 30 }),
    detectMudHarshnessSibilance({ path: renderSafe.real, duration_seconds: options.duration_seconds ?? 30 }),
    detectPhaseMonoIssues({ path: renderSafe.real }),
    scoreLowEndControl({ path: renderSafe.real, duration_seconds: options.duration_seconds ?? 30 }),
    scoreMixBalance({ path: renderSafe.real, concept: session.brief, duration_seconds: options.duration_seconds ?? 30 }),
    scoreMixTranslation({ path: renderSafe.real, duration_seconds: options.duration_seconds ?? 30 }),
    scoreDepthImage({ path: renderSafe.real, stems })
  ]);
  const masking = stems.length >= 2 ? await detectFrequencyMasking({ stems, duration_seconds: options.duration_seconds ?? 30 }) : null;
  const findings = [
    ...((quality as any).findings ?? []),
    ...((mudHarsh as any).findings ?? []).map((finding: any) => String(finding.issue ?? finding)),
    ...((lowEnd as any).findings ?? [])
  ];
  const failure = classifyRenderFailure({ findings, scores: (quality as any).scores });
  const revision = await generateRevisionPass({ concept: session.brief, render_path: renderSafe.real, findings });
  const review = sanitizeForStore({
    createdAt: nowIso(),
    renderPath: redactPath(renderSafe.real),
    stemCount: stems.length,
    quality,
    mudHarsh,
    phase,
    lowEnd,
    mixBalance,
    translation,
    depth,
    masking,
    failure,
    revision
  }) as Record<string, unknown>;
  session.renderReviews = [review, ...session.renderReviews].slice(0, MaxStoredArray);
  session.revisionHistory = [revision as Record<string, unknown>, ...session.revisionHistory].slice(0, MaxStoredArray);
  addNext(session, [
    { name: "ableton_generate_next_revision_pass", arguments: { project_state: { session_id: session.id }, previous_findings: findings, concept: session.brief } },
    { name: "ableton_score_track_professionalism", arguments: { session_id: session.id, render_path: renderSafe.real } }
  ]);
  await writeSession(session);
  return {
    session_id: session.id,
    review,
    nextRecommendedCalls: session.nextRecommendedCalls
  };
}

export async function scoreTrackProfessionalism(options: { session_id: string; render_path?: string; stem_paths?: string[]; duration_seconds?: number }) {
  const session = await readStoredSession(options.session_id);
  const planningFindings = [
    !session.blueprint ? "song blueprint missing" : null,
    !session.soundPalette ? "signature sound palette missing" : null,
    !session.executionPlan ? "execution plan missing" : null,
    session.renderReviews.length === 0 ? "no render review yet" : null
  ].filter((finding): finding is string => Boolean(finding));
  let audioScores: Record<string, unknown> | null = null;
  if (options.render_path) {
    const safe = await resolveSafePath(options.render_path, { mustExist: true });
    const [quality, balance, translation, depth] = await Promise.all([
      analyzeRenderQuality({ path: safe.real, concept: session.brief, duration_seconds: options.duration_seconds ?? 30 }),
      scoreMixBalance({ path: safe.real, concept: session.brief, duration_seconds: options.duration_seconds ?? 30 }),
      scoreMixTranslation({ path: safe.real, duration_seconds: options.duration_seconds ?? 30 }),
      scoreDepthImage({ path: safe.real, stems: await resolveAudioPaths(options.stem_paths) })
    ]);
    audioScores = { quality, balance, translation, depth };
  }
  const planningScore = clamp(100 - planningFindings.length * 14, 0, 100);
  const latestQuality = audioScores ? ((audioScores.quality as any).scores?.releaseReadiness ?? 70) as number : null;
  const score = {
    sessionId: session.id,
    planningScore,
    audioScore: latestQuality,
    overall: latestQuality === null ? planningScore : Math.round((planningScore * 0.45) + (latestQuality * 0.55)),
    findings: planningFindings,
    sourceReadiness: {
      usageMode: session.usageMode,
      sourcePolicy: session.sourcePolicy,
      releaseCandidateRequiresReview: session.usageMode === "release_candidate"
    },
    nextToolCalls: planningFindings.length
      ? session.nextRecommendedCalls
      : [{ name: "ableton_create_delivery_package", arguments: { project_name: session.title, manifest_path: "<source manifest path>", dry_run: true } }],
    audioScores
  };
  session.professionalismScore = sanitizeForStore(score) as Record<string, unknown>;
  await writeSession(session);
  return {
    session_id: session.id,
    professionalism: session.professionalismScore,
    nextRecommendedCalls: session.nextRecommendedCalls
  };
}

export async function advanceProductionSession(options: {
  session_id: string;
  phase: ProductionPhase;
  render_path?: string;
  stem_paths?: string[];
  max_internal_steps?: number;
  dry_run?: boolean;
}) {
  const maxSteps = clamp(options.max_internal_steps ?? 4, 1, 8);
  const artifacts: Array<{ label: string; result: unknown }> = [];
  let steps = 0;
  const run = async <T>(label: string, action: () => Promise<T>) => {
    if (steps >= maxSteps) {
      throw new AbletonMcpError("Production facade internal step cap reached.", "PRODUCTION_STEP_CAP_REACHED", ["Call the next recommended tool to continue."]);
    }
    steps += 1;
    const result = await action();
    artifacts.push({ label, result: sanitizeForStore(result) });
    return result;
  };
  if (options.phase === "readiness") {
    const session = await readStoredSession(options.session_id);
    session.capabilitySnapshot = capabilitySnapshot(false);
    addNext(session, [{ name: "ableton_generate_song_blueprint", arguments: { session_id: session.id } }]);
    await writeSession(session);
    return { session_id: session.id, phase: options.phase, artifacts, nextRecommendedCalls: session.nextRecommendedCalls, safe_to_execute: true, requires_user_approval: false };
  }
  if (options.phase === "blueprint") await run("blueprint", () => generateSongBlueprint({ session_id: options.session_id }));
  if (options.phase === "sound_palette") {
    await run("blueprint", () => generateSongBlueprint({ session_id: options.session_id }));
    await run("sound_palette", () => designSignatureSoundPalette({ session_id: options.session_id }));
  }
  if (options.phase === "assets") await run("assets", () => prepareProductionAssets({ session_id: options.session_id }));
  if (options.phase === "execution_plan") await run("execution_plan", () => createExecutionPlan({ session_id: options.session_id, check_bridge: false }));
  if (options.phase === "render_review") {
    if (!options.render_path) {
      throw new AbletonMcpError("render_path is required for render_review phase.", "PRODUCTION_RENDER_PATH_REQUIRED");
    }
    await run("render_review", () => reviewRenderAndRevise({
      session_id: options.session_id,
      render_path: options.render_path!,
      ...(options.stem_paths ? { stem_paths: options.stem_paths } : {})
    }));
  }
  if (options.phase === "revision") {
    const session = await readStoredSession(options.session_id);
    const revision = generateNextRevisionPass({ project_state: reportSession(session), previous_findings: session.revisionHistory.flatMap((item) => ((item as any).findings ?? []) as string[]), concept: session.brief });
    session.revisionHistory = [revision as Record<string, unknown>, ...session.revisionHistory].slice(0, MaxStoredArray);
    addNext(session, [{ name: "ableton_review_render_and_revise", arguments: { session_id: session.id, render_path: "<next render path>" } }]);
    await writeSession(session);
    artifacts.push({ label: "revision", result: revision });
  }
  if (options.phase === "delivery") {
    const session = await readStoredSession(options.session_id);
    if (!session.conceptPlanId) await run("blueprint", () => generateSongBlueprint({ session_id: options.session_id }));
    const refreshed = await readStoredSession(options.session_id);
    if (!refreshed.conceptPlanId) throw new AbletonMcpError("Production session has no concept plan id.", "PRODUCTION_CONCEPT_MISSING");
    const delivery = await renderDeliveryPlan(refreshed.conceptPlanId);
    addNext(refreshed, [{ name: "ableton_create_delivery_package", arguments: { project_name: refreshed.title, manifest_path: "<source manifest path>", dry_run: true } }]);
    await writeSession(refreshed);
    artifacts.push({ label: "delivery", result: delivery });
  }
  const session = await readStoredSession(options.session_id);
  return {
    session_id: session.id,
    phase: options.phase,
    dry_run: options.dry_run !== false,
    decisions: {
      title: session.title,
      usageMode: session.usageMode,
      sourcePolicy: session.sourcePolicy
    },
    artifacts,
    scores: {
      professionalism: session.professionalismScore,
      latestRenderReview: session.renderReviews[0] ?? null
    },
    risks: [
      session.usageMode === "private_experiment" ? "Private experiment source status is not release readiness." : null,
      !FLAGS.write ? "Live writes disabled by default." : null,
      !FLAGS.downloads ? "Downloads disabled by default." : null,
      !FLAGS.uiControl ? "UI/mouse control disabled by default." : null
    ].filter(Boolean),
    blocked_by: [],
    next_recommended_calls: session.nextRecommendedCalls,
    requires_user_approval: options.phase === "execution_plan" || options.phase === "delivery",
    safe_to_execute: options.dry_run !== false
  };
}
