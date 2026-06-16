import fs from "node:fs/promises";
import path from "node:path";
import { analyzeAudioFile, analyzeLufs, analyzeSpectrum, detectClipping } from "./analysis.js";
import { LOCAL_PATHS } from "./config.js";
import { redactPath, resolveSafePath } from "./security.js";
import { type SourceUsageMode } from "./source-usage.js";

type BriefInput = {
  concept: string;
  style?: string;
  target_duration_seconds?: number;
  intensity?: number;
};

type AudioWindow = {
  start_seconds?: number;
  duration_seconds?: number;
};

const MoodWords = {
  horror: ["horror", "creepy", "terrifying", "dread", "occult", "haunted", "liminal", "backrooms", "nightmare"],
  sad: ["sad", "gloomy", "lonely", "melancholy", "nostalgic", "dystopic", "decayed"],
  dreamy: ["dream", "dreamcore", "vaporwave", "surreal", "unreal", "sleep", "memory"],
  energetic: ["banging", "dance", "club", "fast", "breakcore", "drum", "pulse", "drive"],
  clinical: ["clinical", "lab", "experiment", "cold war", "machine", "surveillance"]
};

const AvoidWords = ["no ", "not ", "avoid ", "without "];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
}

function includesAny(text: string, candidates: string[]) {
  const lower = text.toLowerCase();
  return candidates.some((candidate) => lower.includes(candidate));
}

function scoreFromFindings(findings: string[], base = 82) {
  return clamp(base - findings.length * 9, 0, 100);
}

function moodTags(concept: string) {
  return Object.entries(MoodWords)
    .filter(([, terms]) => includesAny(concept, terms))
    .map(([tag]) => tag);
}

function intensityLabel(intensity = 6) {
  if (intensity <= 3) return "restrained";
  if (intensity >= 8) return "extreme";
  return "moderate";
}

function inferBpmRange(concept: string, style?: string) {
  const text = `${concept} ${style ?? ""}`.toLowerCase();
  if (includesAny(text, ["ambient", "liminal", "dream", "horror", "drone"])) return { min: 45, max: 78, default: 62, feel: "slow or beatless" };
  if (includesAny(text, ["vaporwave", "mall", "synthwave"])) return { min: 72, max: 96, default: 82, feel: "slow head-nod" };
  if (includesAny(text, ["breakcore", "jungle"])) return { min: 150, max: 190, default: 172, feel: "fast chopped" };
  if (includesAny(text, ["club", "house", "dance"])) return { min: 118, max: 132, default: 124, feel: "steady dance" };
  return { min: 70, max: 118, default: 92, feel: "moderate" };
}

function inferKey(concept: string) {
  if (includesAny(concept, ["sad", "gloomy", "horror", "dark", "dystopic", "occult", "liminal"])) return "C# minor";
  if (includesAny(concept, ["warm", "hope", "bright", "celebration"])) return "A major";
  if (includesAny(concept, ["dream", "vaporwave", "nostalgic"])) return "F minor";
  return "D minor";
}

function noteSequenceForKey(key: string, lengthBeats: number) {
  const root = key.toLowerCase().startsWith("c#") ? 61 : key.toLowerCase().startsWith("f") ? 65 : 62;
  const shape = [0, 3, 7, 10, 8, 7, 3, 2];
  const count = Math.max(4, Math.min(16, Math.round(lengthBeats)));
  return Array.from({ length: count }, (_, index) => ({
    pitch: clamp(root + shape[index % shape.length]!, 0, 127),
    beat: Number((index * 0.5).toFixed(2)),
    duration: index % 3 === 2 ? 0.75 : 0.5,
    velocity: 66 + ((index * 7) % 25)
  }));
}

function defaultNextCalls() {
  return [
    { name: "ableton_get_production_readiness", arguments: { check_bridge: false } },
    { name: "ableton_parse_music_brief", arguments: { concept: "user brief", intensity: 6 } },
    { name: "ableton_compile_mood_palette", arguments: { concept: "user brief", intensity: 6 } },
    { name: "ableton_generate_revision_pass", arguments: { concept: "user brief" } }
  ];
}

export function parseMusicBrief(input: BriefInput) {
  const concept = input.concept.trim();
  const text = `${concept} ${input.style ?? ""}`;
  const tokenList = words(text);
  const moods = moodTags(text);
  const avoidList = text.split(/[.;\n]/)
    .map((part) => part.trim())
    .filter((part) => AvoidWords.some((prefix) => part.toLowerCase().includes(prefix)))
    .slice(0, 8);
  const bpm = inferBpmRange(concept, input.style);
  return {
    concept,
    style: input.style ?? null,
    targetDurationSeconds: input.target_duration_seconds ?? 180,
    intensity: input.intensity ?? 6,
    moodTags: moods.length ? moods : ["focused"],
    extractedTerms: tokenList.slice(0, 48),
    avoidList,
    inferredTempo: bpm,
    inferredKey: inferKey(text),
    sourceUsageRecommendation: "private_experiment" as SourceUsageMode,
    firstProductionDecisions: [
      "Pick tempo/key before writing MIDI.",
      "Name every layer role before adding sounds.",
      "Render and analyze a rough mix before adding polish."
    ],
    nextToolCalls: [
      { name: "ableton_compile_mood_palette", arguments: { concept, style: input.style, intensity: input.intensity ?? 6 } },
      { name: "ableton_plan_tempo_grid", arguments: { concept, style: input.style, target_duration_seconds: input.target_duration_seconds ?? 180 } },
      { name: "ableton_generate_harmonic_palette", arguments: { concept, mood: moods.join(", "), complexity: "medium" } }
    ]
  };
}

