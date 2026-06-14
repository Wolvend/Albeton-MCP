/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const slug = "the-wallpaper-knows-your-name";
const title = "The Wallpaper Knows Your Name";
const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const DURATION = 216;
const N = DURATION * SR;
let seed = 0x2a7f51c9;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);

const stems = {
  memory: bus("ballroom-memory"),
  voices: bus("wallpaper-voices"),
  hallway: bus("hallway-air"),
  reverse: bus("reverse-glass"),
  pressure: bus("basement-pressure"),
  knocks: bus("structural-knocks"),
  tape: bus("tape-cuts"),
  signal: bus("forbidden-baby-monitor-signal")
};

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

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`Not WAV: ${file}`);
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= b.length) {
    const id = b.toString("ascii", offset, offset + 4);
    const size = b.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        sampleRate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14)
      };
    }
    if (id === "data") data = b.subarray(body, body + size);
    offset = body + size + (size % 2);
  }
  if (!fmt || !data || ![1, 3].includes(fmt.format)) throw new Error(`Unsupported WAV: ${file}`);
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / bytes / fmt.channels);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const values = [];
    for (let c = 0; c < fmt.channels; c += 1) {
      const p = (i * fmt.channels + c) * bytes;
      let v = 0;
      if (fmt.format === 3 && fmt.bits === 32) v = data.readFloatLE(p);
      else if (fmt.bits === 16) v = data.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) {
        const raw = data[p] | (data[p + 1] << 8) | (data[p + 2] << 16);
        v = ((raw & 0x800000) ? raw | 0xff000000 : raw) / 8388608;
      } else if (fmt.bits === 32) v = data.readInt32LE(p) / 2147483648;
      values.push(v);
    }
    l[i] = values[0] ?? 0;
    r[i] = values[1] ?? values[0] ?? 0;
  }
  return resample({ file, sampleRate: fmt.sampleRate, length: frames, l, r });
}

function resample(src) {
  if (src.sampleRate === SR) return src;
  const frames = Math.floor(src.length * SR / src.sampleRate);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const x = i * src.sampleRate / SR;
    const j = Math.floor(x);
    const f = x - j;
    const k = Math.min(src.length - 1, j + 1);
    l[i] = src.l[j] * (1 - f) + src.l[k] * f;
    r[i] = src.r[j] * (1 - f) + src.r[k] * f;
  }
  return { ...src, sampleRate: SR, length: frames, l, r };
}

function sampleAt(src, channel, position) {
  if (position < 0 || position >= src.length - 2) return 0;
  const i = Math.floor(position);
  const f = position - i;
  const data = channel === 0 ? src.l : src.r;
  return data[i] * (1 - f) + data[i + 1] * f;
}

function addSample(b, src, opt) {
  const start = Math.floor((opt.time ?? 0) * SR);
  const len = Math.floor((opt.length ?? 6) * SR);
  const sourceStart = (opt.src ?? 0) * SR;
  const [pl, pr] = panGains(opt.pan ?? 0);
  const fade = Math.min(Math.floor((opt.fade ?? 0.8) * SR), Math.floor(len / 2));
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    const sag = opt.sag ? 1 - opt.sag * p : 1;
    const drift = 1 + Math.sin((opt.time + t) * 0.031) * (opt.wow ?? 0) + Math.sin((opt.time + t) * 0.113) * (opt.wow ?? 0) * 0.48;
    const rate = (opt.rate ?? 1) * sag * drift;
    const local = opt.reverse ? (len - i - 1) * rate : i * rate;
    let l = sampleAt(src, 0, sourceStart + local);
    let r = sampleAt(src, 1, sourceStart + local);
    if (opt.crush) {
      const steps = 1 << Math.max(4, Math.floor(14 - opt.crush * 7));
      l = Math.round(l * steps) / steps;
      r = Math.round(r * steps) / steps;
    }
    let e = 1;
    if (fade > 0) e *= Math.min(1, i / fade, (len - i) / fade);
    if (opt.attack) e *= smoothstep(i / (opt.attack * SR));
    if (opt.release) e *= smoothstep((len - i) / (opt.release * SR));
    if (opt.gate) {
      const q = ((t + (opt.gate.phase ?? 0)) % opt.gate.period) / opt.gate.period;
      e *= q < opt.gate.duty ? 1 : opt.gate.floor;
    }
    if (opt.dropouts) e *= rand() < opt.dropouts ? 0.04 : 1;
    b.l[di] += l * (opt.gain ?? 0.1) * e * pl;
    b.r[di] += r * (opt.gain ?? 0.1) * e * pr;
  }
}

