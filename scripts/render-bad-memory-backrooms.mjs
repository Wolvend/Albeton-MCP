/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const slug = "a-room-wearing-your-childhood";
const title = "A Room Wearing Your Childhood";
const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const DURATION = 238;
const N = DURATION * SR;
let seed = 0x51f15e;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);

const stems = {
  memory: bus("childhood-memory"),
  vocals: bus("erased-vocals"),
  room: bus("fluorescent-room"),
  tape: bus("tape-skin"),
  sub: bus("sub-dread"),
  impacts: bus("wall-impacts"),
  smear: bus("corridor-smear"),
  loop: bus("bad-memory-loop")
};

function bus(name) {
  return { name, l: new Float32Array(N), r: new Float32Array(N) };
}

function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function smooth(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function pan(p) {
  const a = (clamp(p, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(a), Math.sin(a)];
}

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF") throw new Error(`Not WAV: ${file}`);
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        sampleRate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14)
      };
    }
    if (id === "data") data = b.subarray(body, body + size);
    off = body + size + (size % 2);
  }
  if (!fmt || !data || ![1, 3].includes(fmt.format)) throw new Error(`Unsupported WAV: ${file}`);
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / bytes / fmt.channels);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const vals = [];
    for (let c = 0; c < fmt.channels; c += 1) {
      const p = (i * fmt.channels + c) * bytes;
      let v = 0;
      if (fmt.format === 3 && fmt.bits === 32) v = data.readFloatLE(p);
      else if (fmt.bits === 16) v = data.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) {
        const raw = data[p] | (data[p + 1] << 8) | (data[p + 2] << 16);
        v = ((raw & 0x800000) ? raw | 0xff000000 : raw) / 8388608;
      } else if (fmt.bits === 32) v = data.readInt32LE(p) / 2147483648;
      vals.push(v);
    }
    l[i] = vals[0] ?? 0;
    r[i] = vals[1] ?? vals[0] ?? 0;
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

function at(src, ch, pos) {
  if (pos < 0 || pos >= src.length - 2) return 0;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = ch === 0 ? src.l : src.r;
  return a[i] * (1 - f) + a[i + 1] * f;
}

function addSample(b, src, o) {
  const start = Math.floor((o.time ?? 0) * SR);
  const len = Math.floor((o.length ?? 6) * SR);
  const srcStart = (o.src ?? 0) * SR;
  const rate = o.rate ?? 1;
  const [gl, gr] = pan(o.pan ?? 0);
  const fade = Math.min(Math.floor((o.fade ?? 0.5) * SR), Math.floor(len / 2));
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const warp = 1 + Math.sin((o.time + t) * 0.031) * (o.wow ?? 0) + Math.sin((o.time + t) * 0.117) * (o.wow ?? 0) * 0.45;
    const local = o.reverse ? (len - i - 1) * rate * warp : i * rate * warp;
    let l = at(src, 0, srcStart + local);
    let r = at(src, 1, srcStart + local);
    if (o.crush) {
      const steps = 1 << Math.max(4, Math.floor(13 - o.crush * 7));
      l = Math.round(l * steps) / steps;
      r = Math.round(r * steps) / steps;
    }
    let e = 1;
    if (fade > 0) e *= Math.min(1, i / fade, (len - i) / fade);
    if (o.attack) e *= smooth(i / (o.attack * SR));
    if (o.release) e *= smooth((len - i) / (o.release * SR));
    if (o.pulse) e *= 0.7 + 0.3 * Math.sin(2 * Math.PI * o.pulse * t + 1.7);
    b.l[di] += l * (o.gain ?? 0.1) * e * gl;
    b.r[di] += r * (o.gain ?? 0.1) * e * gr;
  }
}

function addTone(b, o) {
  const start = Math.floor(o.time * SR);
  const len = Math.floor(o.length * SR);
  const [gl, gr] = pan(o.pan ?? 0);
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const p = i / Math.max(1, len - 1);
    const freq = o.freq + ((o.freqEnd ?? o.freq) - o.freq) * p;
    const t = i / SR;
    let v = Math.sin(2 * Math.PI * freq * t);
    if (o.type === "tri") v = Math.asin(v) * 2 / Math.PI;
    if (o.type === "saw") v = 2 * ((freq * t) % 1) - 1;
    const e = smooth(i / ((o.attack ?? 0.5) * SR)) * smooth((len - i) / ((o.release ?? 1) * SR));
    b.l[di] += v * (o.gain ?? 0.05) * e * gl;
    b.r[di] += v * (o.gain ?? 0.05) * e * gr;
  }
}

