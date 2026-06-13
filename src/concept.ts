import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import toneMidi from "@tonejs/midi";
import { convertAudioFile } from "./analysis.js";
import { bridgeAction, getBridgeCapabilityMatrix, getBridgeSnapshot, type BridgeActionCapability } from "./bridge.js";
import { FLAGS, LOCAL_PATHS, PLATFORM } from "./config.js";
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

export type ConceptProductionPlanInput = ConceptPlanInput & {
  sample_assignments?: SampleLayerAssignmentInput[];
  include_sample_search?: boolean;
  sample_page_size?: number;
};

export type ReferenceAudioIntakePlanOptions = {
  reference_path: string;
  concept?: string;
  desired_destination_name?: string;
};

export type ConceptSampleCurationOptions = {
  plan_id: string;
  page: number;
  pageSize: number;
  search?: boolean;
  allowed_only?: boolean;
  max_layers?: number;
};

export type ConceptExecutionPreflightOptions = {
  arrangement_id: string;
  check_bridge?: boolean;
};

export type ConceptExecutionActionMatrixOptions = ConceptExecutionPreflightOptions;

export type ConceptExecutionApprovalBundleOptions = ConceptExecutionPreflightOptions;

export type ConceptDeviceAutomationReadinessOptions = ConceptExecutionPreflightOptions;

export type ConceptRoutingReadinessOptions = ConceptExecutionPreflightOptions;

export type ConceptExecutionManifestOptions = {
  arrangement_id: string;
};

export type ConceptAttributionBundleOptions = {
  arrangement_id: string;
};

export type ConceptProductionScorecardOptions = ConceptExecutionPreflightOptions;

