# Future Patches

This roadmap captures the next professional music-production tools for Ableton MCP. These tools are not claimed as current runtime features until they are implemented, tested, and listed by `npm run verify:mcp`.

The goal is to make Ableton MCP better at creating, judging, revising, and finishing music. Future tools should follow the existing safety model:

For the producer-skill view of why these tools matter and how agents should sequence them, see [Music production skills](MUSIC_PRODUCTION_SKILLS.md).

- Read-only or dry-run by default.
- Real Ableton writes require `ABLETON_MCP_ENABLE_WRITE=1` and `dry_run=false`.
- UI/mouse fallback requires `ABLETON_MCP_ENABLE_UI_CONTROL=1`.
- Downloads require `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
- No broad filesystem scans, arbitrary shell, arbitrary URL fetch, public HTTP exposure, hidden commands, or fake success.
- Unsupported LiveAPI operations must return structured `unsupported: true` results with next steps.

## Implementation Pattern

New tools should use strict typed schemas and structured responses.

```ts
type FutureToolPatch = {
  name: string;
  purpose: string;
  inputSchema: Record<string, unknown>;
  output: Record<string, unknown>;
  agentUse: string[];
  implementationNotes: string[];
};
```

Recommended handler shape:

```ts
{
  name: "ableton_future_tool_name",
  description: "One clear sentence.",
  inputSchema: {
    concept: z.string().min(3).max(2000),
    dry_run: z.boolean().default(true)
  },
  annotations: ro,
  handler: async (args) => ({
    ok: true,
    result: {
      dry_run: true,
      plan: {},
      nextToolCalls: []
    }
  })
}
```

## Patch 1: Musical Feature Intelligence

Core status: implemented as read-only heuristic tools. Future work should deepen the DSP and scoring models rather than re-add these names.

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_analyze_sample_musical_features` | Implemented. Reads an allowed local audio file and estimates BPM, key, transient density, loopability, loudness, spectral centroid, energy balance, hiss/noise, mood tags, and vocal likelihood. | `input: { path, start_seconds?, duration_seconds? } -> output: { bpmCandidates[], keyCandidates[], confidence, transientDensity, loopability, moodTextureTags[] }` | Use before placing samples; reject weak or mismatched samples early. |
| `ableton_detect_key_bpm_confidence` | Implemented. Produces BPM/key candidates with confidence and ambiguity notes instead of one brittle guess. | `input: { path, bpm_range?, key_hint?, start_seconds?, duration_seconds? } -> output: { bpmCandidates[], keyCandidates[], confidence, ambiguityWarnings[] }` | Ask for confirmation or use harmonic-neutral processing when confidence is low. |
| `ableton_find_best_loop_points` | Implemented. Finds zero-crossing loop candidates and crossfade suggestions from a bounded local preview. | `input: { path, target_bars?, bpm?, start_seconds?, duration_seconds? } -> output: { loopCandidates[], crossfadeSuggestionMs, warnings[] }` | Build loopable beds and motifs without obvious clicks. |
| `ableton_match_samples_to_concept` | Implemented. Ranks local or metadata-only sample candidates by emotional role and concept fit while sanitizing untrusted text. | `input: { concept, candidates[], roles? } -> output: { rankedSamples[], rejectedSamples[], roleCoverage, missingRoles }` | Choose samples for motif, texture, impact, vocal ghost, room tone, pulse, and transition roles. |
| `ableton_plan_sample_slicing` | Turns one sample into chops, reverse tails, one-shots, motifs, pads, impacts, and rhythmic cells. | `input: { path, concept, bpm?, key? } -> output: { slices[], renderPlans[], nextToolCalls[] }` | Reuse strong source material in multiple musical roles without sounding like a static loop. |