function addTone(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const t = i / SR;
    const freq = opt.freq + ((opt.freqEnd ?? opt.freq) - opt.freq) * p;
    let v = Math.sin(2 * Math.PI * freq * t + (opt.phase ?? 0));
    if (opt.type === "tri") v = Math.asin(v) * 2 / Math.PI;
    if (opt.type === "sine2") v = v * 0.72 + Math.sin(2 * Math.PI * freq * 2.01 * t + 1.1) * 0.28;
    const trem = opt.tremolo ? 0.72 + 0.28 * Math.sin(2 * Math.PI * opt.tremolo * t + 0.9) : 1;
    const env = smoothstep(i / ((opt.attack ?? 1) * SR)) * smoothstep((len - i) / ((opt.release ?? 1) * SR));
    b.l[di] += v * (opt.gain ?? 0.04) * env * trem * pl;
    b.r[di] += v * (opt.gain ?? 0.04) * env * trem * pr;
  }
}

function addNoise(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    lpL += ((rand() * 2 - 1) - lpL) * (opt.lowpass ?? 0.006);
    lpR += ((rand() * 2 - 1) - lpR) * (opt.lowpass ?? 0.006);
    const p = i / Math.max(1, len - 1);
    const env = smoothstep(i / ((opt.attack ?? 2) * SR)) * smoothstep((len - i) / ((opt.release ?? 2) * SR));
    const breathe = 0.78 + 0.22 * Math.sin(2 * Math.PI * (opt.breathe ?? 0.025) * (i / SR) + 1.4);
    const scar = rand() > (opt.scarThreshold ?? 0.99992) ? (rand() * 2 - 1) * (opt.scar ?? 0.09) : 0;
    const tilt = 0.85 + p * 0.35;
    b.l[di] += (lpL * tilt + scar) * (opt.gain ?? 0.03) * env * breathe * pl;
    b.r[di] += (lpR * (2 - tilt) + scar * 0.44) * (opt.gain ?? 0.03) * env * breathe * pr;
  }
}

function addVowelGhost(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  const shapes = [
    [330, 780, 2260],
    [440, 1010, 2410],
    [620, 1260, 2840],
    [760, 1380, 3030]
  ];
  const formants = shapes[opt.shape ?? 0];
  let breathL = 0;
  let breathR = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    breathL += ((rand() * 2 - 1) - breathL) * 0.014;
    breathR += ((rand() * 2 - 1) - breathR) * 0.011;
    let voiced = 0;
    for (let h = 1; h <= 9; h += 1) {
      const pull = 1 - p * (opt.sag ?? 0.03);
      voiced += Math.sin(2 * Math.PI * opt.freq * h * pull * t + h * 0.37) / (h * 1.7);
    }
    let body = 0;
    for (const f of formants) body += Math.sin(2 * Math.PI * f * (1 + Math.sin(t * 0.17) * 0.002) * t) * 0.034;
    const env = smoothstep(i / ((opt.attack ?? 4) * SR)) * smoothstep((len - i) / ((opt.release ?? 5) * SR));
    const almostWord = 0.72 + 0.28 * Math.sin(2 * Math.PI * (0.11 + opt.shape * 0.013) * t + 0.5);
    const near = opt.near ? 1.18 + 0.1 * Math.sin(t * 3.6) : 1;
    b.l[di] += (voiced * 0.35 + body + breathL * 0.13) * (opt.gain ?? 0.04) * env * almostWord * near * pl;
    b.r[di] += (voiced * 0.31 + body * 1.08 - breathR * 0.11) * (opt.gain ?? 0.04) * env * almostWord * near * pr;
  }
}

