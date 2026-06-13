import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import toneMidi from "@tonejs/midi";
import { convertAudioFile } from "./analysis.js";
import { bridgeAction, getBridgeSnapshot } from "./bridge.js";
import { FLAGS, LOCAL_PATHS } from "./config.js";
import { AbletonMcpError, requireFlag } from "./errors.js";
import { buildSampleAttribution, downloadSample, normalizeLicense, searchFreesound, searchInternetArchiveAudio } from "./samples.js";
import { redactPath, resolveSafePath } from "./security.js";
import { assertAllowedSampleUrl } from "./network.js";

const { Midi } = toneMidi;

export type ConceptSource = "local_library" | "internet_archive" | "freesound";

export type ConceptPlanInput = {
  concept: string;
  target_duration_seconds: number;
  intensity: number;
  style?: string;
  sources: ConceptSource[];
  reference_path?: string;
};

export type ExportConceptMidiMotifOptions = {
  plan_id: string;
  output_name?: string;
  dry_run: boolean;
};

export type PrepareConceptAudioLayersOptions = {
  plan_id: string;
  output_prefix?: string;
  format: "wav" | "flac" | "mp3";
  dry_run: boolean;
};

export type BuildArrangementFromPreparedAudioOptions = {
  preparation_id: string;
  sample_assignments?: SampleLayerAssignmentInput[];
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
    redactedPath: string;
    mediaType: "audio" | "file";
    approvedForAudioPlacement: boolean;
    sourceAudioPlan?: SourceAudioTreatmentPlan | undefined;
    nextSteps?: string[] | undefined;
  };
  sections: ConceptSection[];
  layers: ConceptLayer[];
  approvalChecklist: string[];
};

type SourceAudioTreatmentPlan = {
  intent: string;
  targetLayers: Array<{
    layer: string;
    clip_slot_index: number;
    name: string;
    treatment: string;
    warp: string;
    followUp: string[];
  }>;
  globalProcessing: string[];
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
  sampleAssignments: Array<{
    layer: string;
    path: string;
    redactedPath: string;
    clip_slot_index: number;
    name: string | null;
    source: "manual_assignment" | "reference_audio";
    treatment?: string | undefined;
  }>;
  sourceAudioPlan?: {
    referencePath: string;
    assignments: Array<{
      layer: string;
      clip_slot_index: number;
      name: string;
      treatment: string;
      followUp: string[];
    }>;
  } | undefined;
  devicePlan: Array<{
    layer: string;
    devices: string[];
    target: "track" | "return";
    track_created_offset?: number;
    return_created_offset?: number;
    execution: "staged";
    reason: string;
  }>;
  automationPlan: Array<{
    layer: string;
    automation: string;
    target: "reverb" | "delay" | "filter" | "volume" | "unknown";
    execution: "staged";
    reason: string;
  }>;
  notes: string[];
};

type PreparedAudioManifest = {
  id: string;
  conceptPlanId: string;
  createdAt: string;
  outputRoot: string;
  assignments: SampleLayerAssignmentInput[];
  rendered: Array<{
    layer: string;
    path: string;
    redactedPath: string;
    clip_slot_index: number;
    name: string;
    treatment: string;
    preset: string;
    format: string;
    checksum: string | null;
    bytes: number | null;
    attributionPath: string | null;
  }>;
};

type CreatedTrackResolution = {
  baseTrackCount: number;
  baseReturnTrackCount: number;
};

export type SampleLayerAssignmentInput = {
  layer: string;
  path: string;
  clip_slot_index?: number;
  name?: string;
  source?: "manual_assignment" | "reference_audio" | undefined;
  treatment?: string | undefined;
  followUp?: string[] | undefined;
};

const AudioFileExtensions = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg"]);

function conceptPlanDir() {
  return path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-plans");
}

function conceptMidiDir() {
  return path.join(LOCAL_PATHS.staging, "midi");
}