export function compileMoodPalette(input: BriefInput) {
  const text = `${input.concept} ${input.style ?? ""}`;
  const moods = moodTags(text);
  const horror = moods.includes("horror");
  const dreamy = moods.includes("dreamy");
  return {
    concept: input.concept,
    intensity: input.intensity ?? 6,
    moodTags: moods,
    approvedPalette: [
      dreamy ? "detuned vapor chords" : "muted harmonic bed",
      horror ? "sub pressure and distant impacts" : "controlled low foundation",
      "role-based texture layers",
      "wide but mono-safe reflections",
      "short ear-candy moments after the hook works"
    ],
    forbiddenPalette: [
      "cheesy preset leads",
      "random layers with no role",
      "bright pads that fight the concept",
      "downloads without explicit gate",
      "foreground UI/mouse control unless the user chooses it"
    ],
    mixTarget: {
      lowEnd: "centered and controlled",
      stereo: "wide reflections, stable center",
      dynamics: intensityLabel(input.intensity),
      roughMasterHeadroom: "-1 dBFS true peak target for review renders"
    },
    nextToolCalls: [
      { name: "ableton_plan_layer_stack", arguments: { concept: input.concept, section: "full_track", intensity: input.intensity ?? 6 } },
      { name: "ableton_design_synth_patch", arguments: { concept: input.concept, role: "signature hook texture" } }
    ]
  };
}

export function planTempoGrid(input: BriefInput & { reference_path?: string }) {
  const tempo = inferBpmRange(input.concept, input.style);
  const duration = input.target_duration_seconds ?? 180;
  const sections = 6;
  return {
    bpm: tempo.default,
    bpmRange: { min: tempo.min, max: tempo.max },
    feel: tempo.feel,
    swing: includesAny(input.concept, ["human", "funk", "groove"]) ? 0.56 : 0.5,
    gridStrategy: includesAny(input.concept, ["ambient", "liminal", "horror"]) ? "slow reference grid with off-grid texture entrances" : "bar-aligned sections with role-specific humanization",
    tempoMap: Array.from({ length: sections }, (_, index) => ({
      section: index + 1,
      startSeconds: Math.round((duration / sections) * index),
      bpm: index >= sections - 2 && includesAny(input.concept, ["collapse", "decay", "fall"]) ? tempo.default - 2 : tempo.default,
      note: index === 0 ? "establish feel" : index === sections - 1 ? "final return or drain" : "controlled evolution"
    })),
    nextToolCalls: [
      { name: "ableton_generate_groove_map", arguments: { feel: tempo.feel, bpm: tempo.default, bars: 8, intensity: input.intensity ?? 6 } },
      { name: "ableton_generate_motif_system", arguments: { concept: input.concept, key: inferKey(input.concept), bpm: tempo.default, length_beats: 8 } }
    ]
  };
}

export function generateHarmonicPalette(input: { concept: string; mood?: string; complexity?: "simple" | "medium" | "advanced" }) {
  const key = inferKey(`${input.concept} ${input.mood ?? ""}`);
  const dark = key.toLowerCase().includes("minor");
  const chords = dark
    ? ["i9", "VImaj7#11", "IIImaj9", "VIIadd9", "iv11", "V7b13"]
    : ["Imaj9", "vi9", "IVmaj7#11", "Vadd9", "ii11"];
  return {
    key,
    mode: dark ? "minor with borrowed color tones" : "major with suspended color tones",
    complexity: input.complexity ?? "medium",
    chordVocabulary: chords,
    tensionRules: [
      "Keep the hook notes stable while chords decay or reharmonize around them.",
      "Use borrowed b9/#11/b13 colors for unease only at section turns.",
      "Resolve bass motion before adding more high-frequency detail."
    ],
    avoidNotes: dark ? ["over-bright major third emphasis", "constant leading-tone tension"] : ["constant root-position block chords"],
    nextToolCalls: [
      { name: "ableton_generate_motif_system", arguments: { concept: input.concept, key, bpm: inferBpmRange(input.concept).default, length_beats: 8 } }
    ]
  };
}

export function generateMotifSystem(input: { concept: string; key?: string; bpm?: number; length_beats?: number }) {
  const key = input.key ?? inferKey(input.concept);
  const bpm = input.bpm ?? inferBpmRange(input.concept).default;
  const motif = noteSequenceForKey(key, input.length_beats ?? 8);
  return {
    key,
    bpm,
    motif,
    transformations: [
      { name: "plain_return", method: "repeat the contour with restrained dynamics" },
      { name: "late_return", method: "delay selected notes by 40-90 ms" },
      { name: "missing_notes", method: "remove every third note on later returns" },
      { name: "bass_answer", method: "answer the first three pitches one octave down" },
      { name: "contour_only", method: "preserve rhythm while reducing pitches to two-note shadow" }
    ],
    hookStrategy: "Make one identifiable idea return in changed forms instead of adding unrelated melodies.",
    nextToolCalls: [
      { name: "ableton_score_hook_memorability", arguments: { motif: motif.map((note) => note.pitch), concept: input.concept } },
      { name: "ableton_generate_midi_clip_plan", arguments: { key, bars: 8, style: "motif", concept: input.concept } }
    ]
  };
}

