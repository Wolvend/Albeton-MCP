/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const slug = "a-room-wearing-your-childhood-horror-pass-v2";
const title = "A Room Wearing Your Childhood - Horror Pass V2";
const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const DURATION = 238;
const N = DURATION * SR;
let seed = 0x6d1e5a77;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);

const stems = {
  memory: bus("childhood-memory"),
  ghost: bus("near-ear-ghost-vocals"),
  room: bus("impossible-room-hum"),
  tape: bus("tape-scars"),
  sub: bus("sub-dread-collapse"),
  impacts: bus("wall-impacts-groans"),
  smear: bus("corridor-smear"),
  loop: bus("bad-memory-loop"),
  forbidden: bus("forbidden-fluorescent-signal")
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
  const fade = Math.min(Math.floor((opt.fade ?? 0.5) * SR), Math.floor(len / 2));
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    const sag = opt.sag ? 1 - opt.sag * p : 1;
    const drift = 1 + Math.sin((opt.time + t) * 0.028) * (opt.wow ?? 0) + Math.sin((opt.time + t) * 0.119) * (opt.wow ?? 0) * 0.6;
    const rate = (opt.rate ?? 1) * sag * drift;
    const local = opt.reverse ? (len - i - 1) * rate : i * rate;
    let l = sampleAt(src, 0, sourceStart + local);
    let r = sampleAt(src, 1, sourceStart + local);
    if (opt.crush) {
      const steps = 1 << Math.max(4, Math.floor(13 - opt.crush * 7));
      l = Math.round(l * steps) / steps;
      r = Math.round(r * steps) / steps;
    }
    let e = 1;
    if (fade > 0) e *= Math.min(1, i / fade, (len - i) / fade);
    if (opt.attack) e *= smoothstep(i / (opt.attack * SR));
    if (opt.release) e *= smoothstep((len - i) / (opt.release * SR));
    if (opt.dropouts) e *= rand() < opt.dropouts ? 0.08 : 1;
    if (opt.pulse) e *= 0.7 + 0.3 * Math.sin(2 * Math.PI * opt.pulse * t + 1.7);
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
    const freq = opt.freq + ((opt.freqEnd ?? opt.freq) - opt.freq) * p;
    const t = i / SR;
    let v = Math.sin(2 * Math.PI * freq * t);
    if (opt.type === "tri") v = Math.asin(v) * 2 / Math.PI;
    if (opt.type === "saw") v = 2 * ((freq * t) % 1) - 1;
    const env = smoothstep(i / ((opt.attack ?? 0.5) * SR)) * smoothstep((len - i) / ((opt.release ?? 1) * SR));
    b.l[di] += v * (opt.gain ?? 0.05) * env * pl;
    b.r[di] += v * (opt.gain ?? 0.05) * env * pr;
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
    lpL += ((rand() * 2 - 1) - lpL) * (opt.lowpass ?? 0.005);
    lpR += ((rand() * 2 - 1) - lpR) * (opt.lowpass ?? 0.005);
    const scar = rand() > (opt.scarThreshold ?? 0.99985) ? (rand() * 2 - 1) * (opt.scar ?? 0.12) : 0;
    const env = smoothstep(i / ((opt.attack ?? 1) * SR)) * smoothstep((len - i) / ((opt.release ?? 1) * SR));
    b.l[di] += (lpL + scar) * (opt.gain ?? 0.04) * env * pl;
    b.r[di] += (lpR + scar * 0.61) * (opt.gain ?? 0.04) * env * pr;
  }
}