function conceptAudioDir(planId: string) {
  return path.join(LOCAL_PATHS.staging, "concepts", planId);
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

function isPathWithin(candidate: string, root: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveApprovedConceptSamplePath(inputPath: string) {
  const safe = await resolveSafePath(inputPath, { mustExist: true });
  const extension = path.extname(safe.real).toLowerCase();
  if (!AudioFileExtensions.has(extension)) {
    throw new AbletonMcpError("Concept sample assignments must point to common local audio files.", "UNSUPPORTED_SAMPLE_TYPE", ["Use WAV, AIFF, FLAC, MP3, M4A, or OGG files."]);
  }
  const approvedRoots = [LOCAL_PATHS.staging, LOCAL_PATHS.imports, LOCAL_PATHS.userLibrary, LOCAL_PATHS.liveRecordings];
  if (!approvedRoots.some((root) => isPathWithin(safe.real, root))) {
    throw new AbletonMcpError("Concept sample assignments must come from staging, Codex Imports, the Ableton User Library, or Live Recordings.", "SAMPLE_PATH_NOT_APPROVED", ["Stage downloads first, or choose a sample already under the Ableton User Library."]);
  }
  return { real: safe.real, redacted: redactPath(safe.real), extension };
}

function isAudioFilePath(inputPath: string) {
  return AudioFileExtensions.has(path.extname(inputPath).toLowerCase());
}

function sourceAudioTreatmentPlan(horror: boolean, intensity: number): SourceAudioTreatmentPlan {
  if (horror) {
    return {
      intent: "Transform the provided source audio into a degraded liminal memory rather than treating it as a clean backing track.",
      targetLayers: [
        {
          layer: "Degraded Memory",
          clip_slot_index: 0,
          name: "Source Memory - degraded motif",
          treatment: "Use a recognizable excerpt, pitch it down slightly, narrow the bandwidth, add tape saturation, and let it decay under long reverb.",
          warp: "Complex Pro or texture-friendly stretch; preserve unstable timing instead of hard quantizing.",
          followUp: ["Find the most melodic 8-16 bar phrase.", "Low-pass until the source feels distant.", "Automate reverb send upward through the Decay Loop section."]
        },
        {
          layer: "Stretched Room",
          clip_slot_index: 1,
          name: "Source Memory - stretched room wash",
          treatment: "Stretch a quieter section into an ambient wash, remove transient focus, and blend it under room tone.",
          warp: "Long stretch with crossfades; avoid tempo-locked rhythmic clarity.",
          followUp: ["Use only low-mid detail under the main motif.", "High-pass rumble before reverb.", "Keep level below the Degraded Memory layer."]
        },
        {
          layer: "Reversed Fragments",
          clip_slot_index: 2,
          name: "Source Memory - reversed fragments",
          treatment: "Reverse short fragments and place them before section changes as impossible-memory swells.",
          warp: "Manual reverse/resample step; keep fragments short and sparse.",
          followUp: ["Place fragments before Spatial Collapse and Unresolved Tail.", "Filter out harsh highs.", "Send more to delay than to the dry channel."]
        }
      ],
      globalProcessing: [
        "Keep the original source recognizable only in brief windows.",
        "Favor reverb, delay throws, filtering, saturation, and negative space over dense layering.",
        `Use intensity ${intensity}/10 as the upper bound for distortion and instability.`
      ]
    };
  }

  return {
    intent: "Use the provided source audio as the main recognizable material while keeping all edits staged and reviewable.",
    targetLayers: [
      {
        layer: "Core Texture",
        clip_slot_index: 0,
        name: "Source Texture",
        treatment: "Use an approved excerpt as the main texture and shape it with EQ, compression, and shared space.",
        warp: "Use a stable warp mode that preserves the source character.",
        followUp: ["Choose one clear excerpt.", "Trim silence.", "Balance against the generated MIDI motif."]
      }
    ],
    globalProcessing: [
      "Preserve source attribution and local path redaction.",
      "Keep destructive edits outside MCP unless explicitly approved."
    ]
  };
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
      name: "Reversed Fragments",
      type: "audio",
      role: "short reversed transition details and impossible-memory swells",
      sourceStrategy: "Use licensed reversed cymbal, tape, or room fragments as section transitions.",
      searchQueries: [baseQueries[4]!, "reverse tape swell public domain"],
      deviceChain: ["EQ Eight", "Echo", "Hybrid Reverb", "Auto Filter"],
      automation: ["reverse swells", "delay throw", "filter closing"],
      mix: { volume: 0.28, pan: 0.18, sends: { reverb: 0.52, delay: 0.34 } }
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

function safeMidiFileName(planId: string, value?: string) {
  const raw = value?.trim() || `${planId}-sparse-motif.mid`;
  const cleaned = raw
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/^\.+/, "")
    .slice(0, 120);
  const base = cleaned.length > 0 ? cleaned : `${planId}-sparse-motif`;
  const withExtension = base.toLowerCase().endsWith(".mid") ? base : `${base}.mid`;
  if (!/^[a-zA-Z0-9._-]+\.mid$/i.test(withExtension)) {
    throw new AbletonMcpError("MIDI output_name must resolve to a simple .mid filename.", "INVALID_MIDI_OUTPUT_NAME", ["Use letters, numbers, dot, underscore, or dash only."]);
  }
  return withExtension;
}

function safeFileStem(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

function layerSlug(value: string) {
  return safeFileStem(value.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "layer");
}

function conversionPresetForLayer(layerName: string): "clean" | "liminal_memory" | "stretched_ambience" | "reversed_fragment" {
  const text = layerName.toLowerCase();
  if (text.includes("stretch") || text.includes("room")) return "stretched_ambience";
  if (text.includes("reverse") || text.includes("fragment")) return "reversed_fragment";
  if (text.includes("degraded") || text.includes("memory")) return "liminal_memory";
  return "clean";
}

function keySignature(planKey: string) {
  const [key, scale] = planKey.split(/\s+/);
  return {
    key: key || "C",
    scale: scale?.toLowerCase() === "minor" ? "minor" : "major",
    ticks: 0
  };
}

function motifExportPlan(plan: ConceptPlan, outputName?: string) {
  const horror = plan.preset === "liminal_backrooms_horror";
  const notes = motifNotes(horror, plan.intensity);
  const fileName = safeMidiFileName(plan.id, outputName);
  const outputPath = path.join(conceptMidiDir(), fileName);
  return {
    plan_id: plan.id,
    preset: plan.preset,
    tempo: plan.tempo,
    key: plan.key,
    clip_length_beats: horror ? 16 : 8,
    track_name: horror ? "Sparse Motif - liminal memory" : "Motif",
    note_count: notes.length,
    notes,
    outputPath,
    redactedOutputPath: redactPath(outputPath)
  };
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

function redactActionPayload(payload: Record<string, unknown>) {
  const redacted = { ...payload };
  if (typeof redacted.path === "string") redacted.path = redactPath(redacted.path);
  return redacted;
}

function arrangementForReport(arrangement: ArrangementPlan): ArrangementPlan {
  return {
    ...arrangement,
    sampleAssignments: (arrangement.sampleAssignments ?? []).map((assignment) => ({
      ...assignment,
      path: assignment.redactedPath
    })),
    sourceAudioPlan: arrangement.sourceAudioPlan ? {
      ...arrangement.sourceAudioPlan,
      referencePath: redactPath(arrangement.sourceAudioPlan.referencePath)
    } : undefined,
    actions: arrangement.actions.map((action) => ({
      ...action,
      payload: redactActionPayload(action.payload)
    }))
  };
}

function preparedAudioManifestForReport(manifest: PreparedAudioManifest) {
  return {
    ...manifest,
    outputRoot: redactPath(manifest.outputRoot),
    assignments: manifest.assignments.map((assignment) => ({
      ...assignment,
      path: redactPath(assignment.path)
    })),
    rendered: manifest.rendered.map((entry) => {
      const safePath = redactPath(entry.path);
      return {
        ...entry,
        path: safePath,
        redactedPath: safePath,
        attributionPath: entry.attributionPath ? redactPath(entry.attributionPath) : null
      };
    })
  };
}

function conceptForReport(plan: ConceptPlan): ConceptPlan {
  if (!plan.reference) return plan;
  return {
    ...plan,
    reference: {
      ...plan.reference,
      path: plan.reference.redactedPath
    }
  };
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

function automationTargetName(automation: string): "reverb" | "delay" | "filter" | "volume" | "unknown" {
  const text = automation.toLowerCase();
  if (text.includes("reverb")) return "reverb";
  if (text.includes("delay") || text.includes("feedback")) return "delay";
  if (text.includes("filter") || text.includes("bandwidth") || text.includes("low-pass")) return "filter";
  if (text.includes("volume") || text.includes("fade") || text.includes("swell") || text.includes("mute")) return "volume";
  return "unknown";
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

export async function readPreparedAudioManifest(preparationId: string): Promise<PreparedAudioManifest> {
  if (!/^prepared-audio-[a-f0-9]{16}$/.test(preparationId)) throw new Error("Invalid prepared audio id.");
  const filePath = path.join(conceptPlanDir(), `${preparationId}.json`);
  return JSON.parse(await fs.readFile(filePath, "utf8")) as PreparedAudioManifest;
}

async function listStoredPlanFiles(prefix: "concept" | "arrangement") {
  const dir = conceptPlanDir();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${prefix}-`) && entry.name.endsWith(".json"))
      .slice(0, 500)
      .map((entry) => path.join(dir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getConceptPlanForReport(planId: string) {
  return conceptForReport(await readConceptPlan(planId));
}

export async function getArrangementPlanForReport(arrangementId: string) {
  return arrangementForReport(await readArrangementPlan(arrangementId));
}

export async function listConceptPlans() {
  const files = await listStoredPlanFiles("concept");
  const summaries = await Promise.all(files.map(async (filePath) => {
    const stat = await fs.stat(filePath);
    const plan = JSON.parse(await fs.readFile(filePath, "utf8")) as ConceptPlan;
    return {
      id: plan.id,
      type: "concept",
      createdAt: plan.createdAt,
      modifiedAt: stat.mtime.toISOString(),
      preset: plan.preset,
      concept: plan.concept,
      style: plan.style,
      target_duration_seconds: plan.target_duration_seconds,
      intensity: plan.intensity,
      layerCount: Array.isArray(plan.layers) ? plan.layers.length : 0,
      sectionCount: Array.isArray(plan.sections) ? plan.sections.length : 0,
      reference: plan.reference ? {
        path: redactPath(plan.reference.redactedPath ?? plan.reference.path),
        mediaType: plan.reference.mediaType ?? "file",
        approvedForAudioPlacement: Boolean(plan.reference.approvedForAudioPlacement)
      } : null
    };
  }));
  return summaries.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export async function listArrangementPlans() {
  const files = await listStoredPlanFiles("arrangement");
  const summaries = await Promise.all(files.map(async (filePath) => {
    const stat = await fs.stat(filePath);
    const arrangement = JSON.parse(await fs.readFile(filePath, "utf8")) as ArrangementPlan;
    const actions = Array.isArray(arrangement.actions) ? arrangement.actions : [];
    const sampleAssignments = Array.isArray(arrangement.sampleAssignments) ? arrangement.sampleAssignments : [];
    const devicePlan = Array.isArray(arrangement.devicePlan) ? arrangement.devicePlan : [];
    const automationPlan = Array.isArray(arrangement.automationPlan) ? arrangement.automationPlan : [];
    return {
      id: arrangement.id,
      type: "arrangement",
      createdAt: arrangement.createdAt,
      modifiedAt: stat.mtime.toISOString(),
      conceptPlanId: arrangement.conceptPlanId,
      actionCount: actions.length,
      executableActionCount: actions.filter((action) => action.safeToExecute).length,
      sampleAssignmentCount: sampleAssignments.length,
      referenceAudioAssignmentCount: sampleAssignments.filter((assignment) => assignment.source === "reference_audio").length,
      devicePlanCount: devicePlan.length,
      automationPlanCount: automationPlan.length
    };
  }));
  return summaries.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
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
    const redactedPath = redactPath(safe.real);
    if (isAudioFilePath(safe.real)) {
      try {
        const approved = await resolveApprovedConceptSamplePath(safe.real);
        plan.reference = {
          path: approved.real,
          redactedPath: approved.redacted,
          mediaType: "audio",
          approvedForAudioPlacement: true,
          sourceAudioPlan: sourceAudioTreatmentPlan(horror, input.intensity)
        };
      } catch {
        plan.reference = {
          path: safe.real,
          redactedPath,
          mediaType: "audio",
          approvedForAudioPlacement: false,
          sourceAudioPlan: sourceAudioTreatmentPlan(horror, input.intensity),
          nextSteps: [
            "Copy or import the source audio into samples/staging, Codex Imports, the Ableton User Library, or Live Recordings before automatic placement.",
            "Build the arrangement with explicit sample_assignments after the path is approved."
          ]
        };
      }
    } else {
      plan.reference = {
        path: safe.real,
        redactedPath,
        mediaType: "file",
        approvedForAudioPlacement: false,
        nextSteps: ["Use a common audio file extension to enable source-audio treatment planning."]
      };
    }
  }

  const filePath = await writeJson(`${plan.id}.json`, plan);
  return { plan: conceptForReport(plan), storedPath: redactPath(filePath) };
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
        attribution: buildSampleAttribution({
          sourceUrl: assertAllowedSampleUrl(sample.url),
          destinationName: sample.destinationName.replace(/[^a-zA-Z0-9._-]/g, "_"),
          metadata: sample.metadata ?? {}
        })
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

export async function buildLayeredArrangementPlan(planId: string, sampleAssignmentsInput: SampleLayerAssignmentInput[] = []) {
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
  const explicitAssignmentLayers = new Set(sampleAssignmentsInput.map((assignment) => assignment.layer.trim().toLowerCase()));
  const referenceAssignments: SampleLayerAssignmentInput[] = plan.reference?.mediaType === "audio" && plan.reference.approvedForAudioPlacement && plan.reference.sourceAudioPlan
    ? plan.reference.sourceAudioPlan.targetLayers
      .filter((target) => !explicitAssignmentLayers.has(target.layer.toLowerCase()))
      .map((target) => ({
        layer: target.layer,
        path: plan.reference!.path,
        clip_slot_index: target.clip_slot_index,
        name: target.name,
        source: "reference_audio",
        treatment: target.treatment,
        followUp: target.followUp
      }))
    : [];
  const allSampleAssignments = [...referenceAssignments, ...sampleAssignmentsInput];
  const sampleAssignments = [];
  for (const assignment of allSampleAssignments) {
    const layerName = assignment.layer.trim();
    const target = layerTargets.find((candidate) => candidate.layer.name.toLowerCase() === layerName.toLowerCase());
    if (!target) {
      throw new AbletonMcpError(`Concept layer not found for sample assignment: ${layerName}`, "CONCEPT_LAYER_NOT_FOUND", ["Use an exact layer name from ableton_plan_concept_track."]);
    }
    if (target.layer.type !== "audio" || target.trackOffset === null) {
      throw new AbletonMcpError(`Sample assignment layer must be an audio layer: ${layerName}`, "CONCEPT_LAYER_NOT_AUDIO", ["Assign samples only to audio layers; MIDI and return layers are generated by the arrangement plan."]);
    }
    const sample = await resolveApprovedConceptSamplePath(assignment.path);
    sampleAssignments.push({
      layer: target.layer.name,
      trackOffset: target.trackOffset,
      path: sample.real,
      redactedPath: sample.redacted,
      clip_slot_index: assignment.clip_slot_index ?? 0,
      name: assignment.name?.trim().slice(0, 128) || target.layer.name,
      source: assignment.source ?? "manual_assignment",
      treatment: assignment.treatment,
      followUp: assignment.followUp ?? []
    });
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
    }),
    ...sampleAssignments.map((assignment) => ({
      action: "ableton_load_preset_or_sample",
      payload: {
        track_created_offset: assignment.trackOffset,
        clip_slot_index: assignment.clip_slot_index,
        path: assignment.path,
        mode: "audio_clip",
        name: assignment.name
      },
      safeToExecute: true,
      reason: "Creates an audio clip from an approved local sample assigned to this stored concept layer."
    }))
  ];
  const devicePlan: ArrangementPlan["devicePlan"] = layerTargets
    .filter((target) => target.layer.deviceChain.length > 0)
    .map((target) => ({
      layer: target.layer.name,
      devices: [...target.layer.deviceChain],
      target: target.layer.type === "return" ? "return" : "track",
      ...(target.trackOffset === null ? {} : { track_created_offset: target.trackOffset }),
      ...(target.returnOffset === null ? {} : { return_created_offset: target.returnOffset }),
      execution: "staged",
      reason: "LiveAPI device insertion requires a verified browser/hot-swap target in this Ableton version; keep this as a review plan or use the user-enabled UI driver fallback."
    }));
  const automationPlan: ArrangementPlan["automationPlan"] = plan.layers.flatMap((layer) => layer.automation.map((automation) => ({
      layer: layer.name,
      automation,
      target: automationTargetName(automation),
      execution: "staged",
      reason: "Automation is planned for review and target discovery; write execution requires a verified device/parameter map for this Ableton set."
    })));
  const arrangement: ArrangementPlan = {
    id: stableId("arrangement", { planId, actions, automationPlan }),
    conceptPlanId: planId,
    createdAt: new Date().toISOString(),
    actions,
    sampleAssignments: sampleAssignments.map((assignment) => ({
      layer: assignment.layer,
      path: assignment.path,
      redactedPath: assignment.redactedPath,
      clip_slot_index: assignment.clip_slot_index,
      name: assignment.name,
      source: assignment.source,
      treatment: assignment.treatment
    })),
    sourceAudioPlan: plan.reference?.mediaType === "audio" && plan.reference.approvedForAudioPlacement && plan.reference.sourceAudioPlan ? {
      referencePath: plan.reference.path,
      assignments: sampleAssignments
        .filter((assignment) => assignment.source === "reference_audio")
        .map((assignment) => ({
          layer: assignment.layer,
          clip_slot_index: assignment.clip_slot_index,
          name: assignment.name ?? assignment.layer,
          treatment: assignment.treatment ?? "Use as approved reference audio material.",
          followUp: assignment.followUp ?? []
        }))
    } : undefined,
    devicePlan,
    automationPlan,
    notes: [
      "Created-track placeholders are resolved from a live snapshot immediately before real execution, so the plan can append to a non-empty set.",
      "Sample placement can be executed from approved local sample paths; device insertion remains staged until a reliable LiveAPI browser or user-enabled UI path is verified.",
      "Automation is represented in the concept plan and should be applied only where bridge support returns success."
    ]
  };
  const filePath = await writeJson(`${arrangement.id}.json`, arrangement);
  return { arrangement: arrangementForReport(arrangement), storedPath: redactPath(filePath) };
}

function midiVelocity(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 100;
  return Math.max(0, Math.min(1, numeric / 127));
}

export async function exportConceptMidiMotif(options: ExportConceptMidiMotifOptions) {
  const plan = await readConceptPlan(options.plan_id);
  const exportPlan = motifExportPlan(plan, options.output_name);
  const responsePlan = {
    ...exportPlan,
    outputPath: exportPlan.redactedOutputPath
  };
  delete (responsePlan as { redactedOutputPath?: string }).redactedOutputPath;

  if (options.dry_run !== false) {
    return {
      dry_run: true,
      midi: responsePlan,
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 to write the generated MIDI motif into samples/staging/midi."
    };
  }

  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Exporting concept MIDI motif");
  await fs.mkdir(conceptMidiDir(), { recursive: true });
  try {
    await fs.access(exportPlan.outputPath);
    throw new AbletonMcpError(`MIDI output already exists: ${redactPath(exportPlan.outputPath)}`, "MIDI_OUTPUT_EXISTS", ["Choose a new output_name. MCP MIDI export never overwrites files."]);
  } catch (error) {
    if (error instanceof AbletonMcpError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const midi = new Midi();
  midi.name = `${plan.id} ${exportPlan.track_name}`;
  midi.header.setTempo(plan.tempo);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.keySignatures.push(keySignature(plan.key));
  midi.header.meta.push({ ticks: 0, type: "marker", text: `Ableton MCP concept ${plan.id}` });
  midi.header.update();

  const track = midi.addTrack();
  track.name = exportPlan.track_name;
  track.channel = 0;
  for (const note of exportPlan.notes) {
    track.addNote({
      midi: note.pitch,
      ticks: Math.round(note.start_time * midi.header.ppq),
      durationTicks: Math.max(1, Math.round(note.duration * midi.header.ppq)),
      velocity: midiVelocity(note.velocity)
    });
  }
  track.endOfTrackTicks = Math.round(exportPlan.clip_length_beats * midi.header.ppq);

  const data = Buffer.from(midi.toArray());
  const checksum = crypto.createHash("sha256").update(data).digest("hex");
  await fs.writeFile(exportPlan.outputPath, data, { flag: "wx" });
  const sidecar = {
    source: "ableton_mcp_generated_midi",
    conceptPlanId: plan.id,
    preset: plan.preset,
    concept: sanitizeRemoteSampleText(plan.concept, 500),
    destinationName: path.basename(exportPlan.outputPath),
    checksum,
    bytes: data.length,
    generatedAt: new Date().toISOString(),
    tempo: plan.tempo,
    key: plan.key,
    clipLengthBeats: exportPlan.clip_length_beats,
    noteCount: exportPlan.note_count,
    license: "Generated locally by Ableton MCP from user-provided concept text; review before publishing."
  };
  await fs.writeFile(`${exportPlan.outputPath}.attribution.json`, `${JSON.stringify(sidecar, null, 2)}\n`, { flag: "wx" });

  return {
    dry_run: false,
    midi: {
      ...responsePlan,
      checksum,
      bytes: data.length,
      attributionPath: redactPath(`${exportPlan.outputPath}.attribution.json`)
    },
    attribution: sidecar
  };
}

export async function prepareConceptAudioLayers(options: PrepareConceptAudioLayersOptions) {
  const plan = await readConceptPlan(options.plan_id);
  const reference = plan.reference;
  if (!reference || reference.mediaType !== "audio") {
    throw new AbletonMcpError("Concept plan does not include reference audio to prepare.", "CONCEPT_REFERENCE_AUDIO_MISSING", ["Create a concept plan with reference_path pointing to an approved local audio file."]);
  }
  if (!reference.approvedForAudioPlacement || !reference.sourceAudioPlan) {
    throw new AbletonMcpError("Concept reference audio is not approved for automatic layer preparation.", "CONCEPT_REFERENCE_AUDIO_NOT_APPROVED", reference.nextSteps ?? ["Stage or import the reference audio into an approved sample root first."]);
  }

  const format = options.format ?? "wav";
  const prefix = safeFileStem(options.output_prefix ?? plan.id, plan.id);
  const layerPlans = reference.sourceAudioPlan.targetLayers.map((target) => {
    const preset = conversionPresetForLayer(target.layer);
    const destinationName = `${prefix}-${layerSlug(target.layer)}.${format}`;
    const output = path.join(conceptAudioDir(plan.id), destinationName);
    return {
      layer: target.layer,
      clip_slot_index: target.clip_slot_index,
      name: target.name,
      treatment: target.treatment,
      followUp: target.followUp,
      preset,
      format,
      input: reference.path,
      output,
      redactedOutput: redactPath(output)
    };
  });

  if (options.dry_run !== false) {
    const conversions = [];
    for (const layer of layerPlans) {
      conversions.push({
        layer: layer.layer,
        clip_slot_index: layer.clip_slot_index,
        name: layer.name,
        treatment: layer.treatment,
        followUp: layer.followUp,
        ...(await convertAudioFile({
          input: layer.input,
          output: layer.output,
          format: layer.format,
          preset: layer.preset,
          dry_run: true
        }) as Record<string, unknown>)
      });
    }
    return {
      dry_run: true,
      plan_id: plan.id,
      outputRoot: redactPath(conceptAudioDir(plan.id)),
      conversions,
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 to render these approved reference-audio layers."
    };
  }

  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Preparing concept reference-audio layers");
  const rendered = [];
  for (const layer of layerPlans) {
    const converted = await convertAudioFile({
      input: layer.input,
      output: layer.output,
      format: layer.format,
      preset: layer.preset,
      dry_run: false
    });
    rendered.push({
      layer: layer.layer,
      clip_slot_index: layer.clip_slot_index,
      name: layer.name,
      treatment: layer.treatment,
      followUp: layer.followUp,
      conversion: converted,
      sample_assignment: {
        layer: layer.layer,
        path: layer.output,
        clip_slot_index: layer.clip_slot_index,
        name: layer.name
      }
    });
  }
  const manifest: PreparedAudioManifest = {
    id: stableId("prepared-audio", {
      planId: plan.id,
      outputs: layerPlans.map((layer) => layer.output)
    }),
    conceptPlanId: plan.id,
    createdAt: new Date().toISOString(),
    outputRoot: conceptAudioDir(plan.id),
    assignments: rendered.map((entry) => ({
      layer: entry.layer,
      path: entry.sample_assignment.path,
      clip_slot_index: entry.clip_slot_index,
      name: entry.name,
      source: "reference_audio",
      treatment: entry.treatment,
      followUp: entry.followUp
    })),
    rendered: rendered.map((entry) => {
      const conversion = entry.conversion as { conversion?: { checksum?: unknown; bytes?: unknown; attributionPath?: unknown } };
      return {
        layer: entry.layer,
        path: entry.sample_assignment.path,
        redactedPath: redactPath(entry.sample_assignment.path),
        clip_slot_index: entry.clip_slot_index,
        name: entry.name,
        treatment: entry.treatment,
        preset: conversionPresetForLayer(entry.layer),
        format,
        checksum: typeof conversion.conversion?.checksum === "string" ? conversion.conversion.checksum : null,
        bytes: typeof conversion.conversion?.bytes === "number" ? conversion.conversion.bytes : null,
        attributionPath: `${entry.sample_assignment.path}.attribution.json`
      };
    })
  };
  const storedPath = await writeJson(`${manifest.id}.json`, manifest);
  const report = preparedAudioManifestForReport(manifest);

  return {
    dry_run: false,
    plan_id: plan.id,
    outputRoot: redactPath(conceptAudioDir(plan.id)),
    preparation_id: manifest.id,
    storedPath: redactPath(storedPath),
    rendered: report.rendered,
    sample_assignments: report.assignments,
    nextStep: "Use ableton_build_arrangement_from_prepared_audio with preparation_id to build an arrangement plan without exposing local sample paths."
  };
}

export async function buildArrangementFromPreparedAudio(options: BuildArrangementFromPreparedAudioOptions) {
  const manifest = await readPreparedAudioManifest(options.preparation_id);
  const manualAssignments = options.sample_assignments ?? [];
  const arrangement = await buildLayeredArrangementPlan(manifest.conceptPlanId, [
    ...manifest.assignments,
    ...manualAssignments
  ]);
  return {
    preparation: preparedAudioManifestForReport(manifest),
    arrangement: arrangement.arrangement,
    storedPath: arrangement.storedPath
  };
}

export async function executeConceptPlan(options: { arrangement_id: string; dry_run: boolean }) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  if (options.dry_run !== false) {
    return {
      dry_run: true,
      arrangement: arrangementForReport(arrangement),
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
    results.push({ action: action.action, bridge: await bridgeAction(action.action, payload), resolvedPayload: redactActionPayload(payload) });
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
