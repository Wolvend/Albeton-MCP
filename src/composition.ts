type SessionPlanInput = {
  brief: string;
  style?: string;
  target_duration_seconds?: number;
  intensity?: number;
};

type DrumRackPlanInput = {
  style?: string;
  concept?: string;
  bars?: number;
  intensity?: number;
};

type InstrumentChainInput = {
  role: string;
  style?: string;
  intensity?: number;
};

type EffectChainInput = {
  source: string;
  style?: string;
  intensity?: number;
};

type ArrangementInput = {
  brief: string;
  style?: string;
  target_duration_seconds?: number;
  intensity?: number;
};

type MixActionsInput = {
  issue: string;
  context?: string;
  intensity?: number;
};

const Safety = {
  writesAbleton: false,
  downloads: false,
  uiControl: false,
  arbitraryShell: false,
  arbitraryUrlFetch: false,
  remoteTextPolicy: "untrusted_data"
};

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim().slice(0, 1000);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isLiminalHorror(...values: string[]) {
  const text = values.join(" ").toLowerCase();
  return ["backrooms", "liminal", "horror", "dementia", "empty mall", "hallway", "fluorescent", "memory", "abandoned", "uncanny"].some((word) => text.includes(word));
}

function sectionPlan(duration: number, horror: boolean) {
  const ratios = horror
    ? [
      ["Isolation", 0.16, "establish room tone, fluorescent air, and negative space"],
      ["Recognizable Motif", 0.2, "let the damaged melody become briefly identifiable"],
      ["Decay Loop", 0.24, "repeat the motif while narrowing bandwidth and increasing distance"],
      ["Spatial Collapse", 0.22, "bring in pressure, mechanical texture, and unstable returns"],
      ["Unresolved Tail", 0.18, "leave a long dark tail with sparse final fragments"]
    ] as const
    : [
      ["Setup", 0.18, "establish palette and groove"],
      ["Theme", 0.28, "introduce the main musical idea"],
      ["Development", 0.28, "add counter layers and movement"],
      ["Break", 0.12, "create contrast and reset energy"],
      ["Release", 0.14, "resolve or hand off cleanly"]
    ] as const;
  let cursor = 0;
  return ratios.map(([name, ratio, intent], index) => {
    const length = index === ratios.length - 1 ? Math.max(1, duration - cursor) : Math.max(1, Math.round(duration * ratio));
    const section = { name, start_seconds: cursor, duration_seconds: length, intent };
    cursor += length;
    return section;
  });
}

function productionPalette(brief: string, style = "", intensity = 6) {
  const horror = isLiminalHorror(brief, style);
  return {
    preset: horror ? "liminal_backrooms_horror" : "general_cinematic",
    tempo: horror ? Math.max(48, 74 - intensity) : Math.max(72, 104 - Math.floor(intensity / 2)),
    key: horror ? "C minor" : "A minor",
    style: style || (horror ? "liminal/backrooms/horror" : "cinematic electronic"),
    horror
  };
}