export function scoreHookMemorability(input: { motif: number[]; concept?: string }) {
  const motif = input.motif;
  const unique = new Set(motif).size;
  const repetition = motif.length > 1 ? 1 - unique / motif.length : 0;
  const intervals = motif.slice(1).map((pitch, index) => Math.abs(pitch - motif[index]!));
  const largeLeaps = intervals.filter((interval) => interval > 7).length;
  const contourChanges = intervals.filter((interval) => interval > 0).length;
  const findings = [
    motif.length < 4 ? "motif is too short to become memorable" : null,
    motif.length > 16 ? "motif may be too long for a clear hook" : null,
    repetition < 0.2 ? "motif has low repetition" : null,
    largeLeaps > 2 ? "motif has too many large leaps for easy memory" : null,
    contourChanges === 0 ? "motif has no contour movement" : null
  ].filter(Boolean) as string[];
  return {
    score: scoreFromFindings(findings, 88),
    strengths: [
      repetition >= 0.2 ? "repetition exists" : null,
      largeLeaps <= 2 ? "intervals are controlled" : null,
      motif.length >= 4 && motif.length <= 12 ? "length is hook-friendly" : null
    ].filter(Boolean),
    weaknesses: findings,
    revisionPlan: findings.length
      ? ["Simplify the contour, repeat a short cell, then vary rhythm on later returns."]
      : ["Keep this motif as the identity anchor and build transformations around it."]
  };
}

export function planLayerStack(input: { concept: string; section?: string; intensity?: number }) {
  const intensity = input.intensity ?? 6;
  return {
    section: input.section ?? "full_track",
    layers: [
      { role: "hook_memory", register: "mid", job: "carry the recognizable idea" },
      { role: "harmonic_body", register: "low_mid_to_mid", job: "support emotion without masking the hook" },
      { role: "sub_foundation", register: "sub", job: "controlled pressure, mono-safe" },
      { role: "texture_air", register: "high", job: "movement and atmosphere, not hiss" },
      { role: "transition_moments", register: "wide", job: "section changes and callbacks" }
    ],
    frequencyPlan: {
      sub: "one owner only",
      lowMid: "avoid stacking pads, piano, and drones in the same octave",
      presence: "reserve for hook/vocal-like material",
      air: intensity >= 8 ? "dark detail, avoid harshness" : "light texture"
    },
    nextToolCalls: [
      { name: "ableton_design_synth_patch", arguments: { concept: input.concept, role: "hook_memory" } },
      { name: "ableton_plan_stereo_depth_stage", arguments: { concept: input.concept, tracks: ["hook_memory", "harmonic_body", "sub_foundation", "texture_air"] } }
    ]
  };
}

export function createMomentMap(input: { concept: string; duration_seconds?: number; intensity?: number }) {
  const duration = input.duration_seconds ?? 180;
  const moments = [
    { timeSeconds: Math.round(duration * 0.18), type: "hook_first_clear_return", purpose: "make the track memorable early" },
    { timeSeconds: Math.round(duration * 0.36), type: "texture_flip", purpose: "prove the space is changing" },
    { timeSeconds: Math.round(duration * 0.55), type: "negative_space_drop", purpose: "create tension by removing layers" },
    { timeSeconds: Math.round(duration * 0.72), type: "payoff_or_reveal", purpose: "highest emotional density" },
    { timeSeconds: Math.round(duration * 0.9), type: "final_motif_shadow", purpose: "return the identity in damaged form" }
  ];
  return {
    durationSeconds: duration,
    moments,
    rule: "Each moment must remove, reveal, or transform a named layer. Do not add random effects.",
    nextToolCalls: [
      { name: "ableton_generate_automation_curves", arguments: { concept: input.concept, target: "macro_width_and_filter", section: "moment_map", intensity: input.intensity ?? 6 } }
    ]
  };
}

export function planNegativeSpace(input: { concept: string; sections?: string[]; intensity?: number }) {
  const sections = input.sections?.length ? input.sections : ["intro", "development", "break", "reveal", "ending"];
  return {
    sections: sections.map((section, index) => ({
      section,
      remove: index % 2 === 0 ? ["high texture", "extra percussion"] : ["sub pressure", "main chord layer"],
      keep: index % 2 === 0 ? ["hook memory"] : ["room tone or tail"],
      reason: "Let contrast make the next entrance feel intentional."
    })),
    failureSigns: ["constant fullness", "no hook impact", "fatigue before the midpoint"],
    nextToolCalls: [
      { name: "ableton_score_density_curve", arguments: { concept: input.concept, arrangement_summary: sections.join(" -> ") } }
    ]
  };
}

function patchMacros(role: string) {
  return ["age", "body", "dirt", "motion", "distance", "width", "instability", "collapse"].map((name, index) => ({
    macro: index + 1,
    name,
    targetHint: `${role}:${name}`
  }));
}