## Patch 2: Tempo, Timing, Groove, And Pocket

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_plan_tempo_grid` | Suggests BPM, half-time/double-time feel, swing, tempo drift, and grid strategy from concept/reference data. | `input: { concept, reference_path?, intensity?, target_duration_seconds? } -> output: { bpm, feel, swing, tempoMap, rationale }` | Pick tempo before writing MIDI or warping samples. |
| `ableton_generate_groove_map` | Creates microtiming and velocity templates for tight pop, dragging horror pulse, human funk pocket, ritual machine pulse, tape-loop wobble, and other feels. | `input: { feel, bpm, bars, intensity } -> output: { timingOffsets[], velocityCurve[], swing, applyCalls[] }` | Apply one coherent groove identity across drums, bass, samples, and motif repeats. |
| `ableton_extract_groove_map` | Extracts transient timing and velocity feel from MIDI/audio references into a reusable groove map. | `input: { path, bpm?, bars? } -> output: { grooveMap, confidence, transientSummary }` | Borrow feel from a reference without copying melody or copyrighted expression. |
| `ableton_apply_groove_map` | Applies a stored groove map to MIDI notes or planned clip events. | `input: { groove_id, track_index?, clip_slot_index?, amount, dry_run } -> output: { plan, changedEvents }` | Keep timing musical and consistent while staying dry-run first. |
| `ableton_generate_drum_pocket` | Designs kick, snare, hat, ghost-hit, percussion, and accent timing around a groove role. | `input: { style, bpm, bars, density, humanize } -> output: { midiNotes, velocityMap, dryRunInsertCall }` | Build rhythm that supports the song instead of filling space randomly. |
| `ableton_generate_drum_and_pulse_roles` | Separates drums from non-drum pulses: heartbeat, machinery, tape thump, sub pulse, room knock, impact memory. | `input: { concept, bpm, intensity } -> output: { pulseRoles[], midiOrSamplePlans[] }` | Use rhythm as emotional structure, not just drums. |
| `ableton_humanize_part_by_role` | Humanizes MIDI differently for bass, drums, piano, pad, vocal chop, or percussion. | `input: { role, notes[], amount, seed? } -> output: { notes, timingReport }` | Avoid generic randomization; use role-specific timing and velocity behavior. |
| `ableton_score_timing_feel` | Scores whether audio/MIDI feels rushed, late, stiff, dragging, or pocketed. | `input: { path? clip?, bpm?, groove_id? } -> output: { score, timingFindings[], revisionPlan }` | Revise timing before adding more layers. |
| `ableton_score_groove_tightness` | Measures consistency and expressive variance against the intended groove. | `input: { notesOrTransients, grooveMap } -> output: { tightness, humanFeel, overQuantized }` | Decide whether to quantize, loosen, or rewrite the part. |
| `ableton_detect_rushed_or_late_hits` | Flags events that are unintentionally early/late against the pocket. | `input: { notesOrTransients, bpm, toleranceMs } -> output: { hitFindings[], suggestedMoves[] }` | Fix specific hits instead of applying blunt quantization. |

## Patch 3: Harmony, Melody, Hooks, And Bass

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_generate_harmonic_palette` | Generates key, mode, chord vocabulary, borrowed chords, tension chords, bass motion, and avoid notes from a concept. | `input: { concept, mood, complexity } -> output: { key, mode, chordSet[], tensionRules, avoidNotes[] }` | Establish harmonic identity before creating motifs and basslines. |
| `ableton_generate_chord_voicings` | Converts chord names into playable voicings by register and instrument role. | `input: { chords[], register, instrumentRole } -> output: { voicings[], midiNotes[] }` | Avoid blocky amateur chord stacks. |
| `ableton_voice_lead_progression` | Smooths chord movement with inversions, common tones, suspensions, and controlled leaps. | `input: { progression[], style, maxLeap } -> output: { voicedProgression, motionReport }` | Make harmonic parts feel arranged instead of generated. |
| `ableton_generate_chord_substitutions` | Suggests tasteful substitutions, modal interchange, reharmonization, and tension alternatives. | `input: { progression[], mood, intensity } -> output: { substitutions[], riskLevel }` | Add sophistication without losing the hook. |
| `ableton_generate_hook_variations` | Creates hook variants with rhythmic, interval, register, and response changes. | `input: { motif, key, style, count } -> output: { variations[], rankingHints[] }` | Generate options, then score and select the strongest hook. |
| `ableton_score_hook_memorability` | Scores a motif for repetition, contour, singability, rhythmic identity, and contrast. | `input: { motif, context? } -> output: { score, strengths[], weaknesses[] }` | Reject forgettable ideas before building an arrangement around them. |
| `ableton_score_hook_strength` | Scores hook strength in the current arrangement context. | `input: { motif, arrangementSummary } -> output: { score, returnStrategy, revisionPlan }` | Decide whether the hook needs simplification, repetition, or contrast. |
| `ableton_score_hook_return` | Checks whether the main idea returns at satisfying moments. | `input: { arrangementSections, motifOccurrences } -> output: { score, missingReturns[] }` | Add returns, callbacks, or corrupted reprises. |
| `ableton_generate_motif_system` | Creates a main motif plus transformations: inversion, displacement, call-response, corrupted reprise, bass answer, vocal shadow. | `input: { concept, key, bpm, lengthBeats } -> output: { motif, transformations[], midiCalls[] }` | Build a track around one memorable idea rather than disconnected parts. |
| `ableton_generate_call_response_parts` | Produces answering parts across instruments or vocal-like textures. | `input: { motif, roles[], density } -> output: { responses[], placementPlan }` | Create conversation between lead, bass, percussion, and texture. |
| `ableton_generate_countermelody` | Writes a secondary melody that supports the hook without masking it. | `input: { melody, harmony, register, density } -> output: { counterMelody, collisionWarnings[] }` | Add musical depth without clutter. |
| `ableton_generate_bassline_from_chords` | Generates basslines from harmonic rhythm, groove, and song section. | `input: { chords[], bpm, groove, role } -> output: { bassNotes, pocketNotes }` | Lock bass to harmony and groove. |
| `ableton_generate_bass_pocket` | Designs bass timing, note length, rests, ghost notes, and kick relationship. | `input: { chords[], kickPattern?, grooveMap, style } -> output: { bassline, kickRelationship }` | Make the low end feel intentional and danceable or cinematic. |

