import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import zlib from "node:zlib";
import { promisify } from "node:util";
import toneMidi from "@tonejs/midi";
import { resolveSafePath, redactPath } from "./security.js";
import { AbletonMcpError } from "./errors.js";

const execFileAsync = promisify(execFile);
const gunzip = promisify(zlib.gunzip);
const { Midi } = toneMidi;

export async function analyzeAudioFile(filePath: string) {
  const safe = await resolveSafePath(filePath, { mustExist: true });
  const { stdout } = await execFileAsync("C:\\ffmpeg_latest\\ffprobe.exe", [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-print_format", "json",
    safe.real
  ], { timeout: 15_000, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
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
