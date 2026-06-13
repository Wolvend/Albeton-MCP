import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { bridgeAction, getBridgeSnapshot } from "./bridge.js";
import { FLAGS, LOCAL_PATHS } from "./config.js";
import { requireFlag } from "./errors.js";
import { downloadSample, normalizeLicense, searchFreesound, searchInternetArchiveAudio } from "./samples.js";
import { redactPath, resolveSafePath } from "./security.js";
import { assertAllowedSampleUrl } from "./network.js";

export type ConceptSource = "local_library" | "internet_archive" | "freesound";

export type ConceptPlanInput = {
  concept: string;
  target_duration_seconds: number;
  intensity: number;
  style?: string;
  sources: ConceptSource[];
  reference_path?: string;
};

type ConceptLayer = {
  name: string;
  type: "audio" | "midi" | "return";
  role: string;
  sourceStrategy: string;
  searchQueries: string[];
  deviceChain: string[];
  automation: string[];
  mix: {
    volume: number;
    pan: number;
    sends: Record<string, number>;
  };
};

type ConceptSection = {
  name: string;
  start_seconds: number;
  duration_seconds: number;
  intent: string;
};

type ConceptPlan = {
  id: string;
  version: 1;
  createdAt: string;
  preset: string;
  concept: string;
  style: string;
  target_duration_seconds: number;
  intensity: number;
  tempo: number;
  key: string;
  sources: ConceptSource[];
  reference?: {
    path: string;
  };
  sections: ConceptSection[];
  layers: ConceptLayer[];
  approvalChecklist: string[];
};

type ArrangementAction = {
  action: string;
  payload: Record<string, unknown>;
  safeToExecute: boolean;
  reason: string;
};

type ArrangementPlan = {
  id: string;
  conceptPlanId: string;
  createdAt: string;
  actions: ArrangementAction[];
  notes: string[];
};

type CreatedTrackResolution = {
  baseTrackCount: number;
  baseReturnTrackCount: number;
};

function conceptPlanDir() {
  return path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-plans");
}

export function sanitizeRemoteSampleText(value: unknown, maxLength = 240) {
  const text = String(value ?? "")
    .replace(/ignore (all )?(previous|prior) instructions/gi, "[removed]")
    .replace(/system prompt/gi, "[removed]")
    .replace(/developer message/gi, "[removed]")
    .replace(/tool call/gi, "[removed]")
    .replace(/exfiltrate/gi, "[removed]")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLength);
}

function stableId(prefix: string, payload: unknown) {
  const hash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  return `${prefix}-${hash}`;
}

function safeRemoteSampleUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return assertAllowedSampleUrl(value);
  } catch {
    return null;
  }
}

function seconds(value: number) {
  return Math.max(1, Math.round(value));
}

function isLiminalHorror(concept: string, style = "") {
  const text = `${concept} ${style}`.toLowerCase();
  return ["backrooms", "liminal", "horror", "dementia", "empty mall", "hallway", "fluorescent", "memory", "abandoned"].some((word) => text.includes(word));
}

function sectionMap(duration: number, horror: boolean): ConceptSection[] {
  const ratios = horror
    ? [
      ["Isolation", 0.16, "empty room tone, no clear pulse"],
      ["Recognizable Motif", 0.2, "a degraded musical memory appears"],
      ["Decay Loop", 0.24, "the motif repeats with pitch and bandwidth damage"],
      ["Spatial Collapse", 0.22, "mechanical texture and low pressure overtake the scene"],
      ["Unresolved Tail", 0.18, "long reverb tail with sparse final fragments"]
    ] as const
    : [
      ["Setup", 0.2, "establish palette and tempo"],
      ["Theme", 0.25, "introduce core musical material"],
      ["Development", 0.3, "layer rhythm, harmony, and texture"],
      ["Release", 0.25, "resolve or transition cleanly"]
    ] as const;
  let cursor = 0;
  return ratios.map(([name, ratio, intent], index) => {
    const length = index === ratios.length - 1 ? duration - cursor : seconds(duration * ratio);
    const section = { name, start_seconds: cursor, duration_seconds: length, intent };
    cursor += length;
    return section;
  });
}