## Patch 4: Professional Synthesis And Sound Design

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_design_synth_patch` | Creates a device-agnostic synth patch plan for bass, lead, pad, sub, drone, ghost vocal, metallic texture, or noise bed. | `input: { concept, role, devicePreference? } -> output: { patch, macros, automationTargets }` | Decide sound character before choosing Ableton device settings. |
| `ableton_design_operator_patch` | Designs Operator oscillator ratios, envelopes, modulation, filter, pitch envelope, and macros. | `input: { role, concept, brightness, instability } -> output: { operatorSettings, macroMap }` | Build FM basses, bells, drones, and harmonic shadows. |
| `ableton_design_wavetable_patch` | Designs Wavetable oscillator tables, unison, filter, envelopes, LFOs, matrix, and macros. | `input: { role, concept, motion, width } -> output: { wavetableSettings, modulationMatrix }` | Create modern evolving textures and leads with repeatable settings. |
| `ableton_design_drift_patch` | Designs Drift patches for analog-style bass, plucks, pads, and unstable synth tones. | `input: { role, warmth, age, detune } -> output: { driftSettings, macroMap }` | Use tasteful analog movement without cheesy presets. |
| `ableton_design_sampler_instrument` | Builds a Sampler/Simpler instrument plan from approved samples, zones, loop points, pitch range, envelopes, filters, and velocity mapping. | `input: { samples[], role, keyRange?, velocityLayers? } -> output: { samplerPlan, zoneMap, loopPlan }` | Turn found sounds into playable instruments. |
| `ableton_design_granular_texture` | Designs granular clouds, smear layers, frozen pads, reverse grains, and evolving noise from source audio. | `input: { path, concept, density, grainSize, movement } -> output: { texturePlan, renderPlan }` | Create signature atmospheres from real source material. |
| `ableton_design_rack_macros` | Converts a sound idea into 8 performance macros such as age, dread, width, instability, distance, body, air, and collapse. | `input: { patchPlan, role } -> output: { macros[], targetParameters[], automationIdeas[] }` | Make every sound controllable in arrangement and automation passes. |
| `ableton_score_patch_against_concept` | Scores a patch against concept fit, role clarity, frequency placement, movement, and mix risk. | `input: { patchPlan, concept, role } -> output: { score, issues[], revisions[] }` | Revise patches before committing to arrangement. |

## Patch 5: Layering, Arrangement, And Drama

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_plan_layer_stack` | Defines each layer role: fundamental, texture, transient, air, sub, movement, stereo shadow, dirt, and reverb return. | `input: { concept, section, intensity } -> output: { layers[], frequencyPlan, stereoPlan }` | Build a complete sound from purposeful layers instead of piling tracks. |
| `ableton_score_arrangement_energy_curve` | Scores section energy, density, width, low-end, tension, and payoff over time. | `input: { arrangementPlan } -> output: { curve, weakSections[], revisionPlan }` | Shape the full track arc before detailed mixing. |
| `ableton_score_arrangement_motion` | Detects static sections, missing contrast, weak payoffs, overlong intros, and hook-return problems. | `input: { arrangementSummary } -> output: { motionScore, findings[], exactChanges[] }` | Keep the arrangement evolving. |
| `ableton_score_section_contrast` | Compares adjacent sections for contrast in rhythm, harmony, density, texture, and stereo image. | `input: { sections[] } -> output: { contrastScores[], suggestions[] }` | Make verse/chorus/drop/bridge or scene sections feel distinct. |
| `ableton_detect_static_sections` | Finds sections where too little changes for too long. | `input: { renderAnalysis?, arrangementPlan } -> output: { staticRanges[], fixes[] }` | Add automation, dropouts, fills, texture shifts, or hook returns. |
| `ableton_create_moment_map` | Plans standout moments: hook reveal, silence, impact, reverse tail, tape stop, vocal throw, sub drop, false ending. | `input: { concept, duration, intensity } -> output: { moments[], placementRationale }` | Build memorable moments into the song timeline. |
| `ableton_generate_transition_moments` | Creates risers, reverse tails, tape stops, silence drops, impact placement, filter moves, and scene handoffs. | `input: { fromSection, toSection, concept, bpm } -> output: { transitionPlan, automationCurves[] }` | Move between sections professionally. |
| `ableton_suggest_mute_unmute_automation` | Plans arrangement mutes, returns, dropouts, and reintroductions. | `input: { tracks[], sections[], goal } -> output: { mutePlan[], expectedEffect }` | Create space and drama without adding more sounds. |
| `ableton_build_tension_release_plan` | Designs long-range tension/release using harmony, filtering, density, stereo width, reverb, and sub pressure. | `input: { concept, sections[], intensity } -> output: { tensionMap, automationTargets[] }` | Make the track feel intentional over minutes, not bars. |
| `ableton_generate_automation_curves` | Generates musical curves for filter, volume, pan, sends, reverb, pitch, distortion, width, and macro motion. | `input: { target, section, curveType, intensity } -> output: { points[], preview }` | Turn static parts into performed parts. |

