/* global Buffer, console, process */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const slug = "blue-food-court-after-midnight";
const title = "Blue Food Court After Midnight";
const SR = 44100;
const DURATION = 180;
const N = DURATION * SR;
const downloads = path.join(os.homedir(), "Downloads");
const sampleLibraryRoot = process.env.ABLETON_MCP_SAMPLE_LIBRARY_ROOT?.trim()
  || path.join(root, "samples", "staging");
const troveRoot = path.join(sampleLibraryRoot, "online-treasure-trove");
const renderRoot = path.join(sampleLibraryRoot, "renders", slug);
const stemDir = path.join(renderRoot, "stems");

const ffmpeg = process.env.ABLETON_MCP_FFMPEG || (process.platform === "win32" ? "C:\\ffmpeg_latest\\ffmpeg.exe" : "ffmpeg");
const ffprobe = process.env.ABLETON_MCP_FFPROBE || (process.platform === "win32" ? "C:\\ffmpeg_latest\\ffprobe.exe" : "ffprobe");

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outNotes = path.join(downloads, `${slug}-notes.txt`);
const outReport = path.join(downloads, `${slug}-verification.json`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);
const stagingReport = path.join(renderRoot, `${slug}-verification.json`);

fs.mkdirSync(stemDir, { recursive: true });
fs.mkdirSync(downloads, { recursive: true });

const sources = {
  jupiterPad: source("sampleradar-80s-synths-free-sample-pack", "80s Synths Samples", "Polys and Pads", "105bpm", "80s_JupiPoly[105]-C.wav"),
  czLead: source("sampleradar-80s-synths-free-sample-pack", "80s Synths Samples", "Arps and Leads", "105bpm", "80s_CZlead[105]-D.wav"),
  dxBass: source("sampleradar-80s-synths-free-sample-pack", "80s Synths Samples", "Bass Loops", "105bpm", "80s_DXbassB[105]-C.wav"),
  glitchTexture: source("musicradar-glitchy-textures-samples", "85bpm", "GliTex_Type[A]_85_03.wav"),
  departmentChimes: source("internet-archive", "red-library-bells-horns-whistles", "R04-40-Department Store Chimes.mp3"),
  knock: source("internet-archive", "various-sound-effects", "2knock.mp3"),
  broadcast: source("internet-archive", "wwii-news-1940", "1940-05-08_CBS_Murrow_On_Non-Confidence_Debate_In_Commons.mp3")
};

const stems = {
  synthMemory: bus("sampled-80s-synth-memory"),
  bass: bus("dx-bass-submerged"),
  motif: bus("glassy-food-court-motif"),
  paGhost: bus("broadcast-pa-ghosts"),
  vhsHaze: bus("glitch-vhs-haze"),
  machinery: bus("empty-mall-machinery"),
  choir: bus("synthetic-choir-neon-fog"),
  bloom: bus("atrium-reverb-bloom")
};

let seed = 0x51c0ffee;

function source(...parts) {
  return path.join(troveRoot, ...parts);
}

function bus(name) {
  return { name, l: new Float32Array(N), r: new Float32Array(N) };
}