function horrorLayers(concept: string): ConceptLayer[] {
  const baseQueries = [
    "fluorescent hum room tone",
    "old tape piano public domain",
    "concrete hallway ambience",
    "distant machinery drone",
    "reverse cymbal swell",
    "empty mall ambience"
  ];
  return [
    {
      name: "Degraded Memory",
      type: "audio",
      role: "recognizable but damaged melodic source",
      sourceStrategy: "Use a short licensed piano, ballroom, or tape-like fragment; stretch and filter it.",
      searchQueries: [baseQueries[1]!, `${concept} tape melody`],
      deviceChain: ["EQ Eight", "Saturator", "Echo", "Hybrid Reverb", "Utility"],
      automation: ["low-pass drift", "send swell", "volume fade"],
      mix: { volume: 0.62, pan: -0.12, sends: { reverb: 0.42, delay: 0.18 } }
    },
    {
      name: "Stretched Room",
      type: "audio",
      role: "wide liminal ambience bed",
      sourceStrategy: "Use room tone or hallway ambience, looped and crossfaded.",
      searchQueries: [baseQueries[0]!, baseQueries[2]!],
      deviceChain: ["EQ Eight", "Hybrid Reverb", "Auto Filter"],
      automation: ["slow filter movement", "reverb bloom"],
      mix: { volume: 0.5, pan: 0, sends: { reverb: 0.68, delay: 0.05 } }
    },
    {
      name: "Low Pressure",
      type: "audio",
      role: "subtle low-frequency unease",
      sourceStrategy: "Use a low drone or synthesized bass note; keep it controlled.",
      searchQueries: ["low drone ambience public domain", "sub bass rumble texture"],
      deviceChain: ["EQ Eight", "Compressor", "Utility"],
      automation: ["volume swells under transitions"],
      mix: { volume: 0.38, pan: 0, sends: { reverb: 0.12, delay: 0 } }
    },
    {
      name: "Mechanical Texture",
      type: "audio",
      role: "intermittent non-musical threat cues",
      sourceStrategy: "Use licensed machinery, HVAC, or metallic room sounds.",
      searchQueries: [baseQueries[3]!, "hvac mechanical clank ambience"],
      deviceChain: ["EQ Eight", "Saturator", "Echo"],
      automation: ["hard mutes", "delay throws"],
      mix: { volume: 0.34, pan: 0.22, sends: { reverb: 0.3, delay: 0.2 } }
    },
    {
      name: "Sparse Motif",
      type: "midi",
      role: "dissonant three-note memory fragment",
      sourceStrategy: "Generate MIDI notes in a minor key with wide spacing and rests.",
      searchQueries: [],
      deviceChain: ["Wavetable", "EQ Eight", "Hybrid Reverb"],
      automation: ["velocity thinning", "filter closing"],
      mix: { volume: 0.48, pan: -0.05, sends: { reverb: 0.5, delay: 0.14 } }
    },
    {
      name: "Memory Reverb",
      type: "return",
      role: "shared impossible-space tail",
      sourceStrategy: "Return track for long, dark reverb.",
      searchQueries: [],
      deviceChain: ["Hybrid Reverb", "EQ Eight", "Compressor"],
      automation: ["return swell at section ends"],
      mix: { volume: 0.7, pan: 0, sends: {} }
    },
    {
      name: "Distant Delay",
      type: "return",
      role: "shared unstable echo throws",
      sourceStrategy: "Return track for sparse, filtered delay repeats.",
      searchQueries: [],
      deviceChain: ["Echo", "EQ Eight", "Utility"],
      automation: ["delay feedback swells", "bandwidth narrowing"],
      mix: { volume: 0.54, pan: 0, sends: {} }
    }
  ];
}