## Patch 6: Vocals, Hooks, Adlibs, And Human Texture

These tools should not clone a real singer or generate hidden coercive messages. They should plan arrangement and production using licensed or user-provided vocal material.

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_plan_vocal_stack` | Plans lead, double, octave, harmony, whisper, breath, chop, and throw layers. | `input: { concept, vocalSource?, sectionRoles[] } -> output: { stackPlan, routing, fx }` | Use vocal texture as arrangement, not just a top line. |
| `ableton_generate_harmony_stack` | Generates harmony intervals, registers, timing offsets, and section placement. | `input: { melody, key, mood, density } -> output: { harmonyParts[], midiOrAudioPlan[] }` | Add emotional lift while avoiding harmonic clutter. |
| `ableton_plan_adlibs_and_responses` | Plans call-response adlibs, vocal throws, breaths, swells, and ear-candy positions. | `input: { hook, sections[], intensity } -> output: { adlibMap[], delayThrowPlan }` | Add life and replay value between major phrases. |
| `ableton_score_vocal_presence` | Checks whether vocal-like material is too buried, harsh, wide, dry, wet, or masked. | `input: { renderPath, vocalStemPath? } -> output: { score, maskingFindings, fixes[] }` | Keep vocals or vocal textures emotionally present. |
| `ableton_plan_vocal_fx_chain` | Designs EQ, compression, saturation, de-essing, delay throws, reverb, pitch/formant, and parallel texture chains. | `input: { role, concept, intensity } -> output: { deviceChain, macros, automation }` | Make vocal production feel modern, cinematic, or degraded on purpose. |
| `ableton_detect_vocal_masking` | Detects masking between vocal-like material and instruments. | `input: { vocalPath, mixPath } -> output: { maskedBands[], suggestedMoves[] }` | Fix intelligibility or ghostly presence without over-brightening. |

## Patch 7: Mix, Master, And Translation Intelligence

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_detect_frequency_masking` | Finds frequency collisions between stems or grouped layers. | `input: { stems[] } -> output: { collisions[], priorityMoves[] }` | Decide which part owns each band. |
| `ableton_detect_mud_harshness_sibilance` | Flags mud, boxiness, harshness, fizz, and sibilance risk. | `input: { path } -> output: { bands[], severity, fixes[] }` | Solve common amateur mix problems early. |
| `ableton_detect_phase_mono_issues` | Detects correlation, polarity, mono loss, stereo instability, and low-end width risk. | `input: { path } -> output: { correlation, monoLoss, warnings[] }` | Keep the track strong on phones, clubs, and mono systems. |
| `ableton_check_kick_bass_phase` | Checks kick/sub/bass phase and low-frequency timing relationship. | `input: { kickStem, bassStem } -> output: { phaseRisk, timingOffsetMs, fixes[] }` | Tighten low end before mastering. |
| `ableton_score_low_end_control` | Scores sub, bass, kick balance, rumble, headroom, and translation. | `input: { path, stems? } -> output: { score, problems[], revisions[] }` | Prevent muddy, weak, or uncontrolled low end. |
| `ableton_score_mix_balance` | Scores tonal balance, dynamics, width, depth, and role clarity. | `input: { path, concept?, referencePack? } -> output: { score, balanceReport, nextMoves[] }` | Generate specific EQ/level/pan/reverb revisions. |
| `ableton_score_mix_translation` | Estimates how the mix will translate across headphones, laptop, phone, car, and club systems. | `input: { path } -> output: { translationScores, riskBands[], fixes[] }` | Avoid a mix that only works on one playback system. |
| `ableton_suggest_eq_moves` | Suggests EQ cuts/boosts by source role and masking context. | `input: { trackRole, issue, analysis } -> output: { eqMoves[], riskNotes[] }` | Make precise mix moves instead of generic presets. |
| `ableton_suggest_compression_moves` | Suggests compression, expansion, transient, sidechain, and parallel moves. | `input: { trackRole, goal, dynamicsReport } -> output: { compressionPlan, settings }` | Control dynamics with intent. |
| `ableton_plan_sidechain_network` | Designs what ducks what: kick/sub, vocal/reverb, impact/ambience, lead/delay, narration/music. | `input: { tracks[], priorities[] } -> output: { sidechainRoutes[], automationPlan }` | Make dense arrangements breathe. |
| `ableton_design_return_space_network` | Designs shared returns for short room, plate, hall, delay, smear, distortion, and parallel compression. | `input: { concept, tracks[] } -> output: { returns[], sendTargets[], gainStaging }` | Create cohesive depth instead of random per-track reverbs. |