function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function panGains(pan) {
  const angle = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function midiToFreq(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function db(value) {
  return value <= 0 ? -120 : 20 * Math.log10(value);
}

function fileExists(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function checkSources() {
  const missing = Object.entries(sources)
    .filter(([, file]) => !fileExists(file))
    .map(([name, file]) => ({ name, file }));
  if (missing.length > 0) {
    throw new Error(`Missing required local sources: ${JSON.stringify(missing, null, 2)}`);
  }
}

function decodeSample(file, options = {}) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error"
  ];
  if (options.seek != null) args.push("-ss", String(options.seek));
  args.push("-i", file);
  if (options.duration != null) args.push("-t", String(options.duration));
  args.push("-ar", String(SR), "-ac", "2", "-f", "f32le", "pipe:1");

  const result = spawnSync(ffmpeg, args, {
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg decode failed for ${file}: ${result.stderr?.toString("utf8") ?? ""}`);
  }
  const samples = new Float32Array(result.stdout.buffer, result.stdout.byteOffset, Math.floor(result.stdout.byteLength / 4));
  return { file, frames: Math.floor(samples.length / 2), samples };
}

function readSampleFrame(sample, pos, channel) {
  const maxFrame = sample.frames - 1;
  if (pos < 0 || pos >= maxFrame) return 0;
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = sample.samples[i * 2 + channel] ?? 0;
  const b = sample.samples[(i + 1) * 2 + channel] ?? a;
  return a + (b - a) * frac;
}

function envelope(progress, fadeIn = 0.08, fadeOut = 0.16) {
  return smoothstep(progress / Math.max(0.0001, fadeIn))
    * smoothstep((1 - progress) / Math.max(0.0001, fadeOut));
}

function addSample(b, sample, options) {
  const start = Math.floor(options.time * SR);
  const outFrames = Math.floor(options.length * SR);
  const speed = options.speed ?? 1;
  const reverse = options.reverse ?? false;
  const volume = options.volume ?? 0.3;
  const width = options.width ?? 1;
  const pan = options.pan ?? 0;
  const panDrift = options.panDrift ?? 0;
  const [baseL, baseR] = panGains(pan);
  let lpL = 0;
  let lpR = 0;
  const lowpass = options.lowpass ?? 1;
  for (let i = 0; i < outFrames; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const progress = i / Math.max(1, outFrames - 1);
    let pos = i * speed;
    if (options.loop) pos %= sample.frames;
    if (reverse) pos = sample.frames - 1 - pos;
    if (pos < 0 || pos >= sample.frames - 1) {
      if (!options.loop) continue;
      pos = ((pos % sample.frames) + sample.frames) % sample.frames;
    }
    let l = readSampleFrame(sample, pos, 0);
    let r = readSampleFrame(sample, pos, 1);
    const mid = (l + r) * 0.5;
    l = mid + (l - mid) * width;
    r = mid + (r - mid) * width;
    lpL += (l - lpL) * lowpass;
    lpR += (r - lpR) * lowpass;
    const driftPan = pan + Math.sin((options.time + i / SR) * (options.driftRate ?? 0.07)) * panDrift;
    const [dl, dr] = panGains(driftPan);
    const gain = volume * envelope(progress, options.fadeIn ?? 0.08, options.fadeOut ?? 0.18);
    b.l[di] += lpL * gain * baseL * dl * 1.25;
    b.r[di] += lpR * gain * baseR * dr * 1.25;
  }
}

function addTone(b, options) {
  const start = Math.floor(options.time * SR);
  const len = Math.floor(options.length * SR);
  const freq = options.freq ?? midiToFreq(options.note ?? 60);
  const [pl, pr] = panGains(options.pan ?? 0);
  let phase = options.phase ?? 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const t = i / SR;
    const drift = 1 + Math.sin((options.time + t) * (options.driftRate ?? 0.08)) * (options.drift ?? 0);
    phase += 2 * Math.PI * freq * drift / SR;
    const sine = Math.sin(phase);
    const second = Math.sin(phase * 2.005) * (options.second ?? 0);
    const third = Math.sin(phase * 3.002) * (options.third ?? 0);
    const fifth = Math.sin(phase * 1.5) * (options.fifth ?? 0);
    const pulse = Math.sign(Math.sin(phase)) * (options.pulse ?? 0);
    const shaped = Math.tanh((sine + second + third + fifth + pulse) * (options.drive ?? 1));
    const trem = 1 + Math.sin((options.time + t) * (options.tremRate ?? 0.1)) * (options.trem ?? 0);
    const gain = (options.volume ?? 0.15) * envelope(p, options.fadeIn ?? 0.1, options.fadeOut ?? 0.18) * trem;
    b.l[di] += shaped * gain * pl;
    b.r[di] += shaped * gain * pr;
  }
}

function addChord(b, time, length, notes, options = {}) {
  notes.forEach((note, index) => {
    addTone(b, {
      time,
      length,
      note,
      volume: (options.volume ?? 0.055) / Math.sqrt(notes.length),
      pan: (options.pan ?? 0) + (index - (notes.length - 1) / 2) * (options.spread ?? 0.15),
      drift: options.drift ?? 0.002,
      driftRate: options.driftRate ?? 0.09,
      second: options.second ?? 0.16,
      third: options.third ?? 0.05,
      fifth: options.fifth ?? 0.08,
      pulse: options.pulse ?? 0.02,
      drive: options.drive ?? 1.2,
      fadeIn: options.fadeIn ?? 0.18,
      fadeOut: options.fadeOut ?? 0.24,
      trem: options.trem ?? 0.08,
      tremRate: options.tremRate ?? 0.03,
      phase: rand() * Math.PI * 2
    });
  });
}

function addBell(b, time, note, options = {}) {
  const length = options.length ?? 5;
  addTone(b, {
    time,
    length,
    note,
    volume: options.volume ?? 0.08,
    pan: options.pan ?? 0,
    drift: 0.0015,
    driftRate: 0.11,
    second: 0.52,
    third: 0.31,
    fifth: 0.18,
    drive: 0.9,
    fadeIn: 0.005,
    fadeOut: 0.72,
    trem: 0.1,
    tremRate: 0.17,
    phase: rand() * Math.PI * 2
  });
}

function addNoiseAir(b, time, length, volume, pan = 0, color = 0.01) {
  const start = Math.floor(time * SR);
  const len = Math.floor(length * SR);
  const [pl, pr] = panGains(pan);
  let l = 0;
  let r = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    l += ((rand() * 2 - 1) - l) * color;
    r += ((rand() * 2 - 1) - r) * color * 0.91;
    const slow = 0.65 + Math.sin((time + i / SR) * 0.031) * 0.35;
    const gain = volume * envelope(p, 0.18, 0.22) * slow;
    b.l[di] += l * gain * pl;
    b.r[di] += r * gain * pr;
  }
}

function addDropout(b, time, length, depth) {
  const start = Math.floor(time * SR);
  const len = Math.floor(length * SR);
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const keep = 1 - depth * envelope(p, 0.15, 0.15);
    b.l[di] *= keep;
    b.r[di] *= keep;
  }
}

function copyDelay(sourceBus, targetBus, options) {
  const delay = Math.floor(options.delay * SR);
  const start = Math.floor((options.start ?? 0) * SR);
  const end = Math.floor((options.end ?? DURATION) * SR);
  const gain = options.gain ?? 0.2;
  const width = options.width ?? 1.3;
  for (let i = start; i < end; i += 1) {
    const di = i + delay;
    if (di < 0 || di >= N) continue;
    const env = envelope((i - start) / Math.max(1, end - start), 0.12, 0.2);
    const l = sourceBus.l[i] ?? 0;
    const r = sourceBus.r[i] ?? 0;
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5 * width;
    targetBus.l[di] += (mid + side) * gain * env;
    targetBus.r[di] += (mid - side) * gain * env;
  }
}

function renderComposition() {
  checkSources();
  const pad = decodeSample(sources.jupiterPad, { duration: 9.2 });
  const lead = decodeSample(sources.czLead, { duration: 9.2 });
  const bass = decodeSample(sources.dxBass, { duration: 4.7 });
  const glitch = decodeSample(sources.glitchTexture, { duration: 5.7 });
  const chime = decodeSample(sources.departmentChimes, { duration: 23.7 });
  const knock = decodeSample(sources.knock, { duration: 2.5 });
  const broadcast = decodeSample(sources.broadcast, { seek: 17, duration: 28 });

  const progression = [
    [42, 49, 56, 61, 66],
    [40, 47, 54, 59, 64],
    [45, 52, 59, 64, 68],
    [38, 45, 52, 57, 62],
    [44, 51, 56, 61, 65],
    [37, 44, 51, 56, 61]
  ];
  for (let section = 0; section < 6; section += 1) {
    const start = section * 30;
    for (let step = 0; step < 4; step += 1) {
      const t = start + step * 7.5;
      const notes = progression[(section + step) % progression.length];
      addChord(stems.synthMemory, t, 8.8, notes, {
        volume: 0.11 + section * 0.005,
        spread: 0.22,
        drift: 0.002 + section * 0.0003,
        trem: 0.05 + section * 0.01,
        fadeIn: 0.32,
        fadeOut: 0.38
      });
    }
  }

  for (let t = 0; t < DURATION; t += 18.2) {
    addSample(stems.synthMemory, pad, {
      time: t,
      length: 19,
      speed: 0.52 + Math.sin(t * 0.07) * 0.02,
      volume: 0.115,
      width: 0.86,
      pan: Math.sin(t * 0.03) * 0.12,
      panDrift: 0.15,
      fadeIn: 0.12,
      fadeOut: 0.28,
      lowpass: 0.12
    });
  }

  for (let t = 22; t < 154; t += 10.9) {
    addSample(stems.bass, bass, {
      time: t,
      length: 9.5,
      speed: 0.47,
      volume: 0.08,
      width: 0.08,
      pan: 0,
      fadeIn: 0.11,
      fadeOut: 0.35,
      lowpass: 0.08
    });
  }
  for (let t = 8; t < 180; t += 15) {
    const shouldDrop = t > 150 && t < 163;
    if (shouldDrop) continue;
    addTone(stems.bass, {
      time: t,
      length: 8.8,
      freq: 46.25,
      volume: t > 120 ? 0.095 : 0.055,
      pan: 0,
      second: 0.02,
      third: 0.01,
      drive: 1.04,
      fadeIn: 0.2,
      fadeOut: 0.5,
      trem: 0.16,
      tremRate: 0.21
    });
  }
  addTone(stems.bass, {
    time: 164,
    length: 12,
    freq: 38.89,
    volume: 0.14,
    pan: 0,
    second: 0.015,
    fadeIn: 0.45,
    fadeOut: 0.62,
    trem: 0.09,
    tremRate: 0.12
  });

  const motif = [66, 68, 73, 71, 64, 61, 66];
  const motifTimes = [18, 48, 78, 108, 136, 160];
  motifTimes.forEach((base, returnIndex) => {
    motif.forEach((note, i) => {
      if (returnIndex >= 2 && (i === 2 || i === 5)) return;
      if (returnIndex >= 4 && i % 2 === 1) return;
      const late = returnIndex * 0.045 + (i % 3) * 0.018;
      addBell(stems.motif, base + i * (1.18 + returnIndex * 0.035) + late, note - Math.floor(returnIndex / 2), {
        length: 4.6 + returnIndex * 0.3,
        volume: 0.075 - returnIndex * 0.006,
        pan: -0.45 + i * 0.15 + Math.sin(base) * 0.08
      });
    });
  });
  [35, 72, 116, 147].forEach((time, index) => {
    addSample(stems.motif, chime, {
      time,
      length: 20,
      speed: index % 2 === 0 ? 0.55 : 0.42,
      reverse: index === 2,
      volume: 0.055,
      width: 1.2,
      pan: index % 2 === 0 ? -0.22 : 0.26,
      panDrift: 0.22,
      fadeIn: 0.16,
      fadeOut: 0.5,
      lowpass: 0.09
    });
  });
  [82, 122, 151].forEach((time, index) => {
    addSample(stems.motif, lead, {
      time,
      length: 16,
      speed: index === 2 ? 0.33 : 0.44,
      reverse: index === 1,
      volume: 0.048,
      width: 1.4,
      pan: index === 1 ? 0.34 : -0.18,
      panDrift: 0.22,
      fadeIn: 0.2,
      fadeOut: 0.55,
      lowpass: 0.06
    });
  });

  addNoiseAir(stems.paGhost, 0, DURATION, 0.018, 0.05, 0.006);
  [44, 95, 132].forEach((time, index) => {
    addSample(stems.paGhost, broadcast, {
      time,
      length: 27,
      speed: index === 0 ? 0.62 : 0.48,
      reverse: index !== 0,
      volume: 0.022,
      width: 1.55,
      pan: index === 1 ? -0.36 : 0.3,
      panDrift: 0.28,
      fadeIn: 0.32,
      fadeOut: 0.5,
      lowpass: 0.035
    });
  });
  for (let t = 20; t < 178; t += 22.5) {
    addTone(stems.paGhost, {
      time: t,
      length: 5.2,
      freq: 880 + Math.sin(t) * 9,
      volume: 0.018,
      pan: Math.sin(t * 0.08) * 0.55,
      second: 0.09,
      third: 0.02,
      drive: 0.8,
      fadeIn: 0.04,
      fadeOut: 0.7,
      trem: 0.28,
      tremRate: 0.41
    });
  }

  for (let t = 30; t < 170; t += 17.3) {
    addSample(stems.vhsHaze, glitch, {
      time: t,
      length: 14,
      speed: 0.31 + Math.sin(t * 0.1) * 0.04,
      reverse: Math.floor(t) % 2 === 0,
      volume: t > 120 ? 0.055 : 0.034,
      width: 1.5,
      pan: Math.sin(t * 0.12) * 0.45,
      panDrift: 0.3,
      fadeIn: 0.22,
      fadeOut: 0.33,
      lowpass: 0.045
    });
  }
  addNoiseAir(stems.vhsHaze, 34, 126, 0.014, -0.2, 0.014);
  [66, 88, 112, 143, 157].forEach((time) => addDropout(stems.vhsHaze, time, 0.6 + rand() * 0.8, 0.85));

  [28, 51, 75, 101, 127, 148, 171].forEach((time, index) => {
    addSample(stems.machinery, knock, {
      time,
      length: 4.2,
      speed: 0.44 + index * 0.015,
      volume: 0.08,
      width: 0.55,
      pan: index % 2 === 0 ? -0.4 : 0.38,
      fadeIn: 0.01,
      fadeOut: 0.7,
      lowpass: 0.25
    });
    addTone(stems.machinery, {
      time: time + 0.07,
      length: 3.8,
      freq: 93 + index * 3.2,
      volume: 0.026,
      pan: 0,
      second: 0.16,
      third: 0.05,
      drive: 1.3,
      fadeIn: 0.01,
      fadeOut: 0.72,
      trem: 0.08,
      tremRate: 0.23
    });
  });

  const choirChords = [
    [61, 64, 68, 73],
    [59, 64, 66, 71],
    [57, 61, 64, 69],
    [56, 61, 63, 68]
  ];
  for (let t = 62; t < 178; t += 14.5) {
    const notes = choirChords[Math.floor((t - 62) / 14.5) % choirChords.length];
    notes.forEach((note, index) => {
      addTone(stems.choir, {
        time: t + index * 0.14,
        length: 18,
        note,
        volume: 0.035,
        pan: -0.55 + index * 0.35 + Math.sin(t * 0.04) * 0.12,
        second: 0.42,
        third: 0.12,
        fifth: 0.09,
        drive: 0.75,
        drift: 0.003,
        driftRate: 0.04,
        fadeIn: 0.42,
        fadeOut: 0.55,
        trem: 0.13,
        tremRate: 0.09,
        phase: rand() * Math.PI * 2
      });
    });
  }

  copyDelay(stems.synthMemory, stems.bloom, { start: 8, end: 176, delay: 0.38, gain: 0.17, width: 1.7 });
  copyDelay(stems.motif, stems.bloom, { start: 18, end: 176, delay: 0.73, gain: 0.22, width: 1.8 });
  copyDelay(stems.choir, stems.bloom, { start: 62, end: 178, delay: 1.41, gain: 0.2, width: 1.95 });
  for (let t = 150; t < 180; t += 6.5) {
    addChord(stems.bloom, t, 9.2, [37, 44, 51, 56, 61, 66], {
      volume: 0.06,
      spread: 0.28,
      drift: 0.003,
      second: 0.24,
      third: 0.08,
      pulse: 0.01,
      fadeIn: 0.4,
      fadeOut: 0.56,
      trem: 0.12,
      tremRate: 0.04
    });
  }
}

function peakOf(b) {
  let peak = 0;
  for (let i = 0; i < N; i += 1) {
    peak = Math.max(peak, Math.abs(b.l[i]), Math.abs(b.r[i]));
  }
  return peak;
}

function rmsOf(interleaved) {
  let sum = 0;
  for (let i = 0; i < interleaved.length; i += 1) sum += interleaved[i] * interleaved[i];
  return Math.sqrt(sum / interleaved.length);
}

function writeWav24(file, left, right) {
  const frames = left.length;
  const dataSize = frames * 2 * 3;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2 * 3, 28);
  buffer.writeUInt16LE(2 * 3, 32);
  buffer.writeUInt16LE(24, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    const l = Math.round(clamp(left[i], -1, 1) * 8388607);
    const r = Math.round(clamp(right[i], -1, 1) * 8388607);
    buffer.writeIntLE(l, offset, 3);
    buffer.writeIntLE(r, offset + 3, 3);
    offset += 6;
  }
  fs.writeFileSync(file, buffer);
}

function writeStemFiles() {
  for (const stem of Object.values(stems)) {
    const peak = peakOf(stem);
    const scale = peak > 0.96 ? 0.96 / peak : 1;
    if (scale !== 1) {
      for (let i = 0; i < N; i += 1) {
        stem.l[i] *= scale;
        stem.r[i] *= scale;
      }
    }
    writeWav24(path.join(stemDir, `${stem.name}.wav`), stem.l, stem.r);
  }
}

function makeMaster() {
  const l = new Float32Array(N);
  const r = new Float32Array(N);
  const gains = {
    synthMemory: 0.72,
    bass: 0.9,
    motif: 0.76,
    paGhost: 0.66,
    vhsHaze: 0.62,
    machinery: 0.68,
    choir: 0.7,
    bloom: 0.72
  };
  for (const [key, stem] of Object.entries(stems)) {
    const gain = gains[key] ?? 0.6;
    for (let i = 0; i < N; i += 1) {
      l[i] += stem.l[i] * gain;
      r[i] += stem.r[i] * gain;
    }
  }
  let hpL = 0;
  let hpR = 0;
  let prevL = 0;
  let prevR = 0;
  for (let i = 0; i < N; i += 1) {
    const dl = l[i] - prevL;
    const dr = r[i] - prevR;
    prevL = l[i];
    prevR = r[i];
    hpL = hpL * 0.995 + dl;
    hpR = hpR * 0.995 + dr;
    l[i] = Math.tanh((hpL + l[i] * 0.92) * 0.92);
    r[i] = Math.tanh((hpR + r[i] * 0.92) * 0.92);
  }
  let peak = 0;
  for (let i = 0; i < N; i += 1) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  const scale = peak > 0 ? 0.86 / peak : 1;
  for (let i = 0; i < N; i += 1) {
    l[i] *= scale;
    r[i] *= scale;
  }
  const interleaved = new Float32Array(N * 2);
  for (let i = 0; i < N; i += 1) {
    interleaved[i * 2] = l[i];
    interleaved[i * 2 + 1] = r[i];
  }
  return { l, r, peak: peak * scale, rms: rmsOf(interleaved) };
}

function runTool(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    stdout: result.stdout?.slice(-4000) ?? "",
    stderr: result.stderr?.slice(-4000) ?? ""
  };
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function writeMp3(wav, mp3) {
  const result = runTool(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "320k", mp3]);
  if (result.status !== 0) throw new Error(`MP3 encode failed: ${result.stderr}`);
  return result;
}

function ffprobeFile(file) {
  return runTool(ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels,bits_per_sample", "-of", "json", file]);
}

function ebur128(file) {
  return runTool(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]);
}

function monoFoldCheck(file) {
  const mono = path.join(renderRoot, `${slug}-mono-check.wav`);
  const result = runTool(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-af", "pan=mono|c0=0.5*c0+0.5*c1", "-ar", String(SR), mono]);
  const probe = fs.existsSync(mono) ? ffprobeFile(mono) : null;
  return { result, probe };
}

function writeNotes(report) {
  const lines = [
    title,
    "",
    "Concept:",
    "An original late-night vaporwave piece built from the local sample trove and procedural synthesis. It imagines an empty blue food court after closing: cassette-soft 80s synth memory, public-address ghosts, department-store chimes, low HVAC pressure, distant knocks, and a slow neon choir.",
    "",
    "Source policy:",
    "Private experiment render. No downloads, no Ableton writes, no UI/mouse control, no arbitrary URL fetches. Broadcast speech is processed as low-level reversed/filtered texture so it does not carry intelligible instructions.",
    "",
    "Local source samples:",
    ...Object.entries(sources).map(([name, file]) => `- ${name}: ${file}`),
    "",
    "Outputs:",
    `- Master WAV: ${outWav}`,
    `- Master MP3: ${outMp3}`,
    `- Stems: ${stemDir}`,
    `- Verification JSON: ${outReport}`,
    "",
    "Mix summary:",
    `- Duration: ${DURATION}s`,
    `- Sample rate: ${SR} Hz`,
    `- Sample peak: ${db(report.master.peak).toFixed(2)} dBFS`,
    `- RMS: ${db(report.master.rms).toFixed(2)} dBFS`
  ];
  fs.writeFileSync(outNotes, `${lines.join(os.EOL)}${os.EOL}`, "utf8");
}

function main() {
  renderComposition();
  writeStemFiles();
  const master = makeMaster();
  writeWav24(stagingWav, master.l, master.r);
  copyFile(stagingWav, outWav);
  const mp3Encode = writeMp3(outWav, outMp3);
  const wavProbe = ffprobeFile(outWav);
  const mp3Probe = ffprobeFile(outMp3);
  const loudness = ebur128(outWav);
  const mono = monoFoldCheck(outWav);
  const stemFiles = fs.readdirSync(stemDir).filter((name) => name.endsWith(".wav")).sort();
  const report = {
    title,
    slug,
    ok: master.peak <= 0.966,
    createdAt: new Date().toISOString(),
    renderRoot,
    downloads,
    sampleLibraryRoot,
    sourceSamplesUsed: Object.keys(sources).length,
    sourceSamples: sources,
    safety: {
      downloads: false,
      abletonWrites: false,
      uiMouseControl: false,
      arbitraryUrlFetch: false,
      arbitraryShell: false,
      subliminalOrCoerciveSpeech: false
    },
    master: {
      wav: outWav,
      mp3: outMp3,
      stagingWav,
      durationSeconds: DURATION,
      sampleRate: SR,
      peak: master.peak,
      peakDbfs: db(master.peak),
      rms: master.rms,
      rmsDbfs: db(master.rms)
    },
    stems: {
      directory: stemDir,
      count: stemFiles.length,
      files: stemFiles
    },
    commands: {
      mp3Encode,
      wavProbe,
      mp3Probe,
      loudness,
      mono
    }
  };
  fs.writeFileSync(stagingReport, `${JSON.stringify(report, null, 2)}${os.EOL}`, "utf8");
  fs.writeFileSync(outReport, `${JSON.stringify(report, null, 2)}${os.EOL}`, "utf8");
  writeNotes(report);
  console.log(JSON.stringify({
    ok: report.ok,
    title,
    masterWav: outWav,
    masterMp3: outMp3,
    notes: outNotes,
    verification: outReport,
    stems: stemDir,
    peakDbfs: Number(report.master.peakDbfs.toFixed(2)),
    rmsDbfs: Number(report.master.rmsDbfs.toFixed(2)),
    sourceSamplesUsed: report.sourceSamplesUsed
  }, null, 2));
}

main();