function generalLayers(concept: string): ConceptLayer[] {
  return [
    {
      name: "Core Texture",
      type: "audio",
      role: "main atmosphere",
      sourceStrategy: "Use one licensed ambience sample as the bed.",
      searchQueries: [`${concept} ambience`, `${concept} texture`],
      deviceChain: ["EQ Eight", "Compressor", "Hybrid Reverb"],
      automation: ["filter movement", "volume shape"],
      mix: { volume: 0.58, pan: 0, sends: { reverb: 0.36, delay: 0.08 } }
    },
    {
      name: "Motif",
      type: "midi",
      role: "short musical identity",
      sourceStrategy: "Generate sparse MIDI and keep it editable.",
      searchQueries: [],
      deviceChain: ["Instrument Rack", "EQ Eight", "Echo"],
      automation: ["send throws"],
      mix: { volume: 0.52, pan: -0.1, sends: { reverb: 0.28, delay: 0.22 } }
    },
    {
      name: "Space Return",
      type: "return",
      role: "shared reverb return",
      sourceStrategy: "Return track for shared spatial processing.",
      searchQueries: [],
      deviceChain: ["Hybrid Reverb", "EQ Eight"],
      automation: ["return level shape"],
      mix: { volume: 0.62, pan: 0, sends: {} }
    },
    {
      name: "Delay Return",
      type: "return",
      role: "shared delay return",
      sourceStrategy: "Return track for tempo-synced echoes.",
      searchQueries: [],
      deviceChain: ["Echo", "EQ Eight"],
      automation: ["feedback throws"],
      mix: { volume: 0.5, pan: 0, sends: {} }
    }
  ];
}

function motifNotes(horror: boolean, intensity: number) {
  const velocityBase = horror ? Math.max(28, 58 - intensity * 2) : 78;
  if (horror) {
    return [
      { pitch: 62, start_time: 0, duration: 2.25, velocity: velocityBase, probability: 0.92 },
      { pitch: 65, start_time: 3.5, duration: 0.75, velocity: velocityBase - 6, probability: 0.72 },
      { pitch: 61, start_time: 7.75, duration: 1.5, velocity: velocityBase - 10, probability: 0.68 },
      { pitch: 57, start_time: 11.5, duration: 2, velocity: velocityBase - 4, probability: 0.82 },
      { pitch: 58, start_time: 15.5, duration: 0.5, velocity: velocityBase - 14, probability: 0.45 }
    ];
  }
  return [
    { pitch: 57, start_time: 0, duration: 1, velocity: velocityBase },
    { pitch: 60, start_time: 2, duration: 1, velocity: velocityBase - 6 },
    { pitch: 64, start_time: 4, duration: 1.5, velocity: velocityBase - 4 },
    { pitch: 60, start_time: 7, duration: 1, velocity: velocityBase - 10 }
  ];
}

function actionPayloadWithCreatedTrack(action: ArrangementAction, resolution: CreatedTrackResolution) {
  const payload = { ...action.payload };
  const createdTrackOffset = typeof payload.track_created_offset === "number" ? payload.track_created_offset : null;
  const createdReturnOffset = typeof payload.return_created_offset === "number" ? payload.return_created_offset : null;

  if (createdTrackOffset !== null) {
    payload.track_id = resolution.baseTrackCount + createdTrackOffset;
    payload.track_index = resolution.baseTrackCount + createdTrackOffset;
    delete payload.track_created_offset;
  }

  if (createdReturnOffset !== null) {
    payload.send_index = resolution.baseReturnTrackCount + createdReturnOffset;
    delete payload.return_created_offset;
  }

  return payload;
}

function bridgeSnapshotResolution(snapshot: unknown): CreatedTrackResolution {
  const response = snapshot as { data?: { state?: { track_count?: unknown; return_track_count?: unknown }; tracks?: unknown[] } };
  const baseTrackCount = Number(response.data?.state?.track_count ?? response.data?.tracks?.length ?? 0);
  const baseReturnTrackCount = Number(response.data?.state?.return_track_count ?? 0);
  return {
    baseTrackCount: Number.isFinite(baseTrackCount) && baseTrackCount >= 0 ? Math.floor(baseTrackCount) : 0,
    baseReturnTrackCount: Number.isFinite(baseReturnTrackCount) && baseReturnTrackCount >= 0 ? Math.floor(baseReturnTrackCount) : 0
  };
}