export function designSynthPatch(input: { concept: string; role: string; device_preference?: string; brightness?: number; instability?: number }) {
  const role = input.role;
  const device = input.device_preference ?? (includesAny(role + input.concept, ["bell", "fm", "metal"]) ? "Operator" : includesAny(role + input.concept, ["pad", "wide", "evolving"]) ? "Wavetable" : "Drift");
  return {
    device,
    role,
    concept: input.concept,
    patch: {
      oscillator: device === "Operator" ? "low-ratio FM with restrained modulation" : device === "Wavetable" ? "dark wavetable pair with slow position drift" : "analog-style detuned saw/triangle blend",
      filter: "lowpass with role-specific envelope motion",
      envelope: "slow enough to avoid cheap plucks unless the role is transient",
      modulation: "tempo-synced low-depth movement",
      brightness: input.brightness ?? 4,
      instability: input.instability ?? 5
    },
    macros: patchMacros(role),
    nextToolCalls: [
      { name: "ableton_score_patch_against_concept", arguments: { concept: input.concept, role, patch_plan: { device, role } } }
    ]
  };
}

export function designOperatorPatch(input: { concept: string; role: string; brightness?: number; instability?: number }) {
  return {
    role: input.role,
    operatorSettings: {
      algorithm: includesAny(input.role, ["bell", "glass"]) ? 5 : 2,
      oscillators: [
        { osc: "A", ratio: 1, level: 0.8 },
        { osc: "B", ratio: includesAny(input.role, ["bell", "metal"]) ? 2.01 : 0.5, level: 0.22 },
        { osc: "C", ratio: 3, level: 0.08 },
        { osc: "D", ratio: 0.25, level: includesAny(input.role, ["sub"]) ? 0.35 : 0.04 }
      ],
      filter: "12 dB lowpass, key tracking reduced",
      pitchEnvelope: input.instability && input.instability > 6 ? "small downward sag on attacks" : "off or very subtle"
    },
    macroMap: patchMacros(input.role)
  };
}

export function designWavetablePatch(input: { concept: string; role: string; motion?: number; width?: number }) {
  return {
    role: input.role,
    wavetableSettings: {
      oscillator1: "dark harmonic table",
      oscillator2: "subtle noisy or vocal-like table",
      unison: (input.width ?? 5) > 6 ? "classic, low amount" : "off or narrow",
      filters: ["lowpass for body", "notch or bandpass for movement"],
      lfos: [{ target: "wavetable_position", rate: "8-32 bars", amount: input.motion ?? 4 }]
    },
    modulationMatrix: patchMacros(input.role)
  };
}

export function designDriftPatch(input: { concept: string; role: string; warmth?: number; age?: number; detune?: number }) {
  return {
    role: input.role,
    driftSettings: {
      oscillatorBlend: "triangle/saw with restrained noise",
      filterDrive: clamp(input.warmth ?? 5, 0, 10),
      detune: clamp(input.detune ?? 4, 0, 10),
      age: clamp(input.age ?? 6, 0, 10),
      envelope: "rounded attack, medium release, no click unless transient role"
    },
    macroMap: patchMacros(input.role)
  };
}

export function designSamplerInstrument(input: { samples: Array<{ path?: string; title?: string; root_note?: string }>; role: string; key_range?: string }) {
  return {
    role: input.role,
    zoneMap: input.samples.slice(0, 16).map((sample, index) => ({
      zone: index + 1,
      source: sample.path ? redactPath(sample.path) : sample.title ?? `sample-${index + 1}`,
      rootNote: sample.root_note ?? "C3",
      keyRange: input.key_range ?? "C1-C6",
      loop: "use ableton_find_best_loop_points before enabling sustain loops"
    })),
    samplerPlan: {
      envelopes: "short fade-in, musical release, velocity mapped to filter and level",
      filter: "role-dependent lowpass/highpass before reverb",
      safety: "only use approved local paths or manifest-tracked experiment sources"
    }
  };
}

export function designGranularTexture(input: { path?: string; concept: string; density?: number; grain_size_ms?: number; movement?: number }) {
  return {
    source: input.path ? redactPath(input.path) : "source to be selected",
    concept: input.concept,
    texturePlan: {
      density: input.density ?? 5,
      grainSizeMs: input.grain_size_ms ?? 140,
      movement: input.movement ?? 5,
      filter: "dark band-limited texture; avoid broadband static beds",
      stereo: "wide grains with mono-safe dry anchor"
    },
    renderPlan: {
      dryRunFirst: true,
      nextToolCalls: input.path
        ? [{ name: "ableton_convert_audio_file", arguments: { input: input.path, output: "samples/staging/<name>.wav", format: "wav", preset: "stretched_ambience", dry_run: true } }]
        : [{ name: "ableton_match_samples_to_concept", arguments: { concept: input.concept, candidates: [] } }]
    }
  };
}

export function designRackMacros(input: { patch_plan: Record<string, unknown>; role: string }) {
  return {
    role: input.role,
    macros: patchMacros(input.role),
    automationIdeas: [
      "Automate age and distance over section boundaries.",
      "Use collapse as a late-arrangement moment, not constant motion.",
      "Keep width automation out of sub/bass roles."
    ],
    patchPlanSummary: input.patch_plan
  };
}

