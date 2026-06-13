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