function addNoise(b, o) {
  const start = Math.floor(o.time * SR);
  const len = Math.floor(o.length * SR);
  const [gl, gr] = pan(o.pan ?? 0);
  let lpfL = 0;
  let lpfR = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    lpfL += ((rand() * 2 - 1) - lpfL) * (o.lowpass ?? 0.005);
    lpfR += ((rand() * 2 - 1) - lpfR) * (o.lowpass ?? 0.005);
    const tick = rand() > (o.tickThreshold ?? 0.9997) ? (rand() * 2 - 1) * (o.tick ?? 0.2) : 0;
    const e = smooth(i / ((o.attack ?? 1) * SR)) * smooth((len - i) / ((o.release ?? 1) * SR));
    b.l[di] += (lpfL + tick) * (o.gain ?? 0.05) * e * gl;
    b.r[di] += (lpfR + tick * 0.62) * (o.gain ?? 0.05) * e * gr;
  }
}

function addVowel(b, o) {
  const start = Math.floor(o.time * SR);
  const len = Math.floor(o.length * SR);
  const [gl, gr] = pan(o.pan ?? 0);
  const forms = [[360, 920, 2440], [500, 1160, 2700], [720, 1350, 2860]][o.shape ?? 0];
  let breath = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    breath += ((rand() * 2 - 1) - breath) * 0.01;
    let v = 0;
    for (let h = 1; h <= 6; h += 1) v += Math.sin(2 * Math.PI * o.freq * h * (1 - p * 0.035) * t + h * 0.33) / (h * 1.45);
    let body = 0;
    for (const f of forms) body += Math.sin(2 * Math.PI * f * (1 + Math.sin(t * 0.17) * 0.002) * t) * 0.055;
    const e = smooth(i / ((o.attack ?? 4) * SR)) * smooth((len - i) / ((o.release ?? 5) * SR));
    b.l[di] += (v * 0.45 + body + breath * 0.05) * (o.gain ?? 0.04) * e * gl;
    b.r[di] += (v * 0.42 + body * 1.08 - breath * 0.04) * (o.gain ?? 0.04) * e * gr;
  }
}

function lowpass(a, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const k = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < a.length; i += 1) {
    y += (a[i] - y) * k;
    a[i] = y;
  }
}

function highpass(a, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const k = rc / (rc + dt);
  let y = 0;
  let prev = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    y = k * (y + x - prev);
    a[i] = y;
    prev = x;
  }
}

function delay(b, seconds, wet, cross = true) {
  const d = Math.floor(seconds * SR);
  for (let i = d; i < N; i += 1) {
    const l = cross ? b.r[i - d] : b.l[i - d];
    const r = cross ? b.l[i - d] : b.r[i - d];
    b.l[i] += l * wet;
    b.r[i] += r * wet;
  }
}

function roomMorph(b, wet) {
  const taps = [
    [0.061, 0.19, 0.44],
    [0.29, 0.73, 1.51],
    [0.13, 0.39, 0.97, 2.2],
    [0.047, 0.11, 0.31, 0.67]
  ];
  for (let i = 1; i < N; i += 1) {
    const t = i / SR;
    const section = t < 42 ? 0 : t < 92 ? 1 : t < 174 ? 2 : 3;
    const width = [0.28, 0.92, 1.16, 0.56][section];
    for (let j = 0; j < taps[section].length; j += 1) {
      const d = Math.floor(taps[section][j] * SR * (0.96 + 0.09 * Math.sin(t * 0.033 + j)));
      const src = i - d;
      if (src <= 0) continue;
      const g = wet / Math.sqrt(j + 1);
      b.l[i] += (b.r[src] * width + b.l[src] * 0.35) * g;
      b.r[i] += (b.l[src] * width + b.r[src] * 0.35) * g;
    }
  }
}