function addImpact(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  let scrape = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    scrape += ((rand() * 2 - 1) - scrape) * 0.026;
    const pitch = opt.freq * (1 - p * 0.42);
    const body = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-p * 7.2);
    const wood = Math.sin(2 * Math.PI * (pitch * 2.7) * t + 0.4) * Math.exp(-p * 12.5);
    const env = smoothstep(i / (0.018 * SR)) * smoothstep((len - i) / (0.18 * SR));
    const v = (body + wood * 0.22 + scrape * 0.11) * (opt.gain ?? 0.08) * env;
    b.l[di] += v * pl;
    b.r[di] += v * pr;
  }
}

function addSignalChirp(b, time, freq, length, gain, pan) {
  addTone(b, { time, length, freq, freqEnd: freq * 0.985, gain, pan, attack: 0.01, release: 0.08, tremolo: 9.2, type: "sine2" });
  addTone(b, { time: time + length * 0.38, length: length * 0.46, freq: freq * 1.507, freqEnd: freq * 1.491, gain: gain * 0.35, pan: -pan, attack: 0.006, release: 0.05 });
}

function highpass(data, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = rc / (rc + dt);
  let y = 0;
  let previous = 0;
  for (let i = 0; i < data.length; i += 1) {
    const x = data[i];
    y = a * (y + x - previous);
    data[i] = y;
    previous = x;
  }
}

function lowpass(data, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < data.length; i += 1) {
    y += (data[i] - y) * a;
    data[i] = y;
  }
}

function filterBus(b, hp, lp) {
  if (hp) {
    highpass(b.l, hp);
    highpass(b.r, hp);
  }
  if (lp) {
    lowpass(b.l, lp);
    lowpass(b.r, lp);
  }
}

function saturateBus(b, drive) {
  for (let i = 0; i < N; i += 1) {
    b.l[i] = Math.tanh(b.l[i] * drive) / Math.tanh(drive);
    b.r[i] = Math.tanh(b.r[i] * drive) / Math.tanh(drive);
  }
}

function roomShift(b, amount) {
  const sections = [
    { start: 0, end: 31, taps: [0.033, 0.071, 0.124], wet: 0.055, width: 0.18 },
    { start: 31, end: 78, taps: [0.16, 0.41, 0.93, 1.52], wet: 0.075, width: 0.7 },
    { start: 78, end: 132, taps: [0.29, 0.67, 1.43, 2.21, 3.18], wet: 0.062, width: 1.0 },
    { start: 132, end: 174, taps: [0.048, 0.19, 0.56, 1.08], wet: 0.052, width: 0.46 },
    { start: 174, end: 216, taps: [0.37, 0.88, 1.91, 3.71, 5.2], wet: 0.048, width: 1.15 }
  ];
  for (const section of sections) {
    const s = Math.floor(section.start * SR);
    const e = Math.min(N, Math.floor(section.end * SR));
    for (const tap of section.taps) {
      const d = Math.floor(tap * SR);
      for (let i = Math.max(s + d, d); i < e; i += 1) {
        const t = i / SR;
        const morph = 0.55 + 0.45 * Math.sin(t * 0.013 + tap * 2.1);
        const wet = section.wet * amount * morph;
        const left = b.l[i - d];
        const right = b.r[i - d];
        b.l[i] += (right * section.width + left * (1 - section.width) * 0.2) * wet;
        b.r[i] += (left * section.width + right * (1 - section.width) * 0.2) * wet;
      }
    }
  }
}