export function scoreSoundDesignMaturity(input: { concept: string; role: string; patch_plan?: Record<string, unknown>; notes?: string }) {
  const text = JSON.stringify(input.patch_plan ?? {}) + " " + (input.notes ?? "");
  const findings = [
    includesAny(text, ["bright saw", "supersaw", "preset lead"]) ? "patch risks cheesy preset lead character" : null,
    includesAny(text, ["reverb"] ) && !includesAny(text, ["filter", "eq", "send"]) ? "space exists but tone shaping is underspecified" : null,
    !includesAny(text, ["macro", "movement", "lfo", "automation"]) ? "patch lacks performance movement" : null,
    !input.role ? "patch has no role" : null
  ].filter(Boolean) as string[];
  return {
    score: scoreFromFindings(findings, 84),
    findings,
    revisions: findings.length ? ["Define role, darken the tone, add slow modulation, and assign macros before arrangement use."] : ["Patch is mature enough for arrangement review."],
    failureClass: findings.length ? "immature_sound_design" : "none"
  };
}

export function scorePatchAgainstConcept(input: { concept: string; role: string; patch_plan: Record<string, unknown> }) {
  const text = JSON.stringify(input.patch_plan).toLowerCase();
  const findings = [
    !text.includes(input.role.toLowerCase().split(/\s+/)[0] ?? "") ? "patch plan does not clearly reference its role" : null,
    text.length < 80 ? "patch plan is too thin for repeatable sound design" : null,
    includesAny(input.concept, ["dark", "horror", "liminal"]) && includesAny(text, ["bright", "supersaw"]) ? "brightness may fight the concept" : null
  ].filter(Boolean) as string[];
  return {
    score: scoreFromFindings(findings, 86),
    issues: findings,
    revisions: findings.map((finding) => `Revise: ${finding}`),
    nextToolCalls: [{ name: "ableton_design_rack_macros", arguments: { role: input.role, patch_plan: input.patch_plan } }]
  };
}

export function scoreArrangementArc(input: { concept: string; sections: string[]; duration_seconds?: number }) {
  const sections = input.sections;
  const findings = [
    sections.length < 4 ? "arrangement has too few sections for a complete arc" : null,
    sections.length > 10 ? "arrangement may have too many sections for focus" : null,
    !sections.some((section) => includesAny(section, ["break", "dropout", "silence", "negative"])) ? "no negative-space moment is named" : null,
    !sections.some((section) => includesAny(section, ["return", "hook", "motif"])) ? "hook return is not explicit" : null
  ].filter(Boolean) as string[];
  return {
    score: scoreFromFindings(findings, 85),
    findings,
    arc: sections.map((section, index) => ({ section, energy: Math.round(40 + (index / Math.max(1, sections.length - 1)) * 45) })),
    revisionPlan: findings.length ? ["Add explicit hook return, contrast section, and one negative-space event."] : ["Proceed to render review."]
  };
}

export function scoreArrangementMotion(input: { concept: string; arrangement_summary: string }) {
  const summary = input.arrangement_summary.toLowerCase();
  const findings = [
    !includesAny(summary, ["autom", "filter", "mute", "return", "drop", "transition"]) ? "motion language is missing" : null,
    !includesAny(summary, ["hook", "motif", "theme"]) ? "motif return is missing" : null,
    summary.length < 80 ? "arrangement summary may be underdeveloped" : null
  ].filter(Boolean) as string[];
  return {
    score: scoreFromFindings(findings, 82),
    findings,
    exactChanges: findings.length ? ["Add one transition event per section boundary and one motif callback after the midpoint."] : ["Review with a rough render."]
  };
}

export function scoreDensityCurve(input: { concept: string; arrangement_summary?: string; sections?: string[] }) {
  const sections = input.sections?.length ? input.sections : (input.arrangement_summary ?? "intro development reveal ending").split(/\s*->\s*|\s*,\s*/).filter(Boolean);
  return {
    densityCurve: sections.map((section, index) => ({
      section,
      density: clamp(30 + index * 12 - (section.toLowerCase().includes("break") ? 25 : 0), 10, 95),
      risk: section.toLowerCase().includes("break") ? "underfilled by design" : index > 3 ? "fatigue if layers do not rotate" : "normal"
    })),
    revisionPlan: ["Mute or filter one layer before adding a new one.", "Use a dropout before major returns."]
  };
}

export function generateAutomationCurves(input: { concept: string; target: string; section?: string; curve_type?: string; intensity?: number }) {
  const intensity = input.intensity ?? 6;
  const curveType = input.curve_type ?? (includesAny(input.concept, ["collapse", "fall", "dread"]) ? "exponential_fall" : "slow_s_curve");
  return {
    target: input.target,
    section: input.section ?? "full_track",
    curveType,
    points: Array.from({ length: 6 }, (_, index) => ({
      time: index / 5,
      value: Number(clamp(curveType === "exponential_fall" ? 1 - (index / 5) ** 1.8 : 0.25 + Math.sin((index / 5) * Math.PI) * 0.55, 0, 1).toFixed(3))
    })),
    dryRunWriteTemplate: {
      name: "ableton_write_device_parameter_automation",
      arguments: { track_index: 0, device_index: 0, parameter_index: 0, points: "<scale normalized points to beat times>", dry_run: true }
    },
    intensity
  };
}

