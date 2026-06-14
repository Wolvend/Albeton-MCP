import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import toneMidi from "@tonejs/midi";
import { resolveSafePath, redactPath } from "./security.js";
import { LOCAL_PATHS, TOOL_PATHS } from "./config.js";
import { AbletonMcpError } from "./errors.js";

const execFileAsync = promisify(execFile);
const gunzip = promisify(zlib.gunzip);
const { Midi } = toneMidi;
const AudioFileExtensions = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg"]);
const ConversionFormats = new Set(["wav", "flac", "mp3"]);
const ConversionPresets = new Set(["clean", "liminal_memory", "stretched_ambience", "reversed_fragment"]);

type AudioConversionOptions = {
  input: string;
  output: string;
  format: string;
  preset: string;
  start_seconds?: number;
  duration_seconds?: number;
  dry_run: boolean;
};

function isPathWithin(candidate: string, root: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function codecArgs(format: string) {
  if (format === "wav") return ["-c:a", "pcm_s24le"];
  if (format === "flac") return ["-c:a", "flac"];
  if (format === "mp3") return ["-c:a", "libmp3lame", "-b:a", "192k"];
  throw new AbletonMcpError(`Unsupported conversion format: ${format}`, "UNSUPPORTED_AUDIO_FORMAT", ["Use wav, flac, or mp3."]);
}

function filterForPreset(preset: string) {
  if (preset === "clean") return null;
  if (preset === "liminal_memory") return "highpass=f=120,lowpass=f=3200,aecho=0.7:0.55:720:0.28,volume=0.82";
  if (preset === "stretched_ambience") return "atempo=0.5,lowpass=f=2400,aecho=0.65:0.5:1200:0.35,volume=0.75";
  if (preset === "reversed_fragment") return "areverse,highpass=f=160,lowpass=f=4500,aecho=0.5:0.45:500:0.25";
  throw new AbletonMcpError(`Unsupported conversion preset: ${preset}`, "UNSUPPORTED_AUDIO_PRESET", ["Use clean, liminal_memory, stretched_ambience, or reversed_fragment."]);
}

async function readAttributionSidecar(inputPath: string) {
  const sidecar = `${inputPath}.attribution.json`;
  try {
    const stat = await fs.stat(sidecar);
    if (stat.size > 128_000) return null;
    return JSON.parse(await fs.readFile(sidecar, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeConversionAttribution(inputPath: string, outputPath: string, checksum: string, bytes: number, options: AudioConversionOptions) {
  const inherited = await readAttributionSidecar(inputPath);
  const attribution = {
    ...(inherited ?? {}),
    sourceUrl: typeof inherited?.sourceUrl === "string" ? inherited.sourceUrl : null,
    destinationName: path.basename(outputPath),
    checksum,
    bytes,
    transformedAt: new Date().toISOString(),
    transform: {
      sourcePath: redactPath(inputPath),
      preset: options.preset,
      format: options.format,
      start_seconds: options.start_seconds ?? null,
      duration_seconds: options.duration_seconds ?? null
    }
  };
  await fs.writeFile(`${outputPath}.attribution.json`, `${JSON.stringify(attribution, null, 2)}\n`, { flag: "wx" });
  return attribution;
}

async function sha256File(filePath: string) {
  const crypto = await import("node:crypto");
  const data = await fs.readFile(filePath);
  return { checksum: crypto.createHash("sha256").update(data).digest("hex"), bytes: data.length };
}

export async function convertAudioFile(options: AudioConversionOptions) {
  const format = options.format.toLowerCase();
  const preset = options.preset.toLowerCase();
  if (!ConversionFormats.has(format)) throw new AbletonMcpError(`Unsupported conversion format: ${options.format}`, "UNSUPPORTED_AUDIO_FORMAT", ["Use wav, flac, or mp3."]);
  if (!ConversionPresets.has(preset)) throw new AbletonMcpError(`Unsupported conversion preset: ${options.preset}`, "UNSUPPORTED_AUDIO_PRESET", ["Use clean, liminal_memory, stretched_ambience, or reversed_fragment."]);

  const input = await resolveSafePath(options.input, { mustExist: true });
  if (!AudioFileExtensions.has(path.extname(input.real).toLowerCase())) {
    throw new AbletonMcpError("Only common local audio files may be converted.", "UNSUPPORTED_SAMPLE_TYPE", ["Use WAV, AIFF, FLAC, MP3, M4A, or OGG files."]);
  }

  const requestedOutput = path.resolve(options.output);
  const allowedOutputRoots = [LOCAL_PATHS.staging, LOCAL_PATHS.imports];
  if (allowedOutputRoots.some((root) => isPathWithin(requestedOutput, root))) {
    await fs.mkdir(path.dirname(requestedOutput), { recursive: true });
  }
  const output = await resolveSafePath(options.output, { mustExist: false, forWrite: true });
  const outputExtension = path.extname(output.real).toLowerCase();
  if (outputExtension !== `.${format}`) {
    throw new AbletonMcpError(`Output extension must match requested format .${format}.`, "AUDIO_OUTPUT_EXTENSION_MISMATCH");
  }
  if (!allowedOutputRoots.some((root) => isPathWithin(output.real, root))) {
    throw new AbletonMcpError("Converted audio must be written to sample staging or Codex Imports.", "AUDIO_OUTPUT_PATH_NOT_APPROVED", ["Use samples/staging or the Ableton User Library Samples/Codex Imports folder."]);
  }
  if (path.resolve(input.real).toLowerCase() === path.resolve(output.real).toLowerCase()) {
    throw new AbletonMcpError("Input and output paths must be different.", "AUDIO_OUTPUT_EQUALS_INPUT");
  }

  let outputExists = false;
  try {
    await fs.access(output.real);
    outputExists = true;
  } catch {
    outputExists = false;
  }
  const filter = filterForPreset(preset);
  const plan = {
    input: redactPath(input.real),
    output: redactPath(output.real),
    format,
    preset,
    filter,
    start_seconds: options.start_seconds ?? null,
    duration_seconds: options.duration_seconds ?? null,
    outputExists,
    overwrite: false
  };
  if (options.dry_run !== false) {
    return {
      dry_run: true,
      conversion: plan,
      nextStep: "Set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 to render this approved local conversion with ffmpeg."
    };
  }
  if (outputExists) {
    throw new AbletonMcpError(`Output already exists: ${redactPath(output.real)}`, "AUDIO_OUTPUT_EXISTS", ["Choose a new output filename. MCP conversion never overwrites files."]);
  }

  await fs.mkdir(path.dirname(output.real), { recursive: true });
  const tempOutput = path.join(path.dirname(output.real), `.${path.basename(output.real)}.${process.pid}.${Date.now()}.tmp.${format}`);
  const args = ["-hide_banner", "-nostdin", "-y"];
  if (typeof options.start_seconds === "number") args.push("-ss", String(options.start_seconds));
  if (typeof options.duration_seconds === "number") args.push("-t", String(options.duration_seconds));
  args.push("-i", input.real, "-map", "0:a:0", "-vn", "-ar", "48000");
  if (filter) args.push("-af", filter);
  args.push(...codecArgs(format), tempOutput);

  try {
    await execFileAsync(TOOL_PATHS.ffmpeg, args, { timeout: 120_000, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
    await fs.copyFile(tempOutput, output.real, fsConstants.COPYFILE_EXCL);
    const { checksum, bytes } = await sha256File(output.real);
    const attribution = await writeConversionAttribution(input.real, output.real, checksum, bytes, { ...options, format, preset });
    return {
      dry_run: false,
      conversion: {
        ...plan,
        outputExists: false,
        checksum,
        bytes,
        attributionPath: redactPath(`${output.real}.attribution.json`),
        attribution
      },
      analysis: await analyzeAudioFile(output.real)
    };
  } finally {
    await fs.rm(tempOutput, { force: true });
  }
}

export async function analyzeAudioFile(filePath: string) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  const { stdout } = await execFileAsync(TOOL_PATHS.ffprobe, [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-print_format", "json",
    safe.real
  ], { timeout: 15_000, env: { SystemRoot: process.env.SystemRoot } });
  return { path: redactPath(safe.real), ffprobe: JSON.parse(stdout) };
}

function assertCommonAudioPath(filePath: string) {
  if (!AudioFileExtensions.has(path.extname(filePath).toLowerCase())) {
    throw new AbletonMcpError("Only common local audio files may be analyzed.", "UNSUPPORTED_SAMPLE_TYPE", ["Use WAV, AIFF, FLAC, MP3, M4A, or OGG files."]);
  }
}

function lastNumber(text: string, pattern: RegExp) {
  let match: RegExpExecArray | null;
  let value: number | null = null;
  while ((match = pattern.exec(text)) !== null) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) value = parsed;
  }
  return value;
}

export async function analyzeLufs(filePath: string) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  assertCommonAudioPath(safe.real);
  const result = await execFileAsync(TOOL_PATHS.ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-nostats",
    "-i", safe.real,
    "-filter_complex", "ebur128=peak=true",
    "-f", "null",
    "-"
  ], { timeout: 180_000, maxBuffer: 4_000_000, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
  const log = `${result.stdout}\n${result.stderr}`;
  return {
    path: redactPath(safe.real),
    integrated_lufs: lastNumber(log, /\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g),
    loudness_range_lu: lastNumber(log, /\bLRA:\s*(-?\d+(?:\.\d+)?)\s*LU/g),
    true_peak_dbfs: lastNumber(log, /\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g),
    method: "ffmpeg ebur128",
    notes: [
      "Integrated LUFS is useful for release-level checks, not arrangement quality by itself.",
      "Keep cinematic horror/ambient masters with headroom; do not chase loudness at the cost of dynamics."
    ]
  };
}

export async function detectClipping(filePath: string, thresholdDbfs = -0.1) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  assertCommonAudioPath(safe.real);
  const result = await execFileAsync(TOOL_PATHS.ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-nostats",
    "-i", safe.real,
    "-af", "volumedetect",
    "-f", "null",
    "-"
  ], { timeout: 180_000, maxBuffer: 4_000_000, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
  const log = `${result.stdout}\n${result.stderr}`;
  const maxVolumeDbfs = lastNumber(log, /\bmax_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
  const meanVolumeDbfs = lastNumber(log, /\bmean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
  return {
    path: redactPath(safe.real),
    threshold_dbfs: thresholdDbfs,
    mean_volume_dbfs: meanVolumeDbfs,
    max_volume_dbfs: maxVolumeDbfs,
    clipping_likely: maxVolumeDbfs !== null ? maxVolumeDbfs >= thresholdDbfs : null,
    method: "ffmpeg volumedetect",
    nextSteps: maxVolumeDbfs !== null && maxVolumeDbfs >= thresholdDbfs
      ? ["Lower final gain or add a true-peak limiter before export.", "Recheck after rendering a new master."]
      : ["Check LUFS, spectrum, and reference balance before final delivery."]
  };
}

async function decodeMonoPreview(filePath: string, startSeconds: number, durationSeconds: number, sampleRate: number) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  assertCommonAudioPath(safe.real);
  const boundedDuration = Math.max(1, Math.min(120, durationSeconds));
  const boundedSampleRate = Math.max(8000, Math.min(48000, Math.floor(sampleRate)));
  const args = [
    "-hide_banner",
    "-nostdin",
    "-v", "error",
    "-ss", String(Math.max(0, startSeconds)),
    "-t", String(boundedDuration),
    "-i", safe.real,
    "-map", "0:a:0",
    "-ac", "1",
    "-ar", String(boundedSampleRate),
    "-f", "f32le",
    "-"
  ];
  const maxBuffer = Math.ceil(boundedDuration * boundedSampleRate * 4 + 1024);
  const result = await execFileAsync(TOOL_PATHS.ffmpeg, args, {
    timeout: 90_000,
    maxBuffer,
    encoding: "buffer",
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH }
  } as any);
  const buffer = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout);
  const sampleCount = Math.floor(buffer.length / 4);
  const samples = new Float32Array(sampleCount);
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = buffer.readFloatLE(i * 4);
    samples[i] = sample;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSquares += sample * sample;
  }
  return {
    path: redactPath(safe.real),
    samples,
    sampleRate: boundedSampleRate,
    startSeconds: Math.max(0, startSeconds),
    durationSeconds: sampleCount / boundedSampleRate,
    peak,
    rms: sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0
  };
}

function goertzelPower(samples: Float32Array, sampleRate: number, frequency: number) {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    s0 = samples[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2) / Math.max(1, samples.length);
}

function db(value: number) {
  return value > 0 ? 20 * Math.log10(value) : -Infinity;
}

export async function analyzeSpectrum(filePath: string, options: { start_seconds?: number; duration_seconds?: number; sample_rate?: number } = {}) {
  const preview = await decodeMonoPreview(
    filePath,
    options.start_seconds ?? 0,
    options.duration_seconds ?? 30,
    options.sample_rate ?? 22050
  );
  const bands = [
    { name: "sub", center_hz: 40 },
    { name: "bass", center_hz: 80 },
    { name: "low_mid", center_hz: 180 },
    { name: "mid", center_hz: 500 },
    { name: "presence", center_hz: 1500 },
    { name: "edge", center_hz: 3500 },
    { name: "air", center_hz: 8000 }
  ].filter((band) => band.center_hz < preview.sampleRate / 2);
  const powers = bands.map((band) => ({ ...band, power: goertzelPower(preview.samples, preview.sampleRate, band.center_hz) }));
  const maxPower = Math.max(...powers.map((band) => band.power), Number.EPSILON);
  return {
    path: preview.path,
    method: "ffmpeg mono preview plus Goertzel broad-band probes",
    preview: {
      start_seconds: preview.startSeconds,
      duration_seconds: preview.durationSeconds,
      sample_rate: preview.sampleRate,
      peak_dbfs: db(preview.peak),
      rms_dbfs: db(preview.rms)
    },
    bands: powers.map((band) => ({
      name: band.name,
      center_hz: band.center_hz,
      relative_db: 10 * Math.log10(Math.max(band.power, Number.EPSILON) / maxPower),
      power: band.power
    })),
    notes: [
      "Broad-band probes are fast mix-balance indicators, not a mastering-grade FFT analyzer.",
      "Use this to catch obvious sub buildup, harsh presence, or missing air before opening Ableton."
    ]
  };
}

const PitchClassNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MajorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MinorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function boundedSampleWindow(options: { start_seconds?: number; duration_seconds?: number; sample_rate?: number }) {
  return {
    start_seconds: clamp(options.start_seconds ?? 0, 0, 100_000),
    duration_seconds: clamp(options.duration_seconds ?? 30, 1, 90),
    sample_rate: Math.trunc(clamp(options.sample_rate ?? 16_000, 8_000, 24_000))
  };
}

function frameEnvelope(samples: Float32Array, frameSize: number, hopSize: number) {
  const frames = Math.max(0, Math.floor((samples.length - frameSize) / hopSize));
  const envelope = new Float32Array(frames);
  let max = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * hopSize;
    let sum = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const sample = samples[start + i] ?? 0;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / frameSize);
    envelope[frame] = rms;
    if (rms > max) max = rms;
  }
  if (max > 0) {
    for (let i = 0; i < envelope.length; i += 1) envelope[i] = envelope[i]! / max;
  }
  return envelope;
}

