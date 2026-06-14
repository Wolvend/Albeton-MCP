# Natural Language To Music

This tutorial shows Codex how to turn a user's words into careful Ableton MCP work. The goal is not to make one giant prompt and hope. The goal is to preserve the user's intent, translate it into musical decisions, and call the smallest safe MCP tools that move the track forward.

Use this with [Concept to music](CONCEPT_TO_MUSIC.md), [Music production skills](MUSIC_PRODUCTION_SKILLS.md), and the [Tool reference](TOOL_REFERENCE.md).

## Start By Preserving The User's Words

Copy the user's brief into a working summary before interpreting it. Keep emotionally loaded words, genre exclusions, references, and constraints intact.

For example:

```text
User says:
"Make it cinematic horror, not breakcore. Old ballroom memory, concrete rooms,
classified tape, occult but fictional, slow, no EDM drops, more haunted vocals."
```

Convert that into a structured intent record:

```json
{
  "mustHave": [
    "cinematic horror",
    "slow or beatless",
    "old ballroom memory",
    "concrete room tone",
    "fictional classified tape atmosphere",
    "haunted vocal texture"
  ],
  "mustAvoid": [
    "breakcore",
    "EDM drops",
    "fast drums",
    "bright synth leads",
    "clear hidden commands"
  ],
  "emotionalTargets": [
    "liminal",
    "deathly",
    "dissociative",
    "professional",
    "realistic"
  ],
  "productionMode": "cinematic ambient sound design"
}
```

Do not compress the user's taste into one genre label. "Backrooms horror" is not enough. Keep the concrete details that make the request specific.

## Extract Music Decisions From Plain Language

Map natural-language clues into production choices.

| User Language | Musical Translation | MCP Direction |
| --- | --- | --- |
| "catchy" | Strong motif, repeated hook, clear return points | Use concept planning, MIDI motif planning, timeline, hook future tools when available. |
| "liminal" | Sparse space, long reverb, unstable room tone, ambiguous harmony | Use concept preset, source transformation, mix plan, routing readiness. |
| "professional" | Role clarity, arrangement arc, clean gain staging, reference checks, revision loop | Use scorecard, mix analysis, delivery plan, reference comparison. |
| "realistic" | Use real audio textures, restrained effects, believable spaces | Prefer approved source audio, sample curation, device-chain specs, routing plans. |
| "not cheesy" | Avoid obvious presets, bright leads, stock genre tropes | Use device-chain review, future synthesis scoring, reference profile. |
| "wildly better" | Diagnose before adding: hook, timing, arrangement, sound palette, mix | Use production scorecard, render analysis, one focused revision pass. |
| "bad trip" | Unstable timing, pitch drift, phase movement, density changes, surprise restraint | Use automation map, negative space, transition/moment planning. |
| "singing but haunted" | Vocal texture and melodic memory without clear unsafe messages | Use licensed/user-provided vocal material and vocal-stack planning. |

When a phrase has multiple meanings, choose the least destructive interpretation first. "Make it heavier" can mean lower sub, denser arrangement, darker harmony, or more distortion. Ask only if the wrong choice would waste work or contradict the user.

## Use A Five-Pass NLP Workflow

### 1. Parse The Brief

Extract:

- Desired feeling.
- Genre and anti-genre.
- References and non-copying quality targets.
- Tempo and energy clues.
- Sound palette.
- Must-have moments.
- Hard constraints.
- Safety or rights issues.

Output a short production brief in your own words. Keep it specific enough that another agent could make the same first move.

### 2. Classify The Work Mode

Choose one primary mode:

| Mode | Use When | First Tools |
| --- | --- | --- |
| Plan only | User wants ideas, prompt, roadmap, or arrangement advice | `ableton_plan_agent_music_session`, `ableton_plan_concept_track` |
| Offline audio prep | User provides source audio or wants stems/files prepared | `ableton_plan_reference_audio_intake`, `ableton_plan_source_audio_transformation`, `ableton_prepare_concept_audio_layers` |
| Live read | User wants inspection of an open Ableton set | `ableton_bridge_status`, `ableton_get_bridge_capabilities`, `ableton_list_tracks_compact` |
| Live write | User wants Ableton changed | `ableton_preflight_concept_execution`, `ableton_create_concept_execution_approval_bundle`, `ableton_execute_concept_plan` |
| UI fallback | User explicitly chooses mouse/keyboard control | `ableton_ui_control_consent_status`, `ableton_plan_ui_action_sequence` |