export async function analyzeRenderQuality(input: { path: string; concept: string } & AudioWindow) {
  const [audio, lufs, clipping, spectrum] = await Promise.all([
    analyzeAudioFile(input.path),
    analyzeLufs(input.path),
    detectClipping(input.path, -0.3),
    analyzeSpectrum(input.path, { start_seconds: input.start_seconds ?? 0, duration_seconds: input.duration_seconds ?? 30 })
  ]);
  const bands = spectrum.bands as Array<{ name: string; relative_db: number }>;
  const findings = [
    (clipping as any).clipping_likely ? "sample peak is too close to clipping" : null,
    (lufs as any).true_peak_dbfs !== null && (lufs as any).true_peak_dbfs > -1 ? "true peak target may be too hot" : null,
    bands.find((band) => band.name === "sub" && band.relative_db > -2) ? "sub band may dominate the mix" : null,
    bands.find((band) => band.name === "presence" && band.relative_db > -1) ? "presence band may become harsh" : null
  ].filter(Boolean) as string[];
  return {
    path: (audio as any).path,
    concept: input.concept,
    scores: {
      technical: scoreFromFindings(findings, 90),
      lowEnd: bands.find((band) => band.name === "sub" && band.relative_db > -2) ? 65 : 82,
      harshnessRisk: bands.find((band) => band.name === "presence" && band.relative_db > -1) ? 55 : 82,
      releaseReadiness: findings.length ? 62 : 84
    },
    findings,
    analysis: { audio, lufs, clipping, spectrum },
    nextToolCalls: [
      { name: "ableton_generate_revision_pass", arguments: { concept: input.concept, render_path: input.path, findings } }
    ]
  };
}

export async function detectFrequencyMasking(input: { stems: string[]; duration_seconds?: number }) {
  const stems = input.stems.slice(0, 12);
  const reports = await Promise.all(stems.map(async (stem) => analyzeSpectrum(stem, { duration_seconds: input.duration_seconds ?? 20 })));
  const bands = ["sub", "bass", "low_mid", "mid", "presence", "edge", "air"];
  const collisions = bands.map((band) => {
    const owners = reports.map((report, index) => ({
      stem: redactPath(stems[index]!),
      relativeDb: ((report.bands as any[]).find((item) => item.name === band)?.relative_db ?? -99) as number
    })).filter((item) => item.relativeDb > -6);
    return owners.length > 1 ? { band, owners, severity: owners.length >= 3 ? "high" : "medium" } : null;
  }).filter(Boolean);
  return {
    stemCount: stems.length,
    collisions,
    priorityMoves: collisions.length ? ["Assign one owner per crowded band, then use EQ, level, or arrangement mutes before mastering."] : ["No broad-band masking collision detected by heuristic probes."]
  };
}

export async function detectMudHarshnessSibilance(input: { path: string } & AudioWindow) {
  const spectrum = await analyzeSpectrum(input.path, { start_seconds: input.start_seconds ?? 0, duration_seconds: input.duration_seconds ?? 30 });
  const band = (name: string) => (spectrum.bands as any[]).find((item) => item.name === name)?.relative_db ?? -99;
  const findings = [
    band("low_mid") > -2 ? { issue: "mud_or_boxiness", band: "low_mid", severity: "medium" } : null,
    band("presence") > -1 ? { issue: "harsh_presence", band: "presence", severity: "medium" } : null,
    band("air") > -1 ? { issue: "fizz_or_sibilance_risk", band: "air", severity: "low" } : null
  ].filter(Boolean);
  return { spectrum, findings, fixes: findings.length ? ["Cut or reduce the crowded band on supporting layers before boosting the hook."] : ["No obvious mud/harshness flag in broad-band probes."] };
}

export async function detectPhaseMonoIssues(input: { path: string }) {
  const audio = await analyzeAudioFile(input.path);
  const streams = ((audio as any).ffprobe?.streams ?? []) as any[];
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const channels = Number(audioStream?.channels ?? 0);
  return {
    path: (audio as any).path,
    channels,
    monoCompatible: channels <= 1 ? true : null,
    correlation: null,
    confidence: channels <= 1 ? "high" : "low_without_stem_or_phase_decode",
    warnings: channels > 1 ? ["Stereo file detected. Current v1 check verifies format and gives mono-safety guidance; detailed correlation can be added with a stereo PCM probe."] : [],
    fixes: ["Keep sub and kick/bass content centered.", "Check a mono fold-down before final export."]
  };
}

export async function scoreLowEndControl(input: { path: string } & AudioWindow) {
  const spectrum = await analyzeSpectrum(input.path, { start_seconds: input.start_seconds ?? 0, duration_seconds: input.duration_seconds ?? 30 });
  const sub = (spectrum.bands as any[]).find((band) => band.name === "sub")?.relative_db ?? -99;
  const bass = (spectrum.bands as any[]).find((band) => band.name === "bass")?.relative_db ?? -99;
  const findings = [
    sub > -1 ? "sub may dominate headroom" : null,
    bass < -18 ? "bass foundation may be weak" : null
  ].filter((finding): finding is string => Boolean(finding));
  return { score: scoreFromFindings(findings, 84), spectrum, findings, revisions: findings.length ? ["Lower sub, high-pass non-bass layers, and recheck LUFS/peak."] : ["Low end looks controlled by broad-band probe."] };
}

export async function scoreMixBalance(input: { path: string; concept?: string } & AudioWindow) {
  const [spectrum, lufs, clipping] = await Promise.all([
    analyzeSpectrum(input.path, { start_seconds: input.start_seconds ?? 0, duration_seconds: input.duration_seconds ?? 30 }),
    analyzeLufs(input.path),
    detectClipping(input.path, -0.3)
  ]);
  const findings = [
    (clipping as any).clipping_likely ? "peak headroom problem" : null,
    ((lufs as any).integrated_lufs ?? -99) > -8 ? "very loud for an unmastered review render" : null
  ].filter(Boolean) as string[];
  return {
    score: scoreFromFindings(findings, 84),
    balanceReport: { spectrum, lufs, clipping },
    nextMoves: findings.length ? ["Fix gain staging and broad tonal balance before adding effects."] : ["Move to arrangement and sound-design revision scoring."]
  };
}