function onsetEnvelope(envelope: Float32Array) {
  const onset = new Float32Array(Math.max(0, envelope.length - 1));
  let max = 0;
  for (let i = 1; i < envelope.length; i += 1) {
    const diff = Math.max(0, envelope[i]! - envelope[i - 1]!);
    onset[i - 1] = diff;
    if (diff > max) max = diff;
  }
  if (max > 0) {
    for (let i = 0; i < onset.length; i += 1) onset[i] = onset[i]! / max;
  }
  return onset;
}

function countOnsetPeaks(onset: Float32Array, threshold = 0.35) {
  let peaks = 0;
  for (let i = 1; i < onset.length - 1; i += 1) {
    if (onset[i]! > threshold && onset[i]! >= onset[i - 1]! && onset[i]! >= onset[i + 1]!) peaks += 1;
  }
  return peaks;
}

function detectBpmCandidates(samples: Float32Array, sampleRate: number, durationSeconds: number, bpmRange?: { min?: number; max?: number }) {
  const frameSize = 512;
  const hopSize = 256;
  const frameRate = sampleRate / hopSize;
  const onset = onsetEnvelope(frameEnvelope(samples, frameSize, hopSize));
  const minBpm = Math.trunc(clamp(bpmRange?.min ?? 45, 30, 260));
  const maxBpm = Math.trunc(clamp(bpmRange?.max ?? 220, minBpm + 1, 300));
  const raw: Array<{ bpm: number; score: number }> = [];
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 1) {
    const lag = Math.round((60 * frameRate) / bpm);
    if (lag < 2 || lag >= onset.length) continue;
    let score = 0;
    for (let i = lag; i < onset.length; i += 1) score += onset[i]! * onset[i - lag]!;
    raw.push({ bpm, score: score / Math.max(1, onset.length - lag) });
  }
  raw.sort((left, right) => right.score - left.score);
  const candidates: Array<{ bpm: number; confidence: number; score: number; feel: string }> = [];
  const maxScore = raw[0]?.score ?? 0;
  for (const candidate of raw) {
    if (candidates.some((seen) => Math.abs(seen.bpm - candidate.bpm) < 4 || Math.abs(seen.bpm * 2 - candidate.bpm) < 4 || Math.abs(seen.bpm / 2 - candidate.bpm) < 4)) continue;
    const normalized = maxScore > 0 ? candidate.score / maxScore : 0;
    candidates.push({
      bpm: candidate.bpm,
      confidence: Number(clamp(normalized * (durationSeconds >= 4 ? 0.9 : 0.55), 0, 0.98).toFixed(3)),
      score: Number(candidate.score.toFixed(6)),
      feel: candidate.bpm < 80 ? "slow" : candidate.bpm > 150 ? "fast" : "moderate"
    });
    if (candidates.length >= 5) break;
  }
  const transientDensity = durationSeconds > 0 ? countOnsetPeaks(onset) / durationSeconds : 0;
  return {
    candidates,
    transientDensity: Number(transientDensity.toFixed(3)),
    onsetFrames: onset.length,
    confidence: Number((candidates[0]?.confidence ?? 0).toFixed(3))
  };
}