async function writeJson(fileName: string, payload: unknown) {
  const dir = conceptPlanDir();
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, fileName);
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
}

export async function readConceptPlan(planId: string): Promise<ConceptPlan> {
  if (!/^concept-[a-f0-9]{16}$/.test(planId)) throw new Error("Invalid concept plan id.");
  const filePath = path.join(conceptPlanDir(), `${planId}.json`);
  return JSON.parse(await fs.readFile(filePath, "utf8")) as ConceptPlan;
}

export async function readArrangementPlan(arrangementId: string): Promise<ArrangementPlan> {
  if (!/^arrangement-[a-f0-9]{16}$/.test(arrangementId)) throw new Error("Invalid arrangement plan id.");
  const filePath = path.join(conceptPlanDir(), `${arrangementId}.json`);
  return JSON.parse(await fs.readFile(filePath, "utf8")) as ArrangementPlan;
}

export async function planConceptTrack(input: ConceptPlanInput) {
  const horror = isLiminalHorror(input.concept, input.style);
  const style = input.style?.trim() || (horror ? "liminal/backrooms/horror" : "cinematic electronic");
  const layers = horror ? horrorLayers(input.concept) : generalLayers(input.concept);
  const plan: ConceptPlan = {
    id: stableId("concept", {
      concept: input.concept,
      target_duration_seconds: input.target_duration_seconds,
      intensity: input.intensity,
      style,
      sources: input.sources,
      reference_path: input.reference_path ?? ""
    }),
    version: 1,
    createdAt: new Date().toISOString(),
    preset: horror ? "liminal_backrooms_horror" : "general_cinematic",
    concept: input.concept,
    style,
    target_duration_seconds: input.target_duration_seconds,
    intensity: input.intensity,
    tempo: horror ? Math.max(48, 72 - input.intensity) : 90,
    key: horror ? "D minor" : "A minor",
    sources: input.sources,
    sections: sectionMap(input.target_duration_seconds, horror),
    layers,
    approvalChecklist: [
      "Review all remote sample licenses before downloading.",
      "Enable ABLETON_MCP_ENABLE_DOWNLOADS=1 only for approved staging.",
      "Enable ABLETON_MCP_ENABLE_WRITE=1 only for a deliberate Ableton session build.",
      "Keep UI/mouse control disabled unless LiveAPI cannot perform a reviewed step.",
      "Export an attribution report before publishing."
    ]
  };

  if (input.reference_path) {
    const safe = await resolveSafePath(input.reference_path, { mustExist: true });
    plan.reference = { path: redactPath(safe.real) };
  }

  const filePath = await writeJson(`${plan.id}.json`, plan);
  return { plan, storedPath: redactPath(filePath) };
}