export async function scoreMixTranslation(input: { path: string } & AudioWindow) {
  const [low, phase, balance] = await Promise.all([
    scoreLowEndControl(input),
    detectPhaseMonoIssues({ path: input.path }),
    scoreMixBalance(input)
  ]);
  return {
    translationScores: {
      phone: Math.min((balance as any).score, 78),
      headphones: (balance as any).score,
      car: Math.min((low as any).score, (balance as any).score),
      mono: phase.monoCompatible === true ? 90 : 70
    },
    riskBands: (low as any).findings,
    fixes: ["Check mono low end, avoid relying on very wide essential hooks, and keep harshness controlled."]
  };
}

export function planStereoDepthStage(input: { concept: string; tracks?: string[]; playback_targets?: string[] }) {
  const tracks = input.tracks?.length ? input.tracks : ["hook", "bass", "texture", "impact", "return"];
  return {
    stageMap: tracks.map((track) => ({
      track,
      centerPriority: includesAny(track, ["bass", "kick", "sub", "hook"]),
      width: includesAny(track, ["texture", "return", "air"]) ? "wide" : "controlled",
      distance: includesAny(track, ["hook", "vocal"]) ? "front" : includesAny(track, ["return", "texture"]) ? "back" : "middle"
    })),
    monoCritical: tracks.filter((track) => includesAny(track, ["bass", "kick", "sub", "hook"])),
    widthRisks: ["Do not widen sub pressure.", "Do not put the only hook identity entirely in side information."],
    playbackTargets: input.playback_targets ?? ["headphones", "phone", "car", "mono check"]
  };
}

export async function scoreDepthImage(input: { path: string; stems?: string[] }) {
  const phase = await detectPhaseMonoIssues({ path: input.path });
  return {
    score: phase.channels > 1 ? 74 : 68,
    imageFindings: phase.warnings,
    fixes: ["Use shared returns for depth, keep dry hook center, and verify mono before final delivery."]
  };
}

export async function compareRenderVersions(input: { before_path: string; after_path: string; concept: string }) {
  const [before, after] = await Promise.all([
    analyzeRenderQuality({ path: input.before_path, concept: input.concept }),
    analyzeRenderQuality({ path: input.after_path, concept: input.concept })
  ]);
  const beforeScore = (before as any).scores.releaseReadiness as number;
  const afterScore = (after as any).scores.releaseReadiness as number;
  return {
    before: { path: redactPath(input.before_path), score: beforeScore, findings: before.findings },
    after: { path: redactPath(input.after_path), score: afterScore, findings: after.findings },
    improved: afterScore > beforeScore ? ["technical release readiness score improved"] : [],
    regressed: afterScore < beforeScore ? ["technical release readiness score regressed"] : [],
    nextPass: afterScore >= beforeScore ? "Continue with focused musical/professionalism review." : "Revert or isolate the change that harmed the score."
  };
}

export async function generateRevisionPass(input: { concept: string; render_path?: string; current_arrangement?: string; findings?: string[] }) {
  const renderFindings = input.render_path ? (await analyzeRenderQuality({ path: input.render_path, concept: input.concept })).findings : [];
  const findings = [...(input.findings ?? []), ...renderFindings];
  const categories = classifyFindings(findings.join(" ") || input.current_arrangement || input.concept);
  return {
    priority: categories[0] ?? "arrangement_motion",
    findings,
    revisionPlan: categories.map((category) => revisionForCategory(category)),
    exactToolCalls: [
      { name: "ableton_score_arrangement_motion", arguments: { concept: input.concept, arrangement_summary: input.current_arrangement ?? "current arrangement" } },
      { name: "ableton_score_sound_design_maturity", arguments: { concept: input.concept, role: "weakest lead or texture" } },
      { name: "ableton_score_mix_balance", arguments: input.render_path ? { path: input.render_path, concept: input.concept } : { path: "<render path>", concept: input.concept } }
    ],
    stopCriteria: ["No clipping warnings.", "One clear hook return.", "No unassigned layers.", "Private sources are manifest-tracked before release review."]
  };
}

export function generateNextRevisionPass(input: { project_state: Record<string, unknown>; previous_findings?: string[]; concept?: string }) {
  const previous = input.previous_findings ?? [];
  const categories = classifyFindings(previous.join(" ") || JSON.stringify(input.project_state));
  return {
    nextPass: revisionForCategory(categories[0] ?? "arrangement_motion"),
    avoidRepeating: previous.slice(-5),
    stopCriteria: ["Technical score stable or improved.", "No new blockers introduced.", "User intent still matches the brief."]
  };
}

function classifyFindings(text: string) {
  const classes = [
    includesAny(text, ["clip", "peak", "headroom"]) ? "gain_staging" : null,
    includesAny(text, ["sub", "bass", "low end"]) ? "low_end" : null,
    includesAny(text, ["harsh", "presence", "fizz", "sibilance"]) ? "harshness" : null,
    includesAny(text, ["static", "motion", "boring", "density"]) ? "arrangement_motion" : null,
    includesAny(text, ["cheesy", "preset", "synth", "patch"]) ? "sound_design" : null,
    includesAny(text, ["hook", "motif", "memory"]) ? "hook_identity" : null
  ].filter(Boolean) as string[];
  return classes.length ? classes : ["arrangement_motion"];
}