function addBreathVowel(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  const formants = [[320, 890, 2380], [480, 1110, 2620], [710, 1320, 2840], [590, 980, 2190]][opt.shape ?? 0];
  let breathL = 0;
  let breathR = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    const t = i / SR;
    const p = i / Math.max(1, len - 1);
    breathL += ((rand() * 2 - 1) - breathL) * 0.018;
    breathR += ((rand() * 2 - 1) - breathR) * 0.014;
    let voiced = 0;
    for (let h = 1; h <= 7; h += 1) voiced += Math.sin(2 * Math.PI * opt.freq * h * (1 - p * 0.045) * t + h * 0.43) / (h * 1.65);
    let body = 0;
    for (const f of formants) body += Math.sin(2 * Math.PI * f * (1 + Math.sin(t * 0.19) * 0.002) * t) * 0.045;
    const env = smoothstep(i / ((opt.attack ?? 3) * SR)) * smoothstep((len - i) / ((opt.release ?? 5) * SR));
    const near = opt.near ? 1.2 + 0.12 * Math.sin(t * 4.1) : 1;
    b.l[di] += (voiced * 0.39 + body + breathL * 0.095) * (opt.gain ?? 0.04) * env * near * pl;
    b.r[di] += (voiced * 0.36 + body * 1.08 - breathR * 0.08) * (opt.gain ?? 0.04) * env * near * pr;
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

function crossDelay(b, seconds, wet) {
  const delay = Math.floor(seconds * SR);
  for (let i = delay; i < N; i += 1) {
    b.l[i] += b.r[i - delay] * wet;
    b.r[i] += b.l[i - delay] * wet;
  }
}

function impossibleRoom(b, wet) {
  const rooms = [
    { start: 0, end: 34, taps: [0.037, 0.064, 0.101], width: 0.22 },
    { start: 34, end: 84, taps: [0.18, 0.47, 0.91, 1.83], width: 0.9 },
    { start: 84, end: 158, taps: [0.31, 0.79, 1.57, 2.71, 3.29], width: 1.2 },
    { start: 158, end: 212, taps: [0.08, 0.16, 0.38, 0.77], width: 0.52 },
    { start: 212, end: 238, taps: [0.24, 0.92, 1.91], width: 1.05 }
  ];
  for (const room of rooms) {
    const start = Math.floor(room.start * SR);
    const end = Math.floor(room.end * SR);
    for (let i = start; i < end; i += 1) {
      const t = i / SR;
      const p = (i - start) / Math.max(1, end - start);
      const morph = smoothstep(p) * (1 - smoothstep((p - 0.82) / 0.18));
      for (let j = 0; j < room.taps.length; j += 1) {
        const delay = Math.floor(room.taps[j] * SR * (0.94 + 0.12 * Math.sin(t * 0.051 + j)));
        const src = i - delay;
        if (src <= 0) continue;
        const gain = wet * morph / Math.sqrt(j + 1);
        const side = j % 2 === 0 ? 1 : -1;
        b.l[i] += (b.r[src] * room.width * side + b.l[src] * 0.35) * gain;
        b.r[i] += (b.l[src] * room.width * -side + b.r[src] * 0.35) * gain;
      }
    }
  }
}

function spatialDrift(b, amount) {
  const l0 = b.l.slice();
  const r0 = b.r.slice();
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const width = 1 + Math.sin(t * 0.023 + 0.8) * amount * 2.8;
    const pan = Math.sin(t * 0.041 + 1.6) * amount + Math.sin(t * 0.011) * amount * 0.7;
    const micro = Math.floor((0.0012 + 0.0026 * (0.5 + 0.5 * Math.sin(t * 0.063))) * SR);
    const j = Math.max(0, i - micro);
    const mid = (l0[j] + r0[i]) * 0.5;
    const side = (l0[j] - r0[i]) * 0.5 * width;
    b.l[i] = (mid + side) * (1 - pan);
    b.r[i] = (mid - side) * (1 + pan);
  }
}