function stereoDrift(b, depth) {
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const side = (b.l[i] - b.r[i]) * 0.5;
    const mid = (b.l[i] + b.r[i]) * 0.5;
    const width = 0.75 + depth * (0.5 + 0.5 * Math.sin(t * 0.019 + Math.sin(t * 0.004) * 2.4));
    b.l[i] = mid + side * width;
    b.r[i] = mid - side * width;
  }
}

function asymDelay(b, leftSeconds, rightSeconds, wet) {
  const dl = Math.max(1, Math.floor(leftSeconds * SR));
  const dr = Math.max(1, Math.floor(rightSeconds * SR));
  for (let i = N - 1; i >= Math.max(dl, dr); i -= 1) {
    b.l[i] += b.l[i - dl] * wet;
    b.r[i] += b.r[i - dr] * wet;
  }
}

function sideHalo(b, seconds, wet) {
  const d = Math.max(1, Math.floor(seconds * SR));
  for (let i = N - 1; i >= d; i -= 1) {
    const t = i / SR;
    const halo = (b.l[i - d] + b.r[i - d]) * 0.5 * wet * (0.7 + 0.3 * Math.sin(t * 0.031 + seconds * 17));
    b.l[i] += halo;
    b.r[i] -= halo * 0.82;
  }
}

function scaleBus(b, gain) {
  for (let i = 0; i < N; i += 1) {
    b.l[i] *= gain;
    b.r[i] *= gain;
  }
}

function sumBuses(buses) {
  const l = new Float32Array(N);
  const r = new Float32Array(N);
  for (const b of buses) {
    for (let i = 0; i < N; i += 1) {
      l[i] += b.l[i];
      r[i] += b.r[i];
    }
  }
  return { name: "master", l, r };
}

function peakRms(b) {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < N; i += 1) {
    const l = b.l[i];
    const r = b.r[i];
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += l * l + r * r;
  }
  return { peak: Number(peak.toFixed(4)), rms: Number(Math.sqrt(sum / (N * 2)).toFixed(4)) };
}

function writeWav24(file, b) {
  const dataBytes = N * 2 * 3;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2 * 3, 28);
  out.writeUInt16LE(2 * 3, 32);
  out.writeUInt16LE(24, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
  let p = 44;
  for (let i = 0; i < N; i += 1) {
    const l = Math.round(clamp(b.l[i], -1, 0.999999) * 8388607);
    const r = Math.round(clamp(b.r[i], -1, 0.999999) * 8388607);
    out.writeIntLE(l, p, 3);
    out.writeIntLE(r, p + 3, 3);
    p += 6;
  }
  fs.writeFileSync(file, out);
}