function noteFrequency(midiNote: number) {
  return 440 * (2 ** ((midiNote - 69) / 12));
}

function profileScore(chroma: number[], profile: number[], root: number) {
  let score = 0;
  let chromaNorm = 0;
  let profileNorm = 0;
  for (let i = 0; i < 12; i += 1) {
    const c = chroma[(i + root) % 12] ?? 0;
    const p = profile[i] ?? 0;
    score += c * p;
    chromaNorm += c * c;
    profileNorm += p * p;
  }
  return chromaNorm > 0 && profileNorm > 0 ? score / Math.sqrt(chromaNorm * profileNorm) : 0;
}

function detectKeyCandidates(samples: Float32Array, sampleRate: number, keyHint?: string) {
  const chroma = Array.from({ length: 12 }, () => 0);
  for (let midi = 36; midi <= 84; midi += 1) {
    const frequency = noteFrequency(midi);
    if (frequency >= sampleRate / 2) continue;
    const pitchClass = midi % 12;
    chroma[pitchClass] = (chroma[pitchClass] ?? 0) + goertzelPower(samples, sampleRate, frequency);
  }
  const chromaMax = Math.max(...chroma, Number.EPSILON);
  const normalizedChroma = chroma.map((value) => value / chromaMax);
  const scores: Array<{ key: string; mode: "major" | "minor"; confidence: number; score: number; hintMatch: boolean }> = [];
  for (let root = 0; root < 12; root += 1) {
    for (const mode of ["major", "minor"] as const) {
      const score = profileScore(normalizedChroma, mode === "major" ? MajorProfile : MinorProfile, root);
      const key = `${PitchClassNames[root]} ${mode}`;
      const hintMatch = Boolean(keyHint && key.toLowerCase().includes(keyHint.toLowerCase().trim()));
      scores.push({ key, mode, confidence: 0, score, hintMatch });
    }
  }
  scores.sort((left, right) => right.score - left.score);
  const top = scores[0]?.score ?? 0;
  const next = scores[1]?.score ?? 0;
  const separation = Math.max(0, top - next);
  const tonalEnergy = chroma.reduce((sum, value) => sum + value, 0);
  const baseConfidence = tonalEnergy > 0 ? clamp(0.25 + separation * 2.5, 0.05, 0.85) : 0;
  return scores.slice(0, 5).map((candidate, index) => ({
    ...candidate,
    confidence: Number(clamp(baseConfidence - index * 0.08 + (candidate.hintMatch ? 0.05 : 0), 0.01, 0.92).toFixed(3)),
    score: Number(candidate.score.toFixed(4))
  }));
}