function writeInt24(buffer, value, offset) {
  const clipped = clamp(value, -8388608, 8388607);
  const unsigned = clipped < 0 ? clipped + 0x1000000 : clipped;
  buffer[offset] = unsigned & 0xff;
  buffer[offset + 1] = (unsigned >> 8) & 0xff;
  buffer[offset + 2] = (unsigned >> 16) & 0xff;
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

const ballroomDir = path.join(root, "samples", "staging", "online-liminal-ballroom");
const vocalDir = path.join(root, "samples", "staging", "occult-liminal-vocals");
const seventeen = readWav(path.join(ballroomDir, "06 When You And I Were Seventeen w.wav"));
const nocturne = readWav(path.join(ballroomDir, "10 Nocturne .wav"));
const happy = readWav(path.join(vocalDir, "02HappyDaysAreHereAgain.wav"));
const vampire = readWav(path.join(vocalDir, "03ImAJazzVampire.wav"));

// False-safe opening: more beautiful and narrow before the room reveals itself.
addSample(stems.memory, seventeen, { time: 0, src: 11.1, length: 36, rate: 0.47, gain: 0.43, pan: -0.02, fade: 5.5, attack: 4, release: 7, wow: 0.006, crush: 0.02 });
addSample(stems.memory, happy, { time: 13.5, src: 8.4, length: 13.5, rate: 0.36, gain: 0.08, pan: 0.04, fade: 2.8, wow: 0.008, crush: 0.04 });

// Ordered motif corruption: normal, late, missing notes, reverse-tail first, pitch sag, contour-only.
const motifReturns = [
  { time: 8, src: 12.2, length: 7.4, rate: 0.49, gain: 0.16, pan: -0.05, reverse: false, sag: 0.00, dropouts: 0 },
  { time: 39.4, src: 12.7, length: 7.8, rate: 0.42, gain: 0.15, pan: 0.16, reverse: false, sag: 0.03, dropouts: 0 },
  { time: 70.8, src: 13.1, length: 8.6, rate: 0.34, gain: 0.13, pan: -0.24, reverse: false, sag: 0.05, dropouts: 0.002 },
  { time: 103.9, src: 15.8, length: 10.4, rate: 0.28, gain: 0.14, pan: 0.22, reverse: true, sag: 0.08, dropouts: 0.003 },
  { time: 146.2, src: 17.6, length: 16.5, rate: 0.21, gain: 0.16, pan: -0.12, reverse: false, sag: 0.18, dropouts: 0.004 },
  { time: 204.2, src: 12.4, length: 22, rate: 0.13, gain: 0.095, pan: 0.04, reverse: true, sag: 0.28, dropouts: 0.006 }
];
for (const item of motifReturns) addSample(stems.memory, seventeen, { ...item, fade: 1.4, wow: 0.018 + item.sag * 0.14, crush: 0.06 + item.sag });

// Near-ear nonverbal ghosts after trust is established.
for (let i = 0; i < 12; i += 1) {
  addBreathVowel(stems.ghost, {
    time: 33 + i * 12.8 + (i % 2) * 1.1,
    length: 9.5 + (i % 4) * 2.6,
    freq: [61.74, 69.3, 73.42, 55][i % 4],
    gain: 0.045 + i * 0.003,
    pan: i % 2 === 0 ? -0.82 + rand() * 0.14 : 0.82 - rand() * 0.14,
    shape: i % 4,
    attack: 2.8,
    release: 4.8,
    near: true
  });
}
for (const t of [58, 91, 124, 166, 199]) {
  addSample(stems.ghost, vampire, { time: t, src: 20 + (t % 11), length: 14, rate: 0.18, gain: 0.085, pan: rand() * 1.4 - 0.7, fade: 4, reverse: true, wow: 0.048, crush: 0.26, pulse: 0.13 });
}

// Corridor material and thought loop.
for (const t of [42, 53.7, 68.2, 86.1, 112.4, 139.5, 161.8, 184.2]) {
  addSample(stems.smear, nocturne, { time: t, src: 8 + (t % 7), length: 19, rate: 0.17, gain: 0.135, pan: rand() * 1.0 - 0.5, fade: 4.2, reverse: t > 100, wow: 0.038, crush: 0.24, pulse: 0.11 });
}
let loopTime = 82.5;
for (const [i, length] of [4.2, 3.6, 3.1, 5.8, 2.7, 4.9, 3.0, 6.2, 2.5].entries()) {
  addSample(stems.loop, seventeen, { time: loopTime, src: 51.8 + (i % 4) * 0.42, length, rate: 0.69 - i * 0.031, gain: 0.11 + i * 0.006, pan: ((i % 5) - 2) * 0.18, fade: 0.18, reverse: i === 3 || i === 7, wow: 0.036, crush: 0.23, pulse: 0.33, dropouts: i > 4 ? 0.002 : 0 });
  loopTime += length * [0.84, 0.74, 1.12][i % 3];
}

// Recurring forbidden signal: small, clinical, never identical.
for (const [i, t] of [36.5, 61.2, 89.7, 119.1, 151.8, 188.4, 219.6].entries()) {
  addTone(stems.forbidden, { time: t, length: 1.4 + i * 0.12, freq: 1120 + i * 41, freqEnd: 860 - i * 19, gain: 0.018 + i * 0.0012, attack: 0.025, release: 0.9, pan: i % 2 ? 0.65 : -0.65 });
  addTone(stems.forbidden, { time: t + 0.31, length: 3.8, freq: 87 - i * 2.5, freqEnd: 42 - i, gain: 0.022, attack: 0.4, release: 2.9, pan: i % 2 ? -0.24 : 0.24, type: "tri" });
}

// Room, sub, impacts, and tape scars.
addNoise(stems.room, { time: 0, length: DURATION, gain: 0.052, lowpass: 0.00075, attack: 9, release: 8, scarThreshold: 0.99998, scar: 0.025, pan: -0.08 });
for (const f of [49.4, 59.7, 100.2, 119.5, 181.3]) addTone(stems.room, { time: 0, length: DURATION, freq: f, freqEnd: f * (0.998 + rand() * 0.004), gain: f < 70 ? 0.016 : 0.0055, attack: 8, release: 9, pan: rand() * 0.5 - 0.25 });
for (const f of [35, 31, 26]) addTone(stems.sub, { time: 38 + rand() * 18, length: 164, freq: f, freqEnd: f * 0.74, gain: 0.035, attack: 16, release: 16, pan: 0, type: "tri" });
for (const t of [30.5, 47.9, 66.6, 84.4, 103.7, 121.9, 138.8, 156.9, 174.6, 192.1, 209.7, 226.8]) {
  addTone(stems.impacts, { time: t, length: 6.1, freq: 48 - (t % 10), freqEnd: 21, gain: 0.078 + rand() * 0.045, attack: 0.018, release: 5.2, pan: 0, type: "tri" });
  addNoise(stems.impacts, { time: t + 0.08, length: 3.4, gain: 0.021, lowpass: 0.0026, attack: 0.04, release: 2.6, scarThreshold: 0.99955, scar: 0.055, pan: rand() * 0.8 - 0.4 });
}
for (let t = 1.8; t < DURATION; t += 3.4 + rand() * 5.2) {
  if (rand() < 0.34) addNoise(stems.tape, { time: t, length: 0.045 + rand() * 0.18, gain: 0.048 + rand() * 0.028, lowpass: 0.018, attack: 0.004, release: 0.08, scarThreshold: 0.976, scar: 0.16, pan: rand() * 1.1 - 0.55 });
}
for (const t of [76, 113.5, 146.2, 182.7, 216.1]) addTone(stems.tape, { time: t, length: 0.24, freq: 720 + rand() * 210, gain: 0.022, attack: 0.01, release: 0.13, pan: rand() * 0.9 - 0.45 });

// Final sub absence and controlled return.
const subDropStart = Math.floor(202 * SR);
const subDropEnd = Math.floor(213.5 * SR);
for (let i = subDropStart; i < subDropEnd; i += 1) {
  stems.sub.l[i] *= 0.025;
  stems.sub.r[i] *= 0.025;
}
addTone(stems.sub, { time: 213.4, length: 14.8, freq: 29, freqEnd: 18.5, gain: 0.17, attack: 2.6, release: 9.5, pan: 0, type: "tri" });

for (const stem of Object.values(stems)) {
  highpass(stem.l, stem === stems.sub ? 18 : 55);
  highpass(stem.r, stem === stems.sub ? 18 : 55);
}
lowpass(stems.memory.l, 3700); lowpass(stems.memory.r, 3500);
lowpass(stems.ghost.l, 3400); lowpass(stems.ghost.r, 3200);
lowpass(stems.room.l, 5200); lowpass(stems.room.r, 4800);
lowpass(stems.tape.l, 6200); lowpass(stems.tape.r, 5900);
lowpass(stems.smear.l, 3000); lowpass(stems.smear.r, 2850);
lowpass(stems.loop.l, 4100); lowpass(stems.loop.r, 3800);
lowpass(stems.forbidden.l, 6400); lowpass(stems.forbidden.r, 6100);

crossDelay(stems.memory, 0.73, 0.042);
crossDelay(stems.ghost, 0.49, 0.065);
crossDelay(stems.ghost, 1.29, 0.08);
crossDelay(stems.smear, 1.77, 0.078);
crossDelay(stems.loop, 0.31, 0.05);
crossDelay(stems.forbidden, 0.93, 0.038);
impossibleRoom(stems.room, 0.1);
impossibleRoom(stems.ghost, 0.055);
impossibleRoom(stems.smear, 0.067);
impossibleRoom(stems.forbidden, 0.035);
spatialDrift(stems.memory, 0.035);
spatialDrift(stems.ghost, 0.12);
spatialDrift(stems.room, 0.13);
spatialDrift(stems.smear, 0.095);
spatialDrift(stems.loop, 0.07);
spatialDrift(stems.forbidden, 0.09);

const masterL = new Float32Array(N);
const masterR = new Float32Array(N);
for (const stem of Object.values(stems)) {
  for (let i = 0; i < N; i += 1) {
    masterL[i] += stem.l[i];
    masterR[i] += stem.r[i];
  }
}
highpass(masterL, 22); highpass(masterR, 22);
lowpass(masterL, 14500); lowpass(masterR, 14200);
for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const drain = t > 202 && t < 213.5 ? 0.52 : 1;
  const fadeOut = i > N - SR * 10 ? smoothstep((N - i) / (SR * 10)) : 1;
  masterL[i] = Math.tanh(masterL[i] * 1.24) * drain * fadeOut;
  masterR[i] = Math.tanh(masterR[i] * 1.24) * drain * fadeOut;
}
const pre = metrics(masterL, masterR);
const gain = Math.min(2.2, 0.86 / Math.max(pre.peak, 0.001));
for (let i = 0; i < N; i += 1) {
  masterL[i] *= gain;
  masterR[i] *= gain;
}