function drift(b, amount) {
  const l0 = b.l.slice();
  const r0 = b.r.slice();
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const width = 1 + Math.sin(t * 0.021) * amount * 2.2;
    const panAmt = Math.sin(t * 0.037 + 1.1) * amount;
    const d = Math.floor((0.001 + 0.002 * (0.5 + 0.5 * Math.sin(t * 0.053))) * SR);
    const j = Math.max(0, i - d);
    const mid = (l0[j] + r0[i]) * 0.5;
    const side = (l0[j] - r0[i]) * 0.5 * width;
    b.l[i] = (mid + side) * (1 - panAmt);
    b.r[i] = (mid - side) * (1 + panAmt);
  }
}

function writeInt24(b, value, offset) {
  const v = clamp(value, -8388608, 8388607);
  const u = v < 0 ? v + 0x1000000 : v;
  b[offset] = u & 0xff;
  b[offset + 1] = (u >> 8) & 0xff;
  b[offset + 2] = (u >> 16) & 0xff;
}

function writeWav(file, l, r) {
  const bytes = N * 6;
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 6, 28);
  b.writeUInt16LE(6, 32);
  b.writeUInt16LE(24, 34);
  b.write("data", 36);
  b.writeUInt32LE(bytes, 40);
  let p = 44;
  for (let i = 0; i < N; i += 1) {
    writeInt24(b, Math.round(clamp(l[i], -1, 1) * 8388607), p); p += 3;
    writeInt24(b, Math.round(clamp(r[i], -1, 1) * 8388607), p); p += 3;
  }
  fs.writeFileSync(file, b);
}

function metrics(l, r) {
  let peak = 0;
  let rms = 0;
  for (let i = 0; i < N; i += 1) {
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    rms += l[i] * l[i] + r[i] * r[i];
  }
  return { peak: Number(peak.toFixed(4)), rms: Number(Math.sqrt(rms / (N * 2)).toFixed(4)) };
}

const ballroom = path.join(root, "samples", "staging", "online-liminal-ballroom");
const vocals = path.join(root, "samples", "staging", "occult-liminal-vocals");
const seventeen = readWav(path.join(ballroom, "06 When You And I Were Seventeen w.wav"));
const nocturne = readWav(path.join(ballroom, "10 Nocturne .wav"));
const oriental = readWav(path.join(ballroom, "07 Oriental Nights.wav"));
const happy = readWav(path.join(vocals, "02HappyDaysAreHereAgain.wav"));
const vampire = readWav(path.join(vocals, "03ImAJazzVampire.wav"));

// 0:00-0:42: a plausible bad memory, small and almost warm.
addSample(stems.memory, seventeen, { time: 0, src: 10.5, length: 47, rate: 0.41, gain: 0.46, pan: -0.05, fade: 6, attack: 5, release: 8, wow: 0.011, crush: 0.04 });
addSample(stems.memory, happy, { time: 15, src: 8.6, length: 11, rate: 0.31, gain: 0.11, pan: 0.08, fade: 2.5, wow: 0.018, crush: 0.1 });

// 0:42-1:32: the memory realizes the hallway is alive.
for (const t of [39.5, 47.7, 57.1, 68.8, 80.4]) {
  addSample(stems.smear, nocturne, { time: t, src: 8 + (t % 9), length: 18, rate: 0.19, gain: 0.16, pan: (rand() - 0.5) * 0.6, fade: 4, reverse: t > 57, wow: 0.032, crush: 0.21, pulse: 0.11 });
}
addSample(stems.memory, seventeen, { time: 43.2, src: 36, length: 38, rate: 0.33, gain: 0.29, pan: 0.18, fade: 5.5, reverse: true, wow: 0.025, crush: 0.14 });

// 1:32-2:54: fluorescent sleep and a thought that repeats wrong.
const loopLens = [4.1, 3.4, 5.2, 2.9, 4.8, 3.1, 6.3, 2.6, 4.4];
let loopT = 91.6;
for (let i = 0; i < loopLens.length; i += 1) {
  addSample(stems.loop, seventeen, { time: loopT, src: 52.4 + (i % 4) * 0.47, length: loopLens[i], rate: 0.72 - i * 0.025, gain: 0.13 + i * 0.006, pan: ((i % 5) - 2) * 0.16, fade: 0.22, reverse: i === 4 || i === 7, wow: 0.028, crush: 0.18, pulse: 0.27 });
  loopT += loopLens[i] * [0.91, 0.77, 1.08][i % 3];
}
for (let i = 0; i < 8; i += 1) {
  addVowel(stems.vocals, { time: 86 + i * 9.7, length: 16 + (i % 3) * 4, freq: [73.42, 61.74, 55, 82.41][i % 4], gain: 0.052 + i * 0.004, pan: ((i % 5) - 2) * 0.19, shape: i % 3, attack: 5, release: 7 });
}