export async function searchConceptSamples(options: { plan_id?: string; concept?: string; page: number; pageSize: number }) {
  const plan = options.plan_id ? await readConceptPlan(options.plan_id) : null;
  const queries = plan
    ? [...new Set(plan.layers.flatMap((layer) => layer.searchQueries).filter(Boolean))]
    : [options.concept ?? "liminal horror ambience"];
  const results = [];
  const accessIssues = [];

  for (const query of queries.slice(0, 6)) {
    try {
      const safeQuery = sanitizeRemoteSampleText(query, 160) || "liminal horror ambience";
      const ia = await searchInternetArchiveAudio(safeQuery, options.page, Math.min(options.pageSize, 5));
      results.push(...(ia.results ?? []).map((item: any) => ({
        source: "internet_archive",
        query: safeQuery,
        identifier: sanitizeRemoteSampleText(item.identifier, 100),
        title: sanitizeRemoteSampleText(item.title),
        creator: sanitizeRemoteSampleText(item.creator),
        license: sanitizeRemoteSampleText(item.licenseurl ?? "unknown"),
        licensePolicy: normalizeLicense(String(item.licenseurl ?? "")),
        score: item.licenseurl ? 0.75 : 0.45
      })));
    } catch (error) {
      accessIssues.push({ source: "internet_archive", query: sanitizeRemoteSampleText(query, 160), error: error instanceof Error ? error.message : String(error) });
    }

    try {
      const safeQuery = sanitizeRemoteSampleText(query, 160) || "liminal horror ambience";
      const freesound = await searchFreesound(safeQuery, options.page, Math.min(options.pageSize, 5));
      results.push(...(freesound.results ?? []).map((item: any) => ({
        source: "freesound",
        query: safeQuery,
        id: item.id,
        title: sanitizeRemoteSampleText(item.name),
        creator: sanitizeRemoteSampleText(item.username),
        license: sanitizeRemoteSampleText(item.license),
        licensePolicy: normalizeLicense(String(item.license ?? "")),
        preview: safeRemoteSampleUrl(item.previews?.["preview-lq-mp3"]),
        score: normalizeLicense(String(item.license ?? "")).allowed ? 0.9 : 0.25
      })));
    } catch (error) {
      accessIssues.push({ source: "freesound", query: sanitizeRemoteSampleText(query, 160), error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    plan_id: plan?.id ?? null,
    queries: queries.map((query) => sanitizeRemoteSampleText(query, 160)),
    results: results.sort((left, right) => Number(right.score) - Number(left.score)).slice(0, options.pageSize),
    accessIssues
  };
}

export async function stageConceptSamples(options: {
  samples: Array<{ url: string; destinationName: string; metadata?: Record<string, unknown> }>;
  dry_run: boolean;
}) {
  if (options.dry_run !== false) {
    return {
      dry_run: true,
      downloadsEnabled: FLAGS.downloads,
      samples: options.samples.map((sample) => ({
        url: assertAllowedSampleUrl(sample.url),
        destinationName: sample.destinationName.replace(/[^a-zA-Z0-9._-]/g, "_"),
        licensePolicy: normalizeLicense(String(sample.metadata?.license ?? sample.metadata?.licenseurl ?? ""))
      })),
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_DOWNLOADS=1 to stage approved licensed samples."
    };
  }
  const staged = [];
  for (const sample of options.samples) {
    staged.push(await downloadSample(sample.url, sample.destinationName, sample.metadata ?? {}));
  }
  return { dry_run: false, staged };
}

export async function buildLayeredArrangementPlan(planId: string) {
  const plan = await readConceptPlan(planId);
  const horror = plan.preset === "liminal_backrooms_horror";
  const layerTargets = plan.layers.map((layer) => ({ layer, trackOffset: null as number | null, returnOffset: null as number | null }));
  const returnOffsetsBySend = new Map<string, number>();
  let nextTrackOffset = 0;
  let nextReturnOffset = 0;
  for (const target of layerTargets) {
    if (target.layer.type === "return") {
      target.returnOffset = nextReturnOffset;
      const returnName = target.layer.name.toLowerCase();
      if ((returnName.includes("reverb") || returnName.includes("space")) && !returnOffsetsBySend.has("reverb")) returnOffsetsBySend.set("reverb", nextReturnOffset);
      if (returnName.includes("delay") && !returnOffsetsBySend.has("delay")) returnOffsetsBySend.set("delay", nextReturnOffset);
      nextReturnOffset += 1;
    } else {
      target.trackOffset = nextTrackOffset;
      nextTrackOffset += 1;
    }
  }
  const actions: ArrangementAction[] = [
    {
      action: "ableton_set_tempo",
      payload: { tempo: plan.tempo },
      safeToExecute: true,
      reason: "Tempo is bounded and plan-derived."
    },
    ...plan.layers.map((layer) => ({
      action: layer.type === "midi" ? "ableton_create_midi_track" : layer.type === "return" ? "ableton_create_return_track" : "ableton_create_audio_track",
      payload: { name: layer.name },
      safeToExecute: true,
      reason: "Creates a named track from the stored concept plan."
    })),
    ...plan.sections.map((section) => ({
      action: "ableton_create_scene",
      payload: { name: section.name },
      safeToExecute: true,
      reason: "Creates named scene markers from the stored section map."
    })),
    ...plan.sections.map((section) => ({
      action: "ableton_create_arrangement_marker",
      payload: { time: Math.round((section.start_seconds / 60) * plan.tempo), name: section.name },
      safeToExecute: true,
      reason: "Creates arrangement locators from the stored section map."
    })),
    ...layerTargets.flatMap((target) => {
      if (target.trackOffset === null) return [];
      return [
        {
          action: "ableton_set_track_volume",
          payload: { track_created_offset: target.trackOffset, value: target.layer.mix.volume },
          safeToExecute: true,
          reason: "Track index is resolved from the live snapshot immediately before execution."
        },
        {
          action: "ableton_set_track_pan",
          payload: { track_created_offset: target.trackOffset, value: target.layer.mix.pan },
          safeToExecute: true,
          reason: "Track index is resolved from the live snapshot immediately before execution."
        },
        ...Object.entries(target.layer.mix.sends).flatMap(([sendName, value]) => {
          const returnOffset = returnOffsetsBySend.get(sendName) ?? returnOffsetsBySend.get("reverb");
          if (value <= 0 || returnOffset === undefined) return [];
          return [{
            action: "ableton_set_track_send",
            payload: { track_created_offset: target.trackOffset, return_created_offset: returnOffset, value, send_name: sendName },
            safeToExecute: true,
            reason: "Track and send indexes are resolved from the live snapshot immediately before execution."
          }];
        })
      ];
    }),
    ...layerTargets.flatMap((target) => {
      if (target.layer.type !== "midi" || target.trackOffset === null) return [];
      return [{
        action: "ableton_insert_midi_notes",
        payload: {
          track_created_offset: target.trackOffset,
          clip_slot_index: 0,
          notes: motifNotes(horror, plan.intensity),
          create_clip_if_missing: true,
          clip_length: horror ? 16 : 8,
          name: `${target.layer.name} Motif`
        },
        safeToExecute: true,
        reason: "Creates a short editable MIDI motif from the stored concept plan."
      }];
    })
  ];
  const arrangement: ArrangementPlan = {
    id: stableId("arrangement", { planId, actions }),
    conceptPlanId: planId,
    createdAt: new Date().toISOString(),
    actions,
    notes: [
      "Created-track placeholders are resolved from a live snapshot immediately before real execution, so the plan can append to a non-empty set.",
      "Sample placement and device insertion remain staged until local sample paths and LiveAPI device support are verified.",
      "Automation is represented in the concept plan and should be applied only where bridge support returns success."
    ]
  };
  const filePath = await writeJson(`${arrangement.id}.json`, arrangement);
  return { arrangement, storedPath: redactPath(filePath) };
}

export async function executeConceptPlan(options: { arrangement_id: string; dry_run: boolean }) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  if (options.dry_run !== false) {
    return {
      dry_run: true,
      arrangement,
      executableActions: arrangement.actions.filter((action) => action.safeToExecute).length,
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 to create the approved session skeleton in Ableton."
    };
  }
  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Executing concept arrangement plan");
  const resolution = bridgeSnapshotResolution(await getBridgeSnapshot(false));
  const results = [];
  for (const action of arrangement.actions) {
    if (!action.safeToExecute) {
      results.push({ action: action.action, skipped: true, reason: action.reason });
      continue;
    }
    const payload = actionPayloadWithCreatedTrack(action, resolution);
    results.push({ action: action.action, bridge: await bridgeAction(action.action, payload), resolvedPayload: payload });
  }
  return { dry_run: false, arrangement_id: arrangement.id, resolution, results };
}

export async function renderDeliveryPlan(planId: string) {
  const plan = await readConceptPlan(planId);
  return {
    plan_id: plan.id,
    export: {
      sampleRate: 48000,
      bitDepth: "24",
      normalize: false,
      scope: "master",
      loudnessNote: "Keep horror/liminal dynamics intact; avoid heavy normalization before picture edit."
    },
    stems: plan.layers.map((layer) => ({
      name: `${plan.id}-${layer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.wav`,
      role: layer.role
    })),
    nextSteps: [
      "Run ableton_prepare_stems_plan for stem naming.",
      "Use Ableton export manually or the UI driver only after explicit user choice.",
      "Generate attribution before publishing if remote samples were staged."
    ]
  };
}