function ensureSource(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing source: ${file}`);
  return file;
}

const ballroomDir = path.join(root, "samples", "staging", "online-liminal-ballroom");
const vocalDir = path.join(root, "samples", "staging", "occult-liminal-vocals");
const hauntingWaltz = readWav(ensureSource(path.join(ballroomDir, "05 That Haunting Waltz.wav")));
const seventeen = readWav(ensureSource(path.join(ballroomDir, "06 When You And I Were Seventeen w.wav")));
const nocturne = readWav(ensureSource(path.join(ballroomDir, "10 Nocturne .wav")));
const happyDays = readWav(ensureSource(path.join(vocalDir, "02HappyDaysAreHereAgain.wav")));
const jazzVampire = readWav(ensureSource(path.join(vocalDir, "03ImAJazzVampire.wav")));

// Motif returns as a recognizable memory, then loses timing, pitch, and contour.
const returns = [
  { time: 0, src: 3.5, length: 26, rate: 0.54, gain: 0.215, pan: -0.08, wow: 0.006 },
  { time: 24.7, src: 7.5, length: 23, rate: 0.505, gain: 0.15, pan: 0.12, wow: 0.011, sag: 0.015 },
  { time: 49.5, src: 3.5, length: 23.5, rate: 0.48, gain: 0.128, pan: -0.22, wow: 0.017, gate: { period: 1.36, duty: 0.68, floor: 0.23 } },
  { time: 76.2, src: 11.5, length: 27, rate: 0.42, gain: 0.116, pan: 0.18, wow: 0.02, reverse: true, sag: 0.02 },
  { time: 108.8, src: 4.4, length: 31, rate: 0.36, gain: 0.105, pan: -0.14, wow: 0.026, sag: 0.06, dropouts: 0.0007 },
  { time: 146.5, src: 15.1, length: 29, rate: 0.295, gain: 0.089, pan: 0.04, wow: 0.032, crush: 0.23, gate: { period: 1.08, duty: 0.43, floor: 0.08 } },
  { time: 183.5, src: 8.1, length: 25, rate: 0.24, gain: 0.071, pan: -0.2, wow: 0.036, reverse: true, sag: 0.08 }
];

for (const phrase of returns) addSample(stems.memory, hauntingWaltz, { ...phrase, fade: 3.4, attack: 2.5, release: 4.5 });

// A second memory peeks through like a neighbor's radio, never taking lead.
addSample(stems.memory, seventeen, { time: 36, src: 12, length: 18, rate: 0.39, gain: 0.052, pan: 0.36, wow: 0.02, fade: 4, attack: 4, release: 6 });
addSample(stems.memory, seventeen, { time: 126, src: 19, length: 34, rate: 0.27, gain: 0.046, pan: -0.45, wow: 0.03, reverse: true, fade: 6, attack: 7, release: 8 });

// Wallpaper voices are close and nonverbal: almost vowel, almost lullaby, never a sentence.
for (const event of [
  [38, 18, 147, 0.036, -0.74, 0, false],
  [55, 24, 196, 0.034, 0.66, 1, true],
  [82, 31, 122, 0.042, -0.37, 2, false],
  [118, 36, 98, 0.048, 0.45, 3, true],
  [154, 30, 165, 0.038, -0.61, 1, true],
  [184, 22, 86, 0.05, 0.23, 0, true]
]) {
  const [time, length, freq, gain, pan, shape, near] = event;
  addVowelGhost(stems.voices, { time, length, freq, gain, pan, shape, near, attack: 5, release: 7, sag: 0.055 });
}

addSample(stems.voices, happyDays, { time: 63, src: 25, length: 22, rate: 0.21, gain: 0.037, pan: 0.72, wow: 0.032, reverse: true, fade: 5, attack: 4, release: 6 });
addSample(stems.voices, jazzVampire, { time: 132, src: 17, length: 29, rate: 0.18, gain: 0.04, pan: -0.69, wow: 0.039, reverse: true, fade: 7, attack: 6, release: 8 });
addSample(stems.voices, happyDays, { time: 177, src: 42, length: 27, rate: 0.16, gain: 0.032, pan: 0.08, wow: 0.041, fade: 7, attack: 8, release: 7, sag: 0.07 });

// Hallway air and fluorescent ballast are tonal/room-based, not broadband static.
addNoise(stems.hallway, { time: 0, length: 216, gain: 0.024, lowpass: 0.0026, attack: 9, release: 12, breathe: 0.017, scarThreshold: 0.99997 });
for (const tone of [
  [0, 216, 59.94, 0.026],
  [14, 198, 119.88, 0.012],
  [31, 145, 89.3, 0.01],
  [76, 92, 177.2, 0.007],
  [168, 42, 242.8, 0.006]
]) {
  const [time, length, freq, gain] = tone;
  addTone(stems.hallway, { time, length, freq, gain, pan: 0, attack: 8, release: 8, tremolo: 0.035, type: "sine2" });
}

// Reverse-glass smears turn the old room into a choir of reflections.
for (let i = 0; i < 38; i += 1) {
  const time = 62 + i * 3.3 + (rand() - 0.5) * 1.7;
  const src = 9 + rand() * 32;
  const length = 5.2 + rand() * 9.5;
  const rate = 0.105 + rand() * 0.18;
  const pan = rand() * 1.8 - 0.9;
  const source = i % 3 === 0 ? nocturne : hauntingWaltz;
  addSample(stems.reverse, source, { time, src, length, rate, gain: 0.018 + rand() * 0.017, pan, reverse: rand() > 0.22, wow: 0.032, fade: 2.5, attack: 2.2, release: 3.8, crush: i > 24 ? 0.12 : 0 });
}

// The repeated signal is the album's "forbidden sound" for this track.
for (const event of [
  [29.2, 1826, 0.62, 0.018, -0.44],
  [58.9, 1804, 0.73, 0.02, 0.51],
  [87.4, 1841, 0.58, 0.021, -0.12],
  [116.8, 1768, 0.82, 0.022, 0.64],
  [151.6, 1737, 0.7, 0.02, -0.7],
  [181.9, 1873, 0.94, 0.024, 0.27],
  [204.2, 1654, 1.22, 0.018, -0.08]
]) {
  const [time, freq, length, gain, pan] = event;
  addSignalChirp(stems.signal, time, freq, length, gain, pan);
}

// Low pressure is centered; it disappears before the final return.
for (const event of [
  [21, 20, 41, 38, 0.035],
  [57, 31, 36, 31, 0.042],
  [102, 38, 32, 26, 0.054],
  [137, 27, 29, 23, 0.042],
  [188, 21, 24, 31, 0.081]
]) {
  const [time, length, freq, end, gain] = event;
  addTone(stems.pressure, { time, length, freq, freqEnd: end, gain, pan: 0, attack: 7, release: 9, tremolo: 0.061, type: "sine2" });
}

for (let t = 0; t < DURATION; t += 1 / SR) {
  if (t < 172 || t > 184) continue;
  const i = Math.floor(t * SR);
  const edge = Math.min(smoothstep((t - 172) / 3.2), smoothstep((184 - t) / 3.2));
  stems.pressure.l[i] *= 1 - edge * 0.94;
  stems.pressure.r[i] *= 1 - edge * 0.94;
}

// Sparse structural knocks: not drums, more like the building failing to remember where it is.
for (const event of [
  [17.2, 0.78, 69, 0.058, -0.2],
  [34.9, 1.1, 54, 0.071, 0.18],
  [53.1, 0.86, 81, 0.049, -0.43],
  [71.6, 1.32, 47, 0.078, 0.38],
  [93.4, 1.1, 42, 0.087, 0.09],
  [113.8, 1.44, 38, 0.082, -0.31],
  [134.7, 1.24, 58, 0.061, 0.52],
  [157.5, 1.36, 34, 0.086, -0.14],
  [186.1, 1.7, 31, 0.11, 0.02],
  [199.6, 1.02, 72, 0.056, -0.53]
]) {
  const [time, length, freq, gain, pan] = event;
  addImpact(stems.knocks, { time, length, freq, gain, pan });
}

// Tape cuts are source scars and tiny losses, not an artificial hiss bed.
for (const event of [
  [30.4, 0.42, 0.026, -0.2],
  [66.2, 0.28, 0.031, 0.47],
  [95.8, 0.36, 0.029, -0.58],
  [122.1, 0.51, 0.034, 0.2],
  [149.4, 0.64, 0.033, -0.32],
  [171.6, 0.78, 0.026, 0.66],
  [190.8, 0.46, 0.038, -0.1],
  [209.7, 0.58, 0.03, 0.12]
]) {
  const [time, length, gain, pan] = event;
  addNoise(stems.tape, { time, length, gain, lowpass: 0.038, attack: 0.02, release: 0.09, scarThreshold: 0.997, scar: 0.19, pan });
}

filterBus(stems.memory, 48, 5200);
filterBus(stems.voices, 140, 4500);
filterBus(stems.hallway, 35, 1300);
filterBus(stems.reverse, 110, 3800);
filterBus(stems.pressure, 18, 190);
filterBus(stems.knocks, 24, 1800);
filterBus(stems.tape, 220, 6000);
filterBus(stems.signal, 900, 3600);

roomShift(stems.memory, 0.82);
roomShift(stems.voices, 0.96);
roomShift(stems.hallway, 0.45);
roomShift(stems.reverse, 1.08);
roomShift(stems.signal, 0.32);

stereoDrift(stems.memory, 0.2);
stereoDrift(stems.voices, 0.82);
stereoDrift(stems.hallway, 0.34);
stereoDrift(stems.reverse, 0.9);
stereoDrift(stems.signal, 0.62);

asymDelay(stems.memory, 0.013, 0.021, 0.09);
asymDelay(stems.voices, 0.007, 0.027, 0.16);
asymDelay(stems.hallway, 0.041, 0.067, 0.045);
asymDelay(stems.reverse, 0.019, 0.043, 0.2);
asymDelay(stems.signal, 0.011, 0.029, 0.1);

sideHalo(stems.memory, 0.046, 0.12);
sideHalo(stems.voices, 0.019, 0.26);
sideHalo(stems.hallway, 0.084, 0.07);
sideHalo(stems.reverse, 0.063, 0.32);
sideHalo(stems.signal, 0.031, 0.18);

saturateBus(stems.memory, 1.35);
saturateBus(stems.voices, 1.42);
saturateBus(stems.hallway, 1.1);
saturateBus(stems.reverse, 1.48);
saturateBus(stems.knocks, 1.25);

const allStems = Object.values(stems);
let master = sumBuses(allStems);
const pre = peakRms(master);
const masterGain = 0.82 / Math.max(pre.peak, 0.001);
for (const b of allStems) scaleBus(b, masterGain);
master = sumBuses(allStems);
filterBus(master, 18, 15500);
saturateBus(master, 1.07);
const post = peakRms(master);
const limiterGain = post.peak > 0.84 ? 0.84 / post.peak : 1;
if (limiterGain < 1) {
  for (const b of allStems) scaleBus(b, limiterGain);
  master = sumBuses(allStems);
}
const finalStats = peakRms(master);

for (const b of allStems) writeWav24(path.join(stemDir, `${b.name}.wav`), b);
writeWav24(outWav, master);
fs.copyFileSync(outWav, stagingWav);

const mp3 = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outWav, "-codec:a", "libmp3lame", "-b:a", "320k", outMp3], { stdio: "inherit" });
if (mp3.status !== 0) throw new Error("ffmpeg MP3 encode failed");

fs.writeFileSync(outAttr, [
  `${title}`,
  "",
  "Original album track rendered offline by the Ableton MCP project.",
  "No Ableton UI/mouse control, LiveAPI writes, plugin installs, arbitrary URL fetches, or ripping were used.",
  "",
  "Local source material:",
  "- samples/staging/online-liminal-ballroom/05 That Haunting Waltz.wav",
  "- samples/staging/online-liminal-ballroom/06 When You And I Were Seventeen w.wav",
  "- samples/staging/online-liminal-ballroom/10 Nocturne .wav",
  "- samples/staging/occult-liminal-vocals/02HappyDaysAreHereAgain.wav",
  "- samples/staging/occult-liminal-vocals/03ImAJazzVampire.wav",
  "",
  "Design notes:",
  "- New song, not a revision of the previous masters.",
  "- Slow liminal horror waltz memory with close nonverbal wallpaper voices.",
  "- Repeating baby-monitor/fluorescent signal appears seven times with variation.",
  "- Low end is centered; room reflections and voices drift wide.",
  "- Tape cuts are short source-tied scars, not a static bed.",
  ""
].join("\n"));

console.log(JSON.stringify({
  ok: true,
  title,
  slug,
  durationSeconds: DURATION,
  sampleRate: SR,
  bitDepth: 24,
  masterWav: outWav,
  masterMp3: outMp3,
  stagingMaster: stagingWav,
  attribution: outAttr,
  stems: allStems.map((b) => ({ name: b.name, path: path.join(stemDir, `${b.name}.wav`), ...peakRms(b) })),
  master: finalStats
}, null, 2));