export type ConceptExecutionOptions = {
  arrangement_id: string;
  dry_run: boolean;
  approval_id?: string;
  approval_confirmed?: boolean;
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

export type ConceptPresetCatalogEntry = {
  id: "liminal_backrooms_horror" | "general_cinematic";
  name: string;
  bestFor: string[];
  avoidWhen: string[];
  defaultStyle: string;
  recommendedDurationSeconds: number;
  recommendedIntensity: number;
  tempoRange: { min: number; max: number };
  keyCenter: string;
  sections: ConceptSection[];
  layerBlueprints: Array<ConceptLayer & { color: number }>;
  sampleStrategy: string[];
  productionMoves: string[];
  bridgeReadiness: string[];
  exactNextToolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  safety: {
    writesAbleton: false;
    downloads: false;
    uiControl: false;
    remoteHttpExposure: false;
  };
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
    target: "reverb" | "delay" | "filter" | "volume" | "midi_velocity" | "unknown";
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
  baseSceneCount: number;
};

type ConceptExecutionJournal = {
  id: string;
  arrangement_id: string;
  approval_id: string;
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  executableActions: number;
  totalActions: number;
  events: Array<Record<string, unknown>>;
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
const MAX_CONCEPT_ATTRIBUTION_BYTES = 128_000;

function conceptPlanDir() {
  return path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-plans");
}

function conceptExecutionDir() {
  return path.join(LOCAL_PATHS.diagnostics, "runtime", "concept-executions");
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

function conceptExecutionApprovalId(arrangement: ArrangementPlan) {
  return stableId("approval", {
    version: 1,
    arrangementId: arrangement.id,
    executableActions: arrangement.actions.filter((action) => action.safeToExecute).length,
    totalActions: arrangement.actions.length
  });
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

function hostInputPath(inputPath: string) {
  if (!PLATFORM.isWsl) return inputPath;
  const match = inputPath.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return inputPath;
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll("\\", "/")}`;
}

async function resolveApprovedConceptSamplePath(inputPath: string) {
  const safe = await resolveSafePath(inputPath, { mustExist: true });
  const extension = path.extname(safe.real).toLowerCase();
  if (!AudioFileExtensions.has(extension)) {
    throw new AbletonMcpError("Concept sample assignments must point to common local audio files.", "UNSUPPORTED_SAMPLE_TYPE", ["Use WAV, AIFF, FLAC, MP3, M4A, or OGG files."]);
  }
  if (!conceptReferenceApprovalRoots().some((root) => isPathWithin(safe.real, root))) {
    throw new AbletonMcpError("Concept sample assignments must come from staging, Codex Imports, the Ableton User Library, or Live Recordings.", "SAMPLE_PATH_NOT_APPROVED", ["Stage downloads first, or choose a sample already under the Ableton User Library."]);
  }
  return { real: safe.real, redacted: redactPath(safe.real), extension };
}

function isAudioFilePath(inputPath: string) {
  return AudioFileExtensions.has(path.extname(inputPath).toLowerCase());
}

function conceptReferenceApprovalRoots() {
  return [LOCAL_PATHS.staging, LOCAL_PATHS.imports, LOCAL_PATHS.userLibrary, LOCAL_PATHS.liveRecordings];
}

function stagingDestinationForReference(inputPath: string, desiredDestinationName?: string) {
  const extension = AudioFileExtensions.has(path.extname(inputPath).toLowerCase())
    ? path.extname(inputPath).toLowerCase()
    : ".wav";
  const requested = desiredDestinationName?.trim();
  const requestedExtension = requested ? path.extname(requested).toLowerCase() : "";
  const stemInput = requested
    ? requested.slice(0, requested.length - requestedExtension.length)
    : path.basename(inputPath, path.extname(inputPath)) || "reference-audio";
  const stem = safeFileStem(stemInput, "reference-audio").replace(/^[-_.]+/, "") || "reference-audio";
  const finalExtension = AudioFileExtensions.has(requestedExtension) ? requestedExtension : extension;
  return path.join(LOCAL_PATHS.staging, `${stem}${finalExtension}`);
}

function pathApprovalRootsForReport() {
  return [
    { root: LOCAL_PATHS.staging, purpose: "temporary reviewed staging for source audio and downloaded samples" },
    { root: LOCAL_PATHS.imports, purpose: "Ableton User Library Codex Imports for publishable imports" },
    { root: LOCAL_PATHS.userLibrary, purpose: "Ableton User Library material already managed by the user" },
    { root: LOCAL_PATHS.liveRecordings, purpose: "Ableton Live Recordings captured by the user" }
  ].map((entry) => ({ ...entry, root: redactPath(entry.root) }));
}

export async function planReferenceAudioIntake(options: ReferenceAudioIntakePlanOptions) {
  const localReferencePath = hostInputPath(options.reference_path);
  const requestedAbsolute = path.resolve(localReferencePath);
  const redactedRequestedPath = redactPath(requestedAbsolute);
  const extension = path.extname(localReferencePath).toLowerCase();
  const audioTypeSupported = AudioFileExtensions.has(extension);
  const stagingDestination = stagingDestinationForReference(localReferencePath, options.desired_destination_name);
  const safeDestinationName = path.basename(stagingDestination);
  const safeConcept = options.concept ? sanitizeRemoteSampleText(options.concept, 500) : null;

  const base = {
    intakeType: "reference_audio_intake_plan",
    concept: safeConcept,
    requestedPath: redactedRequestedPath,
    audioTypeSupported,
    extension: extension || null,
    safety: {
      readsUnapprovedPath: false,
      copiesFiles: false,
      downloads: false,
      abletonWrites: false,
      uiControl: false,
      arbitraryUrlFetch: false
    },
    approvalRoots: pathApprovalRootsForReport(),
    recommendedStaging: {
      destinationName: safeDestinationName,
      stagingPath: redactPath(stagingDestination),
      copyRequired: true
    }
  };

  if (!audioTypeSupported) {
    return {
      ...base,
      okToUseAsReference: false,
      status: "unsupported_file_type",
      nextSteps: [
        "Use WAV, AIFF, FLAC, MP3, M4A, or OGG for reference-audio treatment.",
        "Convert the file into an approved staging or Ableton User Library location before calling ableton_plan_concept_track with reference_path."
      ],
      exactNextToolCalls: {
        conceptWithoutReference: safeConcept
          ? {
              name: "ableton_plan_concept_track",
              arguments: { concept: safeConcept, target_duration_seconds: 150, intensity: 8, style: "liminal/backrooms/horror", sources: ["local_library"] }
            }
          : null
      }
    };
  }

  if (!conceptReferenceApprovalRoots().some((root) => isPathWithin(requestedAbsolute, root))) {
    return {
      ...base,
      okToUseAsReference: false,
      status: "needs_user_staging_or_import",
      reason: {
        code: "REFERENCE_AUDIO_NOT_IN_APPROVED_ROOT",
        message: "Reference audio path is not under an approved staging/import/library root.",
        nextSteps: ["Copy or import the source audio into samples/staging, Codex Imports, the Ableton User Library, or Live Recordings before automatic placement."]
      },
      nextSteps: [
        `Copy or import the source audio to ${redactPath(stagingDestination)} or to the Ableton User Library Codex Imports folder.`,
        "After the copy/import, call ableton_plan_reference_audio_intake again with the approved destination path.",
        "Then call ableton_plan_concept_track with reference_path set to the approved staged or imported audio."
      ],
      exactNextToolCalls: {
        recheckAfterUserCopy: {
          name: "ableton_plan_reference_audio_intake",
          arguments: {
            reference_path: redactPath(stagingDestination),
            ...(safeConcept ? { concept: safeConcept } : {}),
            desired_destination_name: safeDestinationName
          }
        },
        conceptWithoutReference: safeConcept
          ? {
              name: "ableton_plan_concept_track",
              arguments: { concept: safeConcept, target_duration_seconds: 150, intensity: 8, style: "liminal/backrooms/horror", sources: ["local_library"] }
            }
          : null
      }
    };
  }

  try {
    const approved = await resolveApprovedConceptSamplePath(localReferencePath);
    return {
      ...base,
      okToUseAsReference: true,
      status: "ready_for_concept_reference",
      requestedPath: approved.redacted,
      recommendedStaging: {
        ...base.recommendedStaging,
        copyRequired: false
      },
      nextSteps: [
        "Call ableton_plan_concept_track with this approved reference_path.",
        "Run ableton_prepare_concept_audio_layers with dry_run=true before rendering prepared layers."
      ],
      exactNextToolCalls: {
        conceptWithReference: {
          name: "ableton_plan_concept_track",
          arguments: {
            concept: safeConcept ?? "liminal backrooms horror reference treatment",
            target_duration_seconds: 150,
            intensity: 8,
            style: "liminal/backrooms/horror",
            sources: ["local_library"],
            reference_path: approved.redacted
          }
        },
        prepareLayersDryRun: {
          name: "ableton_prepare_concept_audio_layers",
          arguments: { plan_id: "concept-...", output_prefix: safeFileStem(path.basename(approved.real, path.extname(approved.real)), "reference-audio"), format: "wav", dry_run: true }
        }
      }
    };
  } catch (error) {
    const reason = error instanceof AbletonMcpError ? { code: error.code, message: error.message, nextSteps: error.nextSteps } : null;
    return {
      ...base,
      okToUseAsReference: false,
      status: "needs_user_staging_or_import",
      reason,
      nextSteps: [
        `Copy or import the source audio to ${redactPath(stagingDestination)} or to the Ableton User Library Codex Imports folder.`,
        "After the copy/import, call ableton_plan_reference_audio_intake again with the approved destination path.",
        "Then call ableton_plan_concept_track with reference_path set to the approved staged or imported audio."
      ],
      exactNextToolCalls: {
        recheckAfterUserCopy: {
          name: "ableton_plan_reference_audio_intake",
          arguments: {
            reference_path: redactPath(stagingDestination),
            ...(safeConcept ? { concept: safeConcept } : {}),
            desired_destination_name: safeDestinationName
          }
        },
        conceptWithoutReference: safeConcept
          ? {
              name: "ableton_plan_concept_track",
              arguments: { concept: safeConcept, target_duration_seconds: 150, intensity: 8, style: "liminal/backrooms/horror", sources: ["local_library"] }
            }
          : null
      }
    };
  }
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
          layer: "Distant Room Tone",
          clip_slot_index: 2,
          name: "Source Memory - distant room tone bed",
          treatment: "Extract a low-detail noise floor, tail, or quiet passage and use it as the constant far-room bed beneath the arrangement.",
          warp: "Texture stretch with long fades; remove transients and obvious musical attacks.",
          followUp: ["Keep the layer barely audible in the Recognizable Motif section.", "High-pass before the reverb send.", "Avoid masking the Degraded Memory layer."]
        },
        {
          layer: "Reversed Fragments",
          clip_slot_index: 3,
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
      name: "Distant Room Tone",
      type: "audio",
      role: "barely audible far-room noise floor and fluorescent air",
      sourceStrategy: "Use quiet room tone, HVAC air, or a noise-floor excerpt; keep it continuous and low.",
      searchQueries: ["distant room tone fluorescent hum", "hvac air noise floor ambience"],
      deviceChain: ["EQ Eight", "Auto Filter", "Hybrid Reverb", "Utility"],
      automation: ["subtle level breathing", "bandwidth narrowing", "reverb distance swell"],
      mix: { volume: 0.29, pan: 0, sends: { reverb: 0.58, delay: 0.04 } }
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

export function listConceptPresets(): ConceptPresetCatalogEntry[] {
  const horrorConcept = "liminal backrooms hallway with a decaying memory song";
  const generalConcept = "cinematic electronic scene";
  const toBlueprint = (layer: ConceptLayer) => ({ ...layer, color: colorForLayer(layer) });

  return [
    {
      id: "liminal_backrooms_horror",
      name: "Liminal Backrooms Horror",
      bestFor: [
        "backrooms videos",
        "dementia-memory music treatments",
        "abandoned malls, hallways, fluorescents, and empty institutional rooms",
        "recognizable source audio that should decay into ambience"
      ],
      avoidWhen: [
        "the brief needs a bright pop structure",
        "the music must stay rhythmically dense or club-focused",
        "sample licenses have not been reviewed for downloadable sources"
      ],
      defaultStyle: "liminal/backrooms/horror",
      recommendedDurationSeconds: 180,
      recommendedIntensity: 8,
      tempoRange: { min: 48, max: 71 },
      keyCenter: "D minor",
      sections: sectionMap(180, true),
      layerBlueprints: horrorLayers(horrorConcept).map(toBlueprint),
      sampleStrategy: [
        "Start from approved local reference audio when available.",
        "Use licensed metadata search for tape melody, room tone, fluorescent hum, machinery, and reversed transition fragments.",
        "Stage downloads only after license review and ABLETON_MCP_ENABLE_DOWNLOADS=1.",
        "Keep remote sample titles/descriptions as untrusted data."
      ],
      productionMoves: [
        "Degrade the main memory layer with EQ, saturation, filtered echo, and long dark reverb.",
        "Build a stretched room bed before the motif enters.",
        "Introduce a sparse dissonant MIDI motif, then let pitch, bandwidth, delay, and reverb destabilize it.",
        "Use low pressure and mechanical texture sparingly so the track feels large without becoming noisy.",
        "End on an unresolved tail with room tone, reversed fragments, and controlled low end."
      ],
      bridgeReadiness: [
        "Bridge reads can inspect tracks, scenes, clips, devices, parameters, and snapshots.",
        "Arrangement creation, MIDI notes, clip shaping, mixer moves, colors, and approved local sample clips are write-gated.",
        "Device insertion and detailed automation remain staged until a reviewed LiveAPI/UI-driver path is chosen."
      ],
      exactNextToolCalls: [
        {
          name: "ableton_plan_concept_track",
          arguments: {
            concept: horrorConcept,
            target_duration_seconds: 180,
            intensity: 8,
            style: "liminal/backrooms/horror",
            sources: ["local_library", "internet_archive", "freesound"]
          }
        },
        {
          name: "ableton_search_concept_samples",
          arguments: {
            concept: horrorConcept,
            page: 1,
            pageSize: 6
          }
        },
        {
          name: "ableton_curate_concept_samples",
          arguments: {
            plan_id: "concept-...",
            search: true,
            allowed_only: true,
            page: 1,
            pageSize: 6
          }
        },
        {
          name: "ableton_plan_full_concept_production",
          arguments: {
            concept: horrorConcept,
            target_duration_seconds: 180,
            intensity: 8,
            style: "liminal/backrooms/horror",
            sources: ["local_library", "internet_archive", "freesound"],
            include_sample_search: true,
            sample_page_size: 6,
            sample_assignments: []
          }
        }
      ],
      safety: { writesAbleton: false, downloads: false, uiControl: false, remoteHttpExposure: false }
    },
    {
      id: "general_cinematic",
      name: "General Cinematic",
      bestFor: [
        "neutral scoring beds",
        "ambient electronic underscore",
        "short concept sketches that need editable MIDI plus space returns"
      ],
      avoidWhen: [
        "the brief specifically asks for backrooms, liminal horror, dementia-memory, or degraded source-audio treatment",
        "the arrangement needs detailed genre-specific drums or vocals"
      ],
      defaultStyle: "cinematic electronic",
      recommendedDurationSeconds: 120,
      recommendedIntensity: 6,
      tempoRange: { min: 84, max: 96 },
      keyCenter: "A minor",
      sections: sectionMap(120, false),
      layerBlueprints: generalLayers(generalConcept).map(toBlueprint),
      sampleStrategy: [
        "Use one approved ambience or texture as the bed.",
        "Keep the MIDI motif editable and separate from the ambience layer.",
        "Use shared reverb and delay returns for cohesion.",
        "Review licenses before downloading or importing external samples."
      ],
      productionMoves: [
        "Establish a clean atmosphere, introduce a sparse motif, then develop texture and space.",
        "Use EQ, compression, reverb, and delay before adding more layers.",
        "Keep automation focused on filter movement, send throws, and return shaping."
      ],
      bridgeReadiness: [
        "The arrangement planner can create tracks, returns, scenes, MIDI clips, and mixer setup through dry-run/write-gated actions.",
        "Sample placement needs approved local paths.",
        "Device and automation plans are discovery-first and remain non-writing by default."
      ],
      exactNextToolCalls: [
        {
          name: "ableton_plan_concept_track",
          arguments: {
            concept: generalConcept,
            target_duration_seconds: 120,
            intensity: 6,
            style: "cinematic electronic",
            sources: ["local_library", "internet_archive"]
          }
        },
        {
          name: "ableton_plan_full_concept_production",
          arguments: {
            concept: generalConcept,
            target_duration_seconds: 120,
            intensity: 6,
            style: "cinematic electronic",
            sources: ["local_library", "internet_archive"],
            include_sample_search: false,
            sample_page_size: 4,
            sample_assignments: []
          }
        },
        {
          name: "ableton_curate_concept_samples",
          arguments: {
            plan_id: "concept-...",
            search: false,
            allowed_only: true,
            page: 1,
            pageSize: 4
          }
        }
      ],
      safety: { writesAbleton: false, downloads: false, uiControl: false, remoteHttpExposure: false }
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
  const createdSceneOffset = typeof payload.scene_created_offset === "number" ? payload.scene_created_offset : null;

  if (createdTrackOffset !== null) {
    payload.track_id = resolution.baseTrackCount + createdTrackOffset;
    payload.track_index = resolution.baseTrackCount + createdTrackOffset;
    delete payload.track_created_offset;
  }

  if (createdReturnOffset !== null) {
    const returnTrackIndex = resolution.baseReturnTrackCount + createdReturnOffset;
    if (action.action === "ableton_set_return_track_volume" || action.action === "ableton_set_return_track_pan" || action.action === "ableton_set_return_track_color") {
      payload.return_track_index = returnTrackIndex;
    } else {
      payload.send_index = returnTrackIndex;
    }
    delete payload.return_created_offset;
  }

  if (createdSceneOffset !== null) {
    payload.scene_index = resolution.baseSceneCount + createdSceneOffset;
    delete payload.scene_created_offset;
  }

  return payload;
}

function dataFromBridgeResponse(snapshot: unknown): Record<string, unknown> {
  const response = snapshot as { data?: unknown };
  return response.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : {};
}

function bridgeSetupHints(error?: unknown) {
  const fromError = error as { nextSteps?: unknown };
  if (Array.isArray(fromError?.nextSteps)) {
    return fromError.nextSteps.filter((step): step is string => typeof step === "string");
  }
  return [
    "Open Ableton Live.",
    "Install/load the Max for Live bridge from bridge/max-for-live.",
    "Retry ableton_bridge_ping or ableton_preflight_concept_execution."
  ];
}

function clipSlotIssue(snapshot: unknown, action: ArrangementAction, payload: Record<string, unknown>) {
  if (action.action !== "ableton_load_preset_or_sample" && action.action !== "ableton_insert_midi_notes") return null;
  if (typeof action.payload.track_created_offset === "number") return null;
  const trackIndex = typeof payload.track_index === "number" ? payload.track_index : null;
  const clipSlotIndex = typeof payload.clip_slot_index === "number" ? payload.clip_slot_index : null;
  if (trackIndex === null || clipSlotIndex === null) return null;
  const tracks = dataFromBridgeResponse(snapshot).tracks;
  if (!Array.isArray(tracks)) return null;
  const track = tracks.find((entry) => {
    const record = entry as { index?: unknown };
    return Number(record.index) === trackIndex;
  }) as { clips?: unknown } | undefined;
  const clips = track?.clips;
  if (!Array.isArray(clips)) return null;
  const slot = clips.find((entry) => {
    const record = entry as { slot_index?: unknown };
    return Number(record.slot_index) === clipSlotIndex;
  }) as { has_clip?: unknown } | undefined;
  if (!slot || slot.has_clip !== true) return null;
  return {
    severity: "blocker",
    code: "CLIP_SLOT_OCCUPIED",
    action: action.action,
    message: `Track ${trackIndex} clip slot ${clipSlotIndex} already contains a clip.`
  };
}

function redactActionPayload(payload: Record<string, unknown>) {
  const redacted = { ...payload };
  if (typeof redacted.path === "string") redacted.path = redactPath(redacted.path);
  return redacted;
}

export function redactExecutionJournalValue(value: unknown): unknown {
  if (typeof value === "string") return redactPath(value);
  if (Array.isArray(value)) return value.map((item) => redactExecutionJournalValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    redactExecutionJournalValue(entry)
  ]));
}

export function extractUnsupportedBridgeResult(response: unknown) {
  const envelope = response && typeof response === "object" ? response as { data?: unknown } : {};
  const data = envelope.data && typeof envelope.data === "object"
    ? envelope.data as Record<string, unknown>
    : response && typeof response === "object"
      ? response as Record<string, unknown>
      : null;
  if (!data || data.unsupported !== true) return null;
  return {
    action: typeof data.action === "string" ? data.action : null,
    reason: typeof data.reason === "string" ? data.reason : "Bridge reported this action as unsupported.",
    nextSteps: Array.isArray(data.nextSteps)
      ? data.nextSteps.filter((step): step is string => typeof step === "string")
      : [],
    details: data.details ?? null
  };
}

type ConceptExecutionJournalState = {
  id: string;
  path: string;
  redactedPath: string;
  journal: ConceptExecutionJournal;
};

function journalError(error: unknown) {
  if (error instanceof AbletonMcpError) {
    return { name: error.name, code: error.code, message: error.message, nextSteps: error.nextSteps };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

async function writeConceptExecutionJournal(state: ConceptExecutionJournalState) {
  state.journal.updatedAt = new Date().toISOString();
  await fs.writeFile(state.path, `${JSON.stringify(state.journal, null, 2)}\n`);
}

export async function startConceptExecutionJournal(input: {
  arrangement_id: string;
  approval_id: string;
  executableActions: number;
  totalActions: number;
}) {
  const dir = conceptExecutionDir();
  await fs.mkdir(dir, { recursive: true });
  const id = `execution-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const target = path.join(dir, `${id}.json`);
  const now = new Date().toISOString();
  const state: ConceptExecutionJournalState = {
    id,
    path: target,
    redactedPath: redactPath(target),
    journal: {
      id,
      arrangement_id: input.arrangement_id,
      approval_id: input.approval_id,
      startedAt: now,
      updatedAt: now,
      status: "running",
      executableActions: input.executableActions,
      totalActions: input.totalActions,
      events: []
    }
  };
  await fs.writeFile(target, `${JSON.stringify(state.journal, null, 2)}\n`, { flag: "wx" });
  return state;
}

export async function recordConceptExecutionJournalEvent(
  state: ConceptExecutionJournalState,
  event: Record<string, unknown>,
  status?: "running" | "completed" | "failed"
) {
  if (status) state.journal.status = status;
  state.journal.events.push(redactExecutionJournalValue({
    at: new Date().toISOString(),
    ...event
  }) as Record<string, unknown>);
  await writeConceptExecutionJournal(state);
  return {
    id: state.id,
    path: state.redactedPath,
    status: state.journal.status,
    events: state.journal.events.length
  };
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

function actionPhase(action: string) {
  if (action === "ableton_set_tempo") return "global_setup";
  if (action.includes("_track") || action === "ableton_rename_return_track") return "track_and_return_setup";
  if (action.includes("_scene")) return "scene_setup";
  if (action === "ableton_create_arrangement_marker") return "arrangement_markers";
  if (action.includes("_volume") || action.includes("_pan") || action === "ableton_set_track_send") return "mixer_setup";
  if (action === "ableton_insert_midi_notes") return "midi_motif";
  if (action === "ableton_load_preset_or_sample") return "sample_placement";
  if (action.includes("_clip") || action.includes("transpose")) return "clip_shaping";
  return "other";
}

function actionPlaceholderSummary(action: ArrangementAction) {
  return {
    track_created_offset: typeof action.payload.track_created_offset === "number",
    return_created_offset: typeof action.payload.return_created_offset === "number",
    scene_created_offset: typeof action.payload.scene_created_offset === "number"
  };
}

function actionNeedsApprovedSample(action: ArrangementAction) {
  return action.action === "ableton_load_preset_or_sample" && typeof action.payload.path === "string";
}

function actionForExecutionReport(action: ArrangementAction, index: number) {
  return {
    index,
    action: action.action,
    phase: actionPhase(action.action),
    safeToExecute: action.safeToExecute,
    reason: action.reason,
    payload: redactActionPayload(action.payload),
    placeholders: actionPlaceholderSummary(action),
    requiresApprovedLocalSample: actionNeedsApprovedSample(action),
    executionGate: action.safeToExecute ? "ABLETON_MCP_ENABLE_WRITE=1 plus dry_run=false" : "not_executable"
  };
}

function bridgeCapabilityByAction() {
  return new Map<string, BridgeActionCapability>(
    (getBridgeCapabilityMatrix().actions as BridgeActionCapability[]).map((entry) => [entry.action, entry])
  );
}

function unknownBridgeCapability(action: string): BridgeActionCapability {
  return {
    action,
    tool: action,
    status: "unsupported",
    domain: "unknown",
    notes: "This action is not present in the local bridge capability matrix."
  };
}

function countByString<T>(items: T[], keyFor: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function actionMatrixDependencies(action: ArrangementAction, placeholders: ReturnType<typeof actionPlaceholderSummary>) {
  const dependencies = [];
  if (placeholders.track_created_offset || placeholders.return_created_offset || placeholders.scene_created_offset) {
    dependencies.push("live_bridge_snapshot_resolution");
  }
  if (action.action === "ableton_set_track_send") {
    dependencies.push("return_track_send_index_resolution");
  }
  if (action.action === "ableton_insert_midi_notes") {
    dependencies.push("empty_or_created_midi_clip_slot");
  }
  if (action.action === "ableton_load_preset_or_sample") {
    dependencies.push("approved_local_sample_path");
    dependencies.push("empty_audio_clip_slot");
  }
  if (action.action.includes("_clip") && action.action !== "ableton_create_clip" && action.action !== "ableton_create_midi_clip") {
    dependencies.push("existing_target_clip");
  }
  return dependencies;
}

function actionMatrixNotes(
  action: ArrangementAction,
  capability: BridgeActionCapability,
  unresolvedPlaceholders: boolean
) {
  const notes = [];
  if (!action.safeToExecute) notes.push("This stored action is marked not safe and will be skipped by the executor.");
  if (capability.status === "unsupported") notes.push(capability.notes ?? "The bridge reports this action as unsupported.");
  if (unresolvedPlaceholders) notes.push("Generated track, return, or scene offsets require live bridge preflight before direct action calls.");
  if (actionNeedsApprovedSample(action)) notes.push("The approved local sample path is redacted in reports; execute through the stored plan, not copied direct calls.");
  return notes;
}

function actionMatrixGate(action: ArrangementAction, capability: BridgeActionCapability) {
  if (!action.safeToExecute) return "not_executable";
  if (capability.status === "unsupported") return "unsupported_by_current_bridge";
  if (capability.status === "write_gated") return "ableton_execute_concept_plan dry_run=false plus ABLETON_MCP_ENABLE_WRITE=1 plus matching approval_id";
  if (capability.status === "read_only" || capability.status === "diagnostic") return "read_only";
  return "unknown";
}

export async function renderConceptExecutionActionMatrix(options: ConceptExecutionActionMatrixOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const capabilityMap = bridgeCapabilityByAction();
  const checkBridge = options.check_bridge === true;
  const bridge = {
    checked: checkBridge,
    reachable: null as boolean | null,
    resolution: null as CreatedTrackResolution | null,
    error: null as string | null,
    nextSteps: [] as string[]
  };

  if (checkBridge) {
    try {
      bridge.resolution = bridgeSnapshotResolution(await getBridgeSnapshot(false));
      bridge.reachable = true;
    } catch (error) {
      bridge.reachable = false;
      bridge.error = error instanceof Error ? error.message : String(error);
      bridge.nextSteps = bridgeSetupHints(error);
    }
  }

  const actions = arrangement.actions.map((action, index) => {
    const placeholders = actionPlaceholderSummary(action);
    const unresolvedPlaceholders = Object.values(placeholders).some(Boolean) && !bridge.resolution;
    const capability = capabilityMap.get(action.action) ?? unknownBridgeCapability(action.action);
    const resolvedPayload = bridge.resolution ? actionPayloadWithCreatedTrack(action, bridge.resolution) : null;
    const directDryRunAvailable = action.safeToExecute
      && capability.status === "write_gated"
      && !unresolvedPlaceholders
      && !actionNeedsApprovedSample(action);
    return {
      index,
      action: action.action,
      phase: actionPhase(action.action),
      safeToExecute: action.safeToExecute,
      reason: action.reason,
      payloadTemplate: redactActionPayload(action.payload),
      resolvedPayload: resolvedPayload ? redactActionPayload(resolvedPayload) : null,
      placeholders,
      dependencies: actionMatrixDependencies(action, placeholders),
      bridgeCapability: {
        action: capability.action,
        tool: capability.tool ?? action.action,
        status: capability.status,
        domain: capability.domain,
        requiresWriteGate: capability.requiresWriteGate === true,
        dryRunFirst: capability.dryRunFirst === true,
        notes: capability.notes ?? null
      },
      requiresApprovedLocalSample: actionNeedsApprovedSample(action),
      executionGate: actionMatrixGate(action, capability),
      realExecutionReady: action.safeToExecute
        && capability.status === "write_gated"
        && bridge.reachable === true
        && !unresolvedPlaceholders,
      directDryRunToolCall: directDryRunAvailable
        ? { name: action.action, arguments: { ...redactActionPayload(resolvedPayload ?? action.payload), dry_run: true } }
        : null,
      directDryRunBlockedReason: directDryRunAvailable
        ? null
        : actionNeedsApprovedSample(action)
          ? "Approved sample paths are intentionally redacted; use the stored-plan executor dry run."
          : unresolvedPlaceholders
            ? "Run with check_bridge=true after the bridge is loaded to resolve generated indexes."
            : capability.status !== "write_gated"
              ? `Bridge capability status is ${capability.status}.`
              : action.safeToExecute ? null : "Action is not safe to execute.",
      notes: actionMatrixNotes(action, capability, unresolvedPlaceholders)
    };
  });

  return {
    planType: "concept_execution_action_matrix",
    arrangement_id: arrangement.id,
    conceptPlanId: arrangement.conceptPlanId,
    safety: {
      readOnly: true,
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      arbitraryBridgePayloads: false,
      storedPlanOnly: true,
      realWritesRequire: [
        "ABLETON_MCP_ENABLE_WRITE=1",
        "dry_run=false",
        "matching approval_id",
        "approval_confirmed=true",
        "successful bridge preflight"
      ]
    },
    bridge,
    summary: {
      totalActions: actions.length,
      safeActions: actions.filter((action) => action.safeToExecute).length,
      skippedActions: actions.filter((action) => !action.safeToExecute).length,
      phases: countByString(actions, (action) => action.phase),
      bridgeStatusCounts: countByString(actions, (action) => String(action.bridgeCapability.status)),
      bridgeDomains: countByString(actions, (action) => String(action.bridgeCapability.domain)),
      requiresPlaceholderResolution: actions.filter((action) => Object.values(action.placeholders).some(Boolean)).length,
      approvedSamplePlacements: actions.filter((action) => action.requiresApprovedLocalSample).length,
      directDryRunToolCalls: actions.filter((action) => action.directDryRunToolCall !== null).length,
      realExecutionReadyActions: actions.filter((action) => action.realExecutionReady).length,
      stagedDeviceChains: arrangement.devicePlan.length,
      stagedAutomationTargets: arrangement.automationPlan.length
    },
    actions,
    stagedReview: {
      devicePlan: arrangement.devicePlan,
      automationPlan: arrangement.automationPlan,
      reason: "Device insertion and automation breakpoint writing remain staged until the loaded bridge reports reliable support."
    },
    exactNextToolCalls: {
      preflight: { name: "ableton_preflight_concept_execution", arguments: { arrangement_id: arrangement.id, check_bridge: true } },
      executionManifest: { name: "ableton_render_concept_execution_manifest", arguments: { arrangement_id: arrangement.id } },
      approvalBundle: { name: "ableton_create_concept_execution_approval_bundle", arguments: { arrangement_id: arrangement.id, check_bridge: true } },
      dryRunExecution: { name: "ableton_execute_concept_plan", arguments: { arrangement_id: arrangement.id, dry_run: true } },
      realExecutionTemplate: { name: "ableton_execute_concept_plan", arguments: { arrangement_id: arrangement.id, approval_id: "approval-...", approval_confirmed: true, dry_run: false } }
    },
    nextSteps: bridge.reachable === true
      ? [
        "Review resolvedPayload and stagedReview before approving real execution.",
        "Run the approval bundle and dry-run executor before setting ABLETON_MCP_ENABLE_WRITE=1."
      ]
      : [
        "Use this matrix to audit the stored plan without side effects.",
        "Open Ableton, load the bridge, then rerun with check_bridge=true to resolve generated track, return, and scene indexes.",
        "Keep real execution behind the approval bundle and write gate."
      ]
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
  const baseSceneCount = Number((response.data?.state as { scene_count?: unknown } | undefined)?.scene_count ?? (response.data as { scenes?: unknown[] } | undefined)?.scenes?.length ?? 0);
  return {
    baseTrackCount: Number.isFinite(baseTrackCount) && baseTrackCount >= 0 ? Math.floor(baseTrackCount) : 0,
    baseReturnTrackCount: Number.isFinite(baseReturnTrackCount) && baseReturnTrackCount >= 0 ? Math.floor(baseReturnTrackCount) : 0,
    baseSceneCount: Number.isFinite(baseSceneCount) && baseSceneCount >= 0 ? Math.floor(baseSceneCount) : 0
  };
}

function automationTargetName(automation: string): ArrangementPlan["automationPlan"][number]["target"] {
  const text = automation.toLowerCase();
  if (text.includes("reverb")) return "reverb";
  if (text.includes("delay") || text.includes("feedback")) return "delay";
  if (text.includes("filter") || text.includes("bandwidth") || text.includes("low-pass")) return "filter";
  if (text.includes("volume") || text.includes("fade") || text.includes("swell") || text.includes("mute")) return "volume";
  if (text.includes("velocity")) return "midi_velocity";
  return "unknown";
}

function deviceInsertTool(device: string) {
  return /wavetable|operator|simpler|sampler|instrument rack|drum rack/i.test(device)
    ? "ableton_insert_instrument"
    : "ableton_insert_effect";
}

function automationParameterHints(target: ArrangementPlan["automationPlan"][number]["target"]) {
  if (target === "filter") return ["Frequency", "Cutoff", "Filter Freq"];
  if (target === "delay") return ["Feedback", "Dry/Wet", "Filter"];
  if (target === "reverb") return ["Dry/Wet", "Decay Time", "Size"];
  if (target === "volume") return ["Mixer volume"];
  if (target === "midi_velocity") return ["MIDI note velocity", "Use ableton_get_clip_notes before editing notes."];
  return ["Use ableton_get_device_parameter_map to choose a reviewed parameter."];
}

function automationSummaryDiscoveryCall(trackIndex: number, target: ArrangementPlan["automationPlan"][number]["target"]) {
  return {
    name: "ableton_extract_automation_summary",
    arguments: {
      track_index: trackIndex,
      include_devices: target !== "volume",
      max_parameters: target === "volume" ? 16 : 64
    }
  };
}

function automationCandidateTargetTypes(target: ArrangementPlan["automationPlan"][number]["target"]) {
  if (target === "volume") return ["track_volume", "device_parameter"];
  if (target === "reverb" || target === "delay") return ["track_send", "device_parameter"];
  if (target === "filter") return ["device_parameter"];
  if (target === "midi_velocity") return ["clip_notes"];
  return ["device_parameter"];
}

function automationBridgeTargetMatches(target: ArrangementPlan["automationPlan"][number]["target"], candidate: Record<string, unknown>) {
  const targetType = String(candidate.target_type ?? "").toLowerCase();
  const text = [
    candidate.parameter_name,
    candidate.device_name,
    candidate.device_class_name,
    candidate.target_id,
    targetType
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");

  if (target === "volume") return targetType === "track_volume" || /\b(volume|gain|level|utility)\b/.test(text);
  if (target === "reverb") return targetType === "track_send" || /reverb|dry\/wet|decay|size/.test(text);
  if (target === "delay") return targetType === "track_send" || /echo|delay|feedback|dry\/wet/.test(text);
  if (target === "filter") return /filter|cutoff|frequency|freq|bandwidth|eq eight/.test(text);
  return false;
}

function automationBridgeTargetSummary(target: ArrangementPlan["automationPlan"][number]["target"], response: unknown) {
  const container = response && typeof response === "object" && "data" in response
    ? (response as { data?: unknown }).data
    : response;
  const data = container && typeof container === "object" ? container as Record<string, unknown> : {};
  const targets = Array.isArray(data.targets) ? data.targets.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object") : [];
  const matchingTargets = targets
    .filter((entry) => automationBridgeTargetMatches(target, entry))
    .slice(0, 8)
    .map((entry) => ({
      target_id: String(entry.target_id ?? ""),
      target_type: String(entry.target_type ?? ""),
      parameter_name: String(entry.parameter_name ?? ""),
      device_name: entry.device_name === null || entry.device_name === undefined ? null : String(entry.device_name),
      parameter_index: typeof entry.parameter_index === "number" ? entry.parameter_index : null,
      current_value_write_tool: entry.current_value_write_tool ?? null,
      automation_write_supported: entry.automation_write_supported === true
    }));

  return {
    available: targets.length > 0,
    targetCount: targets.length,
    matchingTargetCount: matchingTargets.length,
    candidateTargetTypes: automationCandidateTargetTypes(target),
    availableTargetTypes: [...new Set(targets.map((entry) => String(entry.target_type ?? "")).filter(Boolean))],
    matchingTargets,
    support: data.support ?? null
  };
}

function devicesForAutomation(target: ArrangementPlan["automationPlan"][number]["target"], devices: string[]) {
  const patterns = {
    reverb: /reverb/i,
    delay: /echo|delay/i,
    filter: /filter|eq eight/i,
    volume: /utility|compressor/i,
    midi_velocity: /.^/,
    unknown: /.^/
  } satisfies Record<ArrangementPlan["automationPlan"][number]["target"], RegExp>;
  return devices.filter((device) => patterns[target].test(device));
}

function sampleClipShapeForLayer(layerName: string, horror: boolean) {
  const text = layerName.toLowerCase();
  const clipLength = horror ? 16 : 8;
  const gain = horror
    ? text.includes("distant room") ? 0.42 : text.includes("mechanical") ? 0.52 : text.includes("low") ? 0.58 : 0.65
    : 0.78;
  const semitones = horror
    ? text.includes("distant room") ? -7 : text.includes("stretched") || text.includes("room") ? -12 : text.includes("reversed") ? -7 : text.includes("degraded") ? -5 : text.includes("mechanical") ? -3 : -2
    : 0;
  const cents = horror ? (text.includes("distant room") ? -11 : text.includes("mechanical") ? -3 : -7) : 0;
  const warpMode = text.includes("stretched") || text.includes("room")
    ? "texture"
    : text.includes("mechanical")
      ? "beats"
      : text.includes("degraded")
        ? "complex"
        : "re-pitch";
  return { clipLength, gain, semitones, cents, warpMode };
}

function colorForLayer(layer: ConceptLayer) {
  const text = layer.name.toLowerCase();
  if (layer.type === "return") return text.includes("delay") ? 0xB48EAD : 0x5E81AC;
  if (layer.type === "midi") return 0xA3BE8C;
  if (text.includes("degraded")) return 0xD08770;
  if (text.includes("stretched") || text.includes("room")) return 0x88C0D0;
  if (text.includes("low")) return 0x4C566A;
  if (text.includes("mechanical")) return 0xEBCB8B;
  if (text.includes("reversed")) return 0xBF616A;
  return 0x81A1C1;
}

function colorForSection(index: number) {
  const colors = [0x3B4252, 0xA3BE8C, 0xD08770, 0xBF616A, 0x5E81AC];
  return colors[index % colors.length];
}

function layerIsActiveInSection(layer: ConceptLayer, sectionIndex: number, horror: boolean) {
  if (!horror) return layer.type === "return" || sectionIndex > 0;
  const name = layer.name.toLowerCase();
  if (layer.type === "return") return true;
  if (name.includes("distant room")) return true;
  if (name.includes("degraded")) return sectionIndex === 1 || sectionIndex === 2;
  if (name.includes("stretched") || name.includes("room")) return sectionIndex === 0 || sectionIndex >= 3;
  if (name.includes("low")) return sectionIndex === 0 || sectionIndex >= 2;
  if (name.includes("mechanical")) return sectionIndex === 2 || sectionIndex === 3;
  if (name.includes("reversed")) return sectionIndex >= 3;
  if (name.includes("sparse") || name.includes("motif")) return sectionIndex === 1 || sectionIndex === 2;
  return sectionIndex > 0;
}

function layerSectionRole(layer: ConceptLayer, sectionIndex: number, horror: boolean) {
  if (!layerIsActiveInSection(layer, sectionIndex, horror)) return "inactive";
  if (sectionIndex === 0) return layer.type === "return" ? "space" : "establish";
  const wasActive = sectionIndex > 0 && layerIsActiveInSection(layer, sectionIndex - 1, horror);
  const name = layer.name.toLowerCase();
  if (name.includes("distant room")) return sectionIndex === 0 ? "establish" : "constant_distance";
  if (!wasActive && layer.type !== "return") return "entrance";
  if (name.includes("motif") || name.includes("degraded")) return "featured";
  if (name.includes("low") || layer.type === "return") return "support";
  return "texture";
}

function sectionProductionFocus(section: ConceptSection, sectionIndex: number, horror: boolean) {
  if (!horror) return section.intent;
  const focus = [
    "Establish room tone, low pressure, and long dark space before any clear motif appears.",
    "Introduce the degraded recognizable memory and sparse motif; keep it fragile and partly buried.",
    "Loop the memory while bandwidth, pitch, mechanical texture, delay, and reverb start to destabilize.",
    "Push stretched ambience, reversed fragments, low pressure, and mechanical texture into the foreground.",
    "Let the arrangement empty out into unresolved room tone, low pressure, reverb, and reversed tail fragments."
  ];
  return focus[sectionIndex] ?? section.intent;
}

function plannedTargetResolution(
  plan: { target: "track" | "return"; track_created_offset?: number; return_created_offset?: number },
  resolution?: CreatedTrackResolution
) {
  if (plan.target === "return") {
    if (typeof plan.return_created_offset !== "number") return { kind: "return", status: "unresolved" };
    return resolution
      ? { kind: "return", status: "resolved", return_track_index: resolution.baseReturnTrackCount + plan.return_created_offset }
      : { kind: "return", status: "requires_bridge_preflight", return_created_offset: plan.return_created_offset };
  }
  if (typeof plan.track_created_offset !== "number") return { kind: "track", status: "unresolved" };
  return resolution
    ? { kind: "track", status: "resolved", track_index: resolution.baseTrackCount + plan.track_created_offset }
    : { kind: "track", status: "requires_bridge_preflight", track_created_offset: plan.track_created_offset };
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

function validateConceptExecutionJournalId(executionId: string) {
  if (!/^execution-\d+-[a-f0-9]{8}$/.test(executionId)) throw new Error("Invalid concept execution journal id.");
  return executionId;
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

async function listStoredExecutionJournalFiles() {
  const dir = conceptExecutionDir();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^execution-\d+-[a-f0-9]{8}\.json$/.test(entry.name))
      .slice(0, 500)
      .map((entry) => path.join(dir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function safeJournalStatus(value: unknown): "running" | "completed" | "failed" | "unknown" {
  return value === "running" || value === "completed" || value === "failed" ? value : "unknown";
}

function journalEventType(event: unknown) {
  return event && typeof event === "object" && typeof (event as Record<string, unknown>).type === "string"
    ? String((event as Record<string, unknown>).type)
    : null;
}

function summarizeConceptExecutionJournal(journal: Partial<ConceptExecutionJournal>, filePath: string, modifiedAt: string) {
  const events = Array.isArray(journal.events) ? journal.events : [];
  const latestEventType = events.length > 0 ? journalEventType(events[events.length - 1]) : null;
  const failedEventCount = events.filter((event) => {
    const type = journalEventType(event);
    return type === "preflight_not_ready" || type === "preflight_failed" || type === "action_failed" || type === "action_unsupported";
  }).length;
  const unsupportedActionCount = events.filter((event) => journalEventType(event) === "action_unsupported").length;
  const id = typeof journal.id === "string" ? journal.id : path.basename(filePath, ".json");
  const arrangementId = typeof journal.arrangement_id === "string" ? journal.arrangement_id : "";

  return {
    id,
    type: "concept_execution",
    path: redactPath(filePath),
    arrangement_id: arrangementId,
    approval_id: typeof journal.approval_id === "string" ? journal.approval_id : "",
    startedAt: typeof journal.startedAt === "string" ? journal.startedAt : null,
    updatedAt: typeof journal.updatedAt === "string" ? journal.updatedAt : null,
    modifiedAt,
    status: safeJournalStatus(journal.status),
    executableActions: typeof journal.executableActions === "number" ? journal.executableActions : null,
    totalActions: typeof journal.totalActions === "number" ? journal.totalActions : null,
    eventCount: events.length,
    latestEventType,
    failedEventCount,
    unsupportedActionCount,
    exactNextToolCalls: {
      inspectJournal: { name: "ableton_get_concept_execution_journal", arguments: { execution_id: id } },
      inspectArrangement: /^arrangement-[a-f0-9]{16}$/.test(arrangementId)
        ? { name: "ableton_get_arrangement_plan", arguments: { arrangement_id: arrangementId } }
        : null
    }
  };
}

export async function getConceptPlanForReport(planId: string) {
  return conceptForReport(await readConceptPlan(planId));
}

export async function getArrangementPlanForReport(arrangementId: string) {
  return arrangementForReport(await readArrangementPlan(arrangementId));
}

export async function readConceptExecutionJournal(executionId: string) {
  const id = validateConceptExecutionJournalId(executionId);
  const filePath = path.join(conceptExecutionDir(), `${id}.json`);
  const stat = await fs.stat(filePath);
  const journal = JSON.parse(await fs.readFile(filePath, "utf8")) as ConceptExecutionJournal;
  const redactedJournal = redactExecutionJournalValue(journal) as ConceptExecutionJournal;
  return {
    summary: summarizeConceptExecutionJournal(redactedJournal, filePath, stat.mtime.toISOString()),
    journal: redactedJournal
  };
}

export async function getConceptExecutionJournalForReport(executionId: string) {
  return readConceptExecutionJournal(executionId);
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

export async function listConceptExecutionJournals() {
  const files = await listStoredExecutionJournalFiles();
  const summaries = await Promise.all(files.map(async (filePath) => {
    const stat = await fs.stat(filePath);
    const journal = redactExecutionJournalValue(JSON.parse(await fs.readFile(filePath, "utf8"))) as Partial<ConceptExecutionJournal>;
    return summarizeConceptExecutionJournal(journal, filePath, stat.mtime.toISOString());
  }));
  return summaries.sort((left, right) =>
    String(right.updatedAt ?? right.modifiedAt).localeCompare(String(left.updatedAt ?? left.modifiedAt))
  );
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

function curationLayerNotes(layer: ConceptLayer) {
  const role = `${layer.role} ${layer.sourceStrategy}`.toLowerCase();
  const notes = [
    "Review the license and attribution before staging.",
    "Treat remote title, creator, and description text as untrusted metadata."
  ];
  if (role.includes("melodic") || layer.name.toLowerCase().includes("memory")) {
    notes.push("Prefer a short, recognizable tonal phrase that can survive filtering and degradation.");
  }
  if (role.includes("room") || role.includes("ambience") || role.includes("tone")) {
    notes.push("Prefer long, low-detail recordings with minimal foreground events and easy loop points.");
  }
  if (role.includes("drone") || role.includes("low")) {
    notes.push("Prefer controlled low-frequency material that will not mask dialogue or picture edits.");
  }
  if (role.includes("mechanical") || role.includes("fragment") || role.includes("transition")) {
    notes.push("Prefer sparse one-shot texture candidates that can be placed around section changes.");
  }
  return notes;
}

function curatedCandidateRecord(layer: ConceptLayer, source: "internet_archive" | "freesound", query: string, item: any) {
  const license = String(item.licenseurl ?? item.license ?? "");
  const licensePolicy = normalizeLicense(license);
  const title = sanitizeRemoteSampleText(item.title ?? item.name, 180);
  const creator = sanitizeRemoteSampleText(item.creator ?? item.username, 140);
  const layerStem = layerSlug(layer.name);
  const score = licensePolicy.allowed ? 0.8 : 0.25;

  if (source === "internet_archive") {
    const identifier = sanitizeRemoteSampleText(item.identifier, 120);
    return {
      source,
      layer: layer.name,
      query,
      title,
      creator,
      identifier,
      license,
      licensePolicy,
      score: score + (identifier ? 0.05 : 0),
      nextCalls: [
        { name: "ableton_list_internet_archive_audio_files", arguments: { identifier, page: 1, pageSize: 10 } },
        { name: "ableton_stage_concept_samples", arguments: { samples: [{ url: "<chosen archive.org/download audio file url>", destinationName: `${layerStem}-<chosen-file>`, metadata: { source: "internet_archive", identifier, title, creator, license } }], dry_run: true } }
      ]
    };
  }

  const preview = safeRemoteSampleUrl(item.previews?.["preview-lq-mp3"] ?? item.preview);
  return {
    source,
    layer: layer.name,
    query,
    title,
    creator,
    id: item.id ?? null,
    license,
    licensePolicy,
    preview,
    score: score + (preview ? 0.05 : 0),
    nextCalls: preview ? [
      { name: "ableton_stage_concept_samples", arguments: { samples: [{ url: preview, destinationName: `${layerStem}-${item.id ?? "preview"}.mp3`, metadata: { source: "freesound", id: item.id, title, creator, license } }], dry_run: true } }
    ] : [
      { name: "ableton_search_freesound", arguments: { query, page: 1, pageSize: 5 } }
    ]
  };
}

export async function curateConceptSamples(options: ConceptSampleCurationOptions) {
  const plan = await readConceptPlan(options.plan_id);
  const maxLayers = Math.max(1, Math.min(12, Math.trunc(options.max_layers ?? 8)));
  const page = Math.max(1, Math.trunc(options.page || 1));
  const pageSize = Math.max(1, Math.min(12, Math.trunc(options.pageSize || 5)));
  const search = options.search === true;
  const allowedOnly = options.allowed_only !== false;
  const layers = plan.layers
    .filter((layer) => layer.type === "audio" && layer.searchQueries.length > 0)
    .slice(0, maxLayers);
  const accessIssues: Array<Record<string, unknown>> = [];
  const layerCuration = [];

  for (const layer of layers) {
    const queries = [...new Set(layer.searchQueries.map((query) => sanitizeRemoteSampleText(query, 160)).filter(Boolean))].slice(0, 3);
    const candidates = [];

    if (search) {
      for (const query of queries.slice(0, 2)) {
        if (plan.sources.includes("internet_archive")) {
          try {
            const result = await searchInternetArchiveAudio(query, page, Math.min(pageSize, 5));
            for (const item of result.results ?? []) {
              const candidate = curatedCandidateRecord(layer, "internet_archive", query, item);
              if (!allowedOnly || candidate.licensePolicy.allowed) candidates.push(candidate);
            }
          } catch (error) {
            accessIssues.push({ source: "internet_archive", layer: layer.name, query, error: error instanceof Error ? error.message : String(error) });
          }
        }

        if (plan.sources.includes("freesound")) {
          try {
            const result = await searchFreesound(query, page, Math.min(pageSize, 5));
            for (const item of result.results ?? []) {
              const candidate = curatedCandidateRecord(layer, "freesound", query, item);
              if (!allowedOnly || candidate.licensePolicy.allowed) candidates.push(candidate);
            }
          } catch (error) {
            accessIssues.push({ source: "freesound", layer: layer.name, query, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
    }

    candidates.sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0));
    layerCuration.push({
      layer: layer.name,
      role: layer.role,
      sourceStrategy: layer.sourceStrategy,
      mix: layer.mix,
      queries,
      searchPerformed: search,
      candidates: candidates.slice(0, pageSize),
      exactSearchCalls: queries.flatMap((query) => [
        ...(plan.sources.includes("internet_archive") ? [{ name: "ableton_search_internet_archive_audio", arguments: { query, page, pageSize } }] : []),
        ...(plan.sources.includes("freesound") ? [{ name: "ableton_search_freesound", arguments: { query, page, pageSize } }] : [])
      ]),
      reviewNotes: curationLayerNotes(layer)
    });
  }

  const candidateCount = layerCuration.reduce((count, layer) => count + layer.candidates.length, 0);
  return {
    curationType: "concept_sample_curation",
    plan: {
      id: plan.id,
      preset: plan.preset,
      concept: sanitizeRemoteSampleText(plan.concept, 240),
      style: sanitizeRemoteSampleText(plan.style, 160),
      sources: plan.sources
    },
    summary: {
      audioLayers: layers.length,
      queries: layerCuration.reduce((count, layer) => count + layer.queries.length, 0),
      searchPerformed: search,
      candidates: candidateCount,
      allowedOnly,
      downloadsPerformed: false,
      writesAbleton: false
    },
    licensePolicy: normalizeLicense("CC BY"),
    layerCuration,
    accessIssues,
    nextSteps: [
      "Review candidate licenses, creators, source URLs, and layer fit.",
      "For Internet Archive candidates, call ableton_list_internet_archive_audio_files before choosing a downloadable audio file.",
      "Call ableton_stage_concept_samples with dry_run=true for selected candidates.",
      "Enable ABLETON_MCP_ENABLE_DOWNLOADS=1 only after reviewing the dry-run staging plan.",
      "Use staged local paths as sample_assignments in ableton_build_layered_arrangement_plan."
    ],
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      arbitraryUrlFetch: false,
      remoteSampleTextPolicy: "untrusted_data"
    }
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
      color: colorForLayer(target.layer),
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
    ...plan.layers.map<ArrangementAction>((layer) => ({
      action: layer.type === "midi" ? "ableton_create_midi_track" : layer.type === "return" ? "ableton_create_return_track" : "ableton_create_audio_track",
      payload: { name: layer.name },
      safeToExecute: true,
      reason: "Creates a named track from the stored concept plan."
    })),
    ...layerTargets.flatMap<ArrangementAction>((target) => {
      const color = colorForLayer(target.layer);
      if (target.trackOffset !== null) {
        return [{
          action: "ableton_set_track_color",
          payload: { track_created_offset: target.trackOffset, color },
          safeToExecute: true,
          reason: "Color-codes the generated concept track for easier navigation."
        }];
      }
      if (target.returnOffset !== null) {
        return [{
          action: "ableton_set_return_track_color",
          payload: { return_created_offset: target.returnOffset, color },
          safeToExecute: true,
          reason: "Color-codes the generated concept return track for easier navigation."
        }];
      }
      return [];
    }),
    ...plan.sections.map<ArrangementAction>((section) => ({
      action: "ableton_create_scene",
      payload: { name: section.name },
      safeToExecute: true,
      reason: "Creates named scene markers from the stored section map."
    })),
    ...plan.sections.map<ArrangementAction>((section, index) => ({
      action: "ableton_set_scene_color",
      payload: { scene_created_offset: index, color: colorForSection(index) },
      safeToExecute: true,
      reason: `Color-codes the generated scene ${section.name} for easier session navigation.`
    })),
    ...plan.sections.flatMap<ArrangementAction>((section, index) => [
      {
        action: "ableton_set_scene_tempo",
        payload: { scene_created_offset: index, tempo: plan.tempo, enabled: true },
        safeToExecute: true,
        reason: `Sets the generated scene tempo for ${section.name} without assuming an empty Live set.`
      },
      {
        action: "ableton_set_scene_time_signature",
        payload: { scene_created_offset: index, numerator: 4, denominator: 4, enabled: true },
        safeToExecute: true,
        reason: `Sets the generated scene time signature for ${section.name} without assuming an empty Live set.`
      }
    ]),
    ...plan.sections.map<ArrangementAction>((section) => ({
      action: "ableton_create_arrangement_marker",
      payload: { time: Math.round((section.start_seconds / 60) * plan.tempo), name: section.name },
      safeToExecute: true,
      reason: "Creates arrangement locators from the stored section map."
    })),
    ...layerTargets.flatMap<ArrangementAction>((target) => {
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
    ...layerTargets.flatMap<ArrangementAction>((target) => {
      if (target.returnOffset === null) return [];
      return [
        {
          action: "ableton_set_return_track_volume",
          payload: { return_created_offset: target.returnOffset, value: target.layer.mix.volume },
          safeToExecute: true,
          reason: "Return track index is resolved from the live snapshot immediately before execution."
        },
        {
          action: "ableton_set_return_track_pan",
          payload: { return_created_offset: target.returnOffset, value: target.layer.mix.pan },
          safeToExecute: true,
          reason: "Return track index is resolved from the live snapshot immediately before execution."
        }
      ];
    }),
    ...layerTargets.flatMap<ArrangementAction>((target) => {
      if (target.layer.type !== "midi" || target.trackOffset === null) return [];
      const clipName = `${target.layer.name} Motif`;
      const clipLength = horror ? 16 : 8;
      return [
        {
          action: "ableton_insert_midi_notes",
          payload: {
            track_created_offset: target.trackOffset,
            clip_slot_index: 0,
            notes: motifNotes(horror, plan.intensity),
            create_clip_if_missing: true,
            clip_length: clipLength,
            name: clipName
          },
          safeToExecute: true,
          reason: "Creates a short editable MIDI motif from the stored concept plan."
        },
        {
          action: "ableton_rename_clip",
          payload: {
            track_created_offset: target.trackOffset,
            clip_slot_index: 0,
            name: clipName
          },
          safeToExecute: true,
          reason: "Names the newly created concept MIDI clip so the generated set remains navigable."
        },
        {
          action: "ableton_set_clip_color",
          payload: {
            track_created_offset: target.trackOffset,
            clip_slot_index: 0,
            color: colorForLayer(target.layer)
          },
          safeToExecute: true,
          reason: "Color-codes the newly created concept MIDI clip for easier navigation."
        },
        {
          action: "ableton_set_clip_loop",
          payload: {
            track_created_offset: target.trackOffset,
            clip_slot_index: 0,
            looping: true,
            loop_start: 0,
            loop_end: clipLength
          },
          safeToExecute: true,
          reason: "Loops the newly created concept MIDI clip over the generated motif length."
        }
      ];
    }),
    ...sampleAssignments.flatMap<ArrangementAction>((assignment) => {
      const shape = sampleClipShapeForLayer(assignment.layer, horror);
      return [
        {
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
        },
        {
          action: "ableton_rename_clip",
          payload: {
            track_created_offset: assignment.trackOffset,
            clip_slot_index: assignment.clip_slot_index,
            name: assignment.name
          },
          safeToExecute: true,
          reason: "Names the newly created approved sample clip so the generated set remains navigable."
        },
        {
          action: "ableton_set_clip_color",
          payload: {
            track_created_offset: assignment.trackOffset,
            clip_slot_index: assignment.clip_slot_index,
            color: assignment.color
          },
          safeToExecute: true,
          reason: "Color-codes the newly created approved sample clip for easier navigation."
        },
        {
          action: "ableton_set_clip_gain",
          payload: {
            track_created_offset: assignment.trackOffset,
            clip_slot_index: assignment.clip_slot_index,
            gain: shape.gain
          },
          safeToExecute: true,
          reason: "Sets a conservative layer-specific clip gain for the approved sample."
        },
        {
          action: "ableton_transpose_clip",
          payload: {
            track_created_offset: assignment.trackOffset,
            clip_slot_index: assignment.clip_slot_index,
            semitones: shape.semitones,
            cents: shape.cents
          },
          safeToExecute: true,
          reason: "Applies deterministic layer-specific audio detuning for the concept mood."
        },
        {
          action: "ableton_set_clip_warp",
          payload: {
            track_created_offset: assignment.trackOffset,
            clip_slot_index: assignment.clip_slot_index,
            warping: true,
            warp_mode: shape.warpMode
          },
          safeToExecute: true,
          reason: "Enables a layer-specific warp mode so the approved sample can follow the generated tempo."
        },
        {
          action: "ableton_set_clip_markers",
          payload: {
            track_created_offset: assignment.trackOffset,
            clip_slot_index: assignment.clip_slot_index,
            start_marker: 0,
            end_marker: shape.clipLength
          },
          safeToExecute: true,
          reason: "Bounds the newly created approved sample clip to the generated layer phrase length."
        },
        {
          action: "ableton_set_clip_loop",
          payload: {
            track_created_offset: assignment.trackOffset,
            clip_slot_index: assignment.clip_slot_index,
            looping: true,
            loop_start: 0,
            loop_end: shape.clipLength
          },
          safeToExecute: true,
          reason: "Loops the newly created approved sample clip for immediate arrangement sketching."
        }
      ];
    })
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
      "Created return-track placeholders are resolved from a live snapshot for return mixer levels and send targets.",
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

export async function planConceptProduction(options: ConceptProductionPlanInput) {
  const concept = await planConceptTrack(options);
  const includeSampleSearch = options.include_sample_search !== false;
  const sampleSearch = includeSampleSearch
    ? await searchConceptSamples({
      plan_id: concept.plan.id,
      page: 1,
      pageSize: Math.max(1, Math.min(12, Math.floor(options.sample_page_size ?? 6)))
    })
    : {
      skipped: true,
      reason: "include_sample_search=false",
      nextStep: "Call ableton_search_concept_samples with the returned plan_id when remote metadata search is desired."
    };
  const arrangement = await buildLayeredArrangementPlan(concept.plan.id, options.sample_assignments ?? []);
  const executionPreview = await executeConceptPlan({ arrangement_id: arrangement.arrangement.id, dry_run: true });
  const delivery = await renderDeliveryPlan(concept.plan.id);
  const scorecard = await renderConceptProductionScorecard({ arrangement_id: arrangement.arrangement.id, check_bridge: false });

  return {
    workflow: "plan_only",
    safety: {
      downloads: "not_performed",
      ableton_writes: "dry_run_only",
      ui_control: "not_used",
      remoteSampleText: "treated_as_untrusted_metadata"
    },
    concept,
    sampleSearch,
    arrangement,
    scorecard,
    executionPreview,
    delivery,
    nextSteps: [
      "Review the concept plan, sample license metadata, arrangement actions, and dry-run execution preview.",
      "Stage only approved licensed samples with ableton_stage_concept_samples and ABLETON_MCP_ENABLE_DOWNLOADS=1.",
      "Use ableton_prepare_concept_audio_layers only for approved local reference audio.",
      "Execute the stored arrangement only after Ableton bridge live-smoke passes and ABLETON_MCP_ENABLE_WRITE=1 is intentional."
    ]
  };
}

export async function preflightConceptExecution(options: ConceptExecutionPreflightOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const safeActions = arrangement.actions.filter((action) => action.safeToExecute);
  const skippedActions = arrangement.actions.filter((action) => !action.safeToExecute);
  const checkBridge = options.check_bridge !== false;
  const issues = [];
  const actionSummary = {
    total: arrangement.actions.length,
    executable: safeActions.length,
    skipped: skippedActions.length,
    samplePlacements: arrangement.actions.filter((action) => action.action === "ableton_load_preset_or_sample").length,
    midiNoteInsertions: arrangement.actions.filter((action) => action.action === "ableton_insert_midi_notes").length,
    trackCreates: arrangement.actions.filter((action) => action.action.endsWith("_track")).length,
    sceneCreates: arrangement.actions.filter((action) => action.action === "ableton_create_scene").length,
    markerCreates: arrangement.actions.filter((action) => action.action === "ableton_create_arrangement_marker").length,
    devicePlan: arrangement.devicePlan.length,
    automationPlan: arrangement.automationPlan.length
  };
  if (skippedActions.length > 0) {
    issues.push({
      severity: "warning",
      code: "SKIPPED_ACTIONS",
      message: `${skippedActions.length} stored action(s) are marked not safe to execute and will be skipped.`
    });
  }
  if (arrangement.devicePlan.length > 0) {
    issues.push({
      severity: "warning",
      code: "STAGED_DEVICE_PLAN",
      message: `${arrangement.devicePlan.length} device-chain plan item(s) remain staged for review or user-enabled UI fallback.`
    });
  }
  if (arrangement.automationPlan.length > 0) {
    issues.push({
      severity: "warning",
      code: "STAGED_AUTOMATION_PLAN",
      message: `${arrangement.automationPlan.length} automation plan item(s) remain staged until LiveAPI parameter targets are verified.`
    });
  }

  if (!checkBridge) {
    issues.push({
      severity: "warning",
      code: "BRIDGE_NOT_CHECKED",
      message: "Bridge snapshot was not requested; run with check_bridge=true before real execution."
    });
    return {
      arrangement_id: arrangement.id,
      status: "bridge_not_checked",
      readyForRealWrite: false,
      actionSummary,
      bridge: {
        checked: false,
        reachable: null
      },
      issues,
      nextSteps: [
        "Run this preflight again with check_bridge=true after Ableton and the Max for Live bridge are loaded.",
        "Keep ableton_execute_concept_plan dry_run=true until this preflight reports readyForRealWrite=true."
      ]
    };
  }

  try {
    const snapshot = await getBridgeSnapshot(false);
    const resolution = bridgeSnapshotResolution(snapshot);
    const snapshotData = dataFromBridgeResponse(snapshot);
    const snapshotState = snapshotData.state && typeof snapshotData.state === "object"
      ? snapshotData.state as { scene_count?: unknown }
      : {};
    const sceneCount = Number(snapshotState.scene_count);
    const resolvedActions = [];
    for (const action of safeActions) {
      const payload = actionPayloadWithCreatedTrack(action, resolution);
      const issue = clipSlotIssue(snapshot, action, payload);
      if (issue) issues.push(issue);
      resolvedActions.push({
        action: action.action,
        payload: redactActionPayload(payload),
        reason: action.reason
      });
    }
    const blockers = issues.filter((issue) => issue.severity === "blocker");
    return {
      arrangement_id: arrangement.id,
      status: blockers.length === 0 ? "ready" : "blocked",
      readyForRealWrite: blockers.length === 0,
      actionSummary,
      bridge: {
        checked: true,
        reachable: true,
        resolution,
        trackCount: resolution.baseTrackCount,
        returnTrackCount: resolution.baseReturnTrackCount,
        sceneCount: Number.isFinite(sceneCount) ? sceneCount : null
      },
      issues,
      resolvedActions,
      stagedReview: {
        devicePlan: arrangement.devicePlan,
        automationPlan: arrangement.automationPlan
      },
      nextSteps: blockers.length === 0
        ? ["Review resolvedActions, then call ableton_execute_concept_plan with dry_run=false only after ABLETON_MCP_ENABLE_WRITE=1 is intentional."]
        : ["Resolve blocker issues, then rerun preflight before real execution."]
    };
  } catch (error) {
    return {
      arrangement_id: arrangement.id,
      status: "bridge_unreachable",
      readyForRealWrite: false,
      actionSummary,
      bridge: {
        checked: true,
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
        nextSteps: bridgeSetupHints(error)
      },
      issues: [{
        severity: "blocker",
        code: "BRIDGE_UNREACHABLE",
        message: "Ableton bridge snapshot could not be read; real execution is not ready."
      }],
      nextSteps: bridgeSetupHints(error)
    };
  }
}

export async function planConceptDeviceAutomationReadiness(options: ConceptDeviceAutomationReadinessOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const concept = await readConceptPlan(arrangement.conceptPlanId);
  const bridge = {
    checked: options.check_bridge !== false,
    reachable: null as boolean | null,
    resolution: null as CreatedTrackResolution | null,
    automationSummaries: [] as Array<{
      track_index: number;
      ok: boolean;
      summary?: unknown;
      error?: string;
    }>,
    error: null as string | null,
    nextSteps: [] as string[]
  };

  if (bridge.checked) {
    try {
      bridge.resolution = bridgeSnapshotResolution(await getBridgeSnapshot(false));
      bridge.reachable = true;
    } catch (error) {
      bridge.reachable = false;
      bridge.error = error instanceof Error ? error.message : String(error);
      bridge.nextSteps = bridgeSetupHints(error);
    }
  }

  const resolvedTrackForAutomation = (entry: ArrangementPlan["automationPlan"][number]) => {
    const chain = arrangement.devicePlan.find((candidate) => candidate.layer === entry.layer);
    if (!chain) return { target: { kind: "unknown", status: "unresolved" } as Record<string, unknown>, trackIndex: null as number | null, chain };
    const target = plannedTargetResolution(chain, bridge.resolution ?? undefined);
    const trackIndex = "track_index" in target && typeof target.track_index === "number" ? target.track_index : null;
    return { target, trackIndex, chain };
  };

  const liveAutomationByTrack = new Map<number, unknown>();
  if (bridge.checked && bridge.reachable) {
    const trackIndices = [...new Set(arrangement.automationPlan
      .map((entry) => resolvedTrackForAutomation(entry).trackIndex)
      .filter((trackIndex): trackIndex is number => trackIndex !== null))]
      .slice(0, 16);
    for (const trackIndex of trackIndices) {
      try {
        const summary = await bridgeAction("automation_summary", { track_index: trackIndex, include_devices: true, max_parameters: 64 }) as Record<string, unknown>;
        liveAutomationByTrack.set(trackIndex, summary);
        bridge.automationSummaries.push({ track_index: trackIndex, ok: true, summary });
      } catch (error) {
        bridge.automationSummaries.push({
          track_index: trackIndex,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const deviceChains = arrangement.devicePlan.map((entry) => {
    const target = plannedTargetResolution(entry, bridge.resolution ?? undefined);
    const resolvedTrackIndex = "track_index" in target && typeof target.track_index === "number" ? target.track_index : null;
    const canUseTrackDeviceTools = entry.target === "track" && resolvedTrackIndex !== null;
    return {
      layer: entry.layer,
      target,
      devices: entry.devices,
      bridgeInsertionSupported: false,
      supportReason: entry.target === "return"
        ? "Return-track device insertion is not exposed by the current typed bridge tools."
        : "Named Ableton-native device insertion returns unsupported until a reliable Browser/hot-swap path is verified.",
      discoveryCalls: canUseTrackDeviceTools
        ? [{ name: "ableton_list_devices", arguments: { track_id: String(resolvedTrackIndex) } }]
        : [],
      exactDryRunToolCalls: canUseTrackDeviceTools
        ? entry.devices.map((device, index) => ({
          name: deviceInsertTool(device),
          arguments: {
            track_index: resolvedTrackIndex,
            device,
            ...(deviceInsertTool(device) === "ableton_insert_effect" ? { position: index, dry_run: true } : { dry_run: true })
          }
        }))
        : [],
      toolCallTemplates: entry.devices.map((device, index) => ({
        name: deviceInsertTool(device),
        executable: false,
        reason: "Resolve the generated track index with ableton_preflight_concept_execution before calling this template.",
        arguments: {
          ...(entry.track_created_offset === undefined ? {} : { track_created_offset: entry.track_created_offset }),
          ...(entry.return_created_offset === undefined ? {} : { return_created_offset: entry.return_created_offset }),
          device,
          ...(deviceInsertTool(device) === "ableton_insert_effect" ? { position: index } : {}),
          dry_run: true
        }
      }))
    };
  });

  const automationTargets = arrangement.automationPlan.map((entry) => {
    const { chain, target, trackIndex: resolvedTrackIndex } = resolvedTrackForAutomation(entry);
    const matchingDevices = chain ? devicesForAutomation(entry.target, chain.devices) : [];
    const summary = resolvedTrackIndex === null ? null : liveAutomationByTrack.get(resolvedTrackIndex);
    const automationSummaryTemplate = entry.target === "midi_velocity"
      ? null
      : {
        name: "ableton_extract_automation_summary",
        executable: resolvedTrackIndex !== null,
        reason: resolvedTrackIndex !== null
          ? "Resolved track index is available from bridge preflight."
          : "Resolve the generated track index with ableton_preflight_concept_execution before calling this template.",
        arguments: resolvedTrackIndex !== null
          ? automationSummaryDiscoveryCall(resolvedTrackIndex, entry.target).arguments
          : {
            ...(chain?.track_created_offset === undefined ? {} : { track_created_offset: chain.track_created_offset }),
            ...(chain?.return_created_offset === undefined ? {} : { return_created_offset: chain.return_created_offset }),
            include_devices: entry.target !== "volume",
            max_parameters: entry.target === "volume" ? 16 : 64
          }
      };
    return {
      layer: entry.layer,
      automation: entry.automation,
      target: entry.target,
      targetResolution: target,
      candidateTargetTypes: automationCandidateTargetTypes(entry.target),
      candidateDevices: matchingDevices,
      parameterHints: automationParameterHints(entry.target),
      discoveryCalls: resolvedTrackIndex === null
        ? entry.target === "midi_velocity"
          ? [{ name: "ableton_get_clip_notes", arguments: { track_index: 0, clip_slot_index: 0 } }]
          : []
        : entry.target === "midi_velocity"
          ? [{ name: "ableton_get_clip_notes", arguments: { track_index: resolvedTrackIndex, clip_slot_index: 0 } }]
          : [
            automationSummaryDiscoveryCall(resolvedTrackIndex, entry.target),
            { name: "ableton_list_devices", arguments: { track_id: String(resolvedTrackIndex) } },
            { name: "ableton_get_device_parameter_map", arguments: { track_index: resolvedTrackIndex, device_index: 0 } }
          ],
      liveAutomationTargetSummary: summary ? automationBridgeTargetSummary(entry.target, summary) : null,
      toolCallTemplates: [
        ...(automationSummaryTemplate ? [automationSummaryTemplate] : []),
        ...(entry.target === "midi_velocity"
          ? [{ name: "ableton_get_clip_notes", executable: false, reason: "Resolve the generated MIDI clip slot before inspecting notes.", arguments: { clip_slot_index: 0 } }]
          : [])
      ],
      exactDryRunToolCalls: resolvedTrackIndex !== null && entry.target === "volume"
        ? [
          { name: "ableton_create_automation_envelope", arguments: { track_index: resolvedTrackIndex, parameter_index: 0, dry_run: true } },
          { name: "ableton_set_automation_point", arguments: { track_index: resolvedTrackIndex, parameter_index: 0, time: 0, value: 0.5, dry_run: true } }
        ]
        : [],
      writeSupport: entry.target === "volume" && resolvedTrackIndex !== null
        ? "dry_run_only_current_bridge_returns_unsupported"
        : "requires_device_parameter_map_and_verified_liveapi_support"
    };
  });

  return {
    planType: "concept_device_automation_readiness",
    arrangement_id: arrangement.id,
    concept: {
      id: concept.id,
      preset: concept.preset,
      style: concept.style
    },
    bridge,
    summary: {
      deviceChains: deviceChains.length,
      automationTargets: automationTargets.length,
      exactDryRunDeviceCalls: deviceChains.reduce((count, entry) => count + entry.exactDryRunToolCalls.length, 0),
      exactDryRunAutomationCalls: automationTargets.reduce((count, entry) => count + entry.exactDryRunToolCalls.length, 0),
      automationSummaryDiscoveryCalls: automationTargets.reduce((count, entry) => count + entry.discoveryCalls.filter((call) => call.name === "ableton_extract_automation_summary").length, 0),
      automationSummaryToolTemplates: automationTargets.reduce((count, entry) => count + entry.toolCallTemplates.filter((call) => call.name === "ableton_extract_automation_summary").length, 0),
      liveAutomationSummaries: bridge.automationSummaries.filter((entry) => entry.ok).length,
      realDeviceInsertionSupported: false,
      realAutomationWriteSupported: false
    },
    deviceChains,
    automationTargets,
    nextSteps: [
      "Run ableton_preflight_concept_execution with check_bridge=true after the bridge is loaded.",
      "Use ableton_extract_automation_summary discovery calls to inspect mixer, send, and device parameter candidates before any automation attempt.",
      "Keep device insertion and automation writes dry-run unless Ableton MCP reports support for the running bridge.",
      "Use the user-enabled UI driver fallback only after explicit user choice."
    ]
  };
}

export async function planConceptRoutingReadiness(options: ConceptRoutingReadinessOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const concept = await readConceptPlan(arrangement.conceptPlanId);
  const bridge = {
    checked: options.check_bridge !== false,
    reachable: null as boolean | null,
    resolution: null as CreatedTrackResolution | null,
    routingOverview: null as Record<string, unknown> | null,
    error: null as string | null,
    nextSteps: [] as string[]
  };

  if (bridge.checked) {
    try {
      bridge.resolution = bridgeSnapshotResolution(await getBridgeSnapshot(false));
      bridge.routingOverview = await bridgeAction("routing_overview", { include_devices: true }) as Record<string, unknown>;
      bridge.reachable = true;
    } catch (error) {
      bridge.reachable = false;
      bridge.error = error instanceof Error ? error.message : String(error);
      bridge.nextSteps = bridgeSetupHints(error);
    }
  }

  const trackLayers = new Map<number, string>();
  const returnLayers = new Map<number, string>();
  for (const entry of arrangement.devicePlan) {
    if (typeof entry.track_created_offset === "number") trackLayers.set(entry.track_created_offset, entry.layer);
    if (typeof entry.return_created_offset === "number") returnLayers.set(entry.return_created_offset, entry.layer);
  }

  const sendActions = arrangement.actions.filter((action) => action.action === "ableton_set_track_send");
  const plannedSends = sendActions.map((action, index) => {
    const trackOffset = typeof action.payload.track_created_offset === "number" ? action.payload.track_created_offset : null;
    const returnOffset = typeof action.payload.return_created_offset === "number" ? action.payload.return_created_offset : null;
    const value = typeof action.payload.value === "number" && Number.isFinite(action.payload.value) ? action.payload.value : 0;
    const resolvedPayload = bridge.resolution ? actionPayloadWithCreatedTrack(action, bridge.resolution) : null;
    const exactDryRunToolCall = resolvedPayload && typeof resolvedPayload.track_index === "number" && typeof resolvedPayload.send_index === "number"
      ? {
        name: "ableton_set_track_send",
        arguments: {
          track_index: resolvedPayload.track_index,
          send_index: resolvedPayload.send_index,
          value,
          dry_run: true
        }
      }
      : null;

    return {
      index,
      layer: trackOffset === null ? null : trackLayers.get(trackOffset) ?? null,
      returnLayer: returnOffset === null ? null : returnLayers.get(returnOffset) ?? null,
      send_name: typeof action.payload.send_name === "string" ? action.payload.send_name : null,
      value,
      track_created_offset: trackOffset,
      return_created_offset: returnOffset,
      targetResolution: bridge.resolution && resolvedPayload
        ? {
          track_index: typeof resolvedPayload.track_index === "number" ? resolvedPayload.track_index : null,
          send_index: typeof resolvedPayload.send_index === "number" ? resolvedPayload.send_index : null
        }
        : { status: "pending_bridge_snapshot" },
      toolCallTemplate: {
        name: "ableton_set_track_send",
        executable: false,
        reason: "Resolve track and send indexes with ableton_preflight_concept_execution or this readiness tool after the bridge is loaded.",
        arguments: {
          ...(trackOffset === null ? {} : { track_created_offset: trackOffset }),
          ...(returnOffset === null ? {} : { return_created_offset: returnOffset }),
          value,
          dry_run: true
        }
      },
      exactDryRunToolCall
    };
  });

  const uniqueReturnTargets = [...new Set(plannedSends.map((entry) => entry.returnLayer ?? entry.send_name ?? "unknown"))];
  const exactDryRunSendCalls = plannedSends.flatMap((entry) => entry.exactDryRunToolCall ? [entry.exactDryRunToolCall] : []);

  return {
    planType: "concept_routing_readiness",
    arrangement_id: arrangement.id,
    concept: {
      id: concept.id,
      preset: concept.preset,
      style: concept.style,
      tempo: concept.tempo,
      key: concept.key
    },
    bridge,
    summary: {
      plannedSendCount: plannedSends.length,
      uniqueReturnTargets,
      exactDryRunSendCalls: exactDryRunSendCalls.length,
      requiresBridgeForRealIndexes: plannedSends.some((entry) => entry.track_created_offset !== null || entry.return_created_offset !== null),
      writesAbleton: false,
      downloads: false,
      uiControl: false
    },
    discoveryCalls: [
      { name: "ableton_get_routing_overview", arguments: { include_devices: true } },
      { name: "ableton_preflight_concept_execution", arguments: { arrangement_id: arrangement.id, check_bridge: true } },
      { name: "ableton_plan_concept_device_automation_readiness", arguments: { arrangement_id: arrangement.id, check_bridge: true } }
    ],
    plannedSends,
    exactDryRunSendCalls,
    nextSteps: bridge.reachable === true
      ? [
        "Compare exactDryRunSendCalls against bridge.routingOverview.send_matrix before real execution.",
        "Run ableton_create_concept_execution_approval_bundle after routing, devices, automation, and samples have been reviewed.",
        "Keep ABLETON_MCP_ENABLE_WRITE=0 until the final approved execution session."
      ]
      : [
        "Load Ableton and the Max for Live bridge, then rerun with check_bridge=true.",
        "Use ableton_get_routing_overview to inspect existing returns before applying concept sends.",
        "Keep send changes dry-run until the routing matrix and approval bundle are reviewed."
      ]
  };
}

export async function createConceptExecutionApprovalBundle(options: ConceptExecutionApprovalBundleOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const concept = await readConceptPlan(arrangement.conceptPlanId);
  const preflight = await preflightConceptExecution(options);

  return {
    bundleType: "concept_execution_approval",
    approval_id: conceptExecutionApprovalId(arrangement),
    approved: false,
    approvalRequired: true,
    concept: conceptForReport(concept),
    arrangement: arrangementForReport(arrangement),
    preflight,
    gates: {
      write: {
        required: true,
        enabled: FLAGS.write,
        env: "ABLETON_MCP_ENABLE_WRITE=1"
      },
      downloads: {
        required: false,
        enabled: FLAGS.downloads,
        env: "ABLETON_MCP_ENABLE_DOWNLOADS=1"
      },
      uiControl: {
        required: false,
        enabled: FLAGS.uiControl,
        env: "ABLETON_MCP_ENABLE_UI_CONTROL=1"
      }
    },
    exactToolCalls: {
      recheckPreflight: {
        name: "ableton_preflight_concept_execution",
        arguments: {
          arrangement_id: arrangement.id,
          check_bridge: true
        }
      },
      dryRunExecution: {
        name: "ableton_execute_concept_plan",
        arguments: {
          arrangement_id: arrangement.id,
          dry_run: true
        }
      },
      routingReadiness: {
        name: "ableton_plan_concept_routing_readiness",
        arguments: {
          arrangement_id: arrangement.id,
          check_bridge: true
        }
      },
      deviceAutomationReadiness: {
        name: "ableton_plan_concept_device_automation_readiness",
        arguments: {
          arrangement_id: arrangement.id,
          check_bridge: true
        }
      },
      realExecutionAfterApproval: {
        name: "ableton_execute_concept_plan",
        arguments: {
          arrangement_id: arrangement.id,
          dry_run: false,
          approval_id: conceptExecutionApprovalId(arrangement),
          approval_confirmed: true
        }
      }
    },
    approvalChecklist: [
      "Review the redacted arrangement actions and staged device/automation plans.",
      "Run ableton_preflight_concept_execution with check_bridge=true after the Ableton bridge is loaded.",
      "Confirm preflight.readyForRealWrite is true before enabling writes.",
      "Enable ABLETON_MCP_ENABLE_WRITE=1 only for the session where real execution is intended.",
      "Keep downloads and UI control disabled unless a separate user-approved step requires them."
    ],
    securityBoundaries: [
      "This bundle does not approve execution.",
      "This bundle does not download files.",
      "This bundle does not send write commands to Ableton.",
      "This bundle does not use UI or mouse control.",
      "Stored executable local paths are redacted in this response."
    ]
  };
}

export async function renderConceptExecutionManifest(options: ConceptExecutionManifestOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const concept = await readConceptPlan(arrangement.conceptPlanId);
  const actionReports = arrangement.actions.map(actionForExecutionReport);
  const phases = [...new Set(actionReports.map((action) => action.phase))].map((phase) => {
    const actions = actionReports.filter((action) => action.phase === phase);
    return {
      phase,
      actionCount: actions.length,
      executableActionCount: actions.filter((action) => action.safeToExecute).length,
      actions
    };
  });
  const placeholderCounts = actionReports.reduce((counts, action) => ({
    track: counts.track + (action.placeholders.track_created_offset ? 1 : 0),
    returnTrack: counts.returnTrack + (action.placeholders.return_created_offset ? 1 : 0),
    scene: counts.scene + (action.placeholders.scene_created_offset ? 1 : 0)
  }), { track: 0, returnTrack: 0, scene: 0 });

  return {
    manifestType: "concept_execution_manifest",
    arrangement_id: arrangement.id,
    concept: {
      id: concept.id,
      preset: concept.preset,
      title: sanitizeRemoteSampleText(concept.concept, 500),
      style: concept.style,
      tempo: concept.tempo,
      key: concept.key,
      sections: concept.sections.map((section) => section.name),
      layerCount: concept.layers.length
    },
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      remoteHttpExposure: false,
      executionPath: "stored_arrangement_id_only",
      arbitraryBridgePayloads: false,
      localPathsRedacted: true
    },
    gates: {
      dryRunFirst: true,
      requiredForRealExecution: ["ABLETON_MCP_ENABLE_WRITE=1", "dry_run=false", "matching approval_id from approval bundle", "approval_confirmed=true", "loaded Max for Live bridge", "successful ableton_preflight_concept_execution"],
      notGrantedByThisManifest: true
    },
    actionSummary: {
      total: arrangement.actions.length,
      executable: arrangement.actions.filter((action) => action.safeToExecute).length,
      stagedDeviceChains: arrangement.devicePlan.length,
      stagedAutomationTargets: arrangement.automationPlan.length,
      samplePlacements: arrangement.actions.filter(actionNeedsApprovedSample).length,
      placeholderCounts
    },
    phases,
    stagedReview: {
      devicePlan: arrangement.devicePlan,
      automationPlan: arrangement.automationPlan,
      routingReadinessToolCall: {
        name: "ableton_plan_concept_routing_readiness",
        arguments: { arrangement_id: arrangement.id, check_bridge: false }
      },
      readinessToolCall: {
        name: "ableton_plan_concept_device_automation_readiness",
        arguments: { arrangement_id: arrangement.id, check_bridge: false }
      }
    },
    exactToolCalls: {
      dryRunExecution: {
        name: "ableton_execute_concept_plan",
        arguments: { arrangement_id: arrangement.id, dry_run: true }
      },
      preflightWithBridge: {
        name: "ableton_preflight_concept_execution",
        arguments: { arrangement_id: arrangement.id, check_bridge: true }
      },
      routingReadiness: {
        name: "ableton_plan_concept_routing_readiness",
        arguments: { arrangement_id: arrangement.id, check_bridge: true }
      },
      approvalBundle: {
        name: "ableton_create_concept_execution_approval_bundle",
        arguments: { arrangement_id: arrangement.id, check_bridge: true }
      },
      realExecutionAfterApproval: {
        name: "ableton_execute_concept_plan",
        arguments: {
          arrangement_id: arrangement.id,
          dry_run: false,
          approval_id: conceptExecutionApprovalId(arrangement),
          approval_confirmed: true
        }
      }
    },
    nextSteps: [
      "Review phases and stagedReview before touching Ableton.",
      "Run dryRunExecution first; it does not contact Ableton.",
      "Run routingReadiness after loading the bridge to verify send and return mapping.",
      "Load the Max for Live bridge, then run preflightWithBridge.",
      "Only run realExecutionAfterApproval after reviewing the approval bundle and intentionally enabling ABLETON_MCP_ENABLE_WRITE=1."
    ]
  };
}

function attributionText(value: unknown, maxLength = 240) {
  const text = sanitizeRemoteSampleText(value, maxLength);
  return text.length > 0 ? text : null;
}

async function readConceptAttributionSidecar(samplePath: string) {
  const sidecarPath = `${samplePath}.attribution.json`;
  let safe;
  try {
    safe = await resolveSafePath(sidecarPath, { mustExist: false });
  } catch (error) {
    return {
      found: false,
      sidecarPath: redactPath(sidecarPath),
      issue: error instanceof Error ? error.message : String(error)
    };
  }

  try {
    const stat = await fs.stat(safe.real);
    if (stat.size > MAX_CONCEPT_ATTRIBUTION_BYTES) {
      return {
        found: false,
        sidecarPath: redactPath(safe.real),
        issue: "Attribution sidecar exceeds size limit."
      };
    }
    const record = JSON.parse(await fs.readFile(safe.real, "utf8")) as Record<string, unknown>;
    const licenseText = String(record.license ?? (record.licensePolicy && typeof record.licensePolicy === "object" ? (record.licensePolicy as { license?: unknown }).license : "") ?? "");
    return {
      found: true,
      sidecarPath: redactPath(safe.real),
      sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null,
      destinationName: attributionText(record.destinationName, 180),
      title: attributionText(record.title, 240),
      creator: attributionText(record.creator, 180),
      identifier: attributionText(record.identifier, 180),
      license: attributionText(licenseText, 220) ?? "unknown",
      licensePolicy: normalizeLicense(licenseText),
      checksum: typeof record.checksum === "string" ? record.checksum : null,
      bytes: typeof record.bytes === "number" ? record.bytes : null,
      stagedAt: typeof record.stagedAt === "string" ? record.stagedAt : null,
      importedAt: typeof record.importedAt === "string" ? record.importedAt : null
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      found: false,
      sidecarPath: redactPath(safe.real),
      issue: code === "ENOENT" ? "Attribution sidecar not found." : error instanceof Error ? error.message : String(error)
    };
  }
}

export async function renderConceptAttributionBundle(options: ConceptAttributionBundleOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const concept = await readConceptPlan(arrangement.conceptPlanId);
  const assignments = arrangement.sampleAssignments ?? [];
  const items = [];
  for (const assignment of assignments) {
    const sidecar = await readConceptAttributionSidecar(assignment.path);
    items.push({
      layer: assignment.layer,
      source: assignment.source,
      treatment: assignment.treatment ?? null,
      clip_slot_index: assignment.clip_slot_index,
      name: attributionText(assignment.name ?? assignment.layer, 180),
      mediaPath: redactPath(assignment.path),
      sidecar,
      attributionReady: sidecar.found === true
        && "licensePolicy" in sidecar
        && Boolean(sidecar.licensePolicy.allowed)
        && typeof sidecar.sourceUrl === "string"
    });
  }
  const missingSidecars = items.filter((item) => item.sidecar.found !== true).map((item) => ({
    layer: item.layer,
    mediaPath: item.mediaPath,
    issue: "issue" in item.sidecar ? item.sidecar.issue : "Attribution sidecar missing."
  }));
  const licenseWarnings = items.filter((item) =>
    item.sidecar.found === true
    && "licensePolicy" in item.sidecar
    && item.sidecar.licensePolicy.allowed !== true
  ).map((item) => ({
    layer: item.layer,
    license: "license" in item.sidecar ? item.sidecar.license : "unknown",
    policy: "licensePolicy" in item.sidecar ? item.sidecar.licensePolicy.policy : "Review license before publishing."
  }));
  const sourceUrlMissing = items.filter((item) =>
    item.sidecar.found === true
    && "sourceUrl" in item.sidecar
    && typeof item.sidecar.sourceUrl !== "string"
  ).map((item) => item.layer);

  return {
    bundleType: "concept_attribution_bundle",
    arrangement_id: arrangement.id,
    concept: {
      id: concept.id,
      preset: concept.preset,
      title: sanitizeRemoteSampleText(concept.concept, 500),
      style: concept.style
    },
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      broadScan: false,
      localPathsRedacted: true,
      sidecarByteLimit: MAX_CONCEPT_ATTRIBUTION_BYTES
    },
    summary: {
      sampleAssignments: assignments.length,
      sidecarsFound: items.filter((item) => item.sidecar.found === true).length,
      missingSidecars: missingSidecars.length,
      licenseWarnings: licenseWarnings.length,
      sourceUrlMissing: sourceUrlMissing.length,
      attributionReady: assignments.length > 0 && missingSidecars.length === 0 && licenseWarnings.length === 0 && sourceUrlMissing.length === 0
    },
    items,
    missingSidecars,
    licenseWarnings,
    sourceUrlMissing,
    exactNextToolCalls: {
      globalAttributionReport: { name: "ableton_generate_attribution_report", arguments: { page: 1, pageSize: 25 } },
      deliveryPlan: { name: "ableton_render_delivery_plan", arguments: { plan_id: concept.id } },
      productionScorecard: { name: "ableton_render_concept_production_scorecard", arguments: { arrangement_id: arrangement.id, check_bridge: false } }
    },
    nextSteps: missingSidecars.length === 0 && licenseWarnings.length === 0
      ? [
        "Review source URLs, licenses, checksums, and creator/title fields before publishing.",
        "Run the global attribution report before delivery if staged or imported samples were used."
      ]
      : [
        "Add or regenerate missing .attribution.json sidecars before publishing.",
        "For user-provided local reference audio, manually confirm rights and store attribution metadata beside the prepared file.",
        "Do not publish with license warnings unresolved."
      ]
  };
}

function productionScoreCheck(
  id: string,
  label: string,
  points: number,
  maxPoints: number,
  evidence: Record<string, unknown>,
  nextSteps: string[] = []
) {
  return {
    id,
    label,
    status: points >= maxPoints ? "pass" : points >= maxPoints * 0.5 ? "warning" : "fail",
    points,
    maxPoints,
    evidence,
    ...(nextSteps.length > 0 ? { nextSteps } : {})
  };
}

export async function renderConceptProductionScorecard(options: ConceptProductionScorecardOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const concept = await readConceptPlan(arrangement.conceptPlanId);
  const checkBridge = options.check_bridge === true;
  const timeline = await renderConceptTimeline(concept.id);
  const mixPlan = await renderConceptMixPlan(concept.id);
  const delivery = await renderDeliveryPlan(concept.id);
  const preflight = await preflightConceptExecution({ arrangement_id: arrangement.id, check_bridge: checkBridge }) as {
    status?: string;
    readyForRealWrite?: boolean;
    issues?: Array<{ severity?: string; code?: string; message?: string }>;
    bridge?: { checked?: boolean; reachable?: boolean | null };
  };
  const routing = await planConceptRoutingReadiness({ arrangement_id: arrangement.id, check_bridge: checkBridge }) as {
    summary?: { plannedSendCount?: number; uniqueReturnTargets?: string[]; writesAbleton?: boolean };
    bridge?: { checked?: boolean; reachable?: boolean | null };
    discoveryCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  };
  const readiness = await planConceptDeviceAutomationReadiness({ arrangement_id: arrangement.id, check_bridge: checkBridge }) as {
    summary?: {
      deviceChains?: number;
      automationTargets?: number;
      realDeviceInsertionSupported?: boolean;
      realAutomationWriteSupported?: boolean;
    };
    bridge?: { checked?: boolean; reachable?: boolean | null };
  };

  const audioLayers = concept.layers.filter((layer) => layer.type === "audio");
  const midiLayers = concept.layers.filter((layer) => layer.type === "midi");
  const returnLayers = concept.layers.filter((layer) => layer.type === "return");
  const assignedAudioLayerNames = new Set((arrangement.sampleAssignments ?? []).map((assignment) => assignment.layer.toLowerCase()));
  const assignedAudioLayers = audioLayers.filter((layer) => assignedAudioLayerNames.has(layer.name.toLowerCase()));
  const missingAudioLayers = audioLayers
    .filter((layer) => !assignedAudioLayerNames.has(layer.name.toLowerCase()))
    .map((layer) => layer.name);
  const requiredHorrorLayers = concept.preset === "liminal_backrooms_horror"
    ? ["Degraded Memory", "Stretched Room", "Distant Room Tone", "Low Pressure", "Mechanical Texture", "Reversed Fragments", "Sparse Motif", "Memory Reverb", "Distant Delay"]
    : [];
  const coveredRequiredHorrorLayers = requiredHorrorLayers.filter((layerName) =>
    concept.layers.some((layer) => layer.name.toLowerCase() === layerName.toLowerCase())
  );
  const actionNames = new Set(arrangement.actions.map((action) => action.action));
  const actionCount = (name: string) => arrangement.actions.filter((action) => action.action === name).length;
  const hasAllActions = (names: string[]) => names.every((name) => actionNames.has(name));
  const unsafeActions = arrangement.actions.filter((action) => !action.safeToExecute);
  const bridgeIssues = Array.isArray(preflight.issues) ? preflight.issues : [];
  const blockers = bridgeIssues.filter((issue) => issue.severity === "blocker");
  const deliveryStems = Array.isArray(delivery.stems) ? delivery.stems : [];
  const sectionList = Array.isArray(timeline.sections) ? timeline.sections : [];

  const checks = [
    productionScoreCheck(
      "layer_architecture",
      "Layer architecture matches the requested concept.",
      [
        concept.layers.length >= 6 ? 3 : 0,
        audioLayers.length >= 4 ? 4 : audioLayers.length >= 2 ? 2 : 0,
        midiLayers.length >= 1 ? 2 : 0,
        returnLayers.length >= 2 ? 3 : returnLayers.length >= 1 ? 1 : 0,
        requiredHorrorLayers.length === 0 || coveredRequiredHorrorLayers.length === requiredHorrorLayers.length ? 6 : Math.floor((coveredRequiredHorrorLayers.length / Math.max(1, requiredHorrorLayers.length)) * 6)
      ].reduce((sum, value) => sum + value, 0),
      18,
      {
        totalLayers: concept.layers.length,
        audioLayers: audioLayers.length,
        midiLayers: midiLayers.length,
        returnLayers: returnLayers.length,
        requiredHorrorLayers,
        coveredRequiredHorrorLayers
      },
      coveredRequiredHorrorLayers.length === requiredHorrorLayers.length
        ? []
        : ["Regenerate the concept plan with the liminal/backrooms/horror preset or add missing required layers before execution."]
    ),
    productionScoreCheck(
      "section_arc",
      "Section map creates a usable musical/video arc.",
      [
        concept.sections.length >= 5 ? 4 : concept.sections.length >= 3 ? 2 : 0,
        Math.abs(concept.sections.reduce((sum, section) => sum + section.duration_seconds, 0) - concept.target_duration_seconds) <= 2 ? 2 : 0,
        concept.sections.some((section) => /collapse|decay|tail|unresolved/i.test(section.name)) ? 2 : 0,
        sectionList.every((section) => {
          const record = section && typeof section === "object" ? section as { activeLayers?: unknown } : {};
          return Array.isArray(record.activeLayers) && record.activeLayers.length > 0;
        }) ? 2 : 0
      ].reduce((sum, value) => sum + value, 0),
      10,
      {
        sectionCount: concept.sections.length,
        sections: concept.sections.map((section) => section.name),
        timelineSections: sectionList.length
      },
      ["Use ableton_render_concept_timeline to review entrances before real execution."]
    ),
    productionScoreCheck(
      "executable_action_coverage",
      "Arrangement contains the core executable Ableton operations.",
      [
        actionNames.has("ableton_set_tempo") ? 2 : 0,
        hasAllActions(["ableton_create_audio_track", "ableton_create_midi_track", "ableton_create_return_track"]) ? 3 : 0,
        hasAllActions(["ableton_create_scene", "ableton_set_scene_color", "ableton_set_scene_tempo", "ableton_set_scene_time_signature"]) ? 3 : 0,
        actionNames.has("ableton_create_arrangement_marker") ? 2 : 0,
        hasAllActions(["ableton_set_track_volume", "ableton_set_track_pan", "ableton_set_track_send"]) ? 3 : 0,
        actionNames.has("ableton_insert_midi_notes") ? 2 : 0,
        hasAllActions(["ableton_rename_clip", "ableton_set_clip_loop", "ableton_set_clip_color"]) ? 3 : 0
      ].reduce((sum, value) => sum + value, 0),
      18,
      {
        totalActions: arrangement.actions.length,
        tempo: actionNames.has("ableton_set_tempo"),
        trackCreates: actionCount("ableton_create_audio_track") + actionCount("ableton_create_midi_track") + actionCount("ableton_create_return_track"),
        sceneCreates: actionCount("ableton_create_scene"),
        midiNoteInsertions: actionCount("ableton_insert_midi_notes"),
        samplePlacements: actionCount("ableton_load_preset_or_sample"),
        sendMoves: actionCount("ableton_set_track_send")
      },
      ["Use ableton_render_concept_execution_manifest to inspect the exact phase order."]
    ),
    productionScoreCheck(
      "sample_coverage",
      "Approved audio material is assigned to the planned audio layers.",
      assignedAudioLayers.length >= audioLayers.length && audioLayers.length > 0
        ? 12
        : assignedAudioLayers.length > 0
          ? 7
          : concept.reference?.approvedForAudioPlacement
            ? 6
            : 3,
      12,
      {
        audioLayers: audioLayers.map((layer) => layer.name),
        assignedAudioLayers: assignedAudioLayers.map((layer) => layer.name),
        missingAudioLayers,
        approvedReferenceAudio: concept.reference?.approvedForAudioPlacement === true
      },
      missingAudioLayers.length > 0
        ? [
          "Use ableton_search_concept_samples for licensed metadata or choose local samples under approved roots.",
          "Use ableton_prepare_concept_audio_layers for approved local reference audio, then rebuild the arrangement from the prepared manifest."
        ]
        : []
    ),
    productionScoreCheck(
      "routing_and_space",
      "Return tracks and sends support layered depth.",
      [
        returnLayers.length >= 2 ? 3 : returnLayers.length >= 1 ? 1 : 0,
        actionCount("ableton_set_track_send") >= 4 ? 4 : actionCount("ableton_set_track_send") >= 1 ? 2 : 0,
        Number(routing.summary?.plannedSendCount ?? 0) > 0 ? 3 : 0,
        Array.isArray(routing.summary?.uniqueReturnTargets) && routing.summary!.uniqueReturnTargets!.length >= 2 ? 2 : 1
      ].reduce((sum, value) => sum + value, 0),
      12,
      {
        returnLayers: returnLayers.map((layer) => layer.name),
        plannedSendActions: actionCount("ableton_set_track_send"),
        routingSummary: routing.summary ?? null,
        bridgeChecked: routing.bridge?.checked === true,
        bridgeReachable: routing.bridge?.reachable ?? null
      },
      ["Run ableton_plan_concept_routing_readiness with check_bridge=true after the Max for Live bridge is loaded."]
    ),
    productionScoreCheck(
      "device_and_automation_readiness",
      "Device chains and automation targets are explicit and reviewable.",
      [
        arrangement.devicePlan.length >= concept.layers.length ? 4 : arrangement.devicePlan.length > 0 ? 2 : 0,
        arrangement.automationPlan.length >= 4 ? 4 : arrangement.automationPlan.length > 0 ? 2 : 0,
        Number(readiness.summary?.deviceChains ?? 0) > 0 ? 2 : 0,
        Number(readiness.summary?.automationTargets ?? 0) > 0 ? 2 : 0
      ].reduce((sum, value) => sum + value, 0),
      12,
      {
        stagedDeviceChains: arrangement.devicePlan.length,
        stagedAutomationTargets: arrangement.automationPlan.length,
        bridgeInsertionSupported: readiness.summary?.realDeviceInsertionSupported ?? false,
        bridgeAutomationSupported: readiness.summary?.realAutomationWriteSupported ?? false,
        bridgeChecked: readiness.bridge?.checked === true,
        bridgeReachable: readiness.bridge?.reachable ?? null
      },
      ["Keep device insertion and automation staged until discovery proves exact devices and parameters."]
    ),
    productionScoreCheck(
      "execution_safety",
      "Execution remains gated, dry-run first, and bridge-aware.",
      [
        unsafeActions.length === 0 ? 2 : 0,
        arrangement.actions.every((action) => !action.payload || typeof action.payload === "object") ? 1 : 0,
        preflight.status === "ready" ? 2 : preflight.status === "bridge_not_checked" ? 1 : 0,
        FLAGS.write === false && FLAGS.downloads === false && FLAGS.uiControl === false ? 2 : 0,
        blockers.length === 0 ? 1 : 0
      ].reduce((sum, value) => sum + value, 0),
      8,
      {
        unsafeActions: unsafeActions.length,
        preflightStatus: preflight.status ?? null,
        readyForRealWrite: preflight.readyForRealWrite === true,
        bridgeChecked: preflight.bridge?.checked === true,
        bridgeReachable: preflight.bridge?.reachable ?? null,
        blockers
      },
      preflight.status === "bridge_not_checked"
        ? ["Run ableton_preflight_concept_execution with check_bridge=true after Ableton and the bridge are loaded."]
        : []
    ),
    productionScoreCheck(
      "delivery_readiness",
      "Export and stem handoff settings are present.",
      [
        delivery.export.sampleRate === 48000 && delivery.export.bitDepth === "24" ? 3 : 0,
        delivery.export.normalize === false ? 2 : 0,
        deliveryStems.length >= concept.layers.length ? 3 : 0,
        mixPlan.masterBus?.targetPeakDb === -6 ? 2 : 0
      ].reduce((sum, value) => sum + value, 0),
      10,
      {
        export: delivery.export,
        stemCount: deliveryStems.length,
        masterBus: mixPlan.masterBus ?? null
      },
      ["Generate attribution before publishing if remote samples are used."]
    )
  ];
  const score = checks.reduce((sum, check) => sum + check.points, 0);
  const maxScore = checks.reduce((sum, check) => sum + check.maxPoints, 0);
  const status = blockers.length > 0
    ? "blocked"
    : score >= 85
      ? "ready_for_dry_run"
      : score >= 70
        ? "needs_samples_or_bridge_review"
        : "needs_plan_iteration";

  return {
    scorecardType: "concept_production_scorecard",
    arrangement_id: arrangement.id,
    concept: {
      id: concept.id,
      preset: concept.preset,
      title: sanitizeRemoteSampleText(concept.concept, 500),
      style: concept.style,
      tempo: concept.tempo,
      key: concept.key,
      duration_seconds: concept.target_duration_seconds
    },
    status,
    score,
    maxScore,
    grade: score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "needs_rework",
    realExecutionReady: preflight.readyForRealWrite === true,
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      remoteHttpExposure: false,
      arbitraryBridgePayloads: false,
      localPathsRedacted: true
    },
    summary: {
      layers: {
        total: concept.layers.length,
        audio: audioLayers.length,
        midi: midiLayers.length,
        returns: returnLayers.length,
        assignedAudio: assignedAudioLayers.length,
        missingAudioLayers
      },
      actions: {
        total: arrangement.actions.length,
        samplePlacements: actionCount("ableton_load_preset_or_sample"),
        midiNoteInsertions: actionCount("ableton_insert_midi_notes"),
        sends: actionCount("ableton_set_track_send"),
        unsafe: unsafeActions.length
      },
      stagedReview: {
        deviceChains: arrangement.devicePlan.length,
        automationTargets: arrangement.automationPlan.length
      },
      bridge: {
        checked: checkBridge,
        preflightStatus: preflight.status ?? null,
        reachable: preflight.bridge?.reachable ?? null
      }
    },
    checks,
    exactNextToolCalls: {
      timeline: { name: "ableton_render_concept_timeline", arguments: { plan_id: concept.id } },
      mixPlan: { name: "ableton_render_concept_mix_plan", arguments: { plan_id: concept.id } },
      executionManifest: { name: "ableton_render_concept_execution_manifest", arguments: { arrangement_id: arrangement.id } },
      routingReadiness: { name: "ableton_plan_concept_routing_readiness", arguments: { arrangement_id: arrangement.id, check_bridge: true } },
      deviceAutomationReadiness: { name: "ableton_plan_concept_device_automation_readiness", arguments: { arrangement_id: arrangement.id, check_bridge: true } },
      preflightWithBridge: { name: "ableton_preflight_concept_execution", arguments: { arrangement_id: arrangement.id, check_bridge: true } },
      dryRunExecution: { name: "ableton_execute_concept_plan", arguments: { arrangement_id: arrangement.id, dry_run: true } },
      approvalBundle: { name: "ableton_create_concept_execution_approval_bundle", arguments: { arrangement_id: arrangement.id, check_bridge: true } }
    },
    nextSteps: status === "ready_for_dry_run"
      ? [
        "Run dryRunExecution to review the exact stored execution path.",
        "Load Ableton and the Max for Live bridge, then run preflightWithBridge.",
        "Review approvalBundle before enabling ABLETON_MCP_ENABLE_WRITE=1 for any real execution."
      ]
      : [
        "Resolve warning or fail checks before real execution.",
        "Fill missing audio layers with approved local samples or prepared reference-audio layers.",
        "Run routingReadiness and deviceAutomationReadiness after the bridge is loaded."
      ]
  };
}

export async function executeConceptPlan(options: ConceptExecutionOptions) {
  const arrangement = await readArrangementPlan(options.arrangement_id);
  const approvalId = conceptExecutionApprovalId(arrangement);
  if (options.dry_run !== false) {
    return {
      dry_run: true,
      arrangement: arrangementForReport(arrangement),
      executableActions: arrangement.actions.filter((action) => action.safeToExecute).length,
      approvalRequirement: {
        requiredForRealExecution: true,
        approval_id: approvalId,
        approval_confirmed: false,
        approvalBundleToolCall: {
          name: "ableton_create_concept_execution_approval_bundle",
          arguments: { arrangement_id: arrangement.id, check_bridge: true }
        }
      },
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 to create the approved session skeleton in Ableton."
    };
  }
  requireFlag(FLAGS.write, "ABLETON_MCP_ENABLE_WRITE", "Executing concept arrangement plan");
  if (options.approval_id !== approvalId || options.approval_confirmed !== true) {
    throw new AbletonMcpError(
      "Concept execution requires the matching approval_id and approval_confirmed=true.",
      "CONCEPT_EXECUTION_APPROVAL_REQUIRED",
      [
        "Call ableton_create_concept_execution_approval_bundle for this arrangement.",
        "Review the redacted actions, preflight, and staged device/automation plans.",
        "Retry with the returned approval_id and approval_confirmed=true only after intentional approval."
      ]
    );
  }
  const journal = await startConceptExecutionJournal({
    arrangement_id: arrangement.id,
    approval_id: approvalId,
    executableActions: arrangement.actions.filter((action) => action.safeToExecute).length,
    totalActions: arrangement.actions.length
  });
  let resolution: CreatedTrackResolution;
  try {
    await recordConceptExecutionJournalEvent(journal, { type: "preflight_started" });
    const preflight = await preflightConceptExecution({ arrangement_id: arrangement.id, check_bridge: true }) as {
      readyForRealWrite: boolean;
      bridge?: { resolution?: CreatedTrackResolution | null };
      nextSteps?: string[];
    };
    if (!preflight.readyForRealWrite || !preflight.bridge?.resolution) {
      await recordConceptExecutionJournalEvent(journal, { type: "preflight_not_ready", preflight }, "failed");
      throw new AbletonMcpError(
        "Concept execution preflight is not ready for real writes.",
        "CONCEPT_EXECUTION_PREFLIGHT_NOT_READY",
        Array.isArray(preflight.nextSteps) ? preflight.nextSteps.map(String) : ["Load the bridge, rerun preflight, and resolve blockers before real execution."]
      );
    }
    resolution = preflight.bridge.resolution;
    await recordConceptExecutionJournalEvent(journal, { type: "preflight_ready", resolution });
  } catch (error) {
    if (journal.journal.status !== "failed") {
      await recordConceptExecutionJournalEvent(journal, { type: "preflight_failed", error: journalError(error) }, "failed");
    }
    throw error;
  }
  const results = [];
  for (const action of arrangement.actions) {
    if (!action.safeToExecute) {
      const skipped = { action: action.action, skipped: true, reason: action.reason };
      await recordConceptExecutionJournalEvent(journal, { type: "action_skipped", ...skipped });
      results.push(skipped);
      continue;
    }
    const payload = actionPayloadWithCreatedTrack(action, resolution);
    await recordConceptExecutionJournalEvent(journal, { type: "action_started", action: action.action, payload: redactActionPayload(payload) });
    let bridge;
    try {
      bridge = await bridgeAction(action.action, payload);
    } catch (error) {
      await recordConceptExecutionJournalEvent(journal, { type: "action_failed", action: action.action, payload: redactActionPayload(payload), error: journalError(error) }, "failed");
      throw error;
    }
    const unsupported = extractUnsupportedBridgeResult(bridge);
    if (unsupported) {
      await recordConceptExecutionJournalEvent(journal, { type: "action_unsupported", action: action.action, payload: redactActionPayload(payload), unsupported }, "failed");
      throw new AbletonMcpError(
        `Concept execution stopped because ${action.action} is unsupported by the loaded bridge.`,
        "CONCEPT_EXECUTION_UNSUPPORTED_ACTION",
        [
          `Bridge reason: ${unsupported.reason}`,
          ...unsupported.nextSteps,
          "Some earlier approved actions may already have run; inspect the Ableton set before retrying.",
          "Rerun ableton_preflight_concept_execution after updating the bridge or removing the unsupported action from the stored plan."
        ]
      );
    }
    await recordConceptExecutionJournalEvent(journal, { type: "action_succeeded", action: action.action, payload: redactActionPayload(payload), bridge });
    results.push({ action: action.action, bridge, resolvedPayload: redactActionPayload(payload) });
  }
  const executionJournal = await recordConceptExecutionJournalEvent(journal, { type: "completed", resultCount: results.length }, "completed");
  return { dry_run: false, arrangement_id: arrangement.id, resolution, executionJournal, results };
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

export async function renderConceptMixPlan(planId: string) {
  const plan = await readConceptPlan(planId);
  const horror = plan.preset === "liminal_backrooms_horror";
  const musicalLayers = plan.layers.filter((layer) => layer.type !== "return");
  const returnLayers = plan.layers.filter((layer) => layer.type === "return");
  const layerPlans = plan.layers.map((layer) => ({
    name: layer.name,
    type: layer.type,
    role: layer.role,
    color: colorForLayer(layer),
    busRole: layerBusRole(layer, horror),
    priority: layerMixPriority(layer, horror),
    mix: {
      fader: layer.mix.volume,
      approximateLevelDb: normalizedLevelToDb(layer.mix.volume),
      pan: layer.mix.pan,
      sends: layer.mix.sends
    },
    frequencyFocus: layerFrequencyFocus(layer, horror),
    spatialTreatment: layerSpatialTreatment(layer),
    deviceChain: layer.deviceChain,
    automationCues: layer.automation.map((cue) => ({
      cue,
      target: automationTarget(cue),
      execution: "staged",
      discoveryRequired: true
    }))
  }));

  return {
    plan_id: plan.id,
    preset: plan.preset,
    concept: sanitizeRemoteSampleText(plan.concept, 500),
    style: plan.style,
    tempo: plan.tempo,
    key: plan.key,
    duration_seconds: plan.target_duration_seconds,
    mixStrategy: horror
      ? "Keep the source memory narrow and damaged, let room tone and reverb define scale, and reserve low pressure/mechanical texture for section changes."
      : "Keep the core texture stable, use the motif as the musical anchor, and let return effects create continuity between sections.",
    layerCount: plan.layers.length,
    audioLayerCount: musicalLayers.filter((layer) => layer.type === "audio").length,
    midiLayerCount: musicalLayers.filter((layer) => layer.type === "midi").length,
    returnLayerCount: returnLayers.length,
    layers: layerPlans,
    returns: returnLayers.map((layer) => ({
      name: layer.name,
      role: layer.role,
      color: colorForLayer(layer),
      fader: layer.mix.volume,
      approximateLevelDb: normalizedLevelToDb(layer.mix.volume),
      deviceChain: layer.deviceChain,
      useCases: returnUseCases(layer)
    })),
    sectionMixCues: plan.sections.map((section, index) => ({
      name: section.name,
      start_seconds: section.start_seconds,
      end_seconds: section.start_seconds + section.duration_seconds,
      focus: sectionProductionFocus(section, index, horror),
      activeLayers: plan.layers
        .filter((layer) => layerIsActiveInSection(layer, index, horror))
        .map((layer) => layer.name),
      automationFocus: plan.layers
        .filter((layer) => layerIsActiveInSection(layer, index, horror) && layer.automation.length > 0)
        .map((layer) => ({ layer: layer.name, cues: layer.automation }))
    })),
    gainStaging: {
      masterHeadroomDb: -6,
      normalize: false,
      lowEndPolicy: horror ? "Keep Low Pressure felt more than heard; avoid stacking rumble under room tone." : "High-pass non-bass ambience before shared reverb.",
      clippingPolicy: "Leave conservative master headroom before any video loudness pass."
    },
    masterBus: {
      sampleRate: 48000,
      bitDepth: "24",
      normalize: false,
      targetPeakDb: -6,
      postProductionNote: "Do final loudness after picture lock; preserve negative space and long tails."
    },
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      automationWriteStatus: "plan_only"
    },
    nextSteps: [
      "Use ableton_render_concept_timeline to confirm section-by-section layer entrances.",
      "Use ableton_search_concept_samples or approved local samples for the audio layers.",
      "Use ableton_build_layered_arrangement_plan after sample and layer choices are reviewed.",
      "Keep automation and device changes staged until bridge discovery proves the exact targets."
    ]
  };
}

export async function renderConceptAutomationMap(planId: string) {
  const plan = await readConceptPlan(planId);
  const horror = plan.preset === "liminal_backrooms_horror";
  const lanes = plan.layers
    .filter((layer) => layer.automation.length > 0)
    .flatMap((layer) => layer.automation.map((cue, automationIndex) => {
      const target = automationTargetName(cue);
      const activeSections = plan.sections
        .map((section, sectionIndex) => ({ section, sectionIndex }))
        .filter(({ sectionIndex }) => layerIsActiveInSection(layer, sectionIndex, horror));
      const points = activeSections.flatMap(({ section, sectionIndex }) =>
        automationSectionPoints(plan, layer, cue, target, section, sectionIndex, horror)
      );
      return {
        lane_id: `${layer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${automationIndex}`,
        layer: layer.name,
        layerType: layer.type,
        cue,
        target,
        targetLabel: automationTargetLabel(target),
        candidateDevices: devicesForAutomation(target, layer.deviceChain),
        parameterHints: automationParameterHints(target),
        writeSupport: target === "volume"
          ? "mixer_volume_requires_bridge_preflight"
          : target === "midi_velocity"
            ? "note_velocity_requires_clip_note_review"
            : "requires_device_parameter_map_and_verified_liveapi_support",
        activeSections: activeSections.map(({ section }) => section.name),
        points,
        dryRunTemplates: automationDryRunTemplates(target),
        reviewNotes: automationReviewNotes(target, cue, layer)
      };
    }));

  return {
    plan_id: plan.id,
    preset: plan.preset,
    concept: sanitizeRemoteSampleText(plan.concept, 500),
    tempo: plan.tempo,
    key: plan.key,
    duration_seconds: plan.target_duration_seconds,
    safety: {
      writesAbleton: false,
      downloads: false,
      uiControl: false,
      remoteHttpExposure: false,
      requiresApprovalForRealWrites: true
    },
    summary: {
      sections: plan.sections.length,
      layersWithAutomation: new Set(lanes.map((lane) => lane.layer)).size,
      lanes: lanes.length,
      points: lanes.reduce((count, lane) => count + lane.points.length, 0),
      targets: [...new Set(lanes.map((lane) => lane.target))]
    },
    sectionMap: plan.sections.map((section, index) => ({
      name: section.name,
      start_seconds: section.start_seconds,
      end_seconds: section.start_seconds + section.duration_seconds,
      start_beats: beatsFromSeconds(section.start_seconds, plan.tempo),
      end_beats: beatsFromSeconds(section.start_seconds + section.duration_seconds, plan.tempo),
      productionFocus: sectionProductionFocus(section, index, horror)
    })),
    lanes,
    exactNextToolCalls: {
      buildArrangementPlan: { name: "ableton_build_layered_arrangement_plan", arguments: { plan_id: plan.id } },
      deviceAutomationReadiness: { name: "ableton_plan_concept_device_automation_readiness", arguments: { arrangement_id: "arrangement-...", check_bridge: true } },
      preflight: { name: "ableton_preflight_concept_execution", arguments: { arrangement_id: "arrangement-...", check_bridge: true } }
    },
    nextSteps: [
      "Review the lane points before building the arrangement plan.",
      "After ableton_build_layered_arrangement_plan, run ableton_plan_concept_device_automation_readiness with check_bridge=true.",
      "Use ableton_get_device_parameter_map and dry-run automation tools before any write-gated automation attempt.",
      "Keep real automation writes behind ABLETON_MCP_ENABLE_WRITE=1, the approval bundle, and bridge preflight."
    ]
  };
}

export async function renderConceptTimeline(planId: string) {
  const plan = await readConceptPlan(planId);
  const horror = plan.preset === "liminal_backrooms_horror";
  const sections = plan.sections.map((section, sectionIndex) => {
    const activeLayers = plan.layers
      .filter((layer) => layerIsActiveInSection(layer, sectionIndex, horror))
      .map((layer) => ({
        name: layer.name,
        type: layer.type,
        role: layerSectionRole(layer, sectionIndex, horror),
        productionRole: layer.role,
        sourceStrategy: layer.sourceStrategy,
        color: colorForLayer(layer),
        mix: layer.mix,
        deviceChain: layer.deviceChain,
        automation: layer.automation,
        searchQueries: layer.searchQueries.slice(0, 3)
      }));
    return {
      name: section.name,
      start_seconds: section.start_seconds,
      end_seconds: section.start_seconds + section.duration_seconds,
      duration_seconds: section.duration_seconds,
      intent: section.intent,
      productionFocus: sectionProductionFocus(section, sectionIndex, horror),
      color: colorForSection(sectionIndex),
      activeLayers,
      automationCues: activeLayers
        .filter((layer) => layer.automation.length > 0)
        .map((layer) => ({
          layer: layer.name,
          cues: layer.automation
        })),
      sampleSearchCues: activeLayers
        .filter((layer) => layer.type === "audio")
        .flatMap((layer) => layer.searchQueries.map((query) => ({ layer: layer.name, query })))
        .slice(0, 8)
    };
  });

  return {
    plan_id: plan.id,
    preset: plan.preset,
    concept: sanitizeRemoteSampleText(plan.concept, 500),
    style: plan.style,
    tempo: plan.tempo,
    key: plan.key,
    duration_seconds: plan.target_duration_seconds,
    sectionCount: sections.length,
    layerCount: plan.layers.length,
    sections,
    nextSteps: [
      "Use this timeline to decide which layers need approved local samples before arrangement execution.",
      "Call ableton_build_layered_arrangement_plan after approving layer/sample choices.",
      "Keep downloads, Ableton writes, and UI control disabled until their explicit gates are intentionally enabled."
    ]
  };
}

function normalizedLevelToDb(value: number) {
  return Number((20 * Math.log10(Math.max(0.001, value))).toFixed(1));
}

function beatsFromSeconds(value: number, tempo: number) {
  return Number(((value / 60) * tempo).toFixed(3));
}

function clamp01(value: number) {
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
}

function automationTargetLabel(target: ArrangementPlan["automationPlan"][number]["target"]) {
  if (target === "filter") return "filter cutoff or bandwidth";
  if (target === "reverb") return "reverb send, dry/wet, decay, or return level";
  if (target === "delay") return "delay send, feedback, dry/wet, or bandwidth";
  if (target === "volume") return "track or return volume";
  if (target === "midi_velocity") return "MIDI note velocity thinning";
  return "reviewed parameter";
}

function automationSectionPoints(
  plan: ConceptPlan,
  layer: ConceptLayer,
  cue: string,
  target: ArrangementPlan["automationPlan"][number]["target"],
  section: ConceptSection,
  sectionIndex: number,
  horror: boolean
) {
  const anchors = [
    { phase: "start", ratio: 0 },
    { phase: "mid", ratio: 0.5 },
    { phase: "end", ratio: 1 }
  ] as const;
  return anchors.map((anchor) => {
    const timeSeconds = section.start_seconds + (section.duration_seconds * anchor.ratio);
    return {
      section: section.name,
      phase: anchor.phase,
      time_seconds: Number(timeSeconds.toFixed(3)),
      time_beats: beatsFromSeconds(timeSeconds, plan.tempo),
      value: automationPointValue(plan, layer, cue, target, sectionIndex, anchor.phase, horror),
      target
    };
  });
}

function automationPointValue(
  plan: ConceptPlan,
  layer: ConceptLayer,
  cue: string,
  target: ArrangementPlan["automationPlan"][number]["target"],
  sectionIndex: number,
  phase: "start" | "mid" | "end",
  horror: boolean
) {
  const text = `${cue} ${layer.name}`.toLowerCase();
  const sectionProgress = plan.sections.length <= 1 ? 0 : sectionIndex / (plan.sections.length - 1);
  const phaseValue = phase === "start" ? 0 : phase === "mid" ? 0.5 : 1;
  const intensity = clamp01(plan.intensity / 10);

  if (target === "filter") {
    if (text.includes("closing") || text.includes("narrowing") || text.includes("low-pass")) {
      return clamp01(0.78 - (sectionProgress * 0.42) - (phaseValue * 0.12) - (intensity * 0.08));
    }
    return clamp01(0.42 + (Math.sin((sectionIndex + phaseValue) * Math.PI) * 0.12) + (horror ? 0.04 : 0.1));
  }

  if (target === "reverb") {
    const bloom = text.includes("bloom") || text.includes("tail") || text.includes("swell") ? 0.16 * phaseValue : 0;
    return clamp01(0.28 + (sectionProgress * 0.28) + bloom + (horror ? 0.08 : 0));
  }

  if (target === "delay") {
    const throwBoost = text.includes("throw") || text.includes("feedback") ? 0.22 * phaseValue : 0.08 * phaseValue;
    const collapseBoost = horror && sectionIndex >= 2 ? 0.12 : 0;
    return clamp01(0.12 + throwBoost + collapseBoost + (sectionProgress * 0.16));
  }

  if (target === "volume") {
    if (text.includes("mute")) return phase === "mid" && sectionIndex % 2 === 0 ? 0.05 : clamp01(layer.mix.volume);
    if (text.includes("fade")) return clamp01(layer.mix.volume * (1 - (sectionProgress * 0.28)) * (1 - (phaseValue * 0.1)));
    if (text.includes("swell")) return clamp01((layer.mix.volume * 0.6) + (phaseValue * 0.28) + (sectionProgress * 0.08));
    return clamp01(layer.mix.volume);
  }

  if (target === "midi_velocity") {
    return clamp01(0.72 - (sectionProgress * 0.32) - (phaseValue * 0.12));
  }

  return 0.5;
}

function automationDryRunTemplates(target: ArrangementPlan["automationPlan"][number]["target"]) {
  if (target === "midi_velocity") {
    return [
      { name: "ableton_get_clip_notes", arguments: { track_index: 0, clip_slot_index: 0 } },
      { name: "ableton_humanize_midi_clip", arguments: { track_index: 0, clip_slot_index: 0, velocity_amount: 4, timing_amount: 0.01, dry_run: true } }
    ];
  }
  return [
    automationSummaryDiscoveryCall(0, target),
    { name: "ableton_get_device_parameter_map", arguments: { track_index: 0, device_index: 0 } },
    { name: "ableton_create_automation_envelope", arguments: { track_index: 0, device_index: 0, parameter_index: 0, dry_run: true } },
    { name: "ableton_set_automation_point", arguments: { track_index: 0, device_index: 0, parameter_index: 0, time: 0, value: 0.5, dry_run: true } }
  ];
}

function automationReviewNotes(target: ArrangementPlan["automationPlan"][number]["target"], cue: string, layer: ConceptLayer) {
  const notes = [
    `Cue: ${cue}`,
    `Layer role: ${layer.role}`
  ];
  if (target === "filter") notes.push("Confirm cutoff units and parameter range from ableton_get_device_parameter_map before writing.");
  if (target === "reverb" || target === "delay") notes.push("Use ableton_extract_automation_summary to compare send targets with device dry/wet or feedback candidates.");
  if (target === "volume") notes.push("Use ableton_extract_automation_summary after bridge preflight resolves the generated track index.");
  if (target === "midi_velocity") notes.push("Review existing clip notes before destructive velocity edits.");
  if (target === "unknown") notes.push("Treat as a production note until a reviewed parameter target is chosen.");
  return notes;
}

function layerBusRole(layer: ConceptLayer, horror: boolean) {
  const name = layer.name.toLowerCase();
  if (layer.type === "return") return name.includes("delay") ? "delay_return" : "reverb_return";
  if (name.includes("distant room")) return "distance_bed";
  if (name.includes("low pressure")) return "controlled_low_end";
  if (name.includes("mechanical") || name.includes("reverse") || name.includes("fragment")) return "threat_fx";
  if (name.includes("motif") || name.includes("memory")) return horror ? "damaged_music_memory" : "musical_anchor";
  if (name.includes("room") || name.includes("texture")) return "ambience_bed";
  return "supporting_layer";
}

function layerMixPriority(layer: ConceptLayer, horror: boolean) {
  const name = layer.name.toLowerCase();
  if (horror && name.includes("degraded memory")) return 1;
  if (name.includes("distant room")) return 5;
  if (name.includes("room") || name.includes("core texture")) return 2;
  if (name.includes("motif")) return horror ? 3 : 1;
  if (name.includes("low pressure")) return 4;
  if (layer.type === "return") return 5;
  return 3;
}

function layerFrequencyFocus(layer: ConceptLayer, horror: boolean) {
  const name = layer.name.toLowerCase();
  if (name.includes("low pressure")) return ["sub restraint", "low-mid cleanup", "mono compatibility"];
  if (name.includes("distant room")) return ["noise-floor control", "narrow low-mid pocket", "soft high-pass before shared space"];
  if (name.includes("degraded") || name.includes("memory")) return horror ? ["band-limited mids", "rolled-off top", "controlled low cut"] : ["midrange identity", "soft top"];
  if (name.includes("room") || name.includes("texture")) return ["low-mid resonance control", "wide ambience", "high-pass before reverb"];
  if (name.includes("mechanical")) return ["harshness control", "transient containment", "narrow resonances"];
  if (name.includes("reverse") || name.includes("fragment")) return ["filtered highs", "transition tails", "delay bandwidth"];
  if (name.includes("motif")) return ["clear note center", "soft attack", "avoid masking memory layer"];
  if (layer.type === "return") return ["dark tail shaping", "mud removal", "controlled feedback"];
  return ["gain staging", "masking check"];
}

function layerSpatialTreatment(layer: ConceptLayer) {
  const name = layer.name.toLowerCase();
  if (layer.type === "return") {
    return { position: "shared_space", width: "wide", motion: "slow return-level changes" };
  }
  if (name.includes("low pressure")) {
    return { position: "center", width: "mono_or_near_mono", motion: "subtle swell only" };
  }
  if (name.includes("distant room")) {
    return { position: "far_background", width: "wide_but_low", motion: "barely perceptible level and bandwidth breathing" };
  }
  if (name.includes("mechanical") || name.includes("reverse")) {
    return { position: layer.mix.pan > 0 ? "right_detail" : "left_detail", width: "medium", motion: "short throws around section changes" };
  }
  if (name.includes("room") || name.includes("texture")) {
    return { position: "wide_bed", width: "wide", motion: "slow filter and reverb bloom" };
  }
  return { position: layer.mix.pan < 0 ? "left_of_center" : layer.mix.pan > 0 ? "right_of_center" : "center", width: "controlled", motion: "automation only where it serves the section" };
}

function automationTarget(cue: string) {
  const text = cue.toLowerCase();
  if (text.includes("filter") || text.includes("low-pass") || text.includes("bandwidth")) return "filter";
  if (text.includes("reverb")) return "reverb";
  if (text.includes("delay") || text.includes("feedback")) return "delay";
  if (text.includes("volume") || text.includes("fade") || text.includes("swell")) return "volume";
  if (text.includes("velocity")) return "midi_velocity";
  return "review";
}

function returnUseCases(layer: ConceptLayer) {
  const name = layer.name.toLowerCase();
  if (name.includes("delay")) return ["short memory repeats", "section-end throws", "bandwidth narrowing before silence"];
  if (name.includes("reverb")) return ["shared impossible-space tail", "transition blooms", "distance for source-memory layers"];
  return ["shared space", "glue between sections"];
}