## Patch 8: Render Review And Revision Loops

This is the most important professional layer. The agent should create, render, analyze, revise, and repeat.

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_render_rough_mix` | Produces a gated rough mix or render plan, depending on bridge/export support. | `input: { arrangement_id?, output?, dry_run } -> output: { renderPlan, file?, unsupported? }` | Create a review target after each major production pass. |
| `ableton_analyze_render_quality` | Runs loudness, clipping, spectrum, contrast, timing, and static-section checks on a render. | `input: { path, concept } -> output: { qualityReport, scores, findings[] }` | Judge the track as audio, not just as a plan. |
| `ableton_compare_to_reference_pack` | Compares a render to a curated reference pack by loudness, spectrum, dynamics, arrangement, and role balance. | `input: { renderPath, referencePackId } -> output: { deltas, nonCopyingGuidance }` | Use references for quality targets, not imitation. |
| `ableton_compare_render_versions` | Compares two renders and reports what improved or regressed. | `input: { beforePath, afterPath, concept } -> output: { improved[], regressed[], nextPass }` | Keep revision history objective. |
| `ableton_score_track_professionalism` | Aggregates hook, groove, arrangement, sound palette, mix, dynamics, repetition, surprise, and release readiness. | `input: { renderPath, concept, arrangementSummary? } -> output: { score, categoryScores, revisionPriorities[] }` | Decide whether to keep revising or finish. |
| `ableton_score_professionalism` | Same scoring concept for plans before a render exists. | `input: { arrangementPlan, concept } -> output: { score, weaknesses[], nextToolCalls[] }` | Catch weak plans before spending time rendering. |
| `ableton_score_release_readiness` | Checks final delivery state: loudness, headroom, clipping, metadata, attribution, stems, naming, and backup. | `input: { masterPath, stems?, attribution? } -> output: { ready, blockers[], checklist }` | Stop releasing rough drafts as final masters. |
| `ableton_generate_revision_pass` | Creates exact next changes: timing, mutes, EQ, automation, sample swaps, hook return, mix fixes, arrangement cuts. | `input: { renderPath?, concept, currentArrangement } -> output: { revisionPlan, exactToolCalls[], priority }` | Make one focused improvement pass at a time. |
| `ableton_generate_next_revision_pass` | Same as above, but optimized for chained iterative sessions with previous pass history. | `input: { projectState, previousFindings[] } -> output: { nextPass, stopCriteria }` | Continue improving until quality thresholds are met. |
| `ableton_apply_revision_pass` | Executes a reviewed stored revision plan through dry-run/write-gated tools. | `input: { revision_id, approval_id?, approval_confirmed, dry_run } -> output: { execution, journal }` | Apply only approved, bounded, non-overlapping changes. |

## Patch 9: LiveAPI Bridge Unlocks

These are implementation unlocks, not just planning tools.

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_create_arrangement_audio_clip` | Real Arrangement View audio placement after verified LiveAPI support. | `input: { path, track_index, start_time, duration?, dry_run } -> output: { clip_id, track_index, start_time }` | Place stems/samples on the timeline without UI control. |
| `ableton_insert_stock_audio_effect` | Real stock effect insertion through a verified Browser/hot-swap path. | `input: { track_index, device, position?, preset? dry_run } -> output: { device_index, name }` | Build effect chains inside Live after dry-run review. |
| `ableton_apply_effect_chain_preset` | Real approved preset/rack loading. | `input: { track_index, preset_path, position?, dry_run } -> output: { device_chain }` | Load reviewed racks without arbitrary file execution. |
| `ableton_write_device_parameter_automation` | Real breakpoint automation after verified envelope mapping. | `input: { track_index, device_index, parameter_index, points[], dry_run } -> output: { writtenPoints, envelopeId }` | Automate performance-level movement from generated curves. |
| `ableton_export_master` | Real Ableton master export when a safe export API or UI export flow is verified. | `input: { output, start_time, duration, sample_rate, bit_depth, dry_run } -> output: { masterPath, analysis }` | Produce review/final files without manual export. |
| `ableton_export_stems` | Real stem export through verified safe export workflow. | `input: { output_directory, groups[], start_time, duration, dry_run } -> output: { stems[], analysis }` | Generate deliverables and revision assets. |
| `ableton_save_set_as` | Real approved save-as or collect-and-save after non-destructive path policy is verified. | `input: { output, collect_and_save, dry_run } -> output: { setPath, backupPath? }` | Preserve versions safely before major changes. |
| `ableton_edit_warp_markers` | Real warp marker editing after reliable clip API mapping. | `input: { track_index, clip_slot_index, markers[], dry_run } -> output: { markerCount }` | Align found samples musically without destructive rendering. |
| `ableton_apply_groove_map` | Real groove application once groove-pool mapping is reliable. | `input: { groove_id, track_index, clip_slot_index, amount, dry_run } -> output: { applied }` | Move from generated groove plans to Live clips. |
| `ableton_get_chunked_snapshot` | Reads huge Live Sets in chunks to avoid Max JSON response truncation. | `input: { chunks: ["tracks","scenes","devices"], page, pageSize } -> output: { chunk, nextPage? }` | Inspect dense projects safely instead of using full snapshots. |

