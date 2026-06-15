/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const slug = "mall-at-the-end-of-sleep";
const title = "Mall at the End of Sleep";
const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const DURATION = 216;
const N = DURATION * SR;
let seed = 0x8051e3d;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const outReport = path.join(downloads, `${slug}-verification.json`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);
const stagingReport = path.join(renderRoot, `${slug}-verification.json`);
const sourceDir = path.join(renderRoot, "sources");
const sourceManifestPath = path.join(sourceDir, "sources-manifest.json");

const stems = {
  chords: bus("closed-mall-vapor-chords"),
  motif: bus("glassy-dream-memory-motif"),
  choir: bus("synthetic-choir-vowel-fog"),
  hvac: bus("mall-hvac-fluorescent-air"),
  pa: bus("distant-pa-and-cassette-drift"),
  sub: bus("mono-sub-pressure"),
  metal: bus("dead-escalator-metal"),
  atrium: bus("impossible-atrium-reverb")
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

function midiToFreq(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function addTone(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  let phase = opt.phase ?? 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const t = i / SR;
    const wobble = 1
      + Math.sin((opt.time + t) * (opt.wowRate ?? 0.27)) * (opt.wow ?? 0)
      + Math.sin((opt.time + t) * (opt.flutterRate ?? 3.7)) * (opt.flutter ?? 0);
    const freq = (opt.freq + ((opt.freqEnd ?? opt.freq) - opt.freq) * p) * wobble;
    phase += 2 * Math.PI * freq / SR;
    let v = Math.sin(phase);
    if (opt.type === "tri") v = Math.asin(Math.sin(phase)) * 2 / Math.PI;
    if (opt.type === "softsquare") v = Math.tanh(Math.sin(phase) * 2.5);
    if (opt.type === "epiano") {
      v = Math.sin(phase) * 0.54
        + Math.sin(phase * 2.01 + 0.8) * 0.21
        + Math.sin(phase * 3.98 + 1.4) * 0.095
        + Math.sin(phase * 6.02 + 0.25) * 0.036;
      v = Math.tanh(v * 1.35);
    }
    if (opt.type === "bell") {
      v = Math.sin(phase) * 0.52
        + Math.sin(phase * 2.02 + 0.2) * 0.24
        + Math.sin(phase * 3.11 + 1.7) * 0.14
        + Math.sin(phase * 5.87 + 0.4) * 0.08;
    }
    const trem = opt.tremolo ? 0.72 + 0.28 * Math.sin(2 * Math.PI * opt.tremolo * t + 0.7) : 1;
    const env = smoothstep(i / ((opt.attack ?? 0.8) * SR)) * smoothstep((len - i) / ((opt.release ?? 1.8) * SR));
    b.l[di] += v * (opt.gain ?? 0.04) * env * trem * pl;
    b.r[di] += v * (opt.gain ?? 0.04) * env * trem * pr;
  }
}

function addNoise(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  let lowL = 0;
  let lowR = 0;
  let slow = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    lowL += ((rand() * 2 - 1) - lowL) * (opt.lowpass ?? 0.002);
    lowR += ((rand() * 2 - 1) - lowR) * (opt.lowpass ?? 0.002);
    slow += ((rand() * 2 - 1) - slow) * (opt.slowpass ?? 0.00012);
    const env = smoothstep(i / ((opt.attack ?? 5) * SR)) * smoothstep((len - i) / ((opt.release ?? 5) * SR));
    const breathe = 0.78 + 0.22 * Math.sin(2 * Math.PI * (opt.breathe ?? 0.011) * t + 1.3);
    const scar = rand() > (opt.scarThreshold ?? 0.999985) ? (rand() * 2 - 1) * (opt.scar ?? 0.05) : 0;
    const shimmer = opt.shimmer ? Math.sin(2 * Math.PI * (opt.shimmer + Math.sin(t * 0.07) * 0.2) * t) * 0.08 : 0;
    const vL = lowL + slow * 0.54 + scar + shimmer;
    const vR = lowR + slow * 0.47 + scar * 0.42 - shimmer * 0.65;
    b.l[di] += vL * (opt.gain ?? 0.03) * env * breathe * pl;
    b.r[di] += vR * (opt.gain ?? 0.03) * env * breathe * pr;
  }
}