const stemReports = [];
for (const stem of Object.values(stems)) {
  const file = path.join(stemDir, `${stem.name}.wav`);
  writeWav(file, stem.l, stem.r);
  stemReports.push({ name: stem.name, path: file, ...metrics(stem.l, stem.r) });
}
writeWav(stagingWav, masterL, masterR);
writeWav(outWav, masterL, masterR);

const mp3 = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outWav, "-codec:a", "libmp3lame", "-b:a", "320k", outMp3], { encoding: "utf8" });
if (mp3.status !== 0) throw new Error(mp3.stderr || mp3.stdout);

fs.writeFileSync(outAttr, [
  title,
  "",
  "Direction: side-by-side horror pass v2 of A Room Wearing Your Childhood. The original master is not overwritten.",
  "This pass adds a false-safe opening, near-ear ghost vowels, recurring forbidden fluorescent signal, ordered motif corruption, room-size hallucination, and final sub absence/return.",
  "",
  "Sources:",
  "- Internet Archive: Cole McElroy Spanish Ballroom Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/ColeMcElroySpanishBallroomOrchestra78rpmCollection",
  "- Internet Archive: Nathan Glantz Orchestra 78rpm Collection, Public Domain Mark 1.0, https://archive.org/details/NathanGlantzOrchestra78rpmCollection",
  "- Internet Archive: Sirens of Song, Public Domain Mark 1.0, https://archive.org/details/SirensOfSong",
  "",
  "Process:",
  "- Main memory source remains When You And I Were Seventeen, but the v2 arrangement changes phrase timing, corruption order, spatial movement, and collapse behavior.",
  "- Haunted vocals are nonverbal breath and vowel ghosts with no intelligible commands.",
  "- Tape is represented as short scars and dropouts rather than broad artificial hiss.",
  "- Stems exported: childhood memory, near-ear ghost vocals, impossible room hum, tape scars, sub dread collapse, wall impacts/groans, corridor smear, bad memory loop, forbidden fluorescent signal.",
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
