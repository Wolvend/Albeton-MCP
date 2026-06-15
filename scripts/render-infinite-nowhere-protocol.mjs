/* global Buffer, console, process */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || root, "Downloads");
const slug = "infinite-nowhere-protocol";
const title = "Infinite Nowhere Protocol";
const renderRoot = path.join(root, "samples", "staging", slug);
const stemDir = path.join(renderRoot, "stems");
fs.mkdirSync(stemDir, { recursive: true });

const SR = 44100;
const DURATION = 228;
const N = DURATION * SR;
let seed = 0x1f4d7a91;

const outWav = path.join(downloads, `${slug}-master.wav`);
const outMp3 = path.join(downloads, `${slug}-master.mp3`);
const outAttr = path.join(downloads, `${slug}-attribution.txt`);
const outReport = path.join(downloads, `${slug}-verification.json`);
const stagingWav = path.join(renderRoot, `${slug}-master.wav`);
const stagingReport = path.join(renderRoot, `${slug}-verification.json`);

const stems = {
  memory: bus("false-calm-memory"),
  siren: bus("far-siren-memory"),
  room: bus("infinite-nowhere-room"),
  pressure: bus("sub-pressure-void"),
  tape: bus("field-recorder-tape"),
  vocals: bus("near-ear-vowel-ghosts"),
  lab: bus("clinical-occult-lab-tones"),
  signal: bus("forbidden-transmission"),
  impacts: bus("distant-concrete-impacts"),
  smear: bus("horizon-smear")
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

function ensureSource(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing source: ${file}`);
  return file;
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
    const fold = opt.fold ? 1 + Math.sin(p * Math.PI * opt.fold) * 0.035 : 1;
    const drift = 1
      + Math.sin((opt.time + t) * 0.043) * (opt.wow ?? 0)
      + Math.sin((opt.time + t) * 0.131) * (opt.wow ?? 0) * 0.52;
    const rate = (opt.rate ?? 1) * sag * drift * fold;
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
    if (opt.dropouts && rand() < opt.dropouts) e *= 0.03;
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
  let slow = 0;
  for (let i = 0; i < len; i += 1) {
    const di = start + i;
    if (di < 0 || di >= N) continue;
    lpL += ((rand() * 2 - 1) - lpL) * (opt.lowpass ?? 0.004);
    lpR += ((rand() * 2 - 1) - lpR) * (opt.lowpass ?? 0.004);
    slow += ((rand() * 2 - 1) - slow) * (opt.slowpass ?? 0.00045);
    const p = i / Math.max(1, len - 1);
    const env = smoothstep(i / ((opt.attack ?? 2) * SR)) * smoothstep((len - i) / ((opt.release ?? 2) * SR));
    const breathe = 0.78 + 0.22 * Math.sin(2 * Math.PI * (opt.breathe ?? 0.019) * (i / SR) + 1.4);
    const scar = rand() > (opt.scarThreshold ?? 0.99996) ? (rand() * 2 - 1) * (opt.scar ?? 0.08) : 0;
    const tilt = 0.82 + p * 0.32;
    b.l[di] += (lpL * tilt + slow * 0.42 + scar) * (opt.gain ?? 0.03) * env * breathe * pl;
    b.r[di] += (lpR * (2 - tilt) + slow * 0.36 + scar * 0.38) * (opt.gain ?? 0.03) * env * breathe * pr;
  }
}

function addVowelGhost(b, opt) {
  const start = Math.floor(opt.time * SR);
  const len = Math.floor(opt.length * SR);
  const [pl, pr] = panGains(opt.pan ?? 0);
  const shapes = [
    [340, 810, 2280],
    [455, 1040, 2460],
    [620, 1240, 2780],
    [720, 1460, 3030]
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
      const pull = 1 - p * (opt.sag ?? 0.04);
      voiced += Math.sin(2 * Math.PI * opt.freq * h * pull * t + h * 0.37) / (h * 1.6);
    }
    let body = 0;
    for (const f of formants) body += Math.sin(2 * Math.PI * f * (1 + Math.sin(t * 0.19) * 0.002) * t) * 0.028;
    const env = smoothstep(i / ((opt.attack ?? 4) * SR)) * smoothstep((len - i) / ((opt.release ?? 5) * SR));
    const almostWord = 0.72 + 0.28 * Math.sin(2 * Math.PI * (0.09 + opt.shape * 0.013) * t + 0.5);
    const near = opt.near ? 1.25 + 0.13 * Math.sin(t * 3.1) : 1;
    b.l[di] += (voiced * 0.34 + body + breathL * 0.15) * (opt.gain ?? 0.04) * env * almostWord * near * pl;
    b.r[di] += (voiced * 0.3 + body * 1.08 - breathR * 0.12) * (opt.gain ?? 0.04) * env * almostWord * near * pr;
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
    scrape += ((rand() * 2 - 1) - scrape) * 0.023;
    const pitch = opt.freq * (1 - p * 0.48);
    const body = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-p * 7.5);
    const cable = Math.sin(2 * Math.PI * (pitch * 0.37 + 7) * t + 0.4) * Math.exp(-p * 2.2);
    const env = smoothstep(i / (0.016 * SR)) * smoothstep((len - i) / (0.22 * SR));
    const v = (body + cable * 0.42 + scrape * 0.09) * (opt.gain ?? 0.08) * env;
    b.l[di] += v * pl;
    b.r[di] += v * pr;
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

function roomShift(b, amount) {
  const sections = [
    { start: 0, end: 35, taps: [0.029, 0.067, 0.101], wet: 0.045, width: 0.15 },
    { start: 35, end: 82, taps: [0.18, 0.49, 0.96, 1.88], wet: 0.076, width: 0.76 },
    { start: 82, end: 136, taps: [0.31, 0.74, 1.62, 2.91, 4.4], wet: 0.068, width: 1.08 },
    { start: 136, end: 183, taps: [0.046, 0.17, 0.43, 0.84], wet: 0.056, width: 0.42 },
    { start: 183, end: 228, taps: [0.52, 1.11, 2.34, 4.8, 6.9], wet: 0.052, width: 1.2 }
  ];
  for (const section of sections) {
    const s = Math.floor(section.start * SR);
    const e = Math.min(N, Math.floor(section.end * SR));
    for (const tap of section.taps) {
      const d = Math.floor(tap * SR);
      for (let i = Math.max(s + d, d); i < e; i += 1) {
        const t = i / SR;
        const morph = 0.52 + 0.48 * Math.sin(t * 0.011 + tap * 2.4);
        const wet = section.wet * amount * morph;
        const left = b.l[i - d];
        const right = b.r[i - d];
        b.l[i] += (right * section.width + left * (1 - section.width) * 0.16) * wet;
        b.r[i] += (left * section.width + right * (1 - section.width) * 0.16) * wet;
      }
    }
  }
}

function stereoDrift(b, depth) {
  for (let i = 0; i < N; i += 1) {
    const t = i / SR;
    const side = (b.l[i] - b.r[i]) * 0.5;
    const mid = (b.l[i] + b.r[i]) * 0.5;
    const width = 0.72 + depth * (0.55 + 0.45 * Math.sin(t * 0.017 + Math.sin(t * 0.0037) * 2.1));
    const lean = Math.sin(t * 0.021 + Math.sin(t * 0.006)) * depth * 0.08;
    b.l[i] = mid * (1 - lean) + side * width;
    b.r[i] = mid * (1 + lean) - side * width;
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
    const halo = (b.l[i - d] + b.r[i - d]) * 0.5 * wet * (0.68 + 0.32 * Math.sin(t * 0.027 + seconds * 19));
    b.l[i] += halo;
    b.r[i] -= halo * 0.86;
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
  let midSum = 0;
  let sideSum = 0;
  let lr = 0;
  let ll = 0;
  let rr = 0;
  let monoPeak = 0;
  for (let i = 0; i < N; i += 1) {
    const l = b.l[i];
    const r = b.r[i];
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    monoPeak = Math.max(monoPeak, Math.abs(mid));
    sum += l * l + r * r;
    midSum += mid * mid;
    sideSum += side * side;
    lr += l * r;
    ll += l * l;
    rr += r * r;
  }
  return {
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(sum / (N * 2)).toFixed(4)),
    monoPeak: Number(monoPeak.toFixed(4)),
    midSideRatio: Number((Math.sqrt(sideSum / Math.max(midSum, 1e-12))).toFixed(4)),
    correlation: Number((lr / Math.sqrt(Math.max(ll * rr, 1e-12))).toFixed(4))
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
  const probe = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_name,sample_rate,channels,bits_per_sample",
    "-of", "json",
    file
  ], { encoding: "utf8" });
  return {
    command: `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${file}`,
    status: probe.status,
    json: probe.stdout ? JSON.parse(probe.stdout) : null,
    stderr: probe.stderr
  };
}

function ebur128(file) {
  const loudness = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", file,
    "-filter_complex", "ebur128=peak=true",
    "-f", "null",
    "-"
  ], { encoding: "utf8" });
  return {
    command: `ffmpeg -hide_banner -nostats -i ${file} -filter_complex ebur128=peak=true -f null -`,
    status: loudness.status,
    stderrTail: (loudness.stderr || "").split(/\r?\n/).slice(-24).join("\n")
  };
}

const ballroomDir = path.join(root, "samples", "staging", "online-liminal-ballroom");
const vocalDir = path.join(root, "samples", "staging", "occult-liminal-vocals");
const hauntingWaltz = readWav(ensureSource(path.join(ballroomDir, "05 That Haunting Waltz.wav")));
const seventeen = readWav(ensureSource(path.join(ballroomDir, "06 When You And I Were Seventeen w.wav")));
const orientalNights = readWav(ensureSource(path.join(ballroomDir, "07 Oriental Nights.wav")));
const nocturne = readWav(ensureSource(path.join(ballroomDir, "10 Nocturne .wav")));
const happyDays = readWav(ensureSource(path.join(vocalDir, "02HappyDaysAreHereAgain.wav")));
const jazzVampire = readWav(ensureSource(path.join(vocalDir, "03ImAJazzVampire.wav")));

// Six stages: false calm, dislocation, infinite nowhere, experiment, bad-trip collapse, final void.
for (const phrase of [
  { time: 0, src: 6.6, length: 33, rate: 0.62, gain: 0.21, pan: -0.08, wow: 0.004 },
  { time: 29.4, src: 10.1, length: 29, rate: 0.54, gain: 0.15, pan: 0.16, wow: 0.01, sag: 0.012 },
  { time: 59.8, src: 14.7, length: 31, rate: 0.46, gain: 0.13, pan: -0.2, wow: 0.015, gate: { period: 1.44, duty: 0.71, floor: 0.2 } },
  { time: 91.6, src: 8.2, length: 36, rate: 0.37, gain: 0.12, pan: 0.23, wow: 0.021, reverse: true, sag: 0.025 },
  { time: 132.4, src: 17.2, length: 38, rate: 0.3, gain: 0.108, pan: -0.1, wow: 0.029, sag: 0.075, fold: 3, dropouts: 0.0009 },
  { time: 178.5, src: 11.4, length: 39, rate: 0.235, gain: 0.079, pan: 0.03, wow: 0.036, reverse: true, crush: 0.26, gate: { period: 1.18, duty: 0.46, floor: 0.07 } }
]) {
  addSample(stems.memory, hauntingWaltz, { ...phrase, fade: 4, attack: phrase.time === 0 ? 6 : 2.8, release: 6 });
}

addSample(stems.memory, seventeen, { time: 47, src: 22, length: 23, rate: 0.42, gain: 0.045, pan: 0.42, wow: 0.024, fade: 5, attack: 5, release: 7 });
addSample(stems.memory, nocturne, { time: 154, src: 18, length: 41, rate: 0.24, gain: 0.047, pan: -0.5, wow: 0.035, reverse: true, fade: 8, attack: 9, release: 9 });

// A remembered female-song hook turns high, close, and wrong, but never becomes a command.
for (const event of [
  [18.2, happyDays, 22.4, 7.2, 0.92, 0.084, -0.32, false],
  [52.7, happyDays, 30.1, 6.4, 1.18, 0.072, 0.47, false],
  [83.4, jazzVampire, 17.6, 8.6, 0.64, 0.081, -0.18, true],
  [113.8, happyDays, 40.8, 5.1, 1.42, 0.058, 0.64, false],
  [145.6, jazzVampire, 24.8, 10.4, 0.38, 0.088, -0.72, true],
  [188.2, happyDays, 35.8, 11.6, 0.28, 0.062, 0.18, true]
]) {
  const [time, src, srcTime, length, rate, gain, pan, reverse] = event;
  addSample(stems.siren, src, { time, src: srcTime, length, rate, gain, pan, reverse, wow: 0.027, fade: 1.5, attack: 1.2, release: 4.5, crush: reverse ? 0.22 : 0.08, sag: reverse ? 0.05 : 0.015 });
}

// The stuck-thought loop folds over itself with uneven lengths.
let loopTime = 72.5;
for (const [i, length] of [4.0, 3.7, 3.2, 5.5, 2.9, 4.4, 3.05, 6.1].entries()) {
  addSample(stems.siren, jazzVampire, {
    time: loopTime,
    src: 25.4 + (i % 4) * 0.64,
    length,
    rate: 0.94 - i * 0.045,
    gain: 0.06 + i * 0.006,
    pan: ((i % 5) - 2) * 0.13,
    fade: 0.16,
    reverse: i === 4 || i === 7,
    wow: 0.036,
    crush: 0.2,
    gate: i > 3 ? { period: 0.71, duty: 0.58, floor: 0.21 } : null
  });
  loopTime += length * 0.84;
}

// Infinite nowhere: wind, fluorescent sky, service tunnel tone, and no broad static bed.
addNoise(stems.room, { time: 0, length: DURATION, gain: 0.026, lowpass: 0.0017, slowpass: 0.00012, attack: 10, release: 14, breathe: 0.013, scarThreshold: 0.99998, pan: -0.08 });
for (const tone of [
  [0, DURATION, 59.94, 0.021],
  [12, 204, 119.88, 0.009],
  [38, 160, 90.2, 0.008],
  [92, 94, 181.3, 0.006],
  [167, 48, 244.6, 0.005]
]) {
  const [time, length, freq, gain] = tone;
  addTone(stems.room, { time, length, freq, freqEnd: freq * 0.992, gain, pan: 0, attack: 9, release: 10, tremolo: 0.028, type: "sine2" });
}

// Physical low pressure, centered, with a late absence before one final controlled swell.
for (const event of [
  [26, 24, 38, 34, 0.035],
  [61, 35, 34, 29, 0.043],
  [104, 43, 30, 25, 0.056],
  [146, 31, 27, 22, 0.047],
  [197, 20, 23, 30, 0.09]
]) {
  const [time, length, freq, end, gain] = event;
  addTone(stems.pressure, { time, length, freq, freqEnd: end, gain, pan: 0, attack: 8, release: 9, tremolo: 0.055, type: "sine2" });
}
for (let t = 0; t < DURATION; t += 1 / SR) {
  if (t < 184 || t > 196) continue;
  const i = Math.floor(t * SR);
  const edge = Math.min(smoothstep((t - 184) / 2.8), smoothstep((196 - t) / 2.8));
  stems.pressure.l[i] *= 1 - edge * 0.96;
  stems.pressure.r[i] *= 1 - edge * 0.96;
}

// Fictional lab/occult atmosphere: quiet machine tones and ritual-like harmonic shadows.
for (const event of [
  [54, 96, 317, 0.008, -0.2],
  [61, 86, 421, 0.007, 0.24],
  [68, 78, 517, 0.006, -0.46],
  [91, 65, 777, 0.005, 0.38],
  [119, 59, 1031, 0.004, -0.1]
]) {
  const [time, length, freq, gain, pan] = event;
  addTone(stems.lab, { time, length, freq, freqEnd: freq * 0.985, gain, pan, attack: 6, release: 10, tremolo: 0.061, type: "tri" });
}
for (const event of [
  [64.2, 1160, 0.14, 0.017, -0.42],
  [70.8, 1215, 0.18, 0.016, 0.36],
  [92.6, 1090, 0.12, 0.014, -0.05],
  [123.4, 1340, 0.16, 0.018, 0.54],
  [151.2, 990, 0.21, 0.015, -0.62]
]) {
  const [time, freq, length, gain, pan] = event;
  addTone(stems.lab, { time, length, freq, freqEnd: freq * 0.996, gain, pan, attack: 0.01, release: 0.08, type: "sine2" });
}

// Forbidden transmission repeats seven times, varied enough to feel like the place is responding.
for (const event of [
  [32.2, 1640, 0.72, 0.016, -0.58],
  [63.6, 1621, 0.81, 0.018, 0.48],
  [96.4, 1687, 0.58, 0.019, -0.14],
  [126.9, 1570, 0.86, 0.02, 0.67],
  [155.8, 1512, 0.7, 0.018, -0.72],
  [184.9, 1726, 1.08, 0.024, 0.31],
  [211.1, 1435, 1.34, 0.018, -0.08]
]) {
  const [time, freq, length, gain, pan] = event;
  addTone(stems.signal, { time, length, freq, freqEnd: freq * 0.982, gain, pan, attack: 0.008, release: 0.07, tremolo: 8.4, type: "sine2" });
  addTone(stems.signal, { time: time + length * 0.39, length: length * 0.48, freq: freq * 1.503, freqEnd: freq * 1.492, gain: gain * 0.32, pan: -pan, attack: 0.006, release: 0.05 });
}

// Close haunted vocals arrive only after the listener trusts the memory.
for (const event of [
  [43, 18, 147, 0.034, -0.78, 0, false],
  [58, 24, 196, 0.035, 0.7, 1, true],
  [87, 32, 122, 0.043, -0.34, 2, false],
  [122, 40, 98, 0.05, 0.44, 3, true],
  [162, 36, 165, 0.04, -0.62, 1, true],
  [197, 24, 86, 0.054, 0.22, 0, true]
]) {
  const [time, length, freq, gain, pan, shape, near] = event;
  addVowelGhost(stems.vocals, { time, length, freq, gain, pan, shape, near, attack: 5, release: 8, sag: 0.06 });
}

// Horizon smear: stretched ballroom fragments become distant architecture and not a clean synth pad.
for (let i = 0; i < 44; i += 1) {
  const time = 58 + i * 3.25 + (rand() - 0.5) * 1.8;
  const src = 8 + rand() * 36;
  const length = 6 + rand() * 11;
  const rate = 0.09 + rand() * 0.17;
  const pan = rand() * 1.9 - 0.95;
  const source = i % 4 === 0 ? orientalNights : i % 4 === 1 ? nocturne : i % 4 === 2 ? happyDays : hauntingWaltz;
  addSample(stems.smear, source, { time, src, length, rate, gain: 0.014 + rand() * 0.018, pan, reverse: rand() > 0.25, wow: 0.036, fade: 2.6, attack: 2.2, release: 4.2, crush: i > 28 ? 0.16 : 0.04, sag: 0.025 });
}

// Sparse impacts: not drums, more like the empty place remembering a building.
for (const event of [
  [18.8, 0.88, 64, 0.055, -0.24],
  [36.7, 1.28, 51, 0.075, 0.19],
  [55.2, 0.92, 82, 0.048, -0.43],
  [74.9, 1.42, 45, 0.079, 0.39],
  [94.1, 1.17, 39, 0.087, 0.1],
  [116.6, 1.6, 35, 0.087, -0.32],
  [138.7, 1.28, 56, 0.062, 0.52],
  [161.5, 1.44, 32, 0.089, -0.15],
  [198.4, 1.86, 29, 0.116, 0.01],
  [213.6, 1.14, 70, 0.055, -0.54]
]) {
  const [time, length, freq, gain, pan] = event;
  addImpact(stems.impacts, { time, length, freq, gain, pan });
}

// Tape artifacts stay short and source-tied: damaged field recorder cuts, not a static blanket.
for (const event of [
  [31.8, 0.34, 0.024, -0.2],
  [67.2, 0.22, 0.027, 0.48],
  [98.6, 0.39, 0.029, -0.58],
  [125.7, 0.48, 0.031, 0.21],
  [151.1, 0.71, 0.032, -0.35],
  [181.5, 0.86, 0.024, 0.65],
  [199.2, 0.43, 0.038, -0.1],
  [219.4, 0.52, 0.029, 0.12]
]) {
  const [time, length, gain, pan] = event;
  addNoise(stems.tape, { time, length, gain, lowpass: 0.035, slowpass: 0.001, attack: 0.015, release: 0.08, scarThreshold: 0.996, scar: 0.16, pan });
}

filterBus(stems.memory, 52, 5000);
filterBus(stems.siren, 145, 5200);
filterBus(stems.room, 28, 1450);
filterBus(stems.pressure, 18, 185);
filterBus(stems.tape, 220, 6200);
filterBus(stems.vocals, 135, 4300);
filterBus(stems.lab, 180, 5600);
filterBus(stems.signal, 880, 3600);
filterBus(stems.impacts, 24, 1800);
filterBus(stems.smear, 95, 3600);

roomShift(stems.memory, 0.82);
roomShift(stems.siren, 0.9);
roomShift(stems.room, 0.48);
roomShift(stems.vocals, 1.02);
roomShift(stems.lab, 0.5);
roomShift(stems.signal, 0.34);
roomShift(stems.smear, 1.14);

stereoDrift(stems.memory, 0.22);
stereoDrift(stems.siren, 0.58);
stereoDrift(stems.room, 0.38);
stereoDrift(stems.vocals, 0.86);
stereoDrift(stems.lab, 0.32);
stereoDrift(stems.signal, 0.64);
stereoDrift(stems.smear, 0.94);

asymDelay(stems.memory, 0.014, 0.023, 0.09);
asymDelay(stems.siren, 0.008, 0.031, 0.13);
asymDelay(stems.room, 0.045, 0.071, 0.05);
asymDelay(stems.vocals, 0.006, 0.027, 0.18);
asymDelay(stems.lab, 0.019, 0.037, 0.07);
asymDelay(stems.signal, 0.011, 0.029, 0.1);
asymDelay(stems.smear, 0.019, 0.047, 0.22);

sideHalo(stems.memory, 0.052, 0.12);
sideHalo(stems.siren, 0.031, 0.18);
sideHalo(stems.room, 0.09, 0.08);
sideHalo(stems.vocals, 0.018, 0.28);
sideHalo(stems.lab, 0.042, 0.1);
sideHalo(stems.signal, 0.029, 0.18);
sideHalo(stems.smear, 0.068, 0.34);

saturateBus(stems.memory, 1.32);
saturateBus(stems.siren, 1.38);
saturateBus(stems.room, 1.08);
saturateBus(stems.vocals, 1.45);
saturateBus(stems.lab, 1.12);
saturateBus(stems.impacts, 1.28);
saturateBus(stems.smear, 1.52);

const allStems = Object.values(stems);
let master = sumBuses(allStems);
const pre = peakRms(master);
const masterGain = 0.8 / Math.max(pre.peak, 0.001);
for (const b of allStems) scaleBus(b, masterGain);
master = sumBuses(allStems);
filterBus(master, 18, 15500);
saturateBus(master, 1.06);
const post = peakRms(master);
const limiterGain = post.peak > 0.84 ? 0.84 / post.peak : 1;
if (limiterGain < 1) {
  for (const b of allStems) scaleBus(b, limiterGain);
  master = sumBuses(allStems);
}
for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const fadeIn = smoothstep(t / 4);
  const fadeOut = t > DURATION - 13 ? smoothstep((DURATION - t) / 13) : 1;
  master.l[i] *= fadeIn * fadeOut;
  master.r[i] *= fadeIn * fadeOut;
}
const finalStats = peakRms(master);
if (finalStats.peak > 0.966) throw new Error(`Master peak ${finalStats.peak} exceeds -0.3 dBFS ceiling.`);

const stemReports = [];
for (const b of allStems) {
  const stemPath = path.join(stemDir, `${b.name}.wav`);
  writeWav24(stemPath, b);
  stemReports.push({ name: b.name, path: stemPath, ...peakRms(b), probe: ffprobe(stemPath) });
}
writeWav24(outWav, master);
fs.copyFileSync(outWav, stagingWav);

const mp3 = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", outWav, "-codec:a", "libmp3lame", "-b:a", "320k", outMp3], { stdio: "pipe", encoding: "utf8" });
if (mp3.status !== 0) throw new Error(`ffmpeg MP3 encode failed: ${mp3.stderr || mp3.stdout}`);

fs.writeFileSync(outAttr, [
  `${title}`,
  "",
  "Original offline Ableton MCP album track.",
  "No Ableton UI/mouse control, LiveAPI writes, plugin installs, arbitrary URL fetches, YouTube/SoundCloud ripping, or real subliminal/coercive commands were used.",
  "The classified/mind-control direction is fictional atmosphere only; vocal material is nonverbal, reversed, buried, or public-domain singing fragments transformed as sound design.",
  "",
  "Local source material:",
  "- samples/staging/online-liminal-ballroom/05 That Haunting Waltz.wav",
  "- samples/staging/online-liminal-ballroom/06 When You And I Were Seventeen w.wav",
  "- samples/staging/online-liminal-ballroom/07 Oriental Nights.wav",
  "- samples/staging/online-liminal-ballroom/10 Nocturne .wav",
  "- samples/staging/occult-liminal-vocals/02HappyDaysAreHereAgain.wav",
  "- samples/staging/occult-liminal-vocals/03ImAJazzVampire.wav",
  "",
  "Source collections previously staged from Internet Archive public-domain/PD-marked material:",
  "- Cole McElroy Spanish Ballroom Orchestra 78rpm Collection",
  "- Nathan Glantz Orchestra 78rpm Collection",
  "- Sirens of Song",
  "",
  "Design notes:",
  "- New project and new song, not an overwrite of previous renders.",
  "- Slow liminal horror with one memory motif decaying through false calm, dislocation, infinite nowhere, experiment, collapse, and void.",
  "- Low end is centered and controlled; room reflections, vocals, and smeared fragments drift wide.",
  "- Tape artifacts are short dropouts and scars, not a continuous artificial static bed.",
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
  safety: {
    abletonWrites: false,
    uiMouseControl: false,
    downloads: false,
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
  master: {
    ...finalStats,
    probe: ffprobe(outWav),
    loudness: ebur128(outWav)
  },
  stems: stemReports,
  verificationCommands: [
    "node scripts/render-infinite-nowhere-protocol.mjs",
    `ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels,bits_per_sample -of json ${outWav}`,
    `ffmpeg -hide_banner -nostats -i ${outWav} -filter_complex ebur128=peak=true -f null -`
  ]
};

fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
fs.copyFileSync(outReport, stagingReport);
console.log(JSON.stringify(report, null, 2));