export function generateSessionPlan(input: SessionPlanInput) {
  const brief = cleanText(input.brief);
  const intensity = clampInt(input.intensity, 1, 10, 6);
  const duration = clampInt(input.target_duration_seconds, 30, 900, 180);
  const palette = productionPalette(brief, input.style, intensity);
  const tracks = palette.horror
    ? [
      { name: "Degraded Memory", type: "audio", role: "recognizable damaged melody", volume: 0.62, pan: -0.12, sends: { reverb: 0.42, delay: 0.18 }, devices: ["EQ Eight", "Saturator", "Echo", "Hybrid Reverb", "Utility"] },
      { name: "Stretched Room", type: "audio", role: "wide liminal ambience bed", volume: 0.5, pan: 0, sends: { reverb: 0.68, delay: 0.05 }, devices: ["EQ Eight", "Hybrid Reverb", "Auto Filter"] },
      { name: "Distant Room Tone", type: "audio", role: "far-room noise floor", volume: 0.29, pan: 0, sends: { reverb: 0.58, delay: 0.04 }, devices: ["EQ Eight", "Auto Filter", "Hybrid Reverb", "Utility"] },
      { name: "Low Pressure", type: "audio", role: "controlled low-frequency unease", volume: 0.38, pan: 0, sends: { reverb: 0.12, delay: 0 }, devices: ["EQ Eight", "Compressor", "Utility"] },
      { name: "Mechanical Texture", type: "audio", role: "intermittent threat texture", volume: 0.34, pan: 0.22, sends: { reverb: 0.3, delay: 0.2 }, devices: ["EQ Eight", "Saturator", "Echo"] },
      { name: "Reversed Fragments", type: "audio", role: "transition swells", volume: 0.28, pan: 0.18, sends: { reverb: 0.52, delay: 0.34 }, devices: ["EQ Eight", "Echo", "Hybrid Reverb", "Auto Filter"] },
      { name: "Sparse Motif", type: "midi", role: "dissonant editable motif", volume: 0.48, pan: -0.05, sends: { reverb: 0.5, delay: 0.14 }, devices: ["Wavetable", "EQ Eight", "Hybrid Reverb"] }
    ]
    : [
      { name: "Drums", type: "midi", role: "rhythmic anchor", volume: 0.72, pan: 0, sends: { reverb: 0.08, delay: 0.02 }, devices: ["Drum Rack", "EQ Eight", "Glue Compressor"] },
      { name: "Bass", type: "midi", role: "low-end support", volume: 0.66, pan: 0, sends: { reverb: 0, delay: 0 }, devices: ["Wavetable", "EQ Eight", "Compressor"] },
      { name: "Harmony", type: "midi", role: "chord bed", volume: 0.56, pan: -0.1, sends: { reverb: 0.22, delay: 0.06 }, devices: ["Instrument Rack", "EQ Eight", "Hybrid Reverb"] },
      { name: "Lead", type: "midi", role: "main theme", volume: 0.6, pan: 0.08, sends: { reverb: 0.18, delay: 0.14 }, devices: ["Wavetable", "EQ Eight", "Echo"] },
      { name: "FX", type: "audio", role: "transitions and ear candy", volume: 0.42, pan: 0.12, sends: { reverb: 0.35, delay: 0.28 }, devices: ["EQ Eight", "Auto Filter", "Echo"] }
    ];
  return {
    brief,
    preset: palette.preset,
    tempo: palette.tempo,
    key: palette.key,
    style: palette.style,
    intensity,
    target_duration_seconds: duration,
    sections: sectionPlan(duration, palette.horror),
    tracks,
    returns: [
      { name: palette.horror ? "Memory Reverb" : "Shared Reverb", role: "shared dark space", devices: ["Hybrid Reverb", "EQ Eight", "Compressor"] },
      { name: palette.horror ? "Distant Delay" : "Tempo Delay", role: "controlled repeats and throws", devices: ["Echo", "EQ Eight", "Utility"] }
    ],
    exactNextToolCalls: [
      { name: "ableton_plan_concept_track", arguments: { concept: brief, target_duration_seconds: duration, intensity, style: palette.style, sources: ["local_library", "internet_archive", "freesound"] } },
      { name: "ableton_generate_midi_clip_plan", arguments: { concept: brief, key: palette.key, bars: palette.horror ? 8 : 4, style: palette.style, intensity, track_index: 0, clip_slot_index: 0 } },
      { name: "ableton_suggest_mix_actions", arguments: { issue: palette.horror ? "make the layers eerie but intelligible" : "balance layers without masking", context: brief, intensity } }
    ],
    safety: Safety
  };
}