// 2:54-3:38: a dead-office ritual made of reversed adolescence.
for (let i = 0; i < 10; i += 1) {
  addSample(stems.smear, oriental, { time: 151 + i * 5.8, src: 18 + (i % 7) * 2.2, length: 18, rate: 0.16 + (i % 3) * 0.015, gain: 0.11 + (i % 4) * 0.014, pan: ((i % 7) - 3) * 0.14, fade: 4.4, reverse: i % 2 === 0, wow: 0.043, crush: 0.27, pulse: 0.18 });
}
for (const t of [161, 174, 189, 207]) {
  addSample(stems.vocals, vampire, { time: t, src: 21 + (t % 13), length: 16, rate: 0.22, gain: 0.105, pan: rand() * 0.8 - 0.4, fade: 4, reverse: true, wow: 0.045, crush: 0.24, pulse: 0.15 });
}

// 3:38-3:58: erase everything except the room and one tiny memory.
addSample(stems.memory, seventeen, { time: 218.5, src: 12.8, length: 16.5, rate: 0.18, gain: 0.13, pan: 0.03, fade: 5, wow: 0.04, crush: 0.22 });
addSample(stems.vocals, happy, { time: 222, src: 39.5, length: 12, rate: 0.19, gain: 0.06, pan: -0.22, fade: 3.5, reverse: true, wow: 0.052, crush: 0.3 });

// Place and pressure.
addNoise(stems.room, { time: 0, length: DURATION, gain: 0.06, lowpass: 0.0008, attack: 9, release: 8, tickThreshold: 0.99994, tick: 0.04, pan: -0.08 });
for (const f of [49.2, 59.6, 100.1, 119.3, 181.2]) addTone(stems.room, { time: 0, length: DURATION, freq: f, freqEnd: f * (0.998 + rand() * 0.004), gain: f < 70 ? 0.018 : 0.006, attack: 8, release: 9, pan: rand() * 0.6 - 0.3 });
for (const f of [36, 31, 28, 24]) addTone(stems.sub, { time: 42 + rand() * 15, length: 185, freq: f, freqEnd: f * 0.78, gain: 0.033, attack: 14, release: 14, pan: 0, type: "tri" });
for (const t of [31, 48.5, 66.2, 84.9, 103.1, 119.8, 137.7, 156.4, 174.2, 191.6, 209.1, 229.4]) {
  addTone(stems.impacts, { time: t, length: 5.7, freq: 48 - (t % 9), freqEnd: 22, gain: 0.075 + rand() * 0.04, attack: 0.02, release: 4.8, pan: 0 });
  addNoise(stems.impacts, { time: t + 0.08, length: 3.8, gain: 0.025, lowpass: 0.003, attack: 0.05, release: 2.8, tickThreshold: 0.9994, tick: 0.07, pan: rand() * 0.8 - 0.4 });
}
addTone(stems.sub, { time: 221, length: 13.5, freq: 29, freqEnd: 19, gain: 0.155, attack: 2.4, release: 8, pan: 0, type: "tri" });

// Tape skin: sparse scars and dropouts, not a detached static blanket.
for (let t = 1.5; t < DURATION; t += 2.7 + rand() * 4.4) {
  if (rand() < 0.42) addNoise(stems.tape, { time: t, length: 0.05 + rand() * 0.22, gain: 0.058 + rand() * 0.036, lowpass: 0.02, attack: 0.004, release: 0.09, tickThreshold: 0.976, tick: 0.18, pan: rand() * 1.2 - 0.6 });
}
for (const t of [75, 116, 147, 183, 217]) addTone(stems.tape, { time: t, length: 0.28, freq: 690 + rand() * 260, gain: 0.026, attack: 0.01, release: 0.14, pan: rand() * 0.9 - 0.45 });