function readWav(file) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(sourceDir))) {
    throw new Error(`Refusing to read source outside Mall project source folder: ${file}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing Mall source ${file}. Run: npm run stage:mall-at-the-end-of-sleep:sources`);
  }
  const b = fs.readFileSync(resolved);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Not a WAV source: ${file}`);
  }
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
  if (!fmt || !data || ![1, 3].includes(fmt.format)) throw new Error(`Unsupported WAV source: ${file}`);
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
      else throw new Error(`Unsupported WAV bit depth ${fmt.bits}: ${file}`);
      values.push(v);
    }
    l[i] = values[0] ?? 0;
    r[i] = values[1] ?? values[0] ?? 0;
  }
  return resample({ file: resolved, sampleRate: fmt.sampleRate, length: frames, l, r });
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

function sampleAt(src, channel, position, loop) {
  let p = position;
  if (loop) {
    p = ((p % src.length) + src.length) % src.length;
  }
  if (p < 0 || p >= src.length - 2) return 0;
  const i = Math.floor(p);
  const f = p - i;
  const data = channel === 0 ? src.l : src.r;
  return data[i] * (1 - f) + data[i + 1] * f;
}

function addSample(b, src, opt) {
  const start = Math.floor((opt.time ?? 0) * SR);
  const len = Math.floor((opt.length ?? 6) * SR);
  const sourceStart = (opt.src ?? 0) * SR;
  const [pl, pr] = panGains(opt.pan ?? 0);
  const fade = Math.min(Math.floor((opt.fade ?? 0.6) * SR), Math.floor(len / 2));
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    const wobble = 1
      + Math.sin((opt.time + t) * (opt.wowRate ?? 0.041)) * (opt.wow ?? 0)
      + Math.sin((opt.time + t) * (opt.flutterRate ?? 2.8)) * (opt.flutter ?? 0);
    const sag = opt.sag ? 1 - opt.sag * p : 1;
    const rate = (opt.rate ?? 1) * wobble * sag;
    const local = opt.reverse ? (len - i - 1) * rate : i * rate;
    let l = sampleAt(src, 0, sourceStart + local, opt.loop);
    let r = sampleAt(src, 1, sourceStart + local, opt.loop);
    if (opt.crush) {
      const steps = 1 << Math.max(4, Math.floor(14 - opt.crush * 7));
      l = Math.round(l * steps) / steps;
      r = Math.round(r * steps) / steps;
    }
    let env = 1;
    if (fade > 0) env *= Math.min(1, i / fade, (len - i) / fade);
    if (opt.attack) env *= smoothstep(i / (opt.attack * SR));
    if (opt.release) env *= smoothstep((len - i) / (opt.release * SR));
    if (opt.dropouts && rand() < opt.dropouts) env *= 0.05;
    const motion = 0.82 + 0.18 * Math.sin(2 * Math.PI * (opt.motion ?? 0.017) * t + 0.4);
    b.l[di] += l * (opt.gain ?? 0.1) * env * motion * pl;
    b.r[di] += r * (opt.gain ?? 0.1) * env * motion * pr;
  }
}

function addVowelFog(opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  const formants = [
    [420, 960, 2350],
    [520, 1180, 2600],
    [610, 1380, 2920],
    [730, 1560, 3180]
  ][opt.shape % 4];
  let breathL = 0;
  let breathR = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    breathL += ((rand() * 2 - 1) - breathL) * 0.011;
    breathR += ((rand() * 2 - 1) - breathR) * 0.009;
    const sag = 1 - p * (opt.sag ?? 0.035);
    let throat = 0;
    for (let h = 1; h <= 9; h += 1) {
      throat += Math.sin(2 * Math.PI * opt.freq * h * sag * t + h * 0.41) / (h * 1.7);
    }
    let mouth = 0;
    for (let f = 0; f < formants.length; f += 1) {
      mouth += Math.sin(2 * Math.PI * formants[f] * (1 + Math.sin(t * 0.21 + f) * 0.002) * t) * [0.032, 0.019, 0.01][f];
    }
    const env = smoothstep(i / ((opt.attack ?? 6) * SR)) * smoothstep((len - i) / ((opt.release ?? 8) * SR));
    const phrase = 0.7 + 0.3 * Math.sin(2 * Math.PI * (0.07 + opt.shape * 0.011) * t + 0.9);
    const tooClose = opt.near ? 1.18 + 0.12 * Math.sin(t * 3.1) : 1;
    stems.choir.l[di] += (throat * 0.28 + mouth + breathL * 0.1) * opt.gain * env * phrase * tooClose * pl;
    stems.choir.r[di] += (throat * 0.25 + mouth * 1.07 - breathR * 0.08) * opt.gain * env * phrase * tooClose * pr;
  }
}

function addChord(time, length, notes, gain, corruption, panBase) {
  notes.forEach((note, index) => {
    const spread = (index - (notes.length - 1) / 2) * 0.11;
    const freq = midiToFreq(note) * (1 - corruption * 0.012) * (1 + (rand() - 0.5) * corruption * 0.006);
    addTone(stems.chords, {
      time: time + index * 0.08 + corruption * 0.21,
      length,
      freq,
      freqEnd: freq * (1 - corruption * 0.018),
      gain: gain * (index === 0 ? 0.9 : 1),
      pan: panBase + spread,
      type: "epiano",
      attack: 2.8 + corruption * 1.7,
      release: 5.5 + corruption * 2.8,
      wow: 0.0018 + corruption * 0.006,
      flutter: 0.00018 + corruption * 0.0009,
      tremolo: 0.038 + corruption * 0.022
    });
  });
}

function addMotifReturn(time, gain, corruption, pan) {
  const motif = [61, 64, 68, 66, 59, 56];
  const offsets = [0, 1.18, 2.08, 3.42, 4.2, 5.62];
  for (let i = 0; i < motif.length; i += 1) {
    if (corruption > 0.36 && ((i === 2 && rand() > 0.18) || (i === 4 && rand() > 0.45))) continue;
    if (corruption > 0.72 && i === 1 && rand() > 0.42) continue;
    const wrong = corruption > 0.44 && i === 3 ? -1 : 0;
    const late = corruption * (i % 2 ? 0.34 : -0.07);
    const reverseFeel = corruption > 0.62 ? (motif.length - i) * 0.08 : 0;
    const freq = midiToFreq(motif[i] + wrong) * (1 - corruption * 0.045) * (1 + (rand() - 0.5) * corruption * 0.018);
    addTone(stems.motif, {
      time: time + offsets[i] * (1 + corruption * 0.12) + late + reverseFeel,
      length: 5.8 + corruption * 2.5,
      freq,
      freqEnd: freq * (1 - corruption * 0.032),
      gain: gain * (1 - i * 0.04),
      pan: pan + ((i % 3) - 1) * 0.09,
      type: "bell",
      attack: corruption > 0.62 ? 0.22 : 0.018,
      release: 4.8 + corruption * 2.4,
      wow: 0.002 + corruption * 0.007,
      flutter: 0.00025 + corruption * 0.0012,
      tremolo: corruption > 0.55 ? 0.41 : 0
    });
  }
}

function addMetalEvent(time, length, freq, gain, pan) {
  const start = Math.floor(time * SR);
  const len = Math.floor(length * SR);
  const [pl, pr] = panGains(pan);
  let scrape = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    scrape += ((rand() * 2 - 1) - scrape) * 0.024;
    const body = Math.sin(2 * Math.PI * freq * (1 - p * 0.42) * t) * Math.exp(-p * 7.8);
    const cable = Math.sin(2 * Math.PI * (freq * 0.41 + 6.8) * t + 0.5) * Math.exp(-p * 2.8);
    const rail = Math.sin(2 * Math.PI * (freq * 3.17) * t) * Math.exp(-p * 14);
    const env = smoothstep(i / (0.012 * SR)) * smoothstep((len - i) / (0.24 * SR));
    const v = (body + cable * 0.38 + rail * 0.1 + scrape * 0.08) * gain * env;
    stems.metal.l[di] += v * pl;
    stems.metal.r[di] += v * pr;
  }
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
  const denom = Math.tanh(drive);
  for (let i = 0; i < N; i += 1) {
    b.l[i] = Math.tanh(b.l[i] * drive) / denom;
    b.r[i] = Math.tanh(b.r[i] * drive) / denom;
  }
}

function impossibleAtrium(b, amount) {
  const rooms = [
    { start: 0, end: 36, taps: [0.033, 0.078, 0.14, 0.28], wet: 0.05, width: 0.28 },
    { start: 36, end: 84, taps: [0.18, 0.46, 0.92, 1.74], wet: 0.072, width: 0.86 },
    { start: 84, end: 132, taps: [0.3, 0.78, 1.66, 3.1, 5.2], wet: 0.067, width: 1.14 },
    { start: 132, end: 180, taps: [0.052, 0.19, 0.51, 0.95, 1.48], wet: 0.058, width: 0.44 },
    { start: 180, end: 216, taps: [0.42, 1.08, 2.32, 4.9, 7.4], wet: 0.055, width: 1.24 }
  ];
  for (const room of rooms) {
    const s = Math.floor(room.start * SR);
    const e = Math.min(N, Math.floor(room.end * SR));
    for (const tap of room.taps) {
      const d = Math.floor(tap * SR);
      for (let i = Math.max(s + d, d); i < e; i += 1) {
        const t = i / SR;
        const morph = 0.54 + 0.46 * Math.sin(t * 0.011 + tap * 2.8);
        const wet = room.wet * amount * morph;
        const left = b.l[i - d];
        const right = b.r[i - d];
        b.l[i] += (right * room.width + left * (1 - room.width) * 0.18) * wet;
        b.r[i] += (left * room.width + right * (1 - room.width) * 0.18) * wet;
      }
    }
  }
}

function stereoDrift(b, depth) {
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const mid = (b.l[i] + b.r[i]) * 0.5;
    const side = (b.l[i] - b.r[i]) * 0.5;
    const width = 0.72 + depth * (0.52 + 0.48 * Math.sin(t * 0.018 + Math.sin(t * 0.004) * 2.3));
    const lean = Math.sin(t * 0.019 + Math.sin(t * 0.006) * 1.3) * depth * 0.07;
    b.l[i] = mid * (1 - lean) + side * width;
    b.r[i] = mid * (1 + lean) - side * width;
  }
}

function sideHalo(b, seconds, wet) {
  const d = Math.max(1, Math.floor(seconds * SR));
  for (let i = N - 1; i >= d; i -= 1) {
    const t = i / SR;
    const halo = (b.l[i - d] + b.r[i - d]) * 0.5 * wet * (0.67 + 0.33 * Math.sin(t * 0.023 + seconds * 23));
    b.l[i] += halo;
    b.r[i] -= halo * 0.84;
  }
}

function crossDelay(b, leftSeconds, rightSeconds, wet) {
  const dl = Math.max(1, Math.floor(leftSeconds * SR));
  const dr = Math.max(1, Math.floor(rightSeconds * SR));
  for (let i = N - 1; i >= Math.max(dl, dr); i -= 1) {
    b.l[i] += b.r[i - dl] * wet;
    b.r[i] += b.l[i - dr] * wet;
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

function metrics(b) {
  let peak = 0;
  let sum = 0;
  let monoPeak = 0;
  let lr = 0;
  let ll = 0;
  let rr = 0;
  let midSum = 0;
  let sideSum = 0;
  for (let i = 0; i < N; i += 1) {
    const l = b.l[i];
    const r = b.r[i];
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    monoPeak = Math.max(monoPeak, Math.abs(mid));
    sum += l * l + r * r;
    lr += l * r;
    ll += l * l;
    rr += r * r;
    midSum += mid * mid;
    sideSum += side * side;
  }
  return {
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(sum / (N * 2)).toFixed(4)),
    monoPeak: Number(monoPeak.toFixed(4)),
    correlation: Number((lr / Math.sqrt(Math.max(ll * rr, 1e-12))).toFixed(4)),
    midSideRatio: Number((Math.sqrt(sideSum / Math.max(midSum, 1e-12))).toFixed(4))
  };
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

function ffprobe(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_name,sample_rate,channels,bits_per_sample",
    "-of", "json",
    file
  ], { encoding: "utf8" });
  return {
    command: `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${file}`,
    status: result.status,
    json: result.stdout ? JSON.parse(result.stdout) : null,
    stderr: result.stderr
  };
}

function ebur128(file) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", file,
    "-filter_complex", "ebur128=peak=true",
    "-f", "null",
    "-"
  ], { encoding: "utf8" });
  return {
    command: `ffmpeg -hide_banner -nostats -i ${file} -filter_complex ebur128=peak=true -f null -`,
    status: result.status,
    stderrTail: (result.stderr || "").split(/\r?\n/).slice(-24).join("\n")
  };
}

if (!fs.existsSync(sourceManifestPath)) {
  throw new Error(`Missing Mall source manifest. Run: npm run stage:mall-at-the-end-of-sleep:sources`);
}

const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
if (sourceManifest.sourcePolicy !== "fixed_allowlisted_public_domain_internet_archive_sources_only") {
  throw new Error(`Unexpected Mall source policy: ${sourceManifest.sourcePolicy}`);
}

function loadSource(file) {
  return readWav(path.join(sourceDir, file));
}

const sourceAudio = {
  departmentStore: loadSource("department-store-ambience.wav"),
  crowdedStore: loadSource("crowded-store-walla.wav"),
  checkout: loadSource("supermarket-checkout.wav"),
  electricSign: loadSource("electric-sign-letter-flips.wav"),
  freightElevator: loadSource("freight-elevator-interior.wav"),
  elevatorRoom: loadSource("elevator-switching-room.wav"),
  storeBell: loadSource("store-door-bell.wav"),
  humidifier: loadSource("humidifier-run.wav")
};

const chordProgressionA = [
  [49, 52, 56, 59, 63],
  [45, 52, 56, 61, 66],
  [44, 51, 56, 59, 63],
  [47, 54, 59, 61, 66]
];
const chordProgressionB = [
  [49, 52, 56, 62],
  [45, 52, 56, 61],
  [42, 49, 52, 56, 61],
  [44, 51, 55, 60, 64]
];

for (let bar = 0; bar < 12; bar += 1) {
  const t = bar * 18;
  const section = Math.floor(t / 36);
  const corruption = clamp((t - 42) / 160, 0, 1);
  const progression = section < 3 ? chordProgressionA : chordProgressionB;
  for (let step = 0; step < 4; step += 1) {
    const notes = progression[(bar + step) % progression.length];
    const gain = 0.028 - corruption * 0.005 + (section === 0 ? 0.006 : 0);
    addChord(t + step * 4.5, 10.8 + corruption * 2.4, notes, gain, corruption, step % 2 ? 0.08 : -0.08);
  }
}

for (const event of [
  [8, 0.061, 0.0],
  [32.5, 0.055, -0.22],
  [61, 0.05, 0.18],
  [86.5, 0.052, -0.1],
  [116, 0.045, 0.23],
  [151.5, 0.039, -0.18],
  [190, 0.031, 0.04]
]) {
  const [time, gain, pan] = event;
  addMotifReturn(time, gain, clamp((time - 18) / 162, 0, 1), pan);
}

addNoise(stems.hvac, { time: 0, length: DURATION, gain: 0.026, lowpass: 0.0011, slowpass: 0.00007, attack: 9, release: 12, breathe: 0.008, scarThreshold: 0.999995, pan: -0.08, shimmer: 59.94 });
for (const tone of [
  [0, DURATION, 59.94, 0.012, 0],
  [16, 184, 119.88, 0.006, -0.18],
  [38, 126, 179.82, 0.0042, 0.21],
  [92, 86, 244.6, 0.0038, -0.28]
]) {
  const [time, length, freq, gain, pan] = tone;
  addTone(stems.hvac, { time, length, freq, freqEnd: freq * 0.994, gain, pan, type: "softsquare", attack: 10, release: 12, tremolo: 0.018, wow: 0.0015 });
}

for (const event of [
  [22, 34, 36, 31, 0.027],
  [62, 42, 33, 28, 0.034],
  [109, 39, 29, 24, 0.043],
  [147, 29, 27, 22, 0.038],
  [198, 15, 24, 31, 0.079]
]) {
  const [time, length, freq, end, gain] = event;
  addTone(stems.sub, { time, length, freq, freqEnd: end, gain, pan: 0, type: "softsquare", attack: 8, release: 8, tremolo: 0.042, wow: 0.0008 });
}
for (let t = 184; t < 196; t += 1 / SR) {
  const i = Math.floor(t * SR);
  const edge = Math.min(smoothstep((t - 184) / 2.6), smoothstep((196 - t) / 2.6));
  stems.sub.l[i] *= 1 - edge * 0.98;
  stems.sub.r[i] *= 1 - edge * 0.98;
}

for (const event of [
  [18, 21, 164.8, 0.018, -0.38, 0, false],
  [46, 26, 196.0, 0.022, 0.52, 1, false],
  [83, 33, 146.8, 0.029, -0.24, 2, true],
  [119, 42, 123.5, 0.034, 0.39, 3, true],
  [158, 34, 110.0, 0.031, -0.58, 1, true],
  [193, 21, 98.0, 0.041, 0.18, 0, true]
]) {
  const [time, length, freq, gain, pan, shape, near] = event;
  addVowelFog({ time, length, freq, gain, pan, shape, near, sag: 0.04 + clamp((time - 40) / 180, 0, 1) * 0.045 });
}

for (const event of [
  [31.2, 987, 1.6, 0.013, -0.44],
  [56.8, 1044, 1.2, 0.012, 0.46],
  [74.4, 784, 2.1, 0.01, -0.18],
  [101.7, 1318, 0.9, 0.014, 0.58],
  [128.6, 932, 1.4, 0.011, -0.62],
  [166.2, 1481, 1.1, 0.016, 0.28],
  [202.4, 692, 2.6, 0.011, -0.08]
]) {
  const [time, freq, length, gain, pan] = event;
  addTone(stems.pa, { time, length, freq, freqEnd: freq * 0.986, gain, pan, type: "bell", attack: 0.02, release: 1.1, wow: 0.006, flutter: 0.001 });
}
for (const event of [
  [41.8, 0.23, 0.017, -0.3],
  [71.4, 0.31, 0.019, 0.41],
  [103.6, 0.4, 0.021, -0.58],
  [137.9, 0.52, 0.021, 0.17],
  [172.5, 0.66, 0.022, -0.24],
  [195.7, 0.82, 0.018, 0.62]
]) {
  const [time, length, gain, pan] = event;
  addNoise(stems.pa, { time, length, gain, lowpass: 0.028, slowpass: 0.0009, attack: 0.012, release: 0.08, scarThreshold: 0.997, scar: 0.12, pan });
}

for (const event of [
  [25.7, 1.0, 57, 0.047, -0.27],
  [44.9, 1.3, 48, 0.058, 0.34],
  [67.8, 0.9, 75, 0.043, -0.5],
  [89.6, 1.5, 41, 0.066, 0.29],
  [114.4, 1.2, 36, 0.074, -0.09],
  [142.2, 1.6, 31, 0.081, 0.49],
  [169.5, 1.4, 44, 0.067, -0.33],
  [199.2, 1.9, 28, 0.102, 0.03]
]) {
  const [time, length, freq, gain, pan] = event;
  addMetalEvent(time, length, freq, gain, pan);
}

for (let i = 0; i < 34; i += 1) {
  const time = 52 + i * 4.15 + (rand() - 0.5) * 1.5;
  const note = [61, 64, 68, 73, 76, 80][i % 6] - Math.floor(i / 11) * 2;
  addTone(stems.atrium, {
    time,
    length: 7.5 + rand() * 8,
    freq: midiToFreq(note) * (0.5 + rand() * 0.15),
    freqEnd: midiToFreq(note) * (0.47 + rand() * 0.13),
    gain: 0.006 + rand() * 0.006,
    pan: rand() * 1.8 - 0.9,
    type: i % 3 === 0 ? "epiano" : "tri",
    attack: 2.8,
    release: 5.5,
    wow: 0.009,
    flutter: 0.0012,
    tremolo: 0.033
  });
}

for (const event of [
  [0, 42, 0, 0.78, 0.046, -0.08, false],
  [35, 50, 11, 0.62, 0.052, 0.15, false],
  [76, 46, 19, 0.51, 0.044, -0.22, false],
  [118, 55, 6, 0.39, 0.041, 0.26, true],
  [166, 43, 14, 0.31, 0.032, -0.04, true]
]) {
  const [time, length, src, rate, gain, pan, reverse] = event;
  addSample(stems.atrium, sourceAudio.departmentStore, {
    time,
    length,
    src,
    rate,
    gain,
    pan,
    reverse,
    loop: true,
    fade: 5,
    attack: time === 0 ? 8 : 3,
    release: 8,
    wow: 0.018,
    flutter: 0.001,
    sag: reverse ? 0.06 : 0.018,
    dropouts: time > 100 ? 0.00035 : 0
  });
}

for (const event of [
  [28, 24, 2, 0.45, 0.028, -0.54, false],
  [64, 29, 9, 0.38, 0.034, 0.48, false],
  [100, 37, 4, 0.31, 0.038, -0.18, true],
  [137, 35, 13, 0.27, 0.04, 0.57, true],
  [178, 27, 6, 0.22, 0.031, -0.36, true]
]) {
  const [time, length, src, rate, gain, pan, reverse] = event;
  addSample(stems.choir, sourceAudio.crowdedStore, {
    time,
    length,
    src,
    rate,
    gain,
    pan,
    reverse,
    loop: true,
    fade: 4,
    attack: 5,
    release: 8,
    wow: 0.026,
    flutter: 0.0015,
    sag: 0.04,
    crush: time > 130 ? 0.14 : 0.05,
    dropouts: 0.00028,
    motion: 0.011
  });
}

for (const event of [
  [15, 18, 0, 0.8, 0.028, 0.22],
  [48, 21, 3.1, 0.62, 0.031, -0.34],
  [82, 19, 6.2, 0.5, 0.027, 0.41],
  [121, 26, 2.5, 0.36, 0.025, -0.18],
  [158, 18, 8.3, 0.28, 0.022, 0.36]
]) {
  const [time, length, src, rate, gain, pan] = event;
  addSample(stems.pa, sourceAudio.checkout, {
    time,
    length,
    src,
    rate,
    gain,
    pan,
    loop: true,
    fade: 1.2,
    attack: 1,
    release: 3,
    wow: 0.021,
    flutter: 0.002,
    crush: 0.11,
    dropouts: 0.00045,
    motion: 0.023
  });
}

for (const event of [
  [34.2, 2.1, 0.018, -0.42],
  [69.4, 1.7, 0.018, 0.46],
  [102.8, 2.5, 0.02, -0.1],
  [139.2, 3.1, 0.022, 0.58],
  [172.9, 2.2, 0.02, -0.64],
  [203.5, 3.8, 0.017, 0.19]
]) {
  const [time, length, gain, pan] = event;
  addSample(stems.pa, sourceAudio.electricSign, {
    time,
    length,
    src: 0,
    rate: 0.72,
    gain,
    pan,
    reverse: time > 120,
    loop: true,
    fade: 0.2,
    attack: 0.08,
    release: 0.5,
    wow: 0.012,
    flutter: 0.0025,
    crush: 0.18,
    dropouts: 0.001
  });
}

for (const event of [
  [23.5, 1.8, 0.028, -0.12, false],
  [58.2, 2.6, 0.025, 0.31, false],
  [93.7, 3.2, 0.023, -0.48, true],
  [132.6, 4.1, 0.02, 0.52, true],
  [188.8, 5.4, 0.018, -0.08, true]
]) {
  const [time, length, gain, pan, reverse] = event;
  addSample(stems.motif, sourceAudio.storeBell, {
    time,
    length,
    src: 0.12,
    rate: reverse ? 0.38 : 0.64,
    gain,
    pan,
    reverse,
    loop: true,
    fade: 0.18,
    attack: reverse ? 0.7 : 0.03,
    release: 2.4,
    wow: 0.024,
    flutter: 0.0014,
    sag: reverse ? 0.08 : 0.02
  });
}

for (const event of [
  [44, 21, 1.5, 0.53, 0.037, -0.2, false],
  [87, 30, 3.4, 0.41, 0.042, 0.31, false],
  [126, 34, 0, 0.33, 0.044, -0.42, true],
  [161, 25, 4.2, 0.27, 0.039, 0.44, true]
]) {
  const [time, length, src, rate, gain, pan, reverse] = event;
  addSample(stems.metal, sourceAudio.freightElevator, {
    time,
    length,
    src,
    rate,
    gain,
    pan,
    reverse,
    loop: true,
    fade: 3,
    attack: 4,
    release: 5,
    wow: 0.024,
    flutter: 0.0011,
    sag: 0.05,
    crush: time > 120 ? 0.13 : 0.04,
    dropouts: 0.00018
  });
}

for (const event of [
  [0, 216, 0, 0.61, 0.036, 0.0],
  [72, 92, 6, 0.43, 0.026, -0.2],
  [142, 61, 2.5, 0.34, 0.024, 0.22]
]) {
  const [time, length, src, rate, gain, pan] = event;
  addSample(stems.hvac, sourceAudio.humidifier, {
    time,
    length,
    src,
    rate,
    gain,
    pan,
    loop: true,
    fade: 6,
    attack: 9,
    release: 9,
    wow: 0.014,
    flutter: 0.0008,
    sag: 0.025,
    dropouts: 0.00012,
    motion: 0.006
  });
}

for (const event of [
  [54, 42, 1.4, 0.45, 0.025, -0.28, false],
  [109, 48, 3.2, 0.36, 0.031, 0.32, true],
  [154, 50, 0.4, 0.28, 0.034, -0.12, true]
]) {
  const [time, length, src, rate, gain, pan, reverse] = event;
  addSample(stems.hvac, sourceAudio.elevatorRoom, {
    time,
    length,
    src,
    rate,
    gain,
    pan,
    reverse,
    loop: true,
    fade: 5,
    attack: 7,
    release: 8,
    wow: 0.021,
    flutter: 0.001,
    sag: 0.06,
    crush: 0.07,
    dropouts: 0.0002
  });
}

filterBus(stems.chords, 48, 5200);
filterBus(stems.motif, 95, 6800);
filterBus(stems.choir, 135, 4300);
filterBus(stems.hvac, 24, 1500);
filterBus(stems.pa, 180, 6200);
filterBus(stems.sub, 18, 170);
filterBus(stems.metal, 26, 2100);
filterBus(stems.atrium, 90, 4200);

impossibleAtrium(stems.chords, 0.64);
impossibleAtrium(stems.motif, 0.92);
impossibleAtrium(stems.choir, 1.08);
impossibleAtrium(stems.hvac, 0.42);
impossibleAtrium(stems.pa, 0.76);
impossibleAtrium(stems.metal, 0.36);
impossibleAtrium(stems.atrium, 1.28);

stereoDrift(stems.chords, 0.22);
stereoDrift(stems.motif, 0.54);
stereoDrift(stems.choir, 0.86);
stereoDrift(stems.hvac, 0.32);
stereoDrift(stems.pa, 0.72);
stereoDrift(stems.metal, 0.2);
stereoDrift(stems.atrium, 0.94);

crossDelay(stems.chords, 0.018, 0.029, 0.07);
crossDelay(stems.motif, 0.011, 0.037, 0.16);
crossDelay(stems.choir, 0.006, 0.027, 0.18);
crossDelay(stems.hvac, 0.048, 0.072, 0.04);
crossDelay(stems.pa, 0.021, 0.043, 0.12);
crossDelay(stems.atrium, 0.033, 0.081, 0.22);

sideHalo(stems.motif, 0.038, 0.18);
sideHalo(stems.choir, 0.021, 0.28);
sideHalo(stems.pa, 0.055, 0.16);
sideHalo(stems.atrium, 0.072, 0.34);

saturateBus(stems.chords, 1.23);
saturateBus(stems.motif, 1.18);
saturateBus(stems.choir, 1.36);
saturateBus(stems.hvac, 1.06);
saturateBus(stems.pa, 1.14);
saturateBus(stems.metal, 1.24);
saturateBus(stems.atrium, 1.42);

const allStems = Object.values(stems);
let master = sumBuses(allStems);
const pre = metrics(master);
const masterGain = 0.78 / Math.max(pre.peak, 0.001);
for (const b of allStems) scaleBus(b, masterGain);
master = sumBuses(allStems);
filterBus(master, 18, 15500);
saturateBus(master, 1.045);
const post = metrics(master);
const limiterGain = post.peak > 0.84 ? 0.84 / post.peak : 1;
if (limiterGain < 1) {
  for (const b of allStems) scaleBus(b, limiterGain);
  master = sumBuses(allStems);
}
for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const fadeIn = smoothstep(t / 5);
  const fadeOut = t > DURATION - 13 ? smoothstep((DURATION - t) / 13) : 1;
  master.l[i] *= fadeIn * fadeOut;
  master.r[i] *= fadeIn * fadeOut;
}
const masterStats = metrics(master);
if (masterStats.peak > 0.966) throw new Error(`Master peak ${masterStats.peak} exceeds -0.3 dBFS ceiling.`);

const stemReports = [];
for (const b of allStems) {
  const stemPath = path.join(stemDir, `${b.name}.wav`);
  writeWav24(stemPath, b);
  stemReports.push({ name: b.name, path: stemPath, ...metrics(b), probe: ffprobe(stemPath) });
}
writeWav24(outWav, master);
fs.copyFileSync(outWav, stagingWav);

const mp3 = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outWav, "-codec:a", "libmp3lame", "-b:a", "320k", outMp3], { encoding: "utf8" });
if (mp3.status !== 0) throw new Error(`ffmpeg MP3 encode failed: ${mp3.stderr || mp3.stdout}`);

const sourceAttributionLines = sourceManifest.files.flatMap(source => [
  `- ${source.id}: ${source.archivePath}`,
  `  ${source.license ?? sourceManifest.license}; ${source.url}`
]);

fs.writeFileSync(outAttr, [
  title,
  "",
  "Original 1980s mall dream track rendered offline by the Ableton MCP project.",
  "This is a separate project, not a revision of a prior render. It does not reuse previous masters, stems, ballroom sources, old vocal sources, or user-provided source audio.",
  "The musical writing is original: vaporwave-style electric-piano chords, glass motif, synthetic nonverbal vowel fog, mono sub pressure, and arrangement automation are generated in scripts/render-mall-at-the-end-of-sleep.mjs.",
  "Fresh source samples were staged only under samples/staging/mall-at-the-end-of-sleep/sources using npm run stage:mall-at-the-end-of-sleep:sources.",
  "No Ableton UI/mouse control, LiveAPI writes, plugin installs, arbitrary URL fetches, YouTube/SoundCloud ripping, or real subliminal/coercive commands were used.",
  "",
  "Source collection:",
  `${sourceManifest.sourceCollection} by ${sourceManifest.sourceCreator}`,
  `${sourceManifest.license}: ${sourceManifest.licenseUrl}`,
  sourceManifest.sourcePage,
  "",
  "Staged source samples:",
  ...sourceAttributionLines,
  "",
  "Composition notes:",
  "- Original harmony in C# minor moves from C#m9/Amaj7#11/Emaj9/G#/Bsus4(add9)-colored material into darker borrowed chords.",
  "- The glassy six-note motif is new and degrades through missing notes, late timing, pitch sag, and reversed-feeling envelope motion.",
  "- Fresh department-store, crowded-store, checkout, electric-sign, elevator, store-bell, and humidifier recordings are slowed, filtered, looped, reversed, and smeared into the mall-memory layer.",
  "- The dementia-dream tone is an original mood direction, not an imitation or quotation of any existing work.",
  "- Low end is mono-centered. Wide motion is limited to reflections, choir fog, PA tails, and motif decay.",
  ""
].join("\n"));

const report = {
  ok: true,
  title,
  slug,
  durationSeconds: DURATION,
  sampleRate: SR,
  bitDepth: 24,
  bpmReference: 56,
  sourceSamplesUsed: sourceManifest.files.length,
  sourcePolicy: "fresh_public_domain_samples_plus_original_synthesis",
  sourceManifest: {
    path: sourceManifestPath,
    sourcePage: sourceManifest.sourcePage,
    sourceCollection: sourceManifest.sourceCollection,
    sourceCreator: sourceManifest.sourceCreator,
    license: sourceManifest.license,
    licenseUrl: sourceManifest.licenseUrl,
    files: sourceManifest.files.map(source => ({
      id: source.id,
      role: source.role,
      archivePath: source.archivePath,
      url: source.url,
      bytes: source.bytes,
      sha256: source.sha256
    }))
  },
  safety: {
    abletonWrites: false,
    uiMouseControl: false,
    renderTimeDownloads: false,
    sourceStagingDownloads: true,
    arbitraryUrlFetch: false,
    subliminalCommands: false
  },
  outputs: {
    masterWav: outWav,
    masterMp3: outMp3,
    stagingMaster: stagingWav,
    attribution: outAttr,
    verificationReport: outReport,
    stemDirectory: stemDir
  },
  master: { ...masterStats, probe: ffprobe(outWav), loudness: ebur128(outWav) },
  stems: stemReports,
  verificationCommands: [
    "node scripts/stage-mall-at-the-end-sources.mjs",
    "node scripts/render-mall-at-the-end-of-sleep.mjs",
    `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${outWav}`,
    `ffmpeg -hide_banner -nostats -i ${outWav} -filter_complex ebur128=peak=true -f null -`
  ]
};

if (report.stems.length !== 8) throw new Error(`Expected 8 stems, wrote ${report.stems.length}.`);

fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
fs.copyFileSync(outReport, stagingReport);
console.log(JSON.stringify(report, null, 2));