function zeroCrossingRate(samples: Float32Array) {
  if (samples.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if ((samples[i - 1]! <= 0 && samples[i]! > 0) || (samples[i - 1]! >= 0 && samples[i]! < 0)) crossings += 1;
  }
  return crossings / (samples.length - 1);
}

function boundaryStats(samples: Float32Array, sampleRate: number) {
  const window = Math.min(samples.length, Math.max(128, Math.floor(sampleRate * 0.05)));
  if (window <= 0) return { discontinuity: 0, edgeRmsDelta: 0, loopabilityScore: 0 };
  let startRms = 0;
  let endRms = 0;
  for (let i = 0; i < window; i += 1) {
    startRms += (samples[i] ?? 0) ** 2;
    endRms += (samples[samples.length - window + i] ?? 0) ** 2;
  }
  startRms = Math.sqrt(startRms / window);
  endRms = Math.sqrt(endRms / window);
  const discontinuity = Math.abs((samples[0] ?? 0) - (samples[samples.length - 1] ?? 0));
  const edgeRmsDelta = Math.abs(startRms - endRms);
  const loopabilityScore = clamp(1 - discontinuity * 8 - edgeRmsDelta * 4, 0, 1);
  return {
    discontinuity: Number(discontinuity.toFixed(5)),
    edgeRmsDelta: Number(edgeRmsDelta.toFixed(5)),
    loopabilityScore: Number(loopabilityScore.toFixed(3))
  };
}