for (const s of Object.values(stems)) {
  highpass(s.l, s === stems.sub ? 18 : 55);
  highpass(s.r, s === stems.sub ? 18 : 55);
}
lowpass(stems.memory.l, 3600); lowpass(stems.memory.r, 3400);
lowpass(stems.vocals.l, 3300); lowpass(stems.vocals.r, 3100);
lowpass(stems.room.l, 5200); lowpass(stems.room.r, 4800);
lowpass(stems.tape.l, 6400); lowpass(stems.tape.r, 6000);
lowpass(stems.smear.l, 3000); lowpass(stems.smear.r, 2850);
lowpass(stems.loop.l, 4200); lowpass(stems.loop.r, 3900);

delay(stems.memory, 0.71, 0.045);
delay(stems.vocals, 1.18, 0.105);
delay(stems.smear, 1.73, 0.07);
delay(stems.loop, 0.39, 0.055);
delay(stems.impacts, 1.41, 0.03);
roomMorph(stems.room, 0.09);
roomMorph(stems.vocals, 0.045);
roomMorph(stems.smear, 0.06);
drift(stems.memory, 0.035);
drift(stems.vocals, 0.09);
drift(stems.room, 0.11);
drift(stems.smear, 0.08);
drift(stems.loop, 0.06);

const masterL = new Float32Array(N);
const masterR = new Float32Array(N);
for (const s of Object.values(stems)) {
  for (let i = 0; i < N; i += 1) {
    masterL[i] += s.l[i];
    masterR[i] += s.r[i];
  }
}
highpass(masterL, 22); highpass(masterR, 22);
lowpass(masterL, 14500); lowpass(masterR, 14200);
for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const drain = t > 215 && t < 226 ? 0.45 : 1;
  const fadeOut = i > N - SR * 10 ? smooth((N - i) / (SR * 10)) : 1;
  masterL[i] = Math.tanh(masterL[i] * 1.18) * drain * fadeOut;
  masterR[i] = Math.tanh(masterR[i] * 1.18) * drain * fadeOut;
}
const pre = metrics(masterL, masterR);
const gain = Math.min(2.2, 0.86 / Math.max(pre.peak, 0.001));
for (let i = 0; i < N; i += 1) {
  masterL[i] *= gain;
  masterR[i] *= gain;
}

const stemReports = [];
for (const s of Object.values(stems)) {
  const file = path.join(stemDir, `${s.name}.wav`);
  writeWav(file, s.l, s.r);
  stemReports.push({ name: s.name, path: file, ...metrics(s.l, s.r) });
}
writeWav(stagingWav, masterL, masterR);
writeWav(outWav, masterL, masterR);

const mp3 = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outWav, "-codec:a", "libmp3lame", "-b:a", "320k", outMp3], { encoding: "utf8" });
if (mp3.status !== 0) throw new Error(mp3.stderr || mp3.stdout);

fs.writeFileSync(outAttr, [
  title,
  "",
  "Direction: original bad-memory Backrooms horror piece, separate from There Was Never a Door and prior occult-liminal renders.",
  "The main motif uses a different public-domain source emphasis and a new arrangement, structure, processing chain, and render slug.",
  "",
  "Sources:",
  "- Internet Archive: Cole McElroy Spanish Ballroom Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/ColeMcElroySpanishBallroomOrchestra78rpmCollection",
  "- Internet Archive: Nathan Glantz Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/NathanGlantzOrchestra78rpmCollection",
  "- Internet Archive: Sirens of Song, Public Domain Mark 1.0, https://archive.org/details/SirensOfSong",
  "",
  "Process:",
  "- Main memory source: When You And I Were Seventeen, slowed, reversed, looped unevenly, filtered, and spatially destabilized.",
  "- Nocturne and Oriental Nights are used as low corridor smears and erased-room harmonics.",
  "- Female vocal sources are transformed into unintelligible vowel ghosts, breathlike shadows, and reverse memory fragments.",
  "- Sparse impacts and sub pressure are procedural; no beat, breakcore, trap, EDM drop, bongos, or bright synth lead is present.",
  "- Stems exported: childhood memory, erased vocals, fluorescent room, tape skin, sub dread, wall impacts, corridor smear, bad memory loop.",
].join("\n"));

console.log(JSON.stringify({
  ok: true,
  title,
  durationSeconds: DURATION,
  sampleRate: SR,
  bitDepth: 24,
  masterWav: outWav,
  masterMp3: outMp3,
  stagingMaster: stagingWav,
  attribution: outAttr,
  stems: stemReports,
  master: metrics(masterL, masterR)
}, null, 2));