export function generateDrumRackPlan(input: DrumRackPlanInput) {
  const style = cleanText(input.style, "house");
  const concept = cleanText(input.concept);
  const intensity = clampInt(input.intensity, 1, 10, 6);
  const bars = clampInt(input.bars, 1, 64, 4);
  const horror = isLiminalHorror(style, concept);
  const pads = horror
    ? [
      ["C1", "Sub Pulse", "low thump below room tone", "low drone thump"],
      ["C#1", "Distant Knock", "short room knock with long tail", "distant knock hallway"],
      ["D1", "Metal Scrape", "controlled metallic texture", "metal scrape ambience"],
      ["D#1", "Fluorescent Tick", "thin high tick for unease", "fluorescent tick noise"],
      ["E1", "Reverse Breath", "reversed transition inhale", "reverse breath swell"],
      ["F1", "Room Thump", "soft impact in a large room", "room thump impact"],
      ["F#1", "Tape Click", "damaged playback detail", "tape click noise"],
      ["G1", "Air Gate", "near-silence accent", "room tone gate"]
    ]
    : [
      ["C1", "Kick", "main low transient", `${style} kick one shot`],
      ["D1", "Snare", "backbeat or accent", `${style} snare one shot`],
      ["F#1", "Closed Hat", "pulse and subdivision", `${style} closed hat`],
      ["A#1", "Open Hat", "section lift", `${style} open hat`],
      ["C2", "Clap", "width accent", `${style} clap`],
      ["D#2", "Perc", "syncopation", `${style} percussion one shot`]
    ];
  return {
    style,
    concept: concept || null,
    preset: horror ? "liminal_backrooms_horror_percussion" : "general_drum_rack",
    bars,
    intensity,
    pads: pads.map(([note, name, role, query], index) => ({
      pad: index + 1,
      note,
      name,
      role,
      sampleSearchQuery: query,
      velocityRange: horror ? [24, Math.max(48, 78 - intensity)] : [56, Math.min(127, 82 + intensity * 3)]
    })),
    patternGuidance: horror
      ? ["Use very few hits per section.", "Leave silence between impacts.", "Route metallic and reverse pads to delay/reverb returns."]
      : ["Keep kick/snare stable first.", "Add hats before decorative percussion.", "Check low-end masking before saturation."],
    exactNextToolCalls: [
      { name: "ableton_search_samples", arguments: { query: pads[0]?.[3] ?? style, page: 1, pageSize: 5 } },
      { name: "ableton_search_internet_archive_audio", arguments: { query: pads[0]?.[3] ?? style, page: 1, pageSize: 5 } },
      { name: "ableton_generate_midi_clip_plan", arguments: { concept: concept || style, key: "C minor", bars, style: horror ? "liminal/backrooms/horror percussion" : style, intensity, track_index: 0, clip_slot_index: 0 } }
    ],
    safety: Safety
  };
}

export function suggestInstrumentChain(input: InstrumentChainInput) {
  const role = cleanText(input.role, "lead");
  const style = cleanText(input.style);
  const intensity = clampInt(input.intensity, 1, 10, 6);
  const horror = isLiminalHorror(role, style);
  const devices = horror || /motif|memory|lead|pad/i.test(role)
    ? [
      { device: "Wavetable", purpose: "simple decayed tonal source", parameters: ["soft attack", "dark wavetable", "low unison"] },
      { device: "EQ Eight", purpose: "band-limit before ambience", parameters: ["high-pass mud", "roll off harsh top"] },
      { device: "Saturator", purpose: "subtle memory damage", parameters: [`drive ${Math.min(6, 1 + intensity * 0.4).toFixed(1)} dB`, "soft clip off unless reviewed"] },
      { device: "Hybrid Reverb", purpose: "place sound in impossible room", parameters: ["dark tail", "modest dry/wet before sends"] }
    ]
    : [
      { device: "Instrument Rack", purpose: "stable playable source", parameters: ["map macro 1 to tone", "map macro 2 to movement"] },
      { device: "EQ Eight", purpose: "fit the source into the arrangement", parameters: ["remove rumble", "reserve space for vocal/lead"] },
      { device: "Compressor", purpose: "level control", parameters: ["slow enough attack to preserve transient"] }
    ];
  return {
    role,
    style: style || null,
    intensity,
    devices,
    automationCandidates: horror ? ["filter cutoff", "reverb send", "velocity"] : ["filter cutoff", "macro 1", "volume"],
    exactNextToolCalls: [
      { name: "ableton_browse_live_devices", arguments: { category: devices[0]?.device ?? "" } },
      { name: "ableton_render_concept_device_catalog_matches", arguments: { arrangement_id: "arrangement-...", max_candidates_per_device: 3, include_plugin_presets: false } },
      { name: "ableton_insert_instrument", arguments: { track_index: 0, device: devices[0]?.device ?? "Instrument Rack", dry_run: true } }
    ],
    safety: Safety
  };
}