function energySummary(spectrum: Awaited<ReturnType<typeof analyzeSpectrum>>) {
  const byName = new Map(spectrum.bands.map((band) => [band.name, band.power]));
  const low = (byName.get("sub") ?? 0) + (byName.get("bass") ?? 0);
  const mid = (byName.get("low_mid") ?? 0) + (byName.get("mid") ?? 0) + (byName.get("presence") ?? 0);
  const high = (byName.get("edge") ?? 0) + (byName.get("air") ?? 0);
  const total = Math.max(low + mid + high, Number.EPSILON);
  const centroid = spectrum.bands.reduce((sum, band) => sum + band.center_hz * band.power, 0)
    / Math.max(spectrum.bands.reduce((sum, band) => sum + band.power, 0), Number.EPSILON);
  return {
    low: Number((low / total).toFixed(3)),
    mid: Number((mid / total).toFixed(3)),
    high: Number((high / total).toFixed(3)),
    spectralCentroidHz: Number(centroid.toFixed(1))
  };
}

function textureTags(metrics: {
  energy: ReturnType<typeof energySummary>;
  transientDensity: number;
  zeroCrossingRate: number;
  loopabilityScore: number;
  vocalLikelihood: number;
  hissEstimate: number;
}) {
  const tags: string[] = [];
  if (metrics.energy.low > 0.45) tags.push("low-heavy", "sub-pressure");
  if (metrics.energy.mid > 0.55) tags.push("mid-forward");
  if (metrics.energy.high > 0.32 || metrics.hissEstimate > 0.55) tags.push("hissy", "bright-noise");
  if (metrics.transientDensity > 3.5) tags.push("percussive", "transient-rich");
  if (metrics.transientDensity < 0.7) tags.push("sustained", "ambient");
  if (metrics.loopabilityScore > 0.68) tags.push("loopable");
  if (metrics.vocalLikelihood > 0.55) tags.push("vocal-like");
  if (metrics.energy.spectralCentroidHz < 350) tags.push("dark");
  if (metrics.zeroCrossingRate > 0.18) tags.push("noisy");
  return [...new Set(tags)].slice(0, 12);
}

export async function detectKeyBpmConfidence(filePath: string, options: { bpm_range?: { min?: number; max?: number }; key_hint?: string; start_seconds?: number; duration_seconds?: number } = {}) {
  const window = boundedSampleWindow(options);
  const preview = await decodeMonoPreview(filePath, window.start_seconds, window.duration_seconds, window.sample_rate);
  const bpm = detectBpmCandidates(preview.samples, preview.sampleRate, preview.durationSeconds, options.bpm_range);
  const keyCandidates = detectKeyCandidates(preview.samples, preview.sampleRate, options.key_hint);
  const ambiguityWarnings: string[] = [];
  if (bpm.confidence < 0.35) ambiguityWarnings.push("BPM confidence is weak; the sample may be beatless, too short, or have diffuse transients.");
  if ((keyCandidates[0]?.confidence ?? 0) < 0.35) ambiguityWarnings.push("Key confidence is weak; treat this as harmonic color or use pitch-neutral processing.");
  if (preview.durationSeconds < 4) ambiguityWarnings.push("Analysis window is short; repeat on a longer section before pitch/tempo-critical placement.");
  return {
    path: preview.path,
    method: "heuristic mono preview onset autocorrelation plus chroma profile scoring",
    heuristic: true,
    window,
    bpmCandidates: bpm.candidates,
    keyCandidates,
    confidence: {
      bpm: bpm.confidence,
      key: Number((keyCandidates[0]?.confidence ?? 0).toFixed(3)),
      overall: Number(Math.min(bpm.confidence || 0, keyCandidates[0]?.confidence ?? 0).toFixed(3))
    },
    ambiguityWarnings,
    recommendedUse: ambiguityWarnings.length
      ? "Use as a creative hint; confirm by ear or analyze a longer section before pitch/tempo-locked arrangement."
      : "Usable as a first-pass guide for warping, key matching, and sample role selection."
  };
}