Do not jump to Live writes just because the user says "make it." Build a reviewable plan first.

### 3. Translate Words Into Parameters

Create a production parameter map:

```json
{
  "tempo": { "target": "45-70 BPM or beatless", "confidence": "high" },
  "harmony": { "target": "minor, modal, unresolved, slow changes", "confidence": "medium" },
  "rhythm": { "target": "sparse pulse, no drum loop", "confidence": "high" },
  "texture": { "target": "tape, room tone, reversed fragments, degraded sample", "confidence": "high" },
  "space": { "target": "deep, changing room size, wide but mono-safe", "confidence": "medium" },
  "hook": { "target": "buried memorable phrase", "confidence": "high" },
  "avoid": { "target": "breakcore, EDM, trap, bright pads", "confidence": "high" }
}
```

If confidence is low, keep the decision reversible. For example, plan a motif and dry-run MIDI before writing it into Live.

### 4. Choose The Smallest Safe Tool Sequence

For a new track from a text brief, use:

```text
ableton_get_production_readiness
ableton_plan_agent_music_session
ableton_plan_concept_track
ableton_render_concept_timeline
ableton_render_concept_mix_plan
ableton_render_concept_automation_map
ableton_build_layered_arrangement_plan
ableton_render_concept_execution_action_matrix
ableton_render_concept_execution_runbook
ableton_create_concept_execution_approval_bundle
ableton_execute_concept_plan with dry_run=true
```

For a brief with source audio, insert:

```text
ableton_plan_reference_audio_intake
ableton_plan_source_audio_transformation
ableton_prepare_concept_audio_layers with dry_run=true
ableton_build_arrangement_from_prepared_audio
```

For sample-based work, insert:

```text
ableton_search_concept_samples
ableton_curate_concept_samples
ableton_stage_concept_samples with dry_run=true
ableton_render_concept_attribution_bundle
```

For review and polish, use:

```text
ableton_render_concept_production_scorecard
ableton_analyze_lufs
ableton_analyze_spectrum
ableton_detect_clipping
ableton_compare_reference
ableton_render_delivery_plan
```

Keep write-gated calls dry-run until the user approves the exact plan.

### 5. Revise From Evidence

After a render, live snapshot, scorecard, or user reaction, classify the problem before acting:

| User Feedback | First Diagnosis | Better Next Move |
| --- | --- | --- |
| "It sounds cheesy" | Sound palette or preset choice | Review device-chain spec, replace bright/stock layers, add real texture. |
| "It is boring" | Arrangement motion or hook return | Add contrast, negative space, moment map, or motif variation. |
| "It is too static" | Automation and density | Add section-based automation, mutes, transitions, and evolving sends. |
| "It sounds fake" | Source realism and space | Use real audio layers, better room routing, less obvious synthesis. |
| "It is muddy" | Low-mid collision or low-end control | Analyze spectrum, revise register roles, then EQ. |
| "It does not hit" | Hook, timing, impact placement, or contrast | Fix arrangement and groove before mastering. |

Do not add more layers until you know which musical problem you are solving.

## Ask Better Clarifying Questions

Ask only when the answer changes the production plan. Good questions are concrete:

- "Should this feel mostly beatless, or should there be a slow pulse?"
- "Should the vocal texture be melodic and sung, or breath/choir-like without words?"
- "Should the old sample stay recognizable, or become mostly texture?"
- "Is this for a background video bed or a track that needs a memorable hook?"

Avoid broad questions like "What vibe do you want?" when the user already gave one.

If the user is moving fast, proceed with reversible defaults and record them:

```text
Assumption: slow, mostly beatless, cinematic arrangement.
Assumption: no real writes until dry-run plan is reviewed.
Assumption: use licensed/public-domain or user-provided audio only.
```