function revisionForCategory(category: string) {
  const plans: Record<string, Record<string, unknown>> = {
    gain_staging: { category, action: "Lower hot buses, keep true peak target below -1 dBFS, rerender before mastering." },
    low_end: { category, action: "Make one low-end owner, high-pass non-bass layers, keep sub mono." },
    harshness: { category, action: "Darken support layers, reduce presence/air on non-hook tracks, avoid fake static beds." },
    arrangement_motion: { category, action: "Add mute/dropout/automation changes at section boundaries before adding layers." },
    sound_design: { category, action: "Replace generic presets with role-specific Operator/Wavetable/Drift patches and macros." },
    hook_identity: { category, action: "Simplify the hook, return it in changed forms, and remove unrelated melodic fragments." }
  };
  return plans[category] ?? { category, action: "Make one focused change, render, analyze, then decide." };
}

export function classifyRenderFailure(input: { findings?: string[]; notes?: string; scores?: Record<string, number> }) {
  const text = `${input.findings?.join(" ") ?? ""} ${input.notes ?? ""} ${JSON.stringify(input.scores ?? {})}`;
  return {
    classes: classifyFindings(text),
    primary: classifyFindings(text)[0],
    nextToolCalls: [
      { name: "ableton_generate_revision_pass", arguments: { concept: "current brief", findings: input.findings ?? [] } }
    ]
  };
}

export function createSongRunbook(input: { concept: string; usage_mode?: SourceUsageMode; target_duration_seconds?: number }) {
  return {
    concept: input.concept,
    usageMode: input.usage_mode ?? "private_experiment",
    phases: [
      "readiness and control-mode check",
      "brief parsing and mood palette",
      "source manifest and sample role selection",
      "tempo, harmonic palette, and motif system",
      "layer stack and sound design",
      "arrangement moments and negative space",
      "dry-run execution or offline render",
      "render quality analysis",
      "focused revision pass",
      "release source readiness and delivery package"
    ],
    exactFirstCalls: defaultNextCalls(),
    safety: ["dry_run first", "writes/downloads/UI explicit opt-in", "source status non-blocking only in private_experiment"]
  };
}

export function planSessionHandoff(input: { concept: string; arrangement_id?: string; delivery_target?: string }) {
  return {
    concept: input.concept,
    deliveryTarget: input.delivery_target ?? "review bundle",
    handoff: {
      requiredFiles: ["master", "stems", "source manifest", "verification report", "revision notes"],
      naming: "tracks and stems should be named by role, not generic track numbers",
      arrangement: input.arrangement_id ?? "not provided",
      nextReviewCalls: ["ableton_analyze_render_quality", "ableton_check_release_source_readiness", "ableton_create_delivery_package"]
    },
    missing: input.arrangement_id ? [] : ["arrangement_id is not linked; include it when a stored arrangement exists"]
  };
}

export function validateProjectOrganization(input: { tracks?: string[]; stems?: string[]; manifest_path?: string; arrangement_id?: string }) {
  const issues = [
    !input.tracks?.length ? "track role list is missing" : null,
    input.tracks?.some((track) => /^track\s*\d+$/i.test(track)) ? "generic track names detected" : null,
    !input.manifest_path ? "source manifest is not linked" : null,
    !input.stems?.length ? "stem list is missing" : null
  ].filter(Boolean) as string[];
  return {
    ok: issues.length === 0,
    issues,
    fixes: issues.length ? ["Name tracks by role, link the source manifest, and include expected stem paths before final handoff."] : ["Project organization is ready for handoff review."]
  };
}

export async function createDeliveryPackage(input: {
  project_name: string;
  master_path?: string;
  stems?: string[];
  manifest_path?: string;
  notes?: string;
  dry_run?: boolean;
}) {
  const master = input.master_path ? await resolveSafePath(input.master_path, { mustExist: true }) : null;
  const stems = await Promise.all((input.stems ?? []).slice(0, 64).map(async (stem) => resolveSafePath(stem, { mustExist: true })));
  const manifest = input.manifest_path ? await resolveSafePath(input.manifest_path, { mustExist: true }) : null;
  const report = {
    schema: "ableton-mcp-delivery-package-v1",
    projectName: input.project_name,
    createdAt: new Date().toISOString(),
    master: master ? redactPath(master.real) : null,
    stems: stems.map((stem) => redactPath(stem.real)),
    sourceManifest: manifest ? redactPath(manifest.real) : null,
    notes: input.notes ?? null,
    releaseWarnings: manifest ? [] : ["No source manifest linked; release_candidate package is not source-ready."]
  };
  const output = path.join(LOCAL_PATHS.diagnostics, "reports", `ableton-delivery-${input.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}-${Date.now()}.json`);
  if (input.dry_run !== false) {
    return { dry_run: true, package: report, output: redactPath(output), nextStep: "Call with dry_run=false to write this delivery package report." };
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return { dry_run: false, package: report, output: redactPath(output) };
}

export async function assertAudioPathForTests(filePath: string) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  return redactPath(safe.real);
}