export async function analyzeSampleMusicalFeatures(filePath: string, options: { start_seconds?: number; duration_seconds?: number } = {}) {
  const window = boundedSampleWindow(options);
  const [ffprobe, loudness, spectrum, keyBpm] = await Promise.all([
    analyzeAudioFile(filePath),
    analyzeLufs(filePath),
    analyzeSpectrum(filePath, { ...window, sample_rate: 16_000 }),
    detectKeyBpmConfidence(filePath, { start_seconds: window.start_seconds, duration_seconds: window.duration_seconds })
  ]);
  const preview = await decodeMonoPreview(filePath, window.start_seconds, window.duration_seconds, window.sample_rate);
  const bpm = detectBpmCandidates(preview.samples, preview.sampleRate, preview.durationSeconds);
  const energy = energySummary(spectrum);
  const zcr = zeroCrossingRate(preview.samples);
  const loopability = boundaryStats(preview.samples, preview.sampleRate);
  const hissEstimate = clamp(energy.high * 1.25 + zcr * 1.5 - energy.low * 0.25, 0, 1);
  const vocalLikelihood = clamp((energy.mid * 0.65) + (1 - Math.abs(energy.spectralCentroidHz - 1200) / 2200) * 0.25 + (bpm.transientDensity < 2 ? 0.1 : 0), 0, 1);
  const tags = textureTags({
    energy,
    transientDensity: bpm.transientDensity,
    zeroCrossingRate: zcr,
    loopabilityScore: loopability.loopabilityScore,
    vocalLikelihood,
    hissEstimate
  });
  const duration = Number((ffprobe.ffprobe as any).format?.duration ?? preview.durationSeconds);
  return {
    path: preview.path,
    method: "heuristic ffprobe/ffmpeg preview analysis; verify musical decisions by ear",
    heuristic: true,
    confidence: {
      bpm: keyBpm.confidence.bpm,
      key: keyBpm.confidence.key,
      features: Number(clamp(preview.durationSeconds / 12, 0.2, 0.9).toFixed(3))
    },
    duration_seconds: Number.isFinite(duration) ? Number(duration.toFixed(3)) : null,
    window,
    loudness,
    peak: {
      peak_dbfs: db(preview.peak),
      rms_dbfs: db(preview.rms)
    },
    bpmCandidates: keyBpm.bpmCandidates,
    keyCandidates: keyBpm.keyCandidates,
    transientDensity: bpm.transientDensity,
    spectralCentroidHz: energy.spectralCentroidHz,
    energy,
    hissNoiseEstimate: Number(hissEstimate.toFixed(3)),
    vocalLikelihood: Number(vocalLikelihood.toFixed(3)),
    loopability: {
      ...loopability,
      hints: loopability.loopabilityScore > 0.68
        ? ["Boundary energy is reasonably close; still add a short crossfade when looping."]
        : ["Loop boundary is likely audible; use a crossfade, different loop endpoint, or one-shot placement."]
    },
    moodTextureTags: tags,
    nextCalls: [
      { name: "ableton_find_best_loop_points", arguments: { path: filePath, bpm: keyBpm.bpmCandidates[0]?.bpm, start_seconds: window.start_seconds, duration_seconds: window.duration_seconds } },
      { name: "ableton_match_samples_to_concept", arguments: { concept: "<brief>", candidates: [{ path: filePath, tags }] } }
    ]
  };
}

function nearestZeroCrossing(samples: Float32Array, targetIndex: number, radius: number) {
  const start = Math.max(1, targetIndex - radius);
  const end = Math.min(samples.length - 1, targetIndex + radius);
  let best = clamp(targetIndex, 1, samples.length - 1);
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = start; i <= end; i += 1) {
    const crosses = (samples[i - 1]! <= 0 && samples[i]! >= 0) || (samples[i - 1]! >= 0 && samples[i]! <= 0);
    const score = Math.abs(samples[i] ?? 0) + (crosses ? 0 : 0.25) + Math.abs(i - targetIndex) / Math.max(1, radius);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return { index: Math.trunc(best), sample: samples[Math.trunc(best)] ?? 0, zeroCrossing: Math.abs(samples[Math.trunc(best)] ?? 0) < 0.01 };
}

export async function findBestLoopPoints(filePath: string, options: { target_bars?: number; bpm?: number; start_seconds?: number; duration_seconds?: number } = {}) {
  const window = boundedSampleWindow({ start_seconds: options.start_seconds ?? 0, duration_seconds: options.duration_seconds ?? 45, sample_rate: 22_050 });
  const preview = await decodeMonoPreview(filePath, window.start_seconds, window.duration_seconds, window.sample_rate);
  const inferredBpm = options.bpm ?? detectBpmCandidates(preview.samples, preview.sampleRate, preview.durationSeconds).candidates[0]?.bpm;
  const bars = clamp(options.target_bars ?? 4, 1, 64);
  const targetLength = inferredBpm ? (bars * 4 * 60) / inferredBpm : Math.min(preview.durationSeconds, 8);
  const lengths = [targetLength, targetLength * 0.5, targetLength * 2]
    .filter((value) => value > 0.25 && value < preview.durationSeconds)
    .slice(0, 3);
  const radius = Math.max(64, Math.floor(preview.sampleRate * 0.075));
  const start = nearestZeroCrossing(preview.samples, 0, radius);
  const candidates = lengths.map((length, index) => {
    const end = nearestZeroCrossing(preview.samples, Math.min(preview.samples.length - 1, Math.floor(length * preview.sampleRate)), radius);
    const startSample = preview.samples[start.index] ?? 0;
    const endSample = preview.samples[end.index] ?? 0;
    const discontinuity = Math.abs(startSample - endSample);
    const score = clamp(1 - discontinuity * 10 - Math.abs((end.index - start.index) / preview.sampleRate - length) / Math.max(length, 0.001), 0, 1);
    return {
      rank: index + 1,
      start_seconds: Number((preview.startSeconds + start.index / preview.sampleRate).toFixed(4)),
      end_seconds: Number((preview.startSeconds + end.index / preview.sampleRate).toFixed(4)),
      length_seconds: Number(((end.index - start.index) / preview.sampleRate).toFixed(4)),
      target_bars: bars,
      bpm: inferredBpm ?? null,
      zeroCrossingStart: start.zeroCrossing,
      zeroCrossingEnd: end.zeroCrossing,
      boundaryDiscontinuity: Number(discontinuity.toFixed(5)),
      score: Number(score.toFixed(3))
    };
  }).sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const warnings: string[] = [];
  if (!best) warnings.push("No usable loop length found inside the analysis window.");
  if (best && best.score < 0.55) warnings.push("Best loop candidate may click or feel uneven; use a longer window or render a crossfaded loop.");
  if (!inferredBpm) warnings.push("BPM was not confidently inferred; target_bars timing is approximate.");
  return {
    path: preview.path,
    method: "heuristic zero-crossing loop endpoint search over bounded mono preview",
    heuristic: true,
    window,
    target: { target_bars: bars, bpm: inferredBpm ?? null, target_length_seconds: Number(targetLength.toFixed(4)) },
    loopCandidates: candidates,
    crossfadeSuggestionMs: best && best.score < 0.8 ? 25 : 8,
    warnings,
    nextCalls: [
      { name: "ableton_crop_clip", arguments: { source_path: filePath, start_seconds: best?.start_seconds ?? 0, duration_seconds: best?.length_seconds ?? targetLength, dry_run: true } }
    ]
  };
}