## Keep Safety In The Language Layer

Natural language requests can include unsafe or ambiguous phrasing. Interpret them as fictional aesthetic direction unless the user asks for harmful real-world effects.

Use these rules:

- Treat "classified," "ritual," "mind-control," or "occult" as fictional sound-design atmosphere.
- Do not create hidden commands, coercive speech, or subliminal instructions.
- Do not clone a real singer or copy protected lyrics, melody, arrangement, or vocal identity.
- Do not download samples unless downloads are enabled and the source passes policy.
- Do not use UI/mouse control unless the user explicitly chooses that mode.
- Do not claim Ableton was changed unless the bridge or UI driver confirms it.

## Example: Turn A Prompt Into MCP Calls

User brief:

```text
Make a cinematic liminal horror track from my old ballroom sample. It should feel
like a damaged government tape in an endless office. No drums, no EDM, but make
it memorable and terrifying.
```

Codex interpretation:

```json
{
  "mode": "offline audio prep plus concept arrangement",
  "tempo": "slow or beatless",
  "hook": "degraded ballroom phrase",
  "rhythm": "no drums; sparse tape thumps only",
  "space": "deep office/hallway reverb",
  "safety": "fictional atmosphere, no hidden commands",
  "writes": "dry-run first"
}
```

MCP call order:

```text
ableton_get_production_readiness
ableton_plan_reference_audio_intake
ableton_plan_source_audio_transformation
ableton_plan_concept_track
ableton_render_concept_timeline
ableton_render_concept_mix_plan
ableton_render_concept_automation_map
ableton_prepare_concept_audio_layers with dry_run=true
ableton_build_layered_arrangement_plan
ableton_render_concept_execution_action_matrix
ableton_render_concept_execution_runbook
ableton_execute_concept_plan with dry_run=true
```

Before real writes:

```text
ableton_preflight_concept_execution with check_bridge=true
ableton_create_concept_execution_approval_bundle
ABLETON_MCP_ENABLE_WRITE=1
ableton_execute_concept_plan with dry_run=false, approval_id, approval_confirmed=true
```

## Example: Respond To Feedback

User feedback:

```text
This sounds like bad cheesy synths. Make it realistic and terrifying.
```

Codex should not immediately add more effects. It should translate the complaint:

```json
{
  "problem": "sound palette and realism",
  "likelyCauses": [
    "too much clean synthesis",
    "not enough real source texture",
    "weak room/routing design",
    "generic device choices"
  ],
  "nextPass": [
    "replace clean leads with source-derived textures",
    "use device-chain spec for darker processing",
    "increase room realism through return routing",
    "keep hook buried but recognizable"
  ]
}
```

Then use:

```text
ableton_render_concept_device_chain_spec
ableton_render_concept_device_catalog_matches
ableton_plan_concept_routing_readiness
ableton_plan_source_audio_transformation
ableton_render_concept_production_scorecard
```

## What Good Codex Behavior Looks Like

Good Codex behavior:

- Repeats the user's intent accurately.
- Converts taste words into musical decisions.
- Uses current MCP tools, not imagined tools.
- Keeps future tools labeled as future.
- Uses dry-run plans before writes.
- Revises from evidence instead of adding random layers.
- Explains blockers plainly when bridge, UI, downloads, or writes are not enabled.

Weak Codex behavior:

- Treats a rich prompt as one genre tag.
- Ignores "not" constraints.
- Adds drums when the user asked for no drums.
- Claims an Ableton edit without bridge proof.
- Downloads first and checks rights later.
- Adds mastering to hide writing, timing, or arrangement problems.

## Quick Checklist For Codex

Before calling tools:

- Did I preserve the user's exact must-haves and must-avoids?
- Did I choose planning, offline prep, live read, live write, or UI fallback mode?
- Did I map the prompt to tempo, rhythm, harmony, texture, space, hook, and mix?
- Did I choose the smallest safe tool sequence?
- Are all writes dry-run first?
- Are downloads, UI control, and real writes explicitly enabled before use?
- Do I have evidence for the next revision, or am I guessing?