export function suggestEffectChain(input: EffectChainInput) {
  const source = cleanText(input.source, "source");
  const style = cleanText(input.style);
  const intensity = clampInt(input.intensity, 1, 10, 6);
  const horror = isLiminalHorror(source, style);
  const devices = horror
    ? [
      { device: "EQ Eight", purpose: "remove unsafe lows and shape distance", parameterHints: ["high-pass before reverb", "notch harsh resonances"] },
      { device: "Auto Filter", purpose: "slow bandwidth collapse", parameterHints: ["low-pass drift", "map cutoff for automation"] },
      { device: "Saturator", purpose: "tape-like damage", parameterHints: [`drive up to ${Math.min(8, intensity).toFixed(1)} dB`, "keep output compensated"] },
      { device: "Echo", purpose: "unstable memory repeats", parameterHints: ["dark feedback", "send throws at section edges"] },
      { device: "Hybrid Reverb", purpose: "large impossible space", parameterHints: ["dark algorithm", "long tail but low dry/wet on inserts"] }
    ]
    : [
      { device: "EQ Eight", purpose: "source cleanup", parameterHints: ["high-pass as needed", "broad subtractive moves first"] },
      { device: "Compressor", purpose: "dynamic control", parameterHints: ["gain-match", "avoid over-compression"] },
      { device: "Saturator", purpose: "controlled tone", parameterHints: ["small drive", "A/B level"] },
      { device: "Reverb", purpose: "space", parameterHints: ["use sends for shared space when possible"] }
    ];
  return {
    source,
    style: style || null,
    intensity,
    devices,
    routing: horror ? "Prefer shared reverb/delay returns for scale; keep insert wet values conservative." : "Use sends for shared effects and insert processing for corrective tone.",
    automationCandidates: horror ? ["filter cutoff", "delay feedback", "reverb send", "volume fade"] : ["filter cutoff", "send amount", "volume"],
    exactNextToolCalls: [
      { name: "ableton_browse_live_devices", arguments: { category: "Audio Effects" } },
      { name: "ableton_extract_automation_summary", arguments: { track_index: 0, include_devices: true, max_parameters: 32 } },
      { name: "ableton_insert_effect", arguments: { track_index: 0, device: devices[0]?.device ?? "EQ Eight", dry_run: true } }
    ],
    safety: Safety
  };
}

export function suggestArrangement(input: ArrangementInput) {
  const brief = cleanText(input.brief);
  const intensity = clampInt(input.intensity, 1, 10, 6);
  const duration = clampInt(input.target_duration_seconds, 30, 900, 180);
  const palette = productionPalette(brief, input.style, intensity);
  return {
    brief,
    preset: palette.preset,
    tempo: palette.tempo,
    key: palette.key,
    sections: sectionPlan(duration, palette.horror),
    transitionPlan: palette.horror
      ? ["use reverse fragments before section changes", "thin the motif in Decay Loop", "increase room and delay returns in Spatial Collapse", "leave the final tail unresolved"]
      : ["introduce one layer at a time", "pull density down before the break", "return with the clearest motif"],
    exactNextToolCalls: [
      { name: "ableton_plan_concept_track", arguments: { concept: brief, target_duration_seconds: duration, intensity, style: palette.style, sources: ["local_library", "internet_archive", "freesound"] } },
      { name: "ableton_build_layered_arrangement_plan", arguments: { plan_id: "concept-...", sample_assignments: [] } },
      { name: "ableton_render_concept_execution_runbook", arguments: { arrangement_id: "arrangement-...", check_bridge: false } }
    ],
    safety: Safety
  };
}