## Patch 10: Taste, Orchestration, And Session Craft

These tools help agents make better producer decisions before adding more tracks or effects.

| Tool | What It Does | Code Contract | Agent Should |
| --- | --- | --- | --- |
| `ableton_build_reference_profile` | Summarizes non-copying reference targets for loudness, density, section timing, width, low-end shape, and palette. | `input: { reference_paths[], concept } -> output: { profile, targetRanges, warnings[] }` | Use references as quality guides, not as material to imitate. |
| `ableton_score_reference_distance` | Scores how far a plan or render is from the approved reference profile. | `input: { renderPath?, arrangementPlan?, referenceProfileId } -> output: { score, deltas[], nextMoves[] }` | Decide what to revise without copying protected expression. |
| `ableton_generate_genre_rulebook` | Converts a style brief into mandatory, optional, and avoid rules for tempo, rhythm, harmony, sound palette, arrangement, and mix. | `input: { style, concept, strictness } -> output: { rules, avoidList, intentionalBreaks[] }` | Keep genre discipline while preserving the user's concept. |
| `ableton_check_genre_authenticity` | Checks whether a plan or render follows the intended style and flags generic or conflicting choices. | `input: { concept, style, arrangementPlan?, renderPath? } -> output: { score, findings[], revisions[] }` | Catch style drift before final mix work. |
| `ableton_plan_instrument_registers` | Assigns instrument and layer registers across sub, bass, body, mid hook, high detail, air, and texture. | `input: { tracksOrLayers[], key?, style } -> output: { registerMap, conflicts[], revisions[] }` | Fix arrangement collisions before reaching for EQ. |
| `ableton_score_frequency_arrangement` | Scores whether the arrangement itself distributes frequency roles well before mix processing. | `input: { arrangementPlan?, stems? } -> output: { score, crowdedBands[], missingRoles[] }` | Separate writing problems from mixing problems. |
| `ableton_plan_negative_space` | Plans silence, dropouts, sparse sections, breaks, tails, and reset moments. | `input: { sections[], concept, intensity } -> output: { spaceMap, muteIdeas[], payoffNotes[] }` | Make hooks and impacts land by removing material. |
| `ableton_score_density_curve` | Scores density over time and finds overfilled or underdeveloped ranges. | `input: { arrangementPlan?, renderPath? } -> output: { densityCurve, fatigueRisk, revisionPlan }` | Keep the listener engaged without constant fullness. |
| `ableton_generate_ear_candy_map` | Places small details such as throws, fills, reverses, one-shots, micro-pauses, and texture flashes. | `input: { sections[], hookMap, intensity } -> output: { events[], placementRationale }` | Add replay value only after the core idea works. |
| `ableton_score_replay_value` | Scores whether the track has memorable details, callbacks, surprise, and variation without clutter. | `input: { arrangementPlan?, renderPath?, concept } -> output: { score, strengths[], additions[] }` | Improve repeat listens without distracting from the song. |
| `ableton_plan_stereo_depth_stage` | Designs center, width, front-back depth, height, dry/wet distance, and mono priorities. | `input: { tracksOrLayers[], concept, playbackTargets[] } -> output: { stageMap, monoCritical[], widthRisks[] }` | Make immersive mixes that still translate. |
| `ableton_score_depth_image` | Scores width, depth, center strength, reverberant blur, and mono risk. | `input: { renderPath, stems? } -> output: { score, imageFindings[], fixes[] }` | Fix spatial problems before mastering. |
| `ableton_plan_session_handoff` | Creates a human-readable handoff for track names, roles, stems, versions, attribution, and next revision steps. | `input: { arrangementId?, conceptPlanId?, deliveryTarget } -> output: { handoff, checklist, missing[] }` | Make projects maintainable after the agent session. |
| `ableton_validate_project_organization` | Checks naming, grouping, markers, journals, attribution sidecars, and export readiness. | `input: { liveSnapshot?, arrangementPlan?, deliveryPlan? } -> output: { ok, issues[], fixes[] }` | Prevent good songs from becoming unmanageable projects. |

## Agent Workflow Target

The intended professional workflow is:

```text
concept
-> sample feature analysis
-> tempo/key/groove plan
-> harmonic palette
-> motif and hook system
-> synthesis and rack design
-> layer stack
-> arrangement motion plan
-> dry-run execution
-> render
-> analyze render quality
-> generate revision pass
-> apply reviewed revision
-> score release readiness
```

Agents should not try to do every tool at once. A good production loop uses small, reviewable passes:

1. Establish concept, tempo, key, sample roles, and hook.
2. Build only the minimum arrangement needed to judge the idea.
3. Render or inspect.
4. Score hook, groove, arrangement motion, and mix balance.
5. Generate one revision pass with exact tool calls.
6. Repeat until the score and user intent agree.

## Prioritization

Implement these first:

1. `ableton_plan_tempo_grid`
2. `ableton_generate_harmonic_palette`
3. `ableton_generate_motif_system`
4. `ableton_design_synth_patch`
5. `ableton_score_track_professionalism`
6. `ableton_generate_revision_pass`

These give Ableton MCP the highest leverage: taste, timing, synthesis, and iteration.