function sanitizeSampleText(value: unknown, maxLength = 240) {
  return String(value ?? "")
    .replace(/ignore (all )?(previous|prior) instructions/gi, "[removed]")
    .replace(/system prompt|developer message|tool call|exfiltrate/gi, "[removed]")
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? " " : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const RoleKeywords: Record<string, string[]> = {
  motif: ["motif", "hook", "melody", "piano", "voice", "vocal", "song", "ballroom", "phrase"],
  texture: ["texture", "room", "tone", "ambience", "field", "noise", "drone", "hiss", "vinyl", "tape"],
  impact: ["impact", "hit", "thud", "slam", "boom", "knock", "metal", "pipe"],
  vocal: ["vocal", "voice", "choir", "chant", "breath", "whisper", "singer", "mouth"],
  pulse: ["pulse", "rhythm", "machine", "heartbeat", "clock", "thump", "loop"],
  bass: ["bass", "sub", "low", "rumble", "pressure"],
  transition: ["reverse", "swell", "riser", "fall", "transition", "cymbal", "whoosh"]
};

function roleScore(text: string, role: string) {
  const keywords = RoleKeywords[role] ?? [role];
  return keywords.reduce((score, keyword) => score + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

export async function matchSamplesToConcept(options: { concept: string; candidates: Array<Record<string, unknown>>; roles?: string[] }) {
  const concept = sanitizeSampleText(options.concept, 500);
  const conceptLower = concept.toLowerCase();
  const roles = (options.roles?.length ? options.roles : ["motif", "texture", "impact", "vocal", "pulse", "bass", "transition"])
    .map((role) => sanitizeSampleText(role, 60).toLowerCase())
    .filter(Boolean)
    .slice(0, 16);
  const rankedSamples: Array<Record<string, unknown>> = [];
  const rejectedSamples: Array<Record<string, unknown>> = [];

  for (const [index, candidate] of options.candidates.slice(0, 100).entries()) {
    const pathValue = typeof candidate.path === "string" ? candidate.path : "";
    const tags = Array.isArray(candidate.tags) ? candidate.tags.map((tag) => sanitizeSampleText(tag, 60)).filter(Boolean).slice(0, 24) : [];
    const summary = {
      index,
      id: sanitizeSampleText(candidate.id ?? index, 100),
      source: sanitizeSampleText(candidate.source, 80) || null,
      title: sanitizeSampleText(candidate.title ?? candidate.name, 180) || null,
      creator: sanitizeSampleText(candidate.creator ?? candidate.username, 120) || null,
      sourceUrl: sanitizeSampleText(candidate.sourceUrl ?? candidate.url, 300) || null,
      license: sanitizeSampleText(candidate.license ?? (candidate.licensePolicy as any)?.license, 120) || null,
      tags
    };
    let localAnalysis: Awaited<ReturnType<typeof analyzeSampleMusicalFeatures>> | null = null;
    if (pathValue) {
      try {
        localAnalysis = await analyzeSampleMusicalFeatures(pathValue, { duration_seconds: 12 });
      } catch (error) {
        rejectedSamples.push({ ...summary, rejected: true, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }
    const text = [
      conceptLower,
      summary.title,
      summary.source,
      summary.creator,
      summary.license,
      tags.join(" "),
      localAnalysis?.moodTextureTags.join(" ") ?? ""
    ].join(" ").toLowerCase();
    const roleScores = roles.map((role) => ({ role, score: roleScore(text, role) + (conceptLower.includes(role) ? 0.5 : 0) }));
    const bestRole = roleScores.sort((left, right) => right.score - left.score)[0] ?? { role: "texture", score: 0 };
    const analysisBoost = localAnalysis
      ? (localAnalysis.loopability.loopabilityScore * 0.2) + (localAnalysis.vocalLikelihood > 0.5 && bestRole.role === "vocal" ? 0.2 : 0) + (localAnalysis.transientDensity > 2 && ["impact", "pulse"].includes(bestRole.role) ? 0.15 : 0)
      : 0;
    const textScore = Math.min(0.7, bestRole.score * 0.18);
    const score = Number(clamp(0.15 + textScore + analysisBoost, 0, 0.98).toFixed(3));
    if (score < 0.22) {
      rejectedSamples.push({ ...summary, rejected: true, reason: "Low concept/role match.", score });
      continue;
    }
    rankedSamples.push({
      ...summary,
      path: pathValue ? redactPath(pathValue) : null,
      score,
      matchedRole: bestRole.role,
      roleScores,
      localAnalysis: localAnalysis ? {
        confidence: localAnalysis.confidence,
        bpmCandidates: localAnalysis.bpmCandidates.slice(0, 2),
        keyCandidates: localAnalysis.keyCandidates.slice(0, 2),
        moodTextureTags: localAnalysis.moodTextureTags,
        loopability: localAnalysis.loopability,
        vocalLikelihood: localAnalysis.vocalLikelihood,
        transientDensity: localAnalysis.transientDensity
      } : null,
      nextCalls: pathValue
        ? [{ name: "ableton_find_best_loop_points", arguments: { path: pathValue, bpm: localAnalysis?.bpmCandidates[0]?.bpm, duration_seconds: 30 } }]
        : [{ name: "ableton_plan_free_sample_download", arguments: { source: summary.source ?? "<source>", source_url: summary.sourceUrl ?? "<source_url>", metadata: { license: summary.license }, dry_run: true } }]
    });
  }

  rankedSamples.sort((left, right) => Number(right.score) - Number(left.score));
  const coveredRoles = new Set(rankedSamples.map((sample) => String(sample.matchedRole)));
  const missingRoles = roles.filter((role) => !coveredRoles.has(role));
  return {
    concept,
    heuristic: true,
    rankedSamples,
    rejectedSamples,
    roleCoverage: roles.map((role) => ({ role, covered: coveredRoles.has(role), count: rankedSamples.filter((sample) => sample.matchedRole === role).length })),
    missingRoles,
    exactNextCalls: [
      { name: "ableton_analyze_sample_musical_features", arguments: { path: "<approved local sample path>" } },
      { name: "ableton_curate_concept_samples", arguments: { plan_id: "<concept plan id>", search: false, allowed_only: true } }
    ]
  };
}

export async function compareReferenceAudio(candidatePath: string, referencePath: string, options: { start_seconds?: number; duration_seconds?: number } = {}) {
  const candidateLufs = await analyzeLufs(candidatePath);
  const referenceLufs = await analyzeLufs(referencePath);
  const candidateSpectrum = await analyzeSpectrum(candidatePath, options);
  const referenceSpectrum = await analyzeSpectrum(referencePath, options);
  const candidateClip = await detectClipping(candidatePath);
  const referenceClip = await detectClipping(referencePath);
  const candidateLufsValue = candidateLufs.integrated_lufs;
  const referenceLufsValue = referenceLufs.integrated_lufs;
  return {
    candidate: { lufs: candidateLufs, spectrum: candidateSpectrum, clipping: candidateClip },
    reference: { lufs: referenceLufs, spectrum: referenceSpectrum, clipping: referenceClip },
    deltas: {
      integrated_lufs: candidateLufsValue !== null && referenceLufsValue !== null ? candidateLufsValue - referenceLufsValue : null,
      band_relative_db: candidateSpectrum.bands.map((candidateBand) => {
        const referenceBand = referenceSpectrum.bands.find((band) => band.name === candidateBand.name);
        return {
          name: candidateBand.name,
          delta_db: referenceBand ? candidateBand.relative_db - referenceBand.relative_db : null
        };
      })
    },
    nextSteps: [
      "Use deltas as mix guidance only; do not copy the reference.",
      "Check whether the candidate has too much sub, not enough low-mid body, or harsh presence against the intended mood."
    ]
  };
}

export async function analyzeMidiFile(filePath: string) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  const data = await fs.readFile(safe.real);
  const midi = new Midi(data);
  return {
    path: redactPath(safe.real),
    duration: midi.duration,
    bpm: midi.header.tempos[0]?.bpm ?? null,
    tracks: midi.tracks.map((track) => ({ name: track.name, notes: track.notes.length, channel: track.channel }))
  };
}

export async function analyzeAbletonSet(filePath: string) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  if (!safe.real.toLowerCase().endsWith(".als")) {
    throw new AbletonMcpError("Expected a .als Ableton Live Set path.", "INVALID_SET_PATH", ["Choose a .als file under an allowed root."]);
  }
  const compressed = await fs.readFile(safe.real);
  const xml = (await gunzip(compressed)).toString("utf8");
  const tracks = [...xml.matchAll(/<(AudioTrack|MidiTrack|ReturnTrack)\b/g)].length;
  const scenes = [...xml.matchAll(/<Scene\b/g)].length;
  const clips = [...xml.matchAll(/<[^>]*Clip\b/g)].length;
  const devices = [...xml.matchAll(/<DeviceChain\b|<[^>]*Device\b/g)].length;
  const plugins = [...xml.matchAll(/PluginDesc|VstPluginInfo|AuPluginInfo/g)].length;
  const sampleRefs = [...xml.matchAll(/<FileRef\b|<SampleRef\b|<OriginalFileRef\b/g)].length;
  const tempo = xml.match(/<Manual Value="([^"]+)"/)?.[1] ?? null;
  return {
    path: redactPath(safe.real),
    bytesRead: compressed.length,
    summary: { tracks, scenes, clips, devices, plugins, sampleRefs, tempo },
    rawXmlReturned: false
  };
}