export function suggestMixActions(input: MixActionsInput) {
  const issue = cleanText(input.issue);
  const context = cleanText(input.context);
  const intensity = clampInt(input.intensity, 1, 10, 6);
  const text = `${issue} ${context}`.toLowerCase();
  const actions = [];
  if (/mud|low|bass|rumble|boomy/.test(text)) {
    actions.push({ priority: 1, action: "Check low-end ownership", detail: "Solo kick/bass/pressure layers, high-pass non-low layers, and keep low pressure near mono.", readTools: ["ableton_get_routing_overview", "ableton_get_track_mixer"] });
  }
  if (/harsh|bright|pain|metal|scrape/.test(text)) {
    actions.push({ priority: 1, action: "Control harsh resonances", detail: "Use narrow EQ cuts before saturation or reverb; avoid adding bright tails.", readTools: ["ableton_list_devices", "ableton_get_device_parameter_map"] });
  }
  if (/reverb|space|wash|blur|distant/.test(text)) {
    actions.push({ priority: 2, action: "Separate dry identity from shared space", detail: "Reduce insert wet values, use return sends, and automate sends only after target discovery.", readTools: ["ableton_get_routing_overview", "ableton_extract_automation_summary"] });
  }
  if (/motif|melody|memory|lead/.test(text)) {
    actions.push({ priority: 2, action: "Protect the motif window", detail: "Lower ambience around motif entrances and keep delay throws after phrase endings.", readTools: ["ableton_get_clip_notes", "ableton_get_track_mixer"] });
  }
  if (actions.length === 0) {
    actions.push({ priority: 1, action: "Start with gain staging", detail: "Balance clip and track levels before EQ, compression, or automation decisions.", readTools: ["ableton_get_full_snapshot", "ableton_get_track_mixer"] });
  }
  return {
    issue,
    context: context || null,
    intensity,
    actions,
    exactNextToolCalls: [
      { name: "ableton_get_routing_overview", arguments: { include_devices: true } },
      { name: "ableton_extract_automation_summary", arguments: { track_index: 0, include_devices: true, max_parameters: 32 } },
      { name: "ableton_validate_production_plan", arguments: { plan: { issue, context, proposedActions: actions } } }
    ],
    safety: Safety
  };
}

export function validateProductionPlan(plan: Record<string, unknown>) {
  const serialized = JSON.stringify(plan).toLowerCase();
  const checks = [
    { id: "ableton_writes", triggered: /ableton_(set|create|insert|load|fire|stop|rename|duplicate|move|transport)/.test(serialized), requiredGate: "ABLETON_MCP_ENABLE_WRITE=1 plus dry_run=false where applicable" },
    { id: "downloads", triggered: /download|stage_concept_samples|ableton_download_sample/.test(serialized), requiredGate: "ABLETON_MCP_ENABLE_DOWNLOADS=1" },
    { id: "ui_control", triggered: /click|type_text|mouse|ui-driver|ableton_click|ableton_type/.test(serialized), requiredGate: "ABLETON_MCP_ENABLE_UI_CONTROL=1 and user-started UI driver" },
    { id: "remote_http", triggered: /0\.0\.0\.0|public internet|port forward|ngrok|cloudflare tunnel/.test(serialized), requiredGate: "Use localhost by default; remote HTTP needs private network plus bearer token" },
    { id: "arbitrary_shell", triggered: /shell|powershell|cmd\.exe|bash -c|exec\(/.test(serialized), requiredGate: "Not supported by Ableton MCP" }
  ];
  const triggered = checks.filter((check) => check.triggered);
  const blockers = triggered.filter((check) => check.id === "remote_http" || check.id === "arbitrary_shell");
  return {
    safeByDefault: blockers.length === 0,
    requiresWrite: checks[0]!.triggered,
    triggeredGates: triggered,
    blockers,
    recommendations: [
      "Run read/planning tools before any write-gated action.",
      "Use dry_run=true for write-capable tools until the plan has been reviewed.",
      "Keep sample downloads, UI control, and remote HTTP opt-in only."
    ],
    plan,
    safety: Safety
  };
}
